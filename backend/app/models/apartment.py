import secrets
from datetime import datetime, time
from decimal import Decimal

from sqlalchemy import (
    Boolean,
    DateTime,
    ForeignKey,
    Integer,
    Numeric,
    String,
    Text,
    Time,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base
from app.models.base import TimestampMixin


def new_export_token() -> str:
    return secrets.token_urlsafe(24)


class Apartment(TimestampMixin, Base):
    """A rentable apartment.

    Text fields on this table hold the default (English) content. Other
    languages live in ``ApartmentTranslation`` and fall back to these values.
    """

    __tablename__ = "apartments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    slug: Mapped[str] = mapped_column(String(200), unique=True, index=True, nullable=False)
    short_description: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    description: Mapped[str] = mapped_column(Text, default="", nullable=False)
    house_rules: Mapped[str] = mapped_column(Text, default="", nullable=False)
    neighborhood: Mapped[str] = mapped_column(String(120), default="", nullable=False, index=True)
    address: Mapped[str] = mapped_column(String(300), default="", nullable=False)
    latitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    longitude: Mapped[Decimal | None] = mapped_column(Numeric(9, 6))
    google_maps_url: Mapped[str] = mapped_column(String(1000), default="", nullable=False)

    max_guests: Mapped[int] = mapped_column(Integer, default=2, nullable=False)
    bedrooms: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    beds: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    bathrooms: Mapped[Decimal] = mapped_column(Numeric(3, 1), default=1, nullable=False)

    price_per_night: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    cleaning_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    min_nights: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    check_in_time: Mapped[time] = mapped_column(Time, default=time(15, 0), nullable=False)
    check_out_time: Mapped[time] = mapped_column(Time, default=time(11, 0), nullable=False)

    seo_title: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    seo_description: Mapped[str] = mapped_column(String(400), default="", nullable=False)

    # Private: never returned by public endpoints.
    airbnb_ical_url: Mapped[str] = mapped_column(String(1000), default="", nullable=False)
    # Secret token for the outgoing iCal feed that Airbnb imports.
    ical_export_token: Mapped[str] = mapped_column(
        String(64), default=new_export_token, unique=True, nullable=False
    )

    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_sync_success: Mapped[bool | None] = mapped_column(Boolean)
    last_sync_error: Mapped[str | None] = mapped_column(Text)
    last_sync_events: Mapped[int | None] = mapped_column(Integer)

    featured: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False, index=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    translations: Mapped[list["ApartmentTranslation"]] = relationship(
        back_populates="apartment", cascade="all, delete-orphan", lazy="selectin"
    )
    images: Mapped[list["ApartmentImage"]] = relationship(  # noqa: F821
        back_populates="apartment",
        cascade="all, delete-orphan",
        order_by="ApartmentImage.sort_order",
        lazy="selectin",
    )
    amenity_links: Mapped[list["ApartmentAmenity"]] = relationship(  # noqa: F821
        back_populates="apartment", cascade="all, delete-orphan", lazy="selectin"
    )
    blocked_dates: Mapped[list["BlockedDate"]] = relationship(  # noqa: F821
        back_populates="apartment", cascade="all, delete-orphan", lazy="raise", passive_deletes=True
    )

    @property
    def amenities(self):
        return sorted((link.amenity for link in self.amenity_links), key=lambda a: a.sort_order)

    @property
    def cover_image(self):
        for img in self.images:
            if img.is_cover:
                return img
        return self.images[0] if self.images else None

    def translation(self, locale: str) -> "ApartmentTranslation | None":
        for t in self.translations:
            if t.locale == locale:
                return t
        return None


class ApartmentTranslation(Base):
    __tablename__ = "apartment_translations"
    __table_args__ = (UniqueConstraint("apartment_id", "locale", name="uq_apartment_locale"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    apartment_id: Mapped[int] = mapped_column(
        ForeignKey("apartments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    locale: Mapped[str] = mapped_column(String(8), nullable=False)
    name: Mapped[str | None] = mapped_column(String(200))
    short_description: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(Text)
    house_rules: Mapped[str | None] = mapped_column(Text)
    neighborhood: Mapped[str | None] = mapped_column(String(120))
    seo_title: Mapped[str | None] = mapped_column(String(200))
    seo_description: Mapped[str | None] = mapped_column(String(400))

    apartment: Mapped[Apartment] = relationship(back_populates="translations")

    TRANSLATABLE_FIELDS = (
        "name",
        "short_description",
        "description",
        "house_rules",
        "neighborhood",
        "seo_title",
        "seo_description",
    )
