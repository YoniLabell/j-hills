"""Import external calendars (Airbnb iCal / ICS feeds) into ``BlockedDate`` rows.

The sync is idempotent: each external VEVENT is keyed by its UID, so running
the sync repeatedly converges on exactly the set of events in the feed —
new events are inserted, changed events are updated in place and events that
disappeared from the feed (cancelled reservations) are removed.

If downloading or parsing fails nothing is changed: existing blocks are kept so
a temporary Airbnb outage never makes booked dates look available.
"""

import hashlib
import logging
from dataclasses import dataclass, field
from datetime import UTC, date, datetime, timedelta
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import httpx
from icalendar import Calendar
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import Apartment, BlockedDate, BlockSource, CalendarSyncLog, SyncTrigger
from app.services.availability_service import lock_apartment

logger = logging.getLogger(__name__)

LOCAL_TZ = ZoneInfo("Asia/Jerusalem")
USER_AGENT = "JerusalemApartments-CalendarSync/1.0"


class CalendarSyncError(Exception):
    """A user-presentable sync failure. Messages never contain the feed URL."""


@dataclass(frozen=True)
class ParsedEvent:
    uid: str
    start_date: date
    end_date: date
    summary: str


@dataclass
class ApplyResult:
    created: int = 0
    updated: int = 0
    removed: int = 0
    unchanged: int = 0


@dataclass
class SyncResult:
    apartment_id: int
    success: bool
    events_imported: int = 0
    created: int = 0
    updated: int = 0
    removed: int = 0
    error: str | None = None
    last_sync: datetime | None = None
    skipped: bool = False
    details: dict = field(default_factory=dict)


# --------------------------------------------------------------------------- fetch


def validate_feed_url(url: str) -> str:
    url = (url or "").strip()
    parsed = urlparse(url)
    if parsed.scheme not in ("https", "http") or not parsed.netloc:
        raise CalendarSyncError("Calendar URL must be an http(s) URL.")
    return url


def fetch_ics(url: str, *, timeout: float | None = None, max_bytes: int | None = None) -> bytes:
    settings = get_settings()
    timeout = timeout or settings.calendar_fetch_timeout
    max_bytes = max_bytes or settings.calendar_max_bytes
    url = validate_feed_url(url)
    try:
        with httpx.Client(
            timeout=timeout, follow_redirects=True, headers={"User-Agent": USER_AGENT}
        ) as client:
            with client.stream("GET", url) as response:
                if response.status_code != 200:
                    raise CalendarSyncError(f"Calendar server responded with HTTP {response.status_code}.")
                chunks: list[bytes] = []
                size = 0
                for chunk in response.iter_bytes():
                    size += len(chunk)
                    if size > max_bytes:
                        raise CalendarSyncError("Calendar file is too large.")
                    chunks.append(chunk)
                return b"".join(chunks)
    except httpx.TimeoutException as exc:
        raise CalendarSyncError("Timed out downloading the calendar.") from exc
    except httpx.HTTPError as exc:
        # str(exc) may contain the private feed URL, so only report the type.
        raise CalendarSyncError(f"Network error downloading the calendar ({type(exc).__name__}).") from exc


# --------------------------------------------------------------------------- parse


def _to_date(value) -> date:
    if isinstance(value, datetime):
        if value.tzinfo is not None:
            value = value.astimezone(LOCAL_TZ)
        return value.date()
    if isinstance(value, date):
        return value
    raise CalendarSyncError(f"Unsupported date value: {value!r}")


def parse_ics(data: bytes | str) -> list[ParsedEvent]:
    """Parse an ICS document into hotel-style blocked periods.

    Handles VALUE=DATE events (what Airbnb exports) as well as date-time
    events, missing DTEND (falls back to DURATION or a single night), missing
    UIDs (a stable hash is generated) and cancelled events (skipped).
    """
    if isinstance(data, bytes):
        text = data.decode("utf-8", errors="replace")
    else:
        text = data
    if "BEGIN:VCALENDAR" not in text.upper():
        raise CalendarSyncError("Response is not an iCal calendar.")
    try:
        cal = Calendar.from_ical(text)
    except Exception as exc:  # icalendar raises a variety of errors
        raise CalendarSyncError("Calendar file could not be parsed.") from exc

    events: dict[str, ParsedEvent] = {}
    for component in cal.walk("VEVENT"):
        status = str(component.get("STATUS", "")).upper()
        if status == "CANCELLED":
            continue
        dtstart = component.get("DTSTART")
        if dtstart is None:
            continue
        try:
            start = _to_date(dtstart.dt)
            dtend = component.get("DTEND")
            duration = component.get("DURATION")
            if dtend is not None:
                end = _to_date(dtend.dt)
            elif duration is not None:
                end = _to_date(dtstart.dt + duration.dt)
            else:
                end = start + timedelta(days=1)
        except (CalendarSyncError, TypeError, ValueError, AttributeError):
            logger.warning("Skipping VEVENT with unparseable dates")
            continue
        if end <= start:
            # Same-day events (e.g. timed blocks) still occupy that night.
            end = start + timedelta(days=1)

        summary = str(component.get("SUMMARY", "") or "").strip()[:500]
        uid = str(component.get("UID", "") or "").strip()
        if not uid:
            digest = hashlib.sha1(f"{start}|{end}|{summary}".encode()).hexdigest()
            uid = f"generated-{digest}"
        uid = uid[:450]
        if uid in events and events[uid].start_date != start:
            # Repeated UID with different dates (recurrence overrides): keep both.
            uid = f"{uid}#{start.isoformat()}"
        events[uid] = ParsedEvent(uid=uid, start_date=start, end_date=end, summary=summary)

    return sorted(events.values(), key=lambda e: (e.start_date, e.uid))


