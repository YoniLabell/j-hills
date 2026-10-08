import io

from PIL import Image

from tests.conftest import future


def apartment_payload(**kw):
    data = {
        "name": "Rehavia Garden Flat",
        "neighborhood": "Rehavia",
        "max_guests": 3,
        "bedrooms": 1,
        "beds": 2,
        "bathrooms": 1,
        "price_per_night": 800,
        "cleaning_fee": 120,
        "check_in_time": "15:00",
        "check_out_time": "11:00",
        "airbnb_ical_url": "https://www.airbnb.com/calendar/ical/1.ics?s=abc",
        "translations": {"he": {"name": "דירת גן ברחביה", "neighborhood": "רחביה"}},
    }
    data.update(kw)
    return data


def png_bytes(size=(64, 48), color=(200, 160, 100)):
    buf = io.BytesIO()
    Image.new("RGB", size, color).save(buf, format="PNG")
    return buf.getvalue()


def test_create_update_and_localize_apartment(admin_client, client, amenities):
    r = admin_client.post("/api/admin/apartments", json=apartment_payload(amenity_ids=[amenities[0].id]))
    assert r.status_code == 201, r.text
    apt = r.json()
    assert apt["slug"] == "rehavia-garden-flat"
    assert apt["airbnb_ical_url"].startswith("https://")
    assert apt["ical_export_url"].endswith(".ics")
    assert apt["amenity_ids"] == [amenities[0].id]

    r = admin_client.put(
        f"/api/admin/apartments/{apt['id']}",
        json={"price_per_night": 900, "amenity_ids": [a.id for a in amenities]},
    )
    assert (
        r.status_code == 200
        and r.json()["price_per_night"] == 900
        and r.json()["name"] == "Rehavia Garden Flat"
    )

    he = client.get(f"/api/apartments/{apt['slug']}", params={"lang": "he"}).json()
    assert he["name"] == "דירת גן ברחביה" and he["neighborhood"] == "רחביה"
    assert {a["name"] for a in he["amenities"]} == {"אינטרנט אלחוטי", "מטבח"}
    en = client.get(f"/api/apartments/{apt['slug']}").json()
    assert en["name"] == "Rehavia Garden Flat"


def test_slug_conflicts_and_validation(admin_client):
    admin_client.post("/api/admin/apartments", json=apartment_payload(slug="my-flat"))
    assert (
        admin_client.post("/api/admin/apartments", json=apartment_payload(slug="my-flat")).status_code == 409
    )
    assert (
        admin_client.post("/api/admin/apartments", json=apartment_payload(slug="Bad Slug!")).status_code
        == 422
    )
    assert (
        admin_client.post(
            "/api/admin/apartments", json=apartment_payload(airbnb_ical_url="ftp://x")
        ).status_code
        == 422
    )
    # Auto slug gets a suffix when taken.
    r = admin_client.post("/api/admin/apartments", json=apartment_payload(name="My Flat"))
    assert r.json()["slug"] == "my-flat-2"


def test_deactivated_apartment_hidden_publicly(admin_client, client):
    apt = admin_client.post("/api/admin/apartments", json=apartment_payload()).json()
    admin_client.put(f"/api/admin/apartments/{apt['id']}", json={"active": False})
    assert client.get(f"/api/apartments/{apt['slug']}").status_code == 404
    assert client.get("/api/apartments").json() == []


def test_duplicate_apartment(admin_client, amenities):
    apt = admin_client.post(
        "/api/admin/apartments", json=apartment_payload(amenity_ids=[amenities[1].id])
    ).json()
    r = admin_client.post(f"/api/admin/apartments/{apt['id']}/duplicate")
    assert r.status_code == 201
    copy = r.json()
    assert copy["slug"] == "rehavia-garden-flat-copy" and copy["active"] is False
    assert copy["airbnb_ical_url"] == "" and copy["amenity_ids"] == [amenities[1].id]
    assert copy["translations"]["he"]["name"] == "דירת גן ברחביה"
    assert copy["ical_export_url"] != apt["ical_export_url"]


def test_delete_only_when_safe(admin_client, client):
    apt = admin_client.post("/api/admin/apartments", json=apartment_payload()).json()
    other = admin_client.post("/api/admin/apartments", json=apartment_payload(name="Other")).json()
    client.post(
        "/api/booking-inquiries",
        json={
            "apartment_id": other["id"],
            "check_in": str(future(5)),
            "check_out": str(future(7)),
            "guests": 2,
            "full_name": "A B",
            "phone": "0501234567",
            "email": "a@example.com",
        },
    )
    assert admin_client.delete(f"/api/admin/apartments/{other['id']}").status_code == 409
    assert admin_client.delete(f"/api/admin/apartments/{apt['id']}").status_code == 204
    assert admin_client.get(f"/api/admin/apartments/{apt['id']}").status_code == 404


