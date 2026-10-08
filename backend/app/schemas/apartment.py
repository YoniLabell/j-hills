import re
from datetime import date, datetime, time
from typing import Annotated

from pydantic import BaseModel, Field, field_validator

from app.config import SUPPORTED_LOCALES
from app.schemas.common import ORMModel

SLUG_RE = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")

NonNegMoney = Annotated[float, Field(ge=0, le=1_000_000)]


class AmenityOut(ORMModel):
    id: int
    key: str
    name: str
    icon: str


class AmenityAdminOut(ORMModel):
    id: int
    key: str
    name_en: str
    name_he: str
    icon: str
    sort_order: int


class ImageOut(ORMModel):
    id: int
    url: str
    alt_text: str
    is_cover: bool
    sort_order: int
    width: int | None = None
    height: int | None = None


class ImageAdminOut(ImageOut):
    cloudinary_public_id: str | None = None


class ApartmentCard(BaseModel):
    """Compact public representation used in listings and search results."""

    id: int
    slug: str
    name: str
    neighborhood: str
    short_description: str
    max_guests: int
    bedrooms: int
    beds: int
    bathrooms: float
    price_per_night: float
    cleaning_fee: float
    currency: str
    featured: bool
    cover_image: ImageOut | None


class ApartmentPublic(ApartmentCard):
    description: str
    house_rules: str
    min_nights: int
    check_in_time: time
    check_out_time: time
    latitude: float | None
    longitude: float | None
    google_maps_url: str
    whatsapp_number: str
    contact_email: str
    images: list[ImageOut]
    amenities: list[AmenityOut]
    seo_title: str
    seo_description: str


class TranslationIn(BaseModel):
    name: str | None = Field(default=None, max_length=200)
    short_description: str | None = Field(default=None, max_length=500)
    description: str | None = Field(default=None, max_length=20000)
    house_rules: str | None = Field(default=None, max_length=10000)
    neighborhood: str | None = Field(default=None, max_length=120)
    seo_title: str | None = Field(default=None, max_length=200)
    seo_description: str | None = Field(default=None, max_length=400)


