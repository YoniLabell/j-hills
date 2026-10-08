"""Admin: authentication, dashboard, site settings and amenities."""

from datetime import UTC, date, datetime, timedelta

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.deps import public_base_url
from app.auth.dependencies import get_current_admin
from app.auth.security import DUMMY_HASH, create_access_token, verify_password
from app.config import get_settings
from app.db.database import get_db
from app.models import (
    Amenity,
    Apartment,
    BlockedDate,
    BlockSource,
    Booking,
    BookingInquiry,
    BookingStatus,
    InquiryStatus,
    User,
)
from app.schemas.apartment import AmenityAdminOut
from app.schemas.auth import AdminUserOut, LoginRequest, LoginResponse
from app.schemas.dashboard import DashboardOut, SyncStatus, UpcomingStay
from app.schemas.settings import SiteSettingsOut, SiteSettingsUpdate
from app.services.availability_service import count_nights
from app.services.image_service import ImageValidationError, store_image
from app.services.rate_limit import RateLimiter, client_ip
from app.services.serializers import currency_symbol
from app.services.site_settings import get_site_settings

_settings = get_settings()
login_ip_limiter = RateLimiter(_settings.login_rate_limit, _settings.login_rate_window_seconds)
login_email_limiter = RateLimiter(_settings.login_rate_limit, _settings.login_rate_window_seconds)

public_router = APIRouter(prefix="/api/admin", tags=["admin-auth"])
router = APIRouter(prefix="/api/admin", tags=["admin"], dependencies=[Depends(get_current_admin)])


def _set_auth_cookie(response: Response, token: str, expires: datetime) -> None:
    settings = get_settings()
    response.set_cookie(
        key=settings.auth_cookie_name,
        value=token,
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
        expires=expires,
        path="/",
    )


@public_router.post("/login", response_model=LoginResponse)
def login(payload: LoginRequest, request: Request, response: Response, db: Session = Depends(get_db)):
    email = payload.email.lower().strip()
    login_ip_limiter.check(client_ip(request))
    login_email_limiter.check(email)

    user = db.scalar(select(User).where(func.lower(User.email) == email))
    if user is None:
        verify_password(payload.password, DUMMY_HASH)  # equalize timing
        valid = False
    else:
        valid = verify_password(payload.password, user.password_hash)
    if not valid or user is None or not user.is_active or not user.is_admin:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid email or password.")

    login_email_limiter.reset(email)
    user.last_login_at = datetime.now(UTC)
    db.commit()
    token, expires = create_access_token(user.id)
    _set_auth_cookie(response, token, expires)
    return LoginResponse(
        user=AdminUserOut(id=user.id, email=user.email), access_token=token, expires_at=expires
    )


@public_router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response):
    settings = get_settings()
    response.delete_cookie(
        settings.auth_cookie_name,
        path="/",
        httponly=True,
        secure=settings.is_production,
        samesite="lax",
    )


@router.get("/me", response_model=AdminUserOut)
def me(user: User = Depends(get_current_admin)):
    return AdminUserOut(id=user.id, email=user.email)


# --------------------------------------------------------------------------- dashboard


