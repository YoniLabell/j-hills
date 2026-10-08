from sqlalchemy import Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.database import Base
from app.models.base import TimestampMixin

SITE_SETTINGS_ID = 1


class SiteSettings(TimestampMixin, Base):
    """Single-row table (id = 1) holding editable site-wide settings."""

    __tablename__ = "site_settings"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=SITE_SETTINGS_ID)
    site_name: Mapped[str] = mapped_column(String(200), default="Jerusalem Stays", nullable=False)
    site_name_he: Mapped[str] = mapped_column(String(200), default="", nullable=False)
    logo_url: Mapped[str] = mapped_column(String(1000), default="", nullable=False)
    hero_image_url: Mapped[str] = mapped_column(String(1000), default="", nullable=False)
    phone: Mapped[str] = mapped_column(String(50), default="", nullable=False)
    whatsapp_number: Mapped[str] = mapped_column(String(50), default="", nullable=False)
    email: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    instagram_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    facebook_url: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    default_currency: Mapped[str] = mapped_column(String(3), default="ILS", nullable=False)
    about_text_en: Mapped[str] = mapped_column(Text, default="", nullable=False)
    about_text_he: Mapped[str] = mapped_column(Text, default="", nullable=False)
    footer_text_en: Mapped[str] = mapped_column(Text, default="", nullable=False)
    footer_text_he: Mapped[str] = mapped_column(Text, default="", nullable=False)
