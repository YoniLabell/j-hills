import logging
from datetime import UTC, datetime, timedelta
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import bad_dates
from app.auth.dependencies import get_current_admin
from app.config import get_settings
from app.db.database import get_db
from app.models import Apartment, BookingInquiry, BookingStatus, InquiryChannel, InquiryStatus
from app.schemas.booking import InquiryCreate, InquiryCreated, InquiryOut, InquiryUpdate, LeadCreate
from app.services.availability_service import InvalidDateRange, is_available, validate_stay
from app.services.booking_service import (
    BookingConflict,
    BookingError,
    cancel_booking,
    confirm_inquiry,
)
from app.services.pricing import quote
from app.services.rate_limit import RateLimiter, client_ip
from app.services.serializers import inquiry_out
from app.services.site_settings import get_site_settings

logger = logging.getLogger(__name__)

_settings = get_settings()
inquiry_limiter = RateLimiter(_settings.inquiry_rate_limit, _settings.inquiry_rate_window_seconds)
# Lead clicks are cheap and may repeat (guest reopens WhatsApp), so allow more.
lead_limiter = RateLimiter(20, 600)
LEAD_DEDUP_WINDOW = timedelta(minutes=30)

router = APIRouter(tags=["inquiries"])


@router.post("/api/booking-inquiries", response_model=InquiryCreated, status_code=status.HTTP_201_CREATED)
def create_inquiry(payload: InquiryCreate, request: Request, db: Session = Depends(get_db)):
    inquiry_limiter.check(client_ip(request))

    apartment = db.get(Apartment, payload.apartment_id)
    if apartment is None or not apartment.active:
        raise HTTPException(status_code=404, detail="Apartment not found.")
    try:
        validate_stay(payload.check_in, payload.check_out)
    except InvalidDateRange as exc:
        raise bad_dates(exc) from exc
    if payload.guests > apartment.max_guests:
        raise HTTPException(
            status_code=422,
            detail=f"This apartment hosts up to {apartment.max_guests} guests.",
        )
    q = quote(apartment, payload.check_in, payload.check_out)
    if q.nights < apartment.min_nights:
        raise HTTPException(status_code=422, detail=f"Minimum stay is {apartment.min_nights} nights.")
    currency = get_site_settings(db).default_currency

    if payload.website:  # honeypot tripped: pretend success, store nothing
        logger.info("Inquiry honeypot triggered from %s", client_ip(request))
        return InquiryCreated(
            id=0, status=InquiryStatus.NEW, nights=q.nights, estimated_total=float(q.total), currency=currency
        )

    # Never trust the calendar shown in the browser: check again here.
    if not is_available(db, apartment.id, payload.check_in, payload.check_out):
        raise HTTPException(status_code=409, detail="Sorry, these dates are no longer available.")

    inquiry = BookingInquiry(
        apartment_id=apartment.id,
        check_in=payload.check_in,
        check_out=payload.check_out,
        guests=payload.guests,
        full_name=payload.full_name,
        phone=payload.phone,
        email=str(payload.email),
        message=payload.message,
        locale=payload.locale,
        status=InquiryStatus.NEW,
        estimated_total=q.total,
        currency=currency,
    )
    db.add(inquiry)
    db.commit()
    logger.info("New booking inquiry %s for apartment %s", inquiry.id, apartment.id)
    return InquiryCreated(
        id=inquiry.id,
        status=inquiry.status,
        nights=q.nights,
        estimated_total=float(q.total),
        currency=currency,
    )