def test_image_upload_reorder_cover_and_delete(admin_client, client):
    apt = admin_client.post("/api/admin/apartments", json=apartment_payload()).json()
    files = [
        ("files", (f"photo-{i}.png", png_bytes(color=(i * 40, 100, 100)), "image/png")) for i in range(3)
    ]
    r = admin_client.post(f"/api/admin/apartments/{apt['id']}/images", files=files)
    assert r.status_code == 201, r.text
    images = r.json()
    assert len(images) == 3 and images[0]["url"].endswith(".webp")
    # Uploaded files are served back.
    path = images[0]["url"].split("/uploads/", 1)[1]
    assert client.get(f"/uploads/{path}").status_code == 200

    detail = admin_client.get(f"/api/admin/apartments/{apt['id']}").json()
    assert detail["cover_image"]["id"] == images[0]["id"]

    new_order = [images[2]["id"], images[0]["id"], images[1]["id"]]
    r = admin_client.put(f"/api/admin/apartments/{apt['id']}/images/order", json={"image_ids": new_order})
    assert [i["id"] for i in r.json()] == new_order

    r = admin_client.patch(
        f"/api/admin/images/{images[1]['id']}", json={"is_cover": True, "alt_text": "Living room"}
    )
    assert r.json()["is_cover"] is True and r.json()["alt_text"] == "Living room"
    detail = admin_client.get(f"/api/admin/apartments/{apt['id']}").json()
    assert [i["is_cover"] for i in detail["images"]].count(True) == 1

    # Deleting the cover promotes another image.
    assert admin_client.delete(f"/api/admin/images/{images[1]['id']}").status_code == 204
    detail = admin_client.get(f"/api/admin/apartments/{apt['id']}").json()
    assert len(detail["images"]) == 2 and detail["cover_image"] is not None
    assert client.get(f"/uploads/{path}").status_code == 200  # other files untouched


def test_image_upload_validation(admin_client):
    apt = admin_client.post("/api/admin/apartments", json=apartment_payload()).json()
    url = f"/api/admin/apartments/{apt['id']}/images"
    r = admin_client.post(url, files=[("files", ("evil.png", b"<?php echo 1; ?>", "image/png"))])
    assert r.status_code == 422
    r = admin_client.post(url, files=[("files", ("doc.pdf", b"%PDF-1.4", "application/pdf"))])
    assert r.status_code == 422
    big = b"\x89PNG" + b"0" * (11 * 1024 * 1024)
    r = admin_client.post(url, files=[("files", ("big.png", big, "image/png"))])
    assert r.status_code == 422 and "MB" in r.json()["detail"]
    assert admin_client.get(f"/api/admin/apartments/{apt['id']}").json()["images"] == []


def test_settings_roundtrip(admin_client, client):
    r = admin_client.put(
        "/api/admin/settings",
        json={"site_name": "My Jerusalem", "whatsapp_number": "+972 50-123-4567", "default_currency": "usd"},
    )
    assert r.status_code == 200, r.text
    assert r.json()["whatsapp_number"] == "972501234567" and r.json()["default_currency"] == "USD"
    assert client.get("/api/settings").json()["site_name"] == "My Jerusalem"
    assert admin_client.put("/api/admin/settings", json={"default_currency": "XYZ"}).status_code == 422


def test_dashboard(admin_client, client, db):
    apt = admin_client.post("/api/admin/apartments", json=apartment_payload()).json()
    client.post(
        "/api/booking-inquiries",
        json={
            "apartment_id": apt["id"],
            "check_in": str(future(1)),
            "check_out": str(future(4)),
            "guests": 2,
            "full_name": "A B",
            "phone": "0501234567",
            "email": "a@example.com",
        },
    )
    inquiry = admin_client.get("/api/admin/inquiries").json()["items"][0]
    d = admin_client.get("/api/admin/dashboard").json()
    assert d["apartments_total"] == 1 and d["new_inquiries"] == 1
    admin_client.patch(f"/api/admin/inquiries/{inquiry['id']}", json={"status": "CONFIRMED"})
    d = admin_client.get("/api/admin/dashboard").json()
    assert d["upcoming_bookings"] == 1 and d["upcoming_checkins"][0]["guest_name"] == "A B"
    assert d["occupancy_percent_30d"] == 10.0


def test_owner_whatsapp_overrides_site_number(admin_client, client):
    admin_client.put("/api/admin/settings", json={"whatsapp_number": "972500000000"})
    shared = admin_client.post("/api/admin/apartments", json=apartment_payload(name="Shared")).json()
    owned = admin_client.post(
        "/api/admin/apartments", json=apartment_payload(name="Owned", owner_whatsapp="050-123-4567")
    ).json()
    # Local Israeli mobile numbers are converted to international format.
    assert owned["owner_whatsapp"] == "972501234567"
    assert client.get(f"/api/apartments/{owned['slug']}").json()["whatsapp_number"] == "972501234567"
    assert client.get(f"/api/apartments/{shared['slug']}").json()["whatsapp_number"] == "972500000000"
    # Clearing the owner number falls back to the site number.
    admin_client.put(f"/api/admin/apartments/{owned['id']}", json={"owner_whatsapp": ""})
    assert client.get(f"/api/apartments/{owned['slug']}").json()["whatsapp_number"] == "972500000000"
    assert (
        admin_client.post("/api/admin/apartments", json=apartment_payload(owner_whatsapp="123")).status_code
        == 422
    )
