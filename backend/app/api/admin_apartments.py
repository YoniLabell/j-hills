"""Admin: apartments, images, calendar blocks and Airbnb sync."""

import re
import unicodedata
from datetime import date, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile, status
from pydantic import BaseModel, Field
from sqlalchemy import exists, func, select
from sqlalchemy.orm import Session

from app.api.deps import bad_dates, public_base_url
from app.auth.dependencies import get_current_admin
from app.config import DEFAULT_LOCALE, get_settings
from app.db.database import get_db
from app.models import (
    Amenity,
    Apartment,
    ApartmentAmenity,
    ApartmentImage,
    ApartmentTranslation,
    BlockedDate,
    BlockSource,
    Booking,
    BookingInquiry,
    CalendarSyncLog,
    SyncTrigger,
)
from app.models.apartment import new_export_token
from app.schemas.apartment import (
    ApartmentAdminOut,
    ApartmentCreate,
    ApartmentUpdate,
    ImageAdminOut,
    TranslationIn,
)
from app.schemas.calendar import BlockCreate, BlockOut, SyncLogOut, SyncResponse
from app.services.availability_service import (
    InvalidDateRange,
    overlapping_blocks_query,
    validate_stay,
    validate_window,
)
from app.services.calendar_sync import sync_apartment
from app.services.image_service import ImageValidationError, delete_stored_image, store_image
from app.services.maps import resolve_coords
from app.services.serializers import apartment_admin, image_out

router = APIRouter(prefix="/api/admin", tags=["admin-apartments"], dependencies=[Depends(get_current_admin)])

MAX_FILES_PER_REQUEST = 20


# --------------------------------------------------------------------------- helpers


