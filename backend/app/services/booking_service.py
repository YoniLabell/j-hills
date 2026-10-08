"""Booking lifecycle: confirming inquiries, creating and cancelling bookings.

Every confirmation re-checks availability *inside* a transaction that holds a
row lock on the apartment, so two confirmations (or a confirmation racing a
calendar sync) can never produce overlapping bookings.
"""

from datetime import date
from decimal import Decimal

from sqlalchemy.orm import Session

from app.models import (
    BlockedDate,
    BlockSource,
    Booking,
    BookingInquiry,
    BookingSource,
    BookingStatus,
    InquiryStatus,
)
from app.services.availability_service import (
    find_conflicts,
    lock_apartment,
    validate_stay,
)
from app.services.pricing import quote


class BookingConflict(Exception):
    def __init__(self, conflicts: list[BlockedDate]):
        self.conflicts = conflicts
        super().__init__("The selected dates are no longer available.")


class BookingError(ValueError):
    pass


def create_booking(
    db: Session,
    *,
    apartment_id: int,
    check_in: date,
    check_out: date,
    guests: int,
    guest_name: str,
    guest_email: str = "",
    guest_phone: str = "",
    source: str = BookingSource.WEBSITE,
    inquiry: BookingInquiry | None = None,
    total_price: Decimal | None = None,
    notes: str = "",
    currency: str = "ILS",
    allow_past: bool = False,
) -> Booking:
    """Create a confirmed booking plus its calendar block. Caller commits."""
    validate_stay(check_in, check_out, allow_past=allow_past)
    apartment = lock_apartment(db, apartment_id)
    if apartment is None:
        raise BookingError("Apartment not found.")
    if guests < 1 or guests > apartment.max_guests:
        raise BookingError(f"This apartment hosts up to {apartment.max_guests} guests.")

    conflicts = find_conflicts(db, apartment_id, check_in, check_out)
    if conflicts:
        raise BookingConflict(conflicts)

    q = quote(apartment, check_in, check_out)
    booking = Booking(
        apartment_id=apartment_id,
        inquiry_id=inquiry.id if inquiry else None,
        guest_name=guest_name,
        guest_email=guest_email,
        guest_phone=guest_phone,
        guests=guests,
        check_in=check_in,
        check_out=check_out,
        source=source,
        status=BookingStatus.CONFIRMED,
        nightly_rate=q.nightly_rate,
        cleaning_fee=q.cleaning_fee,
        total_price=total_price if total_price is not None else q.total,
        currency=currency,
        notes=notes,
    )
    db.add(booking)
    db.flush()
    db.add(
        BlockedDate(
            apartment_id=apartment_id,
            start_date=check_in,
            end_date=check_out,
            source=BlockSource.WEBSITE_BOOKING,
            external_uid=f"booking-{booking.id}",
            reason=f"Direct booking #{booking.id}",
            booking_id=booking.id,
        )
    )
    db.flush()
    return booking


def confirm_inquiry(db: Session, inquiry: BookingInquiry, *, total_price: Decimal | None = None) -> Booking:
    previous = inquiry.booking
    if previous is not None:
        if previous.status == BookingStatus.CONFIRMED:
            raise BookingError("Inquiry is already confirmed.")
        # Re-confirming a previously cancelled inquiry: detach the old booking.
        inquiry.booking = None
        db.flush()
    booking = create_booking(
        db,
        apartment_id=inquiry.apartment_id,
        check_in=inquiry.check_in,
        check_out=inquiry.check_out,
        guests=inquiry.guests,
        guest_name=inquiry.full_name,
        guest_email=inquiry.email,
        guest_phone=inquiry.phone,
        source=BookingSource.WEBSITE,
        inquiry=inquiry,
        total_price=total_price,
        currency=inquiry.currency,
        notes=inquiry.message,
    )
    inquiry.booking = booking
    inquiry.status = InquiryStatus.CONFIRMED
    db.flush()
    return booking


def cancel_booking(db: Session, booking: Booking) -> Booking:
    """Cancel a booking and free its dates. Caller commits."""
    if booking.status == BookingStatus.CANCELLED:
        return booking
    lock_apartment(db, booking.apartment_id)
    booking.status = BookingStatus.CANCELLED
    if booking.blocked_date is not None:
        db.delete(booking.blocked_date)
    if booking.inquiry is not None:
        booking.inquiry.status = InquiryStatus.CANCELLED
    db.flush()
    return booking
