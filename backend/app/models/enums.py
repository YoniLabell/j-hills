from enum import StrEnum


class BlockSource(StrEnum):
    """Where a blocked period on the calendar came from.

    New external providers (Booking.com, Vrbo, ...) are added here and synced
    through the same calendar sync service.
    """

    AIRBNB = "airbnb"
    WEBSITE_BOOKING = "website_booking"
    MANUAL = "manual"


EXTERNAL_SOURCES = {BlockSource.AIRBNB}


class BookingSource(StrEnum):
    WEBSITE = "website"
    MANUAL = "manual"


class BookingStatus(StrEnum):
    CONFIRMED = "confirmed"
    CANCELLED = "cancelled"


class InquiryStatus(StrEnum):
    NEW = "NEW"
    CONTACTED = "CONTACTED"
    CONFIRMED = "CONFIRMED"
    CANCELLED = "CANCELLED"


class InquiryChannel(StrEnum):
    """How the guest reached out. WhatsApp/email leads are recorded silently when
    the guest clicks the button; the conversation itself happens in that app."""

    FORM = "form"
    WHATSAPP = "whatsapp"
    EMAIL = "email"


class SyncTrigger(StrEnum):
    CRON = "cron"
    MANUAL = "manual"