def slugify(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode()
    value = re.sub(r"[^a-zA-Z0-9]+", "-", value).strip("-").lower()
    return re.sub(r"-{2,}", "-", value)[:180]


def unique_slug(db: Session, base: str, exclude_id: int | None = None) -> str:
    base = base or "apartment"
    candidate, n = base, 2
    while True:
        q = select(Apartment.id).where(Apartment.slug == candidate)
        if exclude_id is not None:
            q = q.where(Apartment.id != exclude_id)
        if db.scalar(q) is None:
            return candidate
        candidate, n = f"{base}-{n}", n + 1


def get_apartment_or_404(db: Session, apartment_id: int) -> Apartment:
    apt = db.get(Apartment, apartment_id)
    if apt is None:
        raise HTTPException(status_code=404, detail="Apartment not found.")
    return apt


def _apply_translations(apt: Apartment, translations: dict[str, TranslationIn]) -> None:
    for locale, data in translations.items():
        if locale == DEFAULT_LOCALE:
            continue
        t = apt.translation(locale)
        if t is None:
            t = ApartmentTranslation(locale=locale)
            apt.translations.append(t)
        for field in ApartmentTranslation.TRANSLATABLE_FIELDS:
            value = getattr(data, field)
            setattr(t, field, value.strip() if isinstance(value, str) and value.strip() else None)


def _apply_amenities(db: Session, apt: Apartment, amenity_ids: list[int]) -> None:
    wanted = set(amenity_ids)
    if wanted:
        found = set(db.scalars(select(Amenity.id).where(Amenity.id.in_(wanted))))
        if missing := wanted - found:
            raise HTTPException(status_code=422, detail=f"Unknown amenity ids: {sorted(missing)}")
    current = {link.amenity_id: link for link in apt.amenity_links}
    for amenity_id, link in current.items():
        if amenity_id not in wanted:
            apt.amenity_links.remove(link)
    for amenity_id in wanted - current.keys():
        apt.amenity_links.append(ApartmentAmenity(amenity_id=amenity_id))


SCALAR_FIELDS = (
    "name",
    "short_description",
    "description",
    "house_rules",
    "neighborhood",
    "address",
    "latitude",
    "longitude",
    "google_maps_url",
    "owner_whatsapp",
    "owner_email",
    "rating",
    "reviews_count",
    "max_guests",
    "bedrooms",
    "beds",
    "bathrooms",
    "price_per_night",
    "cleaning_fee",
    "min_nights",
    "check_in_time",
    "check_out_time",
    "seo_title",
    "seo_description",
    "airbnb_ical_url",
    "featured",
    "active",
    "sort_order",
)

NULLABLE_FIELDS = {"latitude", "longitude", "rating", "reviews_count"}


def _fill_coords_from_maps_url(apt: Apartment, url_changed: bool) -> None:
    """Derive latitude/longitude from the Google Maps link (also short share links)."""
    if not apt.google_maps_url:
        return
    if not url_changed and apt.latitude is not None and apt.longitude is not None:
        return
    coords = resolve_coords(apt.google_maps_url)
    if coords:
        apt.latitude, apt.longitude = coords


def _out(db: Session, request: Request, apt: Apartment) -> ApartmentAdminOut:
    db.refresh(apt)
    return apartment_admin(apt, public_base_url(request))


# --------------------------------------------------------------------------- CRUD


@router.get("/apartments", response_model=list[ApartmentAdminOut])
def admin_list_apartments(request: Request, db: Session = Depends(get_db)):
    rows = db.scalars(select(Apartment).order_by(Apartment.sort_order, Apartment.id))
    base = public_base_url(request)
    return [apartment_admin(a, base) for a in rows]


@router.get("/apartments/{apartment_id}", response_model=ApartmentAdminOut)
def admin_get_apartment(apartment_id: int, request: Request, db: Session = Depends(get_db)):
    return apartment_admin(get_apartment_or_404(db, apartment_id), public_base_url(request))


@router.post("/apartments", response_model=ApartmentAdminOut, status_code=status.HTTP_201_CREATED)
def admin_create_apartment(payload: ApartmentCreate, request: Request, db: Session = Depends(get_db)):
    slug = payload.slug or slugify(payload.name)
    if payload.slug and db.scalar(select(Apartment.id).where(Apartment.slug == payload.slug)):
        raise HTTPException(status_code=409, detail="Slug is already in use.")
    apt = Apartment(slug=unique_slug(db, slug))
    for field in SCALAR_FIELDS:
        setattr(apt, field, getattr(payload, field))
    db.add(apt)
    _fill_coords_from_maps_url(apt, url_changed=True)
    _apply_translations(apt, payload.translations)
    _apply_amenities(db, apt, payload.amenity_ids)
    db.commit()
    return _out(db, request, apt)


@router.put("/apartments/{apartment_id}", response_model=ApartmentAdminOut)
def admin_update_apartment(
    apartment_id: int, payload: ApartmentUpdate, request: Request, db: Session = Depends(get_db)
):
    apt = get_apartment_or_404(db, apartment_id)
    data = payload.model_dump(exclude_unset=True)
    if "slug" in data and data["slug"] and data["slug"] != apt.slug:
        if db.scalar(select(Apartment.id).where(Apartment.slug == data["slug"], Apartment.id != apt.id)):
            raise HTTPException(status_code=409, detail="Slug is already in use.")
        apt.slug = data["slug"]
    previous_maps_url = apt.google_maps_url
    for field in SCALAR_FIELDS:
        if field in data and (data[field] is not None or field in NULLABLE_FIELDS):
            setattr(apt, field, data[field])
    _fill_coords_from_maps_url(apt, url_changed=apt.google_maps_url != previous_maps_url)
    if payload.translations is not None:
        _apply_translations(apt, payload.translations)
    if payload.amenity_ids is not None:
        _apply_amenities(db, apt, payload.amenity_ids)
    db.commit()
    return _out(db, request, apt)


@router.delete("/apartments/{apartment_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_apartment(apartment_id: int, db: Session = Depends(get_db)):
    """Delete an apartment only when no guest data refers to it.

    Apartments with bookings or inquiries must be deactivated instead so the
    history is preserved.
    """
    apt = get_apartment_or_404(db, apartment_id)
    has_history = db.scalar(
        select(
            exists().where(Booking.apartment_id == apt.id)
            | exists().where(BookingInquiry.apartment_id == apt.id)
        )
    )
    if has_history:
        raise HTTPException(
            status_code=409,
            detail="This apartment has bookings or inquiries. Deactivate it instead of deleting.",
        )
    stored = [(i.cloudinary_public_id, i.local_path) for i in apt.images]
    db.delete(apt)
    db.commit()
    for public_id, local_path in stored:
        delete_stored_image(public_id, local_path)


@router.post(
    "/apartments/{apartment_id}/duplicate",
    response_model=ApartmentAdminOut,
    status_code=status.HTTP_201_CREATED,
)
def admin_duplicate_apartment(apartment_id: int, request: Request, db: Session = Depends(get_db)):
    """Copy an apartment's details, translations and amenities.

    The copy starts inactive, without images or an Airbnb feed (each listing
    has its own Airbnb calendar, and images are owned by one apartment).
    """
    src = get_apartment_or_404(db, apartment_id)
    copy = Apartment(slug=unique_slug(db, f"{src.slug}-copy"))
    for field in SCALAR_FIELDS:
        setattr(copy, field, getattr(src, field))
    copy.name = f"{src.name} (copy)"
    copy.airbnb_ical_url = ""
    copy.active = False
    copy.featured = False
    copy.ical_export_token = new_export_token()
    db.add(copy)
    for t in src.translations:
        copy.translations.append(
            ApartmentTranslation(
                locale=t.locale,
                **{f: getattr(t, f) for f in ApartmentTranslation.TRANSLATABLE_FIELDS},
            )
        )
    for link in src.amenity_links:
        copy.amenity_links.append(ApartmentAmenity(amenity_id=link.amenity_id))
    db.commit()
    return _out(db, request, copy)


# --------------------------------------------------------------------------- images


def _normalize_cover(apt: Apartment) -> None:
    images = sorted(apt.images, key=lambda i: (i.sort_order, i.id or 0))
    covers = [i for i in images if i.is_cover]
    keep = covers[0] if covers else (images[0] if images else None)
    for img in images:
        img.is_cover = img is keep


@router.post(
    "/apartments/{apartment_id}/images",
    response_model=list[ImageAdminOut],
    status_code=status.HTTP_201_CREATED,
)
async def admin_upload_images(
    apartment_id: int,
    request: Request,
    files: list[UploadFile] = File(...),
    db: Session = Depends(get_db),
):
    apt = get_apartment_or_404(db, apartment_id)
    if not files:
        raise HTTPException(status_code=422, detail="No files uploaded.")
    if len(files) > MAX_FILES_PER_REQUEST:
        raise HTTPException(status_code=422, detail=f"Upload at most {MAX_FILES_PER_REQUEST} files at once.")
    limit = get_settings().max_upload_mb * 1024 * 1024
    base = public_base_url(request)

    # Validate everything first so a bad file doesn't leave a partial upload.
    payloads = []
    for f in files:
        data = await f.read(limit + 1)
        payloads.append((data, f.content_type, f.filename or ""))
    from app.services.image_service import validate_image

    try:
        for data, ctype, name in payloads:
            validate_image(data, ctype, name)
    except ImageValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    next_order = (
        db.scalar(select(func.max(ApartmentImage.sort_order)).where(ApartmentImage.apartment_id == apt.id))
        or 0
    ) + 1
    created: list[ApartmentImage] = []
    for offset, (data, ctype, name) in enumerate(payloads):
        try:
            stored = store_image(data, ctype, name, folder=f"apartments/{apt.id}", base_url=base)
        except ImageValidationError as exc:
            db.commit()  # keep the ones already stored
            raise HTTPException(status_code=422, detail=str(exc)) from exc
        stem = re.sub(r"\.[a-z0-9]+$", "", name, flags=re.I).replace("_", " ").replace("-", " ").strip()
        img = ApartmentImage(
            apartment_id=apt.id,
            image_url=stored.url,
            cloudinary_public_id=stored.public_id,
            local_path=stored.local_path,
            width=stored.width,
            height=stored.height,
            sort_order=next_order + offset,
            alt_text=f"{apt.name} – {stem}"[:300] if stem else apt.name,
            is_cover=False,
        )
        apt.images.append(img)
        created.append(img)
    db.flush()
    _normalize_cover(apt)
    db.commit()
    return [
        ImageAdminOut(**image_out(i).model_dump(), cloudinary_public_id=i.cloudinary_public_id)
        for i in created
    ]


class ImageOrder(BaseModel):
    image_ids: list[int] = Field(min_length=1)


@router.put("/apartments/{apartment_id}/images/order", response_model=list[ImageAdminOut])
def admin_reorder_images(apartment_id: int, payload: ImageOrder, db: Session = Depends(get_db)):
    apt = get_apartment_or_404(db, apartment_id)
    by_id = {i.id: i for i in apt.images}
    if set(payload.image_ids) != set(by_id) or len(payload.image_ids) != len(by_id):
        raise HTTPException(status_code=422, detail="image_ids must list every image of the apartment once.")
    for position, image_id in enumerate(payload.image_ids):
        by_id[image_id].sort_order = position
    db.commit()
    db.refresh(apt)
    return [
        ImageAdminOut(**image_out(i).model_dump(), cloudinary_public_id=i.cloudinary_public_id)
        for i in apt.images
    ]


class ImageUpdate(BaseModel):
    alt_text: str | None = Field(default=None, max_length=300)
    is_cover: bool | None = None


@router.patch("/images/{image_id}", response_model=ImageAdminOut)
def admin_update_image(image_id: int, payload: ImageUpdate, db: Session = Depends(get_db)):
    img = db.get(ApartmentImage, image_id)
    if img is None:
        raise HTTPException(status_code=404, detail="Image not found.")
    if payload.alt_text is not None:
        img.alt_text = payload.alt_text.strip()
    if payload.is_cover:
        for other in img.apartment.images:
            other.is_cover = other.id == img.id
    db.commit()
    return ImageAdminOut(**image_out(img).model_dump(), cloudinary_public_id=img.cloudinary_public_id)


@router.delete("/images/{image_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_image(image_id: int, db: Session = Depends(get_db)):
    img = db.get(ApartmentImage, image_id)
    if img is None:
        raise HTTPException(status_code=404, detail="Image not found.")
    apt = img.apartment
    public_id, local_path = img.cloudinary_public_id, img.local_path
    apt.images.remove(img)
    db.flush()
    _normalize_cover(apt)
    db.commit()
    delete_stored_image(public_id, local_path)


# --------------------------------------------------------------------------- calendar


@router.post("/apartments/{apartment_id}/sync-calendar", response_model=SyncResponse)
def admin_sync_calendar(apartment_id: int, db: Session = Depends(get_db)):
    apt = get_apartment_or_404(db, apartment_id)
    if not apt.airbnb_ical_url:
        raise HTTPException(status_code=422, detail="Add an Airbnb iCal URL to this apartment first.")
    result = sync_apartment(db, apartment_id, trigger=SyncTrigger.MANUAL)
    return SyncResponse(
        success=result.success,
        events_imported=result.events_imported,
        created=result.created,
        updated=result.updated,
        removed=result.removed,
        last_sync=result.last_sync,
        error=result.error,
    )


@router.get("/apartments/{apartment_id}/sync-logs", response_model=list[SyncLogOut])
def admin_sync_logs(apartment_id: int, db: Session = Depends(get_db)):
    get_apartment_or_404(db, apartment_id)
    return list(
        db.scalars(
            select(CalendarSyncLog)
            .where(CalendarSyncLog.apartment_id == apartment_id)
            .order_by(CalendarSyncLog.started_at.desc())
            .limit(20)
        )
    )


@router.get("/apartments/{apartment_id}/blocked-dates", response_model=list[BlockOut])
def admin_blocked_dates(
    apartment_id: int,
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
):
    get_apartment_or_404(db, apartment_id)
    start = start_date or date.today() - timedelta(days=60)
    end = end_date or start + timedelta(days=500)
    try:
        validate_window(start, end)
    except InvalidDateRange as exc:
        raise bad_dates(exc) from exc
    return list(db.scalars(overlapping_blocks_query(apartment_id, start, end)))


@router.post(
    "/apartments/{apartment_id}/block-dates", response_model=BlockOut, status_code=status.HTTP_201_CREATED
)
def admin_block_dates(apartment_id: int, payload: BlockCreate, db: Session = Depends(get_db)):
    """Manually block a period (maintenance, personal use, ...).

    ``end_date`` is exclusive like a check-out day: blocking 20→25 Oct blocks
    the nights of the 20th through the 24th.
    """
    get_apartment_or_404(db, apartment_id)
    try:
        validate_stay(payload.start_date, payload.end_date, allow_past=True, max_nights=730)
    except InvalidDateRange as exc:
        raise bad_dates(exc) from exc
    block = BlockedDate(
        apartment_id=apartment_id,
        start_date=payload.start_date,
        end_date=payload.end_date,
        source=BlockSource.MANUAL,
        reason=payload.reason.strip(),
    )
    db.add(block)
    db.flush()
    block.external_uid = f"manual-{block.id}"
    db.commit()
    return block


@router.delete("/blocked-dates/{block_id}", status_code=status.HTTP_204_NO_CONTENT)
def admin_delete_block(block_id: int, db: Session = Depends(get_db)):
    block = db.get(BlockedDate, block_id)
    if block is None:
        raise HTTPException(status_code=404, detail="Blocked period not found.")
    if block.source == BlockSource.AIRBNB:
        raise HTTPException(
            status_code=409,
            detail="This period comes from Airbnb. Change it on Airbnb; the next sync will update it.",
        )
    if block.source == BlockSource.WEBSITE_BOOKING:
        raise HTTPException(
            status_code=409,
            detail="This period belongs to a direct booking. Cancel the booking instead.",
        )
    db.delete(block)
    db.commit()
