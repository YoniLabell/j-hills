from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import bad_dates
from app.db.database import get_db
from app.models import Amenity, Apartment
from app.schemas.apartment import ApartmentCard, ApartmentPublic
from app.schemas.settings import SiteSettingsOut
from app.services.availability_service import (
    InvalidDateRange,
    count_nights,
    is_available,
    unavailable_apartment_ids,
    validate_stay,
)
from app.services.pricing import quote
from app.services.serializers import (
    apartment_card,
    apartment_public,
    currency_symbol,
    localized,
    normalize_locale,
)
from app.services.site_settings import get_site_settings

router = APIRouter(prefix="/api", tags=["public"])


def _active_query(
    neighborhood: str | None = None,
    bedrooms: int | None = None,
    guests: int | None = None,
    featured: bool | None = None,
):
    q = select(Apartment).where(Apartment.active.is_(True))
    if neighborhood:
        q = q.where(Apartment.neighborhood == neighborhood)
    if bedrooms:
        q = q.where(Apartment.bedrooms >= bedrooms)
    if guests:
        q = q.where(Apartment.max_guests >= guests)
    if featured is not None:
        q = q.where(Apartment.featured.is_(featured))
    return q.order_by(Apartment.featured.desc(), Apartment.sort_order, Apartment.id)


@router.get("/settings", response_model=SiteSettingsOut)
def public_settings(db: Session = Depends(get_db)):
    s = get_site_settings(db)
    out = SiteSettingsOut.model_validate(s)
    out.currency_symbol = currency_symbol(s.default_currency)
    return out


@router.get("/amenities")
def list_amenities(lang: str = "en", db: Session = Depends(get_db)):
    locale = normalize_locale(lang)
    rows = db.scalars(select(Amenity).order_by(Amenity.sort_order, Amenity.id))
    return [{"id": a.id, "key": a.key, "name": a.name(locale), "icon": a.icon} for a in rows]


@router.get("/neighborhoods")
def list_neighborhoods(lang: str = "en", db: Session = Depends(get_db)):
    """Neighborhoods that have at least one active apartment.

    ``value`` is the canonical (default-language) name used for filtering;
    ``label`` is localized.
    """
    locale = normalize_locale(lang)
    labels: dict[str, str] = {}
    counts: dict[str, int] = {}
    for apt in db.scalars(select(Apartment).where(Apartment.active.is_(True))):
        if not apt.neighborhood:
            continue
        labels.setdefault(apt.neighborhood, localized(apt, "neighborhood", locale))
        counts[apt.neighborhood] = counts.get(apt.neighborhood, 0) + 1
    return [{"value": v, "label": labels[v], "count": counts[v]} for v in sorted(labels, key=str.lower)]


@router.get("/apartments", response_model=list[ApartmentCard])
def list_apartments(
    lang: str = "en",
    neighborhood: str | None = Query(default=None, max_length=120),
    bedrooms: int | None = Query(default=None, ge=0, le=50),
    guests: int | None = Query(default=None, ge=1, le=50),
    featured: bool | None = None,
    db: Session = Depends(get_db),
):
    locale = normalize_locale(lang)
    currency = get_site_settings(db).default_currency
    rows = db.scalars(_active_query(neighborhood, bedrooms, guests, featured))
    return [apartment_card(a, locale, currency) for a in rows]


@router.get("/apartments/search", response_model=list[ApartmentCard])
def search_apartments(
    check_in: date,
    check_out: date,
    guests: int = Query(default=1, ge=1, le=50),
    lang: str = "en",
    neighborhood: str | None = Query(default=None, max_length=120),
    bedrooms: int | None = Query(default=None, ge=0, le=50),
    db: Session = Depends(get_db),
):
    """Apartments that are free for every night of ``[check_in, check_out)``."""
    try:
        validate_stay(check_in, check_out)
    except InvalidDateRange as exc:
        raise bad_dates(exc) from exc
    locale = normalize_locale(lang)
    currency = get_site_settings(db).default_currency
    nights = count_nights(check_in, check_out)
    blocked = unavailable_apartment_ids(db, check_in, check_out)
    rows = db.scalars(_active_query(neighborhood, bedrooms, guests))
    return [
        apartment_card(a, locale, currency) for a in rows if a.id not in blocked and a.min_nights <= nights
    ]


@router.get("/apartments/{slug}", response_model=ApartmentPublic)
def get_apartment(slug: str, lang: str = "en", db: Session = Depends(get_db)):
    apt = db.scalar(select(Apartment).where(Apartment.slug == slug, Apartment.active.is_(True)))
    if apt is None:
        raise HTTPException(status_code=404, detail="Apartment not found.")
    currency = get_site_settings(db).default_currency
    return apartment_public(apt, normalize_locale(lang), currency)


@router.get("/apartments/{apartment_id}/quote")
def get_quote(
    apartment_id: int, check_in: date, check_out: date, guests: int = 1, db: Session = Depends(get_db)
):
    apt = db.get(Apartment, apartment_id)
    if apt is None or not apt.active:
        raise HTTPException(status_code=404, detail="Apartment not found.")
    try:
        validate_stay(check_in, check_out)
    except InvalidDateRange as exc:
        raise bad_dates(exc) from exc
    q = quote(apt, check_in, check_out)
    nights_ok = q.nights >= apt.min_nights
    return {
        "available": is_available(db, apt.id, check_in, check_out) and nights_ok,
        "min_nights": apt.min_nights,
        "meets_min_nights": nights_ok,
        "guests_ok": 1 <= guests <= apt.max_guests,
        "nights": q.nights,
        "nightly_rate": float(q.nightly_rate),
        "accommodation": float(q.accommodation),
        "cleaning_fee": float(q.cleaning_fee),
        "total": float(q.total),
        "currency": get_site_settings(db).default_currency,
    }