class ApartmentBase(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    slug: str | None = Field(default=None, max_length=200)
    short_description: str = Field(default="", max_length=500)
    description: str = Field(default="", max_length=20000)
    house_rules: str = Field(default="", max_length=10000)
    neighborhood: str = Field(default="", max_length=120)
    address: str = Field(default="", max_length=300)
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    google_maps_url: str = Field(default="", max_length=1000)
    owner_whatsapp: str = Field(default="", max_length=50)
    owner_email: str = Field(default="", max_length=255)
    max_guests: int = Field(default=2, ge=1, le=50)
    bedrooms: int = Field(default=1, ge=0, le=50)
    beds: int = Field(default=1, ge=0, le=100)
    bathrooms: float = Field(default=1, ge=0, le=50)
    price_per_night: NonNegMoney = 0
    cleaning_fee: NonNegMoney = 0
    min_nights: int = Field(default=1, ge=1, le=60)
    check_in_time: time = time(15, 0)
    check_out_time: time = time(11, 0)
    seo_title: str = Field(default="", max_length=200)
    seo_description: str = Field(default="", max_length=400)
    airbnb_ical_url: str = Field(default="", max_length=1000)
    featured: bool = False
    active: bool = True
    sort_order: int = 0
    translations: dict[str, TranslationIn] = Field(default_factory=dict)
    amenity_ids: list[int] = Field(default_factory=list)

    @field_validator("slug")
    @classmethod
    def _slug(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return None
        v = v.strip().lower()
        if not SLUG_RE.match(v):
            raise ValueError("Slug may contain lowercase letters, numbers and single hyphens.")
        return v

    @field_validator("airbnb_ical_url", "google_maps_url")
    @classmethod
    def _url(cls, v: str) -> str:
        v = (v or "").strip()
        if re.match(r"^webcals?://", v, re.IGNORECASE):  # calendar-app links: same feed over https
            v = "https://" + v.split("://", 1)[1]
        if v and not re.match(r"^https?://", v, re.IGNORECASE):
            raise ValueError("Must be an http(s) URL.")
        return v

    @field_validator("owner_whatsapp")
    @classmethod
    def _owner_whatsapp(cls, v: str | None) -> str | None:
        return normalize_whatsapp(v)

    @field_validator("owner_email")
    @classmethod
    def _owner_email(cls, v: str | None) -> str | None:
        if not v or not v.strip():
            return "" if v is not None else None
        from email_validator import EmailNotValidError, validate_email

        try:
            return validate_email(v.strip(), check_deliverability=False).normalized
        except EmailNotValidError as exc:
            raise ValueError("Invalid email address.") from exc

    @field_validator("translations")
    @classmethod
    def _locales(cls, v: dict[str, TranslationIn]) -> dict[str, TranslationIn]:
        for locale in v:
            if locale not in SUPPORTED_LOCALES:
                raise ValueError(f"Unsupported locale: {locale}")
        return v


class ApartmentCreate(ApartmentBase):
    pass


class ApartmentUpdate(ApartmentBase):
    """PUT payload. Every field is optional: omitted fields are left unchanged."""

    name: str | None = Field(default=None, min_length=1, max_length=200)  # type: ignore[assignment]
    short_description: str | None = None  # type: ignore[assignment]
    description: str | None = None  # type: ignore[assignment]
    house_rules: str | None = None  # type: ignore[assignment]
    neighborhood: str | None = None  # type: ignore[assignment]
    address: str | None = None  # type: ignore[assignment]
    google_maps_url: str | None = None  # type: ignore[assignment]
    owner_whatsapp: str | None = None  # type: ignore[assignment]
    owner_email: str | None = None  # type: ignore[assignment]
    max_guests: int | None = Field(default=None, ge=1, le=50)  # type: ignore[assignment]
    bedrooms: int | None = Field(default=None, ge=0, le=50)  # type: ignore[assignment]
    beds: int | None = Field(default=None, ge=0, le=100)  # type: ignore[assignment]
    bathrooms: float | None = Field(default=None, ge=0, le=50)  # type: ignore[assignment]
    price_per_night: NonNegMoney | None = None  # type: ignore[assignment]
    cleaning_fee: NonNegMoney | None = None  # type: ignore[assignment]
    min_nights: int | None = Field(default=None, ge=1, le=60)  # type: ignore[assignment]
    check_in_time: time | None = None  # type: ignore[assignment]
    check_out_time: time | None = None  # type: ignore[assignment]
    seo_title: str | None = None  # type: ignore[assignment]
    seo_description: str | None = None  # type: ignore[assignment]
    airbnb_ical_url: str | None = None  # type: ignore[assignment]
    featured: bool | None = None  # type: ignore[assignment]
    active: bool | None = None  # type: ignore[assignment]
    sort_order: int | None = None  # type: ignore[assignment]
    translations: dict[str, TranslationIn] | None = None  # type: ignore[assignment]
    amenity_ids: list[int] | None = None  # type: ignore[assignment]

    @field_validator("airbnb_ical_url", "google_maps_url")
    @classmethod
    def _url_opt(cls, v: str | None) -> str | None:
        if v is None:
            return None
        return ApartmentBase._url(v)


def normalize_whatsapp(v: str | None) -> str | None:
    """Keep digits only (international format, e.g. 972501234567)."""
    if v is None:
        return None
    digits = re.sub(r"\D", "", v)
    if v.strip() and len(digits) < 8:
        raise ValueError("Enter the WhatsApp number in international format, e.g. 972501234567.")
    if digits.startswith("0") and len(digits) == 10:  # local Israeli mobile 05x… -> 9725x…
        digits = "972" + digits[1:]
    return digits


class ApartmentAdminOut(BaseModel):
    id: int
    name: str
    slug: str
    short_description: str
    description: str
    house_rules: str
    neighborhood: str
    address: str
    latitude: float | None
    longitude: float | None
    google_maps_url: str
    owner_whatsapp: str
    owner_email: str
    max_guests: int
    bedrooms: int
    beds: int
    bathrooms: float
    price_per_night: float
    cleaning_fee: float
    min_nights: int
    check_in_time: time
    check_out_time: time
    seo_title: str
    seo_description: str
    airbnb_ical_url: str
    ical_export_url: str
    featured: bool
    active: bool
    sort_order: int
    translations: dict[str, TranslationIn]
    amenity_ids: list[int]
    images: list[ImageAdminOut]
    cover_image: ImageOut | None
    last_sync_at: datetime | None
    last_sync_success: bool | None
    last_sync_error: str | None
    last_sync_events: int | None
    created_at: datetime
    updated_at: datetime


class SearchParams(BaseModel):
    check_in: date
    check_out: date
    guests: int = 1
