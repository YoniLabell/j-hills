"""Outgoing iCal feed per apartment.

Paste this feed's URL into Airbnb ("Availability → Connect calendars → Import")
so direct bookings and manual blocks also block the dates on Airbnb. Airbnb's
own events are not re-exported, to avoid echo loops.
"""

from datetime import UTC, datetime

from icalendar import Calendar, Event
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Apartment, BlockedDate, BlockSource

EXPORTED_SOURCES = (BlockSource.WEBSITE_BOOKING, BlockSource.MANUAL)


def build_ics(db: Session, apartment: Apartment) -> bytes:
    cal = Calendar()
    cal.add("prodid", "-//Jerusalem Apartments//Direct Bookings//EN")
    cal.add("version", "2.0")
    cal.add("calscale", "GREGORIAN")
    cal.add("method", "PUBLISH")
    blocks = db.scalars(
        select(BlockedDate)
        .where(
            BlockedDate.apartment_id == apartment.id,
            BlockedDate.source.in_([s.value for s in EXPORTED_SOURCES]),
        )
        .order_by(BlockedDate.start_date)
    )
    stamp = datetime.now(UTC)
    for block in blocks:
        event = Event()
        event.add("uid", f"block-{block.id}@jerusalem-apartments")
        event.add("dtstamp", stamp)
        event.add("dtstart", block.start_date)
        event.add("dtend", block.end_date)
        event.add("summary", "Reserved" if block.source == BlockSource.WEBSITE_BOOKING else "Not available")
        cal.add_component(event)
    return cal.to_ical()
