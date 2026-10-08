import re

from pydantic import BaseModel, Field, field_validator

from app.config import SUPPORTED_CURRENCIES
from app.schemas.common import ORMModel


class SiteSettingsOut(ORMModel):
    site_name: str
    site_name_he: str
    logo_url: str
    hero_image_url: str
    phone: str
    whatsapp_number: str
    email: str
    instagram_url: str
    facebook_url: str
    default_currency: str
    currency_symbol: str = "₪"
    about_text_en: str
    about_text_he: str
    footer_text_en: str
    footer_text_he: str


class SiteSettingsUpdate(BaseModel):
    site_name: str | None = Field(default=None, min_length=1, max_length=200)
    site_name_he: str | None = Field(default=None, max_length=200)
    logo_url: str | None = Field(default=None, max_length=1000)
    hero_image_url: str | None = Field(default=None, max_length=1000)
    phone: str | None = Field(default=None, max_length=50)
    whatsapp_number: str | None = Field(default=None, max_length=50)
    email: str | None = Field(default=None, max_length=255)
    instagram_url: str | None = Field(default=None, max_length=500)
    facebook_url: str | None = Field(default=None, max_length=500)
    default_currency: str | None = None
    about_text_en: str | None = Field(default=None, max_length=10000)
    about_text_he: str | None = Field(default=None, max_length=10000)
    footer_text_en: str | None = Field(default=None, max_length=2000)
    footer_text_he: str | None = Field(default=None, max_length=2000)

    @field_validator("default_currency")
    @classmethod
    def _currency(cls, v: str | None) -> str | None:
        if v is None:
            return v
        v = v.upper()
        if v not in SUPPORTED_CURRENCIES:
            raise ValueError(f"Supported currencies: {', '.join(SUPPORTED_CURRENCIES)}")
        return v

    @field_validator("whatsapp_number")
    @classmethod
    def _whatsapp(cls, v: str | None) -> str | None:
        if v is None:
            return v
        digits = re.sub(r"\D", "", v)
        if v.strip() and len(digits) < 8:
            raise ValueError("Enter the WhatsApp number in international format, e.g. 972501234567.")
        return digits

    @field_validator("email")
    @classmethod
    def _email(cls, v):
        if v in (None, ""):
            return v
        from email_validator import EmailNotValidError, validate_email

        try:
            return validate_email(str(v), check_deliverability=False).normalized
        except EmailNotValidError as exc:
            raise ValueError("Invalid email address.") from exc

    @field_validator("logo_url", "hero_image_url", "instagram_url", "facebook_url")
    @classmethod
    def _url(cls, v: str | None) -> str | None:
        if v and not re.match(r"^(https?://|/)", v.strip(), re.IGNORECASE):
            raise ValueError("Must be an http(s) URL.")
        return v.strip() if v else v
