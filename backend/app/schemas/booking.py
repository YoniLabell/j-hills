from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, EmailStr, Field, field_validator

from app.models import InquiryStatus
from app.schemas.common import ORMModel


class InquiryCreate(BaseModel):
    apartment_id: int
    check_in: date
    check_out: date
    guests: int = Field(ge=1, le=50)
    full_name: str = Field(min_length=2, max_length=200)
    phone: str = Field(min_length=5, max_length=50)
    email: EmailStr
    message: str = Field(default="", max_length=3000)
    locale: Literal["en", "he"] = "en"
    # Honeypot: real visitors never fill this hidden field.
    website: str = Field(default="", max_length=200)

    @field_validator("full_name", "phone", "message")
    @classmethod
    def _strip(cls, v: str) -> str:
        return v.strip()

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        allowed = set("0123456789+-() ")
        if not set(v) <= allowed or sum(c.isdigit() for c in v) < 5:
            raise ValueError("Please enter a valid phone number.")
        return v


class LeadCreate(BaseModel):
    """Recorded when a guest clicks "Book on WhatsApp" / "Send an email".

    Only the guest's name is required: the conversation continues in WhatsApp or email.
    """

    apartment_id: int
    check_in: date
    check_out: date
    guests: int = Field(ge=1, le=50)
    channel: Literal["whatsapp", "email"]
    full_name: str = Field(min_length=2, max_length=200)
    locale: Literal["en", "he"] = "en"
    website: str = Field(default="", max_length=200)  # honeypot

    @field_validator("full_name")
    @classmethod
    def _strip_name(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Please enter your name.")
        return v


class InquiryCreated(BaseModel):
    id: int
    status: str
    nights: int
    estimated_total: float
    currency: str


class InquiryOut(ORMModel):
    id: int
    apartment_id: int
    apartment_name: str
    apartment_slug: str
    check_in: date
    check_out: date
    nights: int
    guests: int
    full_name: str
    phone: str
    email: str
    message: str
    locale: str
    channel: str
    status: str
    estimated_total: float | None
    currency: str
    admin_notes: str
    booking_id: int | None
    created_at: datetime
    updated_at: datetime


class InquiryUpdate(BaseModel):
    status: InquiryStatus | None = None
    admin_notes: str | None = Field(default=None, max_length=5000)
    total_price: float | None = Field(default=None, ge=0, le=10_000_000)


class BookingCreate(BaseModel):
    apartment_id: int
    check_in: date
    check_out: date
    guests: int = Field(ge=1, le=50)
    guest_name: str = Field(min_length=1, max_length=200)
    guest_email: str = Field(default="", max_length=255)
    guest_phone: str = Field(default="", max_length=50)
    total_price: float | None = Field(default=None, ge=0, le=10_000_000)
    notes: str = Field(default="", max_length=5000)


class BookingUpdate(BaseModel):
    status: Literal["cancelled"] | None = None
    notes: str | None = Field(default=None, max_length=5000)


class BookingRow(BaseModel):
    """Unified row for the admin bookings table (direct bookings + calendar blocks)."""

    kind: Literal["booking", "block"]
    id: int
    apartment_id: int
    apartment_name: str
    guest_name: str
    guest_email: str
    guest_phone: str
    check_in: date
    check_out: date
    nights: int
    guests: int | None
    source: str
    status: str
    total_price: float | None
    currency: str | None
    notes: str
    created_at: datetime


class BookingsPage(BaseModel):
    items: list[BookingRow]
    total: int
