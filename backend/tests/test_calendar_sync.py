from datetime import date

import pytest
from sqlalchemy import select

from app.db.database import SessionLocal
from app.models import Apartment, BlockedDate, BlockSource, CalendarSyncLog
from app.services.calendar_sync import (
    CalendarSyncError,
    parse_ics,
    sync_all,
    sync_apartment,
)
from tests.conftest import future, ics, make_apartment, vevent


def blocks(db, apartment_id, source=BlockSource.AIRBNB):
    db.expire_all()
    return list(
        db.scalars(
            select(BlockedDate)
            .where(BlockedDate.apartment_id == apartment_id, BlockedDate.source == source)
            .order_by(BlockedDate.start_date)
        )
    )


# ----------------------------------------------------------------- parsing


def test_parse_airbnb_ics():
    data = ics(
        vevent("a1@airbnb.com", date(2026, 10, 10), date(2026, 10, 13), "Reserved"),
        vevent("a2@airbnb.com", date(2026, 11, 1), date(2026, 11, 5), "Airbnb (Not available)"),
    )
    events = parse_ics(data)
    assert [(e.uid, e.start_date, e.end_date, e.summary) for e in events] == [
        ("a1@airbnb.com", date(2026, 10, 10), date(2026, 10, 13), "Reserved"),
        ("a2@airbnb.com", date(2026, 11, 1), date(2026, 11, 5), "Airbnb (Not available)"),
    ]


def test_parse_handles_missing_dtend_missing_uid_datetimes_and_cancelled():
    data = ics(
        vevent("no-end", date(2026, 10, 10), None),
        vevent(None, date(2026, 10, 20), date(2026, 10, 22), "No UID"),
        vevent("cancelled", date(2026, 10, 25), date(2026, 10, 27), extra="STATUS:CANCELLED"),
        "BEGIN:VEVENT\r\nUID:timed\r\nDTSTART:20261201T130000Z\r\nDTEND:20261203T090000Z\r\n"
        "SUMMARY:Timed\r\nEND:VEVENT",
    )
    events = {e.uid: e for e in parse_ics(data)}
    assert events["no-end"].end_date == date(2026, 10, 11)
    generated = [e for uid, e in events.items() if uid.startswith("generated-")]
    assert len(generated) == 1 and generated[0].start_date == date(2026, 10, 20)
    assert "cancelled" not in events
    assert (events["timed"].start_date, events["timed"].end_date) == (date(2026, 12, 1), date(2026, 12, 3))
    # Generated UIDs are stable across runs (needed for idempotency).
    assert [e.uid for e in parse_ics(data)] == [e.uid for e in parse_ics(data)]


@pytest.mark.parametrize("payload", [b"<html>Not found</html>", b"", b"BEGIN:VCALENDAR\r\nBROKEN"])
def test_parse_rejects_invalid_data(payload):
    with pytest.raises(CalendarSyncError):
        parse_ics(payload)


def test_parse_empty_calendar_is_valid():
    assert parse_ics(ics()) == []


# ----------------------------------------------------------------- importing


def test_import_creates_blocks_and_records_sync(db, apartment):
    feed = ics(
        vevent("a1", future(10), future(13)),
        vevent("a2", future(20), future(25)),
    )
    result = sync_apartment(db, apartment.id, fetcher=lambda url: feed)
    assert result.success and result.events_imported == 2 and result.created == 2
    rows = blocks(db, apartment.id)
    assert [(b.external_uid, b.start_date, b.end_date) for b in rows] == [
        ("a1", future(10), future(13)),
        ("a2", future(20), future(25)),
    ]
    apt = db.get(Apartment, apartment.id)
    assert apt.last_sync_success is True and apt.last_sync_at is not None and apt.last_sync_events == 2
    log = db.scalar(select(CalendarSyncLog))
    assert log.success and log.events_created == 2


def test_repeated_sync_does_not_duplicate(db, apartment):
    feed = ics(vevent("a1", future(10), future(13)), vevent("a2", future(20), future(25)))
    for _ in range(3):
        result = sync_apartment(db, apartment.id, fetcher=lambda url: feed)
        assert result.success
    assert len(blocks(db, apartment.id)) == 2
    assert result.created == 0 and result.updated == 0 and result.removed == 0


def test_deleted_airbnb_events_are_removed(db, apartment):
    sync_apartment(
        db,
        apartment.id,
        fetcher=lambda url: ics(vevent("a1", future(10), future(13)), vevent("a2", future(20), future(25))),
    )
    result = sync_apartment(db, apartment.id, fetcher=lambda url: ics(vevent("a2", future(20), future(25))))
    assert result.removed == 1
    assert [b.external_uid for b in blocks(db, apartment.id)] == ["a2"]


