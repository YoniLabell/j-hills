from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.api.deps import bad_dates
from app.db.database import get_db
from app.models import Apartment
from app.schemas.calendar import AvailabilityOut
from app.schemas.common import PeriodOut
from app.services.availability_service import InvalidDateRange, blocked_periods, validate_window
from app.services.calendar_export import build_ics

router = APIRouter(prefix="/api", tags=["availability"])


@router.get("/apartments/{apartment_id}/availability", response_model=AvailabilityOut)
def get_availability(
    apartment_id: int,
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
):
    """Blocked periods (merged, source-less) between ``start_date`` and ``end_date``.

    Each period is half-open: ``end_date`` is a check-out day and is itself
    available for a new check-in.
    """
    apt = db.get(Apartment, apartment_id)
    if apt is None or not apt.active:
        raise HTTPException(status_code=404, detail="Apartment not found.")
    start = start_date or date.today()
    end = end_date or start + timedelta(days=365)
    try:
        validate_window(start, end)
    except InvalidDateRange as exc:
        raise bad_dates(exc) from exc
    periods = blocked_periods(db, apartment_id, start, end)
    return AvailabilityOut(
        apartment_id=apartment_id,
        start_date=start,
        end_date=end,
        min_nights=apt.min_nights,
        blocked=[PeriodOut(start_date=p.start_date, end_date=p.end_date) for p in periods],
    )


@router.get("/calendar/{token}.ics", include_in_schema=False)
def export_calendar(token: str, db: Session = Depends(get_db)):
    """Outgoing iCal feed (direct bookings + manual blocks) for Airbnb to import."""
    apt = db.scalar(select(Apartment).where(Apartment.ical_export_token == token))
    if apt is None:
        raise HTTPException(status_code=404, detail="Not found.")
    return Response(
        content=build_ics(db, apt),
        media_type="text/calendar; charset=utf-8",
        headers={"Cache-Control": "no-cache", "Content-Disposition": "inline; filename=calendar.ics"},
    )