@router.post("/api/leads", status_code=status.HTTP_201_CREATED)
def record_lead(payload: LeadCreate, request: Request, db: Session = Depends(get_db)):
    """Silently record a WhatsApp/email contact click so it appears in the admin.

    The browser fires this without waiting for it; the guest's WhatsApp opens
    regardless of the result.
    """
    lead_limiter.check(client_ip(request))
    apartment = db.get(Apartment, payload.apartment_id)
    if apartment is None or not apartment.active:
        raise HTTPException(status_code=404, detail="Apartment not found.")
    try:
        validate_stay(payload.check_in, payload.check_out)
    except InvalidDateRange as exc:
        raise bad_dates(exc) from exc
    if payload.guests > apartment.max_guests:
        raise HTTPException(
            status_code=422, detail=f"This apartment hosts up to {apartment.max_guests} guests."
        )
    if payload.website:  # honeypot
        return {"id": 0, "created": False}
    if not is_available(db, apartment.id, payload.check_in, payload.check_out):
        raise HTTPException(status_code=409, detail="Sorry, these dates are no longer available.")

    # The same guest clicking twice (or switching WhatsApp -> email) shouldn't create duplicates.
    recent = db.scalar(
        select(BookingInquiry)
        .where(
            BookingInquiry.apartment_id == apartment.id,
            BookingInquiry.check_in == payload.check_in,
            BookingInquiry.check_out == payload.check_out,
            BookingInquiry.guests == payload.guests,
            BookingInquiry.channel.in_([InquiryChannel.WHATSAPP, InquiryChannel.EMAIL]),
            BookingInquiry.status == InquiryStatus.NEW,
            BookingInquiry.created_at >= datetime.now(UTC) - LEAD_DEDUP_WINDOW,
        )
        .order_by(BookingInquiry.created_at.desc())
        .limit(1)
    )
    if recent is not None and recent.full_name in ("", payload.full_name):
        if payload.full_name and not recent.full_name:
            recent.full_name = payload.full_name
        recent.channel = payload.channel
        db.commit()
        return {"id": recent.id, "created": False}

    q = quote(apartment, payload.check_in, payload.check_out)
    lead = BookingInquiry(
        apartment_id=apartment.id,
        check_in=payload.check_in,
        check_out=payload.check_out,
        guests=payload.guests,
        full_name=payload.full_name,
        phone="",
        email="",
        message="",
        locale=payload.locale,
        status=InquiryStatus.NEW,
        channel=payload.channel,
        estimated_total=q.total,
        currency=get_site_settings(db).default_currency,
    )
    db.add(lead)
    db.commit()
    logger.info("New %s lead %s for apartment %s", payload.channel, lead.id, apartment.id)
    return {"id": lead.id, "created": True}


admin_router = APIRouter(
    prefix="/api/admin", tags=["admin-inquiries"], dependencies=[Depends(get_current_admin)]
)


@admin_router.get("/inquiries")
def list_inquiries(
    status_filter: InquiryStatus | None = Query(default=None, alias="status"),
    apartment_id: int | None = None,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: Session = Depends(get_db),
):
    q = select(BookingInquiry)
    if status_filter:
        q = q.where(BookingInquiry.status == status_filter)
    if apartment_id:
        q = q.where(BookingInquiry.apartment_id == apartment_id)
    total = db.scalar(select(func.count()).select_from(q.subquery()))
    rows = db.scalars(q.order_by(BookingInquiry.created_at.desc()).limit(limit).offset(offset))
    return {"items": [inquiry_out(i) for i in rows], "total": total}


def _get_inquiry(db: Session, inquiry_id: int) -> BookingInquiry:
    inquiry = db.get(BookingInquiry, inquiry_id)
    if inquiry is None:
        raise HTTPException(status_code=404, detail="Inquiry not found.")
    return inquiry


@admin_router.get("/inquiries/{inquiry_id}", response_model=InquiryOut)
def get_inquiry(inquiry_id: int, db: Session = Depends(get_db)):
    return inquiry_out(_get_inquiry(db, inquiry_id))


@admin_router.patch("/inquiries/{inquiry_id}", response_model=InquiryOut)
def update_inquiry(inquiry_id: int, payload: InquiryUpdate, db: Session = Depends(get_db)):
    inquiry = _get_inquiry(db, inquiry_id)
    if payload.admin_notes is not None:
        inquiry.admin_notes = payload.admin_notes

    new_status = payload.status
    active_booking = (
        inquiry.booking
        if inquiry.booking is not None and inquiry.booking.status == BookingStatus.CONFIRMED
        else None
    )
    if new_status and new_status != inquiry.status:
        if new_status == InquiryStatus.CONFIRMED:
            try:
                confirm_inquiry(
                    db,
                    inquiry,
                    total_price=Decimal(str(payload.total_price))
                    if payload.total_price is not None
                    else None,
                )
            except BookingConflict as exc:
                db.rollback()
                raise HTTPException(
                    status_code=409,
                    detail={
                        "message": "These dates are no longer available. The apartment is "
                        "already blocked for part of this stay.",
                        "conflicts": [
                            {
                                "start_date": c.start_date.isoformat(),
                                "end_date": c.end_date.isoformat(),
                                "source": c.source,
                            }
                            for c in exc.conflicts
                        ],
                    },
                ) from exc
            except (BookingError, InvalidDateRange) as exc:
                db.rollback()
                raise HTTPException(status_code=422, detail=str(exc)) from exc
        elif new_status == InquiryStatus.CANCELLED:
            if active_booking is not None:
                cancel_booking(db, active_booking)
            inquiry.status = InquiryStatus.CANCELLED
        else:
            if active_booking is not None:
                raise HTTPException(
                    status_code=409,
                    detail="This inquiry has a confirmed booking. Cancel it first.",
                )
            inquiry.status = new_status
    db.commit()
    db.refresh(inquiry)
    return inquiry_out(inquiry)