def test_modified_airbnb_events_are_updated(db, apartment):
    sync_apartment(
        db, apartment.id, fetcher=lambda url: ics(vevent("a1", future(10), future(13), "Reserved"))
    )
    original_id = blocks(db, apartment.id)[0].id
    result = sync_apartment(
        db, apartment.id, fetcher=lambda url: ics(vevent("a1", future(11), future(15), "Reserved"))
    )
    assert result.updated == 1 and result.created == 0
    [block] = blocks(db, apartment.id)
    assert (block.id, block.start_date, block.end_date) == (original_id, future(11), future(15))


def test_sync_never_touches_manual_or_website_blocks(db, apartment):
    db.add(
        BlockedDate(
            apartment_id=apartment.id,
            start_date=future(40),
            end_date=future(42),
            source=BlockSource.MANUAL,
            external_uid="manual-x",
            reason="Maintenance",
        )
    )
    db.commit()
    sync_apartment(db, apartment.id, fetcher=lambda url: ics())
    assert len(blocks(db, apartment.id, BlockSource.MANUAL)) == 1


def test_failed_sync_keeps_existing_blocks_and_hides_url(db, apartment):
    sync_apartment(db, apartment.id, fetcher=lambda url: ics(vevent("a1", future(10), future(13))))

    def broken(url):
        raise CalendarSyncError("Calendar server responded with HTTP 500.")

    result = sync_apartment(db, apartment.id, fetcher=broken)
    assert not result.success and "500" in result.error
    assert len(blocks(db, apartment.id)) == 1  # nothing was wiped
    apt = db.get(Apartment, apartment.id)
    db.refresh(apt)
    assert apt.last_sync_success is False
    assert "secret" not in (apt.last_sync_error or "")


def test_invalid_feed_content_is_a_failure_not_an_empty_calendar(db, apartment):
    sync_apartment(db, apartment.id, fetcher=lambda url: ics(vevent("a1", future(10), future(13))))
    result = sync_apartment(db, apartment.id, fetcher=lambda url: b"<html>Error</html>")
    assert not result.success
    assert len(blocks(db, apartment.id)) == 1


def test_sync_all_continues_after_a_failure(db):
    a = make_apartment(db, slug_suffix="a", airbnb_ical_url="https://example.com/a.ics")
    b = make_apartment(db, slug_suffix="b", airbnb_ical_url="https://example.com/b.ics")
    c = make_apartment(db, slug_suffix="c", airbnb_ical_url="")  # no feed: skipped
    d = make_apartment(db, slug_suffix="d", airbnb_ical_url="https://example.com/d.ics", active=False)

    def fetcher(url):
        if url.endswith("a.ics"):
            raise RuntimeError("boom")
        return ics(vevent("b1", future(5), future(7)))

    results = sync_all(SessionLocal, fetcher=fetcher)
    by_id = {r.apartment_id: r for r in results}
    assert set(by_id) == {a.id, b.id}
    assert by_id[a.id].success is False
    assert by_id[b.id].success is True
    assert len(blocks(db, b.id)) == 1
    assert c.id not in by_id and d.id not in by_id


def test_cron_script_exits_zero(db, monkeypatch):
    make_apartment(db, slug_suffix="x", airbnb_ical_url="https://example.com/x.ics")
    from app.scripts import sync_calendars
    from app.services import calendar_sync

    monkeypatch.setattr(calendar_sync, "fetch_ics", lambda url: ics(vevent("x1", future(3), future(4))))
    monkeypatch.setattr(
        sync_calendars,
        "sync_all",
        lambda factory, trigger: calendar_sync.sync_all(
            factory, trigger=trigger, fetcher=calendar_sync.fetch_ics
        ),
    )
    assert sync_calendars.main() == 0


def test_admin_manual_sync_endpoint(admin_client, db, apartment, monkeypatch):
    from app.api import admin_apartments

    feed = ics(vevent("a1", future(10), future(13)), vevent("a2", future(30), future(31)))
    original = admin_apartments.sync_apartment
    monkeypatch.setattr(
        admin_apartments,
        "sync_apartment",
        lambda db, apt_id, trigger: original(db, apt_id, trigger=trigger, fetcher=lambda url: feed),
    )
    r = admin_client.post(f"/api/admin/apartments/{apartment.id}/sync-calendar")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["success"] is True and body["events_imported"] == 2 and body["last_sync"]


def test_webcal_links_are_normalized(admin_client):
    r = admin_client.post(
        "/api/admin/apartments",
        json={"name": "Webcal Flat", "airbnb_ical_url": "webcal://www.airbnb.com/calendar/ical/1.ics?s=x"},
    )
    assert r.status_code == 201, r.text
    assert r.json()["airbnb_ical_url"] == "https://www.airbnb.com/calendar/ical/1.ics?s=x"


def test_html_page_instead_of_calendar_gives_helpful_error(db, apartment):
    result = sync_apartment(
        db, apartment.id, fetcher=lambda url: b"<!DOCTYPE html><html><body>Airbnb</body></html>"
    )
    assert not result.success and "Export calendar" in result.error
