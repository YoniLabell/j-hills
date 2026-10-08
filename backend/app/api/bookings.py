"""Admin: bookings dashboard (direct bookings + Airbnb/manual calendar blocks)."""

from datetime import date
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.dependencies import get_current_admin
from app.db.database import get_db
from app.models import Apartment, BlockedDate, BlockSource, Booking, BookingSource
from app.schemas.booking import BookingCreate, BookingRow, BookingsPage, BookingUpdate
from app.services.availability_service import InvalidDateRange, count_nights
from app.services.booking_service import BookingConflict, BookingError, cancel_booking, create_booking
from app.services.site_settings import get_site_settings

router = APIRouter(prefix="/api/admin", tags=["admin-bookings"], dependencies=[Depends(get_current_admin)])

AIRBNB_GUEST_LABEL = "Airbnb Reservation"


def _booking_row(b: Booking) -> BookingRow:
    return BookingRow(
        kind="booking",
        id=b.id,
        apartment_id=b.apartment_id,
        apartment_name=b.apartment.name,
        guest_name=b.guest_name,
        guest_email=b.guest_email,
        guest_phone=b.guest_phone,
        check_in=b.check_in,
        check_out=b.check_out,
        nights=count_nights(b.check_in, b.check_out),
        guests=b.guests,
        source=b.source,
        status=b.status,
        total_price=float(b.total_price),
        currency=b.currency,
        notes=b.notes,
        created_at=b.created_at,
    )


def _block_row(block: BlockedDate, apartment_name: str) -> BookingRow:
    is_airbnb = block.source == BlockSource.AIRBNB
    return BookingRow(
        kind="block",
        id=block.id,
        apartment_id=block.apartment_id,
        apartment_name=apartment_name,
        # We never invent guest details: Airbnb's iCal feed doesn't include them.
        guest_name=AIRBNB_GUEST_LABEL if is_airbnb else "",
        guest_email="",
        guest_phone="",
        check_in=block.start_date,
        check_out=block.end_date,
        nights=count_nights(block.start_date, block.end_date),
        guests=None,
        source=block.source,
        status="confirmed" if is_airbnb else "blocked",
        total_price=None,
        currency=None,
        notes=block.reason,
        created_at=block.created_at,
    )


@router.get("/bookings", response_model=BookingsPage)
def list_bookings(
    apartment_id: int | None = None,
    source: str | None = Query(default=None, pattern="^(website|airbnb|manual)$"),
    status_filter: str | None = Query(
        default=None, alias="status", pattern="^(confirmed|cancelled|blocked)$"
    ),
    from_date: date | None = None,
    to_date: date | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    rows: list[BookingRow] = []

    if source in (None, "website", "manual") and status_filter != "blocked":
        q = select(Booking)
        if apartment_id:
            q = q.where(Booking.apartment_id == apartment_id)
        if source:
            q = q.where(Booking.source == source)
        if status_filter:
            q = q.where(Booking.status == status_filter)
        if from_date:
            q = q.where(Booking.check_out > from_date)
        if to_date:
            q = q.where(Booking.check_in < to_date)
        rows.extend(_booking_row(b) for b in db.scalars(q))

    block_sources: list[str] = []
    if source in (None, "airbnb") and status_filter in (None, "confirmed"):
        block_sources.append(BlockSource.AIRBNB)
    if source in (None, "manual") and status_filter in (None, "blocked"):
        block_sources.append(BlockSource.MANUAL)
    if block_sources:
        names = {row.id: row.name for row in db.execute(select(Apartment.id, Apartment.name))}
        q = select(BlockedDate).where(BlockedDate.source.in_(block_sources))
        if apartment_id:
            q = q.where(BlockedDate.apartment_id == apartment_id)
        if from_date:
            q = q.where(BlockedDate.end_date > from_date)
        if to_date:
            q = q.where(BlockedDate.start_date < to_date)
        rows.extend(_block_row(b, names.get(b.apartment_id, "")) for b in db.scalars(q))

    rows.sort(key=lambda r: (r.check_in, r.apartment_name))
    return BookingsPage(items=rows[offset : offset + limit], total=len(rows))


@router.post("/bookings", response_model=BookingRow, status_code=status.HTTP_201_CREATED)
def create_manual_booking(payload: BookingCreate, db: Session = Depends(get_db)):
    """Record a booking the owner took directly (phone, returning guest...)."""
    try:
        booking = create_booking(
            db,
            apartment_id=payload.apartment_id,
            check_in=payload.check_in,
            check_out=payload.check_out,
            guests=payload.guests,
            guest_name=payload.guest_name.strip(),
            guest_email=payload.guest_email.strip(),
            guest_phone=payload.guest_phone.strip(),
            source=BookingSource.MANUAL,
            total_price=Decimal(str(payload.total_price)) if payload.total_price is not None else None,
            notes=payload.notes,
            currency=get_site_settings(db).default_currency,
        )
    except BookingConflict as exc:
        db.rollback()
        raise HTTPException(status_code=409, detail=str(exc)) from exc
    except (BookingError, InvalidDateRange) as exc:
        db.rollback()
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    db.commit()
    db.refresh(booking)
    return _booking_row(booking)


@router.patch("/bookings/{booking_id}", response_model=BookingRow)
def update_booking(booking_id: int, payload: BookingUpdate, db: Session = Depends(get_db)):
    booking = db.get(Booking, booking_id)
    if booking is None:
        raise HTTPException(status_code=404, detail="Booking not found.")
    if payload.notes is not None:
        booking.notes = payload.notes
    if payload.status == "cancelled":
        cancel_booking(db, booking)
    db.commit()
    db.refresh(booking)
    return _booking_row(booking)
