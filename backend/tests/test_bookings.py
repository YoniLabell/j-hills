from sqlalchemy import select

from app.models import BlockedDate, BlockSource, Booking
from tests.conftest import future


def inquiry_payload(apartment_id, check_in, check_out, **kw):
    data = {
        "apartment_id": apartment_id,
        "check_in": str(check_in),
        "check_out": str(check_out),
        "guests": 2,
        "full_name": "Dana Levi",
        "phone": "+972 50-123-4567",
        "email": "dana@example.com",
        "message": "Looking forward!",
    }
    data.update(kw)
    return data


def test_create_inquiry(client, db, apartment):
    r = client.post("/api/booking-inquiries", json=inquiry_payload(apartment.id, future(10), future(13)))
    assert r.status_code == 201, r.text
    body = r.json()
    assert body["status"] == "NEW" and body["nights"] == 3 and body["estimated_total"] == 1600


def test_inquiry_validation(client, apartment):
    bad = [
        inquiry_payload(apartment.id, future(10), future(10)),
        inquiry_payload(apartment.id, future(10), future(13), guests=9),
        inquiry_payload(apartment.id, future(10), future(13), email="nope"),
        inquiry_payload(apartment.id, future(10), future(13), phone="abc"),
        inquiry_payload(apartment.id, future(-5), future(-2)),
    ]
    for payload in bad:
        assert client.post("/api/booking-inquiries", json=payload).status_code == 422, payload
    assert (
        client.post("/api/booking-inquiries", json=inquiry_payload(9999, future(10), future(13))).status_code
        == 404
    )


def test_inquiry_rejected_for_blocked_dates_even_if_frontend_allows(client, db, apartment):
    db.add(
        BlockedDate(
            apartment_id=apartment.id,
            start_date=future(11),
            end_date=future(12),
            source=BlockSource.AIRBNB,
            external_uid="x",
        )
    )
    db.commit()
    r = client.post("/api/booking-inquiries", json=inquiry_payload(apartment.id, future(10), future(13)))
    assert r.status_code == 409


def test_inquiry_rate_limit(client, apartment):
    codes = [
        client.post(
            "/api/booking-inquiries", json=inquiry_payload(apartment.id, future(10 + i), future(11 + i))
        ).status_code
        for i in range(7)
    ]
    assert codes[:5] == [201] * 5 and codes[5] == 429


def test_honeypot_stores_nothing(client, db, apartment):
    r = client.post(
        "/api/booking-inquiries",
        json=inquiry_payload(apartment.id, future(10), future(12), website="spam.example"),
    )
    assert r.status_code == 201
    from app.models import BookingInquiry

    assert db.scalar(select(BookingInquiry)) is None


def test_confirm_inquiry_blocks_dates(admin_client, client, db, apartment):
    inquiry_id = client.post(
        "/api/booking-inquiries", json=inquiry_payload(apartment.id, future(10), future(13))
    ).json()["id"]
    r = admin_client.patch(f"/api/admin/inquiries/{inquiry_id}", json={"status": "CONFIRMED"})
    assert r.status_code == 200, r.text
    assert r.json()["status"] == "CONFIRMED" and r.json()["booking_id"]

    block = db.scalar(select(BlockedDate).where(BlockedDate.apartment_id == apartment.id))
    assert (block.source, block.start_date, block.end_date) == (
        BlockSource.WEBSITE_BOOKING,
        future(10),
        future(13),
    )
    avail = client.get(f"/api/apartments/{apartment.id}/availability").json()
    assert avail["blocked"] == [{"start_date": str(future(10)), "end_date": str(future(13))}]
    # Same-day turnover still bookable.
    assert (
        client.post(
            "/api/booking-inquiries", json=inquiry_payload(apartment.id, future(13), future(15))
        ).status_code
        == 201
    )


def test_double_booking_prevented_on_confirmation(admin_client, client, db, apartment):
    first = client.post(
        "/api/booking-inquiries", json=inquiry_payload(apartment.id, future(10), future(14))
    ).json()["id"]
    second = client.post(
        "/api/booking-inquiries",
        json=inquiry_payload(apartment.id, future(12), future(16), email="b@example.com"),
    ).json()["id"]
    assert (
        admin_client.patch(f"/api/admin/inquiries/{first}", json={"status": "CONFIRMED"}).status_code == 200
    )
    r = admin_client.patch(f"/api/admin/inquiries/{second}", json={"status": "CONFIRMED"})
    assert r.status_code == 409
    assert r.json()["detail"]["conflicts"][0]["source"] == "website_booking"
    assert len(list(db.scalars(select(Booking)))) == 1
    assert admin_client.get(f"/api/admin/inquiries/{second}").json()["status"] == "NEW"


def test_confirmation_rechecks_airbnb_blocks(admin_client, client, db, apartment):
    inquiry_id = client.post(
        "/api/booking-inquiries", json=inquiry_payload(apartment.id, future(10), future(13))
    ).json()["id"]
    # Airbnb booking arrives (via sync) after the inquiry was sent.
    db.add(
        BlockedDate(
            apartment_id=apartment.id,
            start_date=future(12),
            end_date=future(14),
            source=BlockSource.AIRBNB,
            external_uid="late",
        )
    )
    db.commit()
    assert (
        admin_client.patch(f"/api/admin/inquiries/{inquiry_id}", json={"status": "CONFIRMED"}).status_code
        == 409
    )


