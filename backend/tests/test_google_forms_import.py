"""Google Forms webhook tests: authentication, draft-only, idempotency and photos."""
import base64
import io
from types import SimpleNamespace

from PIL import Image


def sample_answers():
    return {
        "2. מספר WhatsApp ליצירת קשר": "0501234567",
        "3. כתובת אימייל": "owner@example.org",
        "6. שם הדירה להצגה באתר — בעברית": "דירה ברחביה",
        "7. רחוב ומספר בית": "Demo 1 Jerusalem",
        "8. שכונה בירושלים": "רחביה",
        "10. האם יש מעלית?": "לא",
        "14. מספר אורחים מרבי": "7",
        "15. מספר חדרי שינה": "3",
        "16. מספר מיטות כולל": "5",
        "17. מספר חדרי רחצה": "2",
        "22. מיזוג וחימום": ["מזגן", "חימום"],
        "25. אינטרנט ובידור": ["Wi-Fi", "טלוויזיה"],
        "36. מחיר בסיס ללילה (₪)": "850",
        "37. דמי ניקיון (₪, 0 אם אין)": "250",
        "38. מינימום לילות להזמנה": "2",
        "39. שעת צ׳ק-אין (HH:MM)": "15:00",
        "40. שעת צ׳ק-אאוט (HH:MM)": "11:00",
        "43. האם מותר לעשן?": "לא",
        "47. מה מייחד את הדירה?": "דירה נעימה",
        "50. שם הדירה באנגלית": "Rehavia Example",
        "56. אישור פרסום הפרטים והתמונות":
            "אני מאשר/ת שיש לי זכות לפרסם את פרטי הדירה ואת תמונותיה באתר",
    }


def setup_secret(monkeypatch):
    monkeypatch.setattr("app.api.google_forms.get_settings",
                        lambda: SimpleNamespace(google_forms_secret="test-import-secret"))


def post_draft(client, answers=None, response_id="response-12345", secret="test-import-secret"):
    return client.post(
        "/api/integrations/google-forms/submissions",
        headers={"X-Forms-Secret": secret},
        json={"form_id": "form-12345", "response_id": response_id,
              "answers": answers if answers is not None else sample_answers()},
    )


def test_form_submission_is_private_inactive_and_idempotent(client, admin_client, monkeypatch):
    setup_secret(monkeypatch)
    assert post_draft(client, secret="wrong").status_code == 401
    r = post_draft(client)
    assert r.status_code == 200, r.text
    assert r.json()["created"] is True
    aid = r.json()["apartment_id"]
    row = admin_client.get(f"/api/admin/apartments/{aid}").json()
    assert row["active"] is False
    assert row["name"] == "Rehavia Example"
    assert row["translations"]["he"]["name"] == "דירה ברחביה"
    assert row["price_per_night"] == 850
    assert row["max_guests"] == 7
    assert row["owner_whatsapp"] == "972501234567"
    assert client.get("/api/apartments").json() == []
    repeated = post_draft(client)
    assert repeated.status_code == 200 and repeated.json() == {
        "apartment_id": aid, "created": False, "active": False,
    }


def test_invalid_answers_cannot_create_apartment(client, admin_client, monkeypatch):
    setup_secret(monkeypatch)
    values = sample_answers()
    values.pop("56. אישור פרסום הפרטים והתמונות")
    assert post_draft(client, values).status_code == 422
    values = sample_answers()
    values["36. מחיר בסיס ללילה (₪)"] = "-50"
    assert post_draft(client, values).status_code == 422
    assert admin_client.get("/api/admin/apartments").json() == []


def test_google_form_image_upload_retries_without_duplicates(client, admin_client, monkeypatch):
    setup_secret(monkeypatch)
    aid = post_draft(client).json()["apartment_id"]
    buffer = io.BytesIO()
    Image.new("RGB", (48, 32), (100, 150, 200)).save(buffer, format="PNG")
    photo = {
        "drive_file_id": "drive-file-12345",
        "filename": "living-room.png",
        "content_type": "image/png",
        "data_base64": base64.b64encode(buffer.getvalue()).decode(),
    }
    url = f"/api/integrations/google-forms/submissions/{aid}/photos"
    assert client.post(url, json=photo).status_code == 401
    headers = {"X-Forms-Secret": "test-import-secret"}
    first = client.post(url, json=photo, headers=headers)
    assert first.status_code == 200, first.text
    assert first.json()["created"] is True
    second = client.post(url, json=photo, headers=headers)
    assert second.status_code == 200 and second.json()["created"] is False
    images = admin_client.get(f"/api/admin/apartments/{aid}").json()["images"]
    assert len(images) == 1 and images[0]["is_cover"] is True


def test_another_form_response_creates_another_inactive_draft(client, admin_client, monkeypatch):
    setup_secret(monkeypatch)
    first = post_draft(client, response_id="response-first-123").json()["apartment_id"]
    second = post_draft(client, response_id="response-second-456").json()["apartment_id"]
    assert first != second
    rows = admin_client.get("/api/admin/apartments").json()
    assert len(rows) == 2
    assert not any(row["active"] for row in rows)


def test_imported_photo_cannot_be_attached_to_another_draft(client, monkeypatch):
    setup_secret(monkeypatch)
    first = post_draft(client, response_id="response-first-123").json()["apartment_id"]
    second = post_draft(client, response_id="response-second-456").json()["apartment_id"]
    buffer = io.BytesIO()
    Image.new("RGB", (32, 32), (70, 120, 170)).save(buffer, format="PNG")
    photo = {
        "drive_file_id": "same-upload-file-123",
        "filename": "sample.png",
        "content_type": "image/png",
        "data_base64": base64.b64encode(buffer.getvalue()).decode(),
    }
    headers = {"X-Forms-Secret": "test-import-secret"}
    assert client.post(f"/api/integrations/google-forms/submissions/{first}/photos",
                       json=photo, headers=headers).status_code == 200
    assert client.post(f"/api/integrations/google-forms/submissions/{second}/photos",
                       json=photo, headers=headers).status_code == 409


def test_form_preserves_supplementary_sleeping_answer(client, admin_client, monkeypatch):
    setup_secret(monkeypatch)
    answers = sample_answers()
    answers["21. מקומות שינה בסלון"] = "כן"
    answers["21א. פירוט מקומות שינה בסלון"] = "ספה נפתחת לשני אורחים"
    response = post_draft(client, answers=answers, response_id="sleep-answers-123")
    assert response.status_code == 200, response.text
    apartment = admin_client.get(
        f"/api/admin/apartments/{response.json()['apartment_id']}"
    ).json()
    description = apartment["translations"]["he"]["description"]
    assert "שינה בסלון: כן" in description
    assert "פירוט שינה בסלון: ספה נפתחת לשני אורחים" in description
