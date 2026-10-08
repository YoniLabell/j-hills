from app.models import BlockedDate, BlockSource
from tests.conftest import future, make_apartment


def block(db, apartment_id, start, end, source=BlockSource.AIRBNB, uid=None):
    db.add(
        BlockedDate(
            apartment_id=apartment_id,
            start_date=start,
            end_date=end,
            source=source,
            external_uid=uid or f"{source}-{start}",
        )
    )
    db.commit()


def test_availability_endpoint_returns_merged_blocked_periods(client, db, apartment):
    block(db, apartment.id, future(10), future(13))
    block(db, apartment.id, future(13), future(15), BlockSource.MANUAL)
    block(db, apartment.id, future(30), future(32))
    r = client.get(
        f"/api/apartments/{apartment.id}/availability",
        params={"start_date": str(future(0)), "end_date": str(future(60))},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["blocked"] == [
        {"start_date": str(future(10)), "end_date": str(future(15))},
        {"start_date": str(future(30)), "end_date": str(future(32))},
    ]
    # Source/UIDs are never exposed publicly.
    assert "source" not in r.text and "external_uid" not in r.text


def test_availability_window_filters(client, db, apartment):
    block(db, apartment.id, future(100), future(103))
    r = client.get(
        f"/api/apartments/{apartment.id}/availability",
        params={"start_date": str(future(0)), "end_date": str(future(50))},
    )
    assert r.json()["blocked"] == []


def test_quote_checks_checkout_checkin_same_day(client, db, apartment):
    block(db, apartment.id, future(10), future(13))
    # Arriving on the previous guest's check-out day is fine.
    r = client.get(
        f"/api/apartments/{apartment.id}/quote",
        params={"check_in": str(future(13)), "check_out": str(future(15))},
    )
    assert r.json()["available"] is True
    # Leaving on the next guest's check-in day is fine too.
    r = client.get(
        f"/api/apartments/{apartment.id}/quote",
        params={"check_in": str(future(8)), "check_out": str(future(10))},
    )
    assert r.json()["available"] is True
    assert r.json()["total"] == 2 * 500 + 100
    # Overlapping one night is not.
    r = client.get(
        f"/api/apartments/{apartment.id}/quote",
        params={"check_in": str(future(12)), "check_out": str(future(14))},
    )
    assert r.json()["available"] is False


def test_search_returns_only_apartments_free_for_entire_range(client, db):
    a = make_apartment(db, slug_suffix="a", max_guests=4)
    b = make_apartment(db, slug_suffix="b", max_guests=4)
    c = make_apartment(db, slug_suffix="c", max_guests=2)
    make_apartment(db, slug_suffix="d", max_guests=6, active=False)  # inactive
    block(db, b.id, future(12), future(13))  # one night inside the range
    block(db, a.id, future(5), future(10))  # ends on our check-in day: fine
    r = client.get(
        "/api/apartments/search",
        params={"check_in": str(future(10)), "check_out": str(future(14)), "guests": 3},
    )
    assert r.status_code == 200
    assert [x["id"] for x in r.json()] == [a.id]  # b blocked, c too small, d inactive
    r = client.get(
        "/api/apartments/search",
        params={"check_in": str(future(10)), "check_out": str(future(14)), "guests": 2},
    )
    assert sorted(x["id"] for x in r.json()) == sorted([a.id, c.id])


def test_search_respects_min_nights(client, db):
    a = make_apartment(db, slug_suffix="a", min_nights=3)
    r = client.get(
        "/api/apartments/search", params={"check_in": str(future(10)), "check_out": str(future(12))}
    )
    assert r.json() == []
    r = client.get(
        "/api/apartments/search", params={"check_in": str(future(10)), "check_out": str(future(13))}
    )
    assert [x["id"] for x in r.json()] == [a.id]


def test_search_rejects_invalid_ranges(client):
    r = client.get(
        "/api/apartments/search", params={"check_in": str(future(10)), "check_out": str(future(10))}
    )
    assert r.status_code == 422
    r = client.get(
        "/api/apartments/search", params={"check_in": str(future(-3)), "check_out": str(future(2))}
    )
    assert r.status_code == 422


def test_public_apartment_never_exposes_ical_url(client, db, apartment):
    r = client.get(f"/api/apartments/{apartment.slug}")
    assert r.status_code == 200
    assert "airbnb" not in r.text.lower() and "ical" not in r.text.lower()
    r = client.get("/api/apartments")
    assert "ical" not in r.text.lower()


def test_ical_export_contains_direct_bookings_only(client, db, apartment):
    block(db, apartment.id, future(10), future(13), BlockSource.AIRBNB)
    block(db, apartment.id, future(20), future(22), BlockSource.MANUAL)
    r = client.get(f"/api/calendar/{apartment.ical_export_token}.ics")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/calendar")
    assert r.text.count("BEGIN:VEVENT") == 1
    assert client.get("/api/calendar/wrong-token.ics").status_code == 404