@router.get("/dashboard", response_model=DashboardOut)
def dashboard(db: Session = Depends(get_db)):
    today = date.today()
    horizon = today + timedelta(days=30)

    apartments = list(db.scalars(select(Apartment).order_by(Apartment.sort_order, Apartment.id)))
    active = [a for a in apartments if a.active]
    names = {a.id: a.name for a in apartments}

    new_inquiries = db.scalar(
        select(func.count()).select_from(BookingInquiry).where(BookingInquiry.status == InquiryStatus.NEW)
    )

    # Reservations = direct bookings + Airbnb blocks (manual blocks are not stays).
    stay_blocks = list(
        db.scalars(
            select(BlockedDate)
            .where(
                BlockedDate.source.in_([BlockSource.AIRBNB, BlockSource.WEBSITE_BOOKING]),
                BlockedDate.end_date > today,
            )
            .order_by(BlockedDate.start_date)
        )
    )
    bookings_by_id = {
        b.id: b
        for b in db.scalars(
            select(Booking).where(Booking.status == BookingStatus.CONFIRMED, Booking.check_out > today)
        )
    }
    upcoming = [b for b in stay_blocks if b.start_date >= today]
    checkins = [
        UpcomingStay(
            apartment_id=b.apartment_id,
            apartment_name=names.get(b.apartment_id, ""),
            guest_name=(
                bookings_by_id[b.booking_id].guest_name
                if b.booking_id in bookings_by_id
                else "Airbnb Reservation"
            ),
            check_in=b.start_date,
            check_out=b.end_date,
            source="website" if b.source == BlockSource.WEBSITE_BOOKING else b.source,
        )
        for b in upcoming
        if b.start_date <= today + timedelta(days=14)
    ][:20]

    # Occupancy: booked nights in the next 30 days over available nights.
    active_ids = {a.id for a in active}
    booked_nights: set[tuple[int, date]] = set()
    for b in stay_blocks:
        if b.apartment_id not in active_ids:
            continue
        start, end = max(b.start_date, today), min(b.end_date, horizon)
        for i in range(max(0, count_nights(start, end))):
            booked_nights.add((b.apartment_id, start + timedelta(days=i)))
    capacity = len(active) * 30
    occupancy = round(100 * len(booked_nights) / capacity, 1) if capacity else 0.0

    return DashboardOut(
        apartments_total=len(apartments),
        apartments_active=len(active),
        new_inquiries=new_inquiries or 0,
        upcoming_bookings=len(upcoming),
        upcoming_checkins=checkins,
        occupancy_percent_30d=occupancy,
        sync_status=[
            SyncStatus(
                apartment_id=a.id,
                apartment_name=a.name,
                has_feed=bool(a.airbnb_ical_url),
                last_sync_at=a.last_sync_at,
                last_sync_success=a.last_sync_success,
                last_sync_error=a.last_sync_error,
                last_sync_events=a.last_sync_events,
            )
            for a in apartments
        ],
    )


# --------------------------------------------------------------------------- settings


def _settings_out(db: Session) -> SiteSettingsOut:
    s = get_site_settings(db)
    out = SiteSettingsOut.model_validate(s)
    out.currency_symbol = currency_symbol(s.default_currency)
    return out


@router.get("/settings", response_model=SiteSettingsOut)
def get_admin_settings(db: Session = Depends(get_db)):
    return _settings_out(db)


@router.put("/settings", response_model=SiteSettingsOut)
def update_settings(payload: SiteSettingsUpdate, db: Session = Depends(get_db)):
    s = get_site_settings(db)
    for field, value in payload.model_dump(exclude_unset=True).items():
        if value is not None:
            setattr(s, field, value)
    db.commit()
    return _settings_out(db)


@router.post("/settings/upload/{kind}", response_model=SiteSettingsOut)
async def upload_site_image(
    kind: str, request: Request, file: UploadFile = File(...), db: Session = Depends(get_db)
):
    if kind not in ("logo", "hero"):
        raise HTTPException(status_code=404, detail="Unknown image kind.")
    data = await file.read(get_settings().max_upload_mb * 1024 * 1024 + 1)
    try:
        stored = store_image(
            data, file.content_type, file.filename or "", folder="site", base_url=public_base_url(request)
        )
    except ImageValidationError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    s = get_site_settings(db)
    if kind == "logo":
        s.logo_url = stored.url
    else:
        s.hero_image_url = stored.url
    db.commit()
    return _settings_out(db)


# --------------------------------------------------------------------------- amenities


@router.get("/amenities", response_model=list[AmenityAdminOut])
def admin_amenities(db: Session = Depends(get_db)):
    return list(db.scalars(select(Amenity).order_by(Amenity.sort_order, Amenity.id)))
