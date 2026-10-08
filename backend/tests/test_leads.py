from app.models import BlockedDate, BlockSource
from tests.conftest import future


def lead(apartment_id, **kw):
    data = {
        "apartment_id": apartment_id,
        "check_in": str(future(10)),
        "check_out": str(future(13)),
        "guests": 2,
        "channel": "whatsapp",
        "locale": "he",
    }
    data.update(kw)
    return data


def test_whatsapp_lead_recorded_and_visible_in_admin(admin_client, client, apartment):
    r = client.post("/api/leads", json=lead(apartment.id, full_name="דנה לוי"))
    assert r.status_code == 201 and r.json()["created"] is True
    [item] = admin_client.get("/api/admin/inquiries").json()["items"]
    assert item["channel"] == "whatsapp" and item["full_name"] == "דנה לוי"
    assert item["phone"] == "" and item["status"] == "NEW" and item["estimated_total"] == 1600


def test_lead_without_name_and_duplicate_clicks(admin_client, client, apartment):
    first = client.post("/api/leads", json=lead(apartment.id)).json()
    # Clicking again, then switching to email, then adding a name: still one lead.
    assert client.post("/api/leads", json=lead(apartment.id)).json() == {"id": first["id"], "created": False}
    client.post("/api/leads", json=lead(apartment.id, channel="email"))
    client.post("/api/leads", json=lead(apartment.id, full_name="Dana"))
    items = admin_client.get("/api/admin/inquiries").json()["items"]
    # The latest click decides the channel shown in the admin.
    assert len(items) == 1 and items[0]["full_name"] == "Dana" and items[0]["channel"] == "whatsapp"
    # Different dates are a separate lead.
    client.post("/api/leads", json=lead(apartment.id, check_in=str(future(20)), check_out=str(future(22))))
    assert admin_client.get("/api/admin/inquiries").json()["total"] == 2


def test_lead_can_be_confirmed_and_blocks_dates(admin_client, client, db, apartment):
    lead_id = client.post("/api/leads", json=lead(apartment.id)).json()["id"]
    r = admin_client.patch(f"/api/admin/inquiries/{lead_id}", json={"status": "CONFIRMED"})
    assert r.status_code == 200, r.text
    bookings = admin_client.get("/api/admin/bookings", params={"source": "website"}).json()["items"]
    assert bookings[0]["guest_name"] == "Whatsapp guest"
    assert client.get(f"/api/apartments/{apartment.id}/availability").json()["blocked"] == [
        {"start_date": str(future(10)), "end_date": str(future(13))}
    ]


def test_lead_validation(client, db, apartment):
    assert client.post("/api/leads", json=lead(apartment.id, channel="sms")).status_code == 422
    assert client.post("/api/leads", json=lead(apartment.id, guests=9)).status_code == 422
    assert client.post("/api/leads", json=lead(9999)).status_code == 404
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
    assert client.post("/api/leads", json=lead(apartment.id)).status_code == 409