def test_cancel_confirmed_inquiry_frees_dates(admin_client, client, db, apartment):
    inquiry_id = client.post(
        "/api/booking-inquiries", json=inquiry_payload(apartment.id, future(10), future(13))
    ).json()["id"]
    admin_client.patch(f"/api/admin/inquiries/{inquiry_id}", json={"status": "CONFIRMED"})
    r = admin_client.patch(f"/api/admin/inquiries/{inquiry_id}", json={"status": "CANCELLED"})
    assert r.status_code == 200 and r.json()["status"] == "CANCELLED"
    assert client.get(f"/api/apartments/{apartment.id}/availability").json()["blocked"] == []
    # And it can be confirmed again later.
    r = admin_client.patch(f"/api/admin/inquiries/{inquiry_id}", json={"status": "CONFIRMED"})
    assert r.status_code == 200, r.text


def test_mark_contacted(admin_client, client, apartment):
    inquiry_id = client.post(
        "/api/booking-inquiries", json=inquiry_payload(apartment.id, future(10), future(13))
    ).json()["id"]
    r = admin_client.patch(
        f"/api/admin/inquiries/{inquiry_id}", json={"status": "CONTACTED", "admin_notes": "Called"}
    )
    assert r.json()["status"] == "CONTACTED" and r.json()["admin_notes"] == "Called"
    listing = admin_client.get("/api/admin/inquiries", params={"status": "CONTACTED"}).json()
    assert listing["total"] == 1


def test_manual_booking_and_bookings_dashboard(admin_client, db, apartment):
    db.add(
        BlockedDate(
            apartment_id=apartment.id,
            start_date=future(30),
            end_date=future(33),
            source=BlockSource.AIRBNB,
            external_uid="air-1",
            reason="Reserved",
        )
    )
    db.commit()
    r = admin_client.post(
        "/api/admin/bookings",
        json={
            "apartment_id": apartment.id,
            "check_in": str(future(5)),
            "check_out": str(future(7)),
            "guests": 2,
            "guest_name": "Phone Guest",
        },
    )
    assert r.status_code == 201, r.text
    # Overlapping manual booking is refused.
    r = admin_client.post(
        "/api/admin/bookings",
        json={
            "apartment_id": apartment.id,
            "check_in": str(future(31)),
            "check_out": str(future(35)),
            "guests": 2,
            "guest_name": "X",
        },
    )
    assert r.status_code == 409

    rows = admin_client.get("/api/admin/bookings").json()["items"]
    assert [(row["guest_name"], row["source"]) for row in rows] == [
        ("Phone Guest", "manual"),
        ("Airbnb Reservation", "airbnb"),
    ]
    airbnb = admin_client.get("/api/admin/bookings", params={"source": "airbnb"}).json()["items"]
    assert len(airbnb) == 1 and airbnb[0]["guest_email"] == "" and airbnb[0]["guests"] is None


def test_manual_blocks_and_airbnb_blocks_deletion_rules(admin_client, db, apartment):
    r = admin_client.post(
        f"/api/admin/apartments/{apartment.id}/block-dates",
        json={"start_date": str(future(20)), "end_date": str(future(25)), "reason": "Maintenance"},
    )
    assert r.status_code == 201 and r.json()["source"] == "manual"
    manual_id = r.json()["id"]
    db.add(
        BlockedDate(
            apartment_id=apartment.id,
            start_date=future(40),
            end_date=future(42),
            source=BlockSource.AIRBNB,
            external_uid="air",
        )
    )
    db.commit()
    airbnb_id = db.scalar(select(BlockedDate.id).where(BlockedDate.source == BlockSource.AIRBNB))

    assert admin_client.delete(f"/api/admin/blocked-dates/{airbnb_id}").status_code == 409
    assert admin_client.delete(f"/api/admin/blocked-dates/{manual_id}").status_code == 204
    remaining = admin_client.get(f"/api/admin/apartments/{apartment.id}/blocked-dates").json()
    assert [b["source"] for b in remaining] == ["airbnb"]


def test_concurrent_confirmations_cannot_double_book(db, apartment):
    """Two admins confirming overlapping stays at the same moment: one must lose.

    Relies on the apartment row lock, so it's only meaningful on PostgreSQL.
    """
    import threading

    import pytest

    from app.db.database import SessionLocal, engine
    from app.services.booking_service import BookingConflict, create_booking

    if engine.dialect.name != "postgresql":
        pytest.skip("row locking requires PostgreSQL")

    barrier = threading.Barrier(2)
    outcomes: list[str] = []

    def attempt(name, start, end):
        with SessionLocal() as s:
            barrier.wait()
            try:
                create_booking(
                    s, apartment_id=apartment.id, check_in=start, check_out=end, guests=2, guest_name=name
                )
                s.commit()
                outcomes.append("ok")
            except BookingConflict:
                s.rollback()
                outcomes.append("conflict")

    threads = [
        threading.Thread(target=attempt, args=("A", future(10), future(14))),
        threading.Thread(target=attempt, args=("B", future(12), future(16))),
    ]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert sorted(outcomes) == ["conflict", "ok"]
    assert len(list(db.scalars(select(Booking)))) == 1
