"""Private webhook used by a Google Forms installable submit trigger."""
import base64
import binascii
import hmac
import re

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.api.deps import public_base_url
from app.config import get_settings
from app.db.database import get_db
from app.models import Apartment, ApartmentImage, ApartmentTranslation
from app.api.admin_apartments import SCALAR_FIELDS, _apply_amenities, _fill_coords_from_maps_url, unique_slug, slugify
from app.services.forms_import import apartment_from_answers
from app.services.image_service import ImageValidationError, store_image, delete_stored_image

router = APIRouter(prefix="/api/integrations/google-forms", tags=["google-forms"], include_in_schema=False)
FILE_ID = re.compile(r"^[A-Za-z0-9_-]{5,160}$")


class Submission(BaseModel):
    form_id: str = Field(min_length=3, max_length=180)
    response_id: str = Field(min_length=3, max_length=180)
    answers: dict[str, str | list[str]]


class Photo(BaseModel):
    drive_file_id: str = Field(min_length=5, max_length=160)
    filename: str = Field(default="image.jpg", max_length=250)
    content_type: str = Field(max_length=80)
    data_base64: str = Field(min_length=1, max_length=15_000_000)


def authenticate(x_forms_secret: str = Header(default="")):
    secret = get_settings().google_forms_secret
    if not secret:
        raise HTTPException(status_code=404, detail="Not found.")
    if not hmac.compare_digest(x_forms_secret.encode(), secret.encode()):
        raise HTTPException(status_code=401, detail="Invalid forms secret.")


def source_key(form_id: str, response_id: str) -> str:
    return f"{form_id}:{response_id}"


@router.post("/submissions", dependencies=[Depends(authenticate)])
def import_submission(payload: Submission, db: Session = Depends(get_db)):
    key = source_key(payload.form_id, payload.response_id)
    existing = db.scalar(select(Apartment).where(Apartment.google_form_source_id == key))
    if existing:
        return {"apartment_id": existing.id, "created": False, "active": existing.active}
    data = apartment_from_answers(db, payload.answers)
    apt = Apartment(slug=unique_slug(db, slugify(data.name)), google_form_source_id=key)
    for field in SCALAR_FIELDS:
        setattr(apt, field, getattr(data, field))
    apt.active = False  # never allow a form to publish directly
    apt.featured = False
    db.add(apt)
    _fill_coords_from_maps_url(apt, url_changed=True)
    for locale, translation in data.translations.items():
        if locale != "en":
            apt.translations.append(ApartmentTranslation(
                locale=locale,
                **{field: getattr(translation, field) for field in ApartmentTranslation.TRANSLATABLE_FIELDS}
            ))
    _apply_amenities(db, apt, data.amenity_ids)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        # Concurrent retried event: the unique source key wins.
        existing = db.scalar(select(Apartment).where(Apartment.google_form_source_id == key))
        if existing:
            return {"apartment_id": existing.id, "created": False, "active": existing.active}
        raise
    return {"apartment_id": apt.id, "created": True, "active": False}


@router.post("/submissions/{apartment_id}/photos", dependencies=[Depends(authenticate)])
def import_photo(apartment_id: int, payload: Photo, request: Request, db: Session = Depends(get_db)):
    apt = db.get(Apartment, apartment_id)
    if not apt or not apt.google_form_source_id:
        raise HTTPException(status_code=404, detail="Imported apartment not found.")
    if not FILE_ID.fullmatch(payload.drive_file_id):
        raise HTTPException(status_code=422, detail="Invalid Google Drive file ID.")
    existing = db.scalar(select(ApartmentImage).where(ApartmentImage.google_form_drive_file_id == payload.drive_file_id))
    if existing:
        if existing.apartment_id != apt.id:
            raise HTTPException(status_code=409, detail="Drive photo already attached to a different apartment.")
        return {"image_id": existing.id, "created": False}
    try:
        raw = base64.b64decode(payload.data_base64, validate=True)
    except (ValueError, binascii.Error) as exc:
        raise HTTPException(status_code=422, detail="Invalid base64 image.") from exc
    try:
        stored = store_image(raw, payload.content_type, payload.filename,
                             folder=f"apartments/{apt.id}", base_url=public_base_url(request))
    except ImageValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    image = ApartmentImage(
        apartment_id=apt.id, image_url=stored.url, cloudinary_public_id=stored.public_id,
        local_path=stored.local_path, width=stored.width, height=stored.height,
        google_form_drive_file_id=payload.drive_file_id,
        sort_order=len(apt.images), is_cover=not bool(apt.images),
        alt_text=f"{apt.name} – {payload.filename}"[:300]
    )
    db.add(image)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        delete_stored_image(stored.public_id, stored.local_path)
        existing = db.scalar(select(ApartmentImage).where(ApartmentImage.google_form_drive_file_id == payload.drive_file_id))
        if existing and existing.apartment_id == apt.id:
            return {"image_id": existing.id, "created": False}
        raise
    return {"image_id": image.id, "created": True}