# --------------------------------------------------------------------------- apply


def apply_events(
    db: Session, apartment_id: int, events: list[ParsedEvent], source: str = BlockSource.AIRBNB
) -> ApplyResult:
    """Make the apartment's ``source`` blocks match ``events`` exactly.

    Must be called inside a transaction; the caller commits.
    """
    lock_apartment(db, apartment_id)
    existing = {
        b.external_uid: b
        for b in db.scalars(
            select(BlockedDate).where(BlockedDate.apartment_id == apartment_id, BlockedDate.source == source)
        )
    }
    result = ApplyResult()
    seen: set[str] = set()
    for event in events:
        seen.add(event.uid)
        block = existing.get(event.uid)
        if block is None:
            db.add(
                BlockedDate(
                    apartment_id=apartment_id,
                    start_date=event.start_date,
                    end_date=event.end_date,
                    source=source,
                    external_uid=event.uid,
                    reason=event.summary,
                )
            )
            result.created += 1
        elif (block.start_date, block.end_date, block.reason) != (
            event.start_date,
            event.end_date,
            event.summary,
        ):
            block.start_date = event.start_date
            block.end_date = event.end_date
            block.reason = event.summary
            result.updated += 1
        else:
            result.unchanged += 1

    for uid, block in existing.items():
        if uid not in seen:
            db.delete(block)
            result.removed += 1
    db.flush()
    return result


# --------------------------------------------------------------------------- orchestration


def sync_apartment(
    db: Session,
    apartment_id: int,
    *,
    trigger: str = SyncTrigger.MANUAL,
    fetcher=fetch_ics,
) -> SyncResult:
    """Download, parse and apply one apartment's Airbnb calendar.

    Commits on success and records failures; never raises for feed problems.
    """
    apartment = db.get(Apartment, apartment_id)
    if apartment is None:
        return SyncResult(apartment_id=apartment_id, success=False, error="Apartment not found.")
    url = (apartment.airbnb_ical_url or "").strip()
    if not url:
        return SyncResult(
            apartment_id=apartment_id,
            success=False,
            skipped=True,
            error="No Airbnb iCal URL configured.",
        )

    started = datetime.now(UTC)
    try:
        events = parse_ics(fetcher(url))
        applied = apply_events(db, apartment_id, events, BlockSource.AIRBNB)
        finished = datetime.now(UTC)
        apartment.last_sync_at = finished
        apartment.last_sync_success = True
        apartment.last_sync_error = None
        apartment.last_sync_events = len(events)
        db.add(
            CalendarSyncLog(
                apartment_id=apartment_id,
                source=BlockSource.AIRBNB,
                trigger=trigger,
                started_at=started,
                finished_at=finished,
                success=True,
                events_imported=len(events),
                events_created=applied.created,
                events_updated=applied.updated,
                events_removed=applied.removed,
            )
        )
        db.commit()
        logger.info(
            "Synced apartment %s: %s events (%s new, %s updated, %s removed)",
            apartment_id,
            len(events),
            applied.created,
            applied.updated,
            applied.removed,
        )
        return SyncResult(
            apartment_id=apartment_id,
            success=True,
            events_imported=len(events),
            created=applied.created,
            updated=applied.updated,
            removed=applied.removed,
            last_sync=finished,
        )
    except Exception as exc:
        db.rollback()
        if isinstance(exc, CalendarSyncError):
            message = str(exc)
            logger.warning("Calendar sync failed for apartment %s: %s", apartment_id, message)
        else:
            message = "Unexpected error during calendar sync."
            logger.exception("Calendar sync crashed for apartment %s", apartment_id)
        finished = datetime.now(UTC)
        try:
            apartment = db.get(Apartment, apartment_id)
            if apartment is not None:
                apartment.last_sync_at = finished
                apartment.last_sync_success = False
                apartment.last_sync_error = message
            db.add(
                CalendarSyncLog(
                    apartment_id=apartment_id,
                    source=BlockSource.AIRBNB,
                    trigger=trigger,
                    started_at=started,
                    finished_at=finished,
                    success=False,
                    error=message,
                )
            )
            db.commit()
        except Exception:
            db.rollback()
            logger.exception("Could not record sync failure for apartment %s", apartment_id)
        return SyncResult(apartment_id=apartment_id, success=False, error=message, last_sync=finished)


def apartments_to_sync(db: Session) -> list[int]:
    return list(
        db.scalars(
            select(Apartment.id)
            .where(Apartment.active.is_(True), Apartment.airbnb_ical_url != "")
            .order_by(Apartment.id)
        )
    )


def sync_all(session_factory, *, trigger: str = SyncTrigger.CRON, fetcher=fetch_ics) -> list[SyncResult]:
    """Sync every active apartment that has a feed. One failure never stops the rest."""
    with session_factory() as db:
        ids = apartments_to_sync(db)
    results: list[SyncResult] = []
    for apartment_id in ids:
        with session_factory() as db:
            try:
                results.append(sync_apartment(db, apartment_id, trigger=trigger, fetcher=fetcher))
            except Exception:  # pragma: no cover - sync_apartment already guards
                logger.exception("Unhandled error syncing apartment %s", apartment_id)
                results.append(SyncResult(apartment_id=apartment_id, success=False, error="Unhandled error"))
    return results
