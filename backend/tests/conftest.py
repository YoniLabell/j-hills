"""Test configuration.

Tests run against PostgreSQL when ``TEST_DATABASE_URL`` is set (recommended,
it's what production uses), otherwise against a temporary SQLite file so the
suite also runs without a database server.
"""

import os
import tempfile
from datetime import date, time, timedelta
from decimal import Decimal
from pathlib import Path

_tmp = Path(tempfile.mkdtemp(prefix="ja-tests-"))
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL") or f"sqlite:///{_tmp / 'test.db'}"
os.environ["SECRET_KEY"] = "test-secret-key-that-is-long-enough-1234567890"
os.environ["ENVIRONMENT"] = "test"
os.environ["LOCAL_UPLOAD_DIR"] = str(_tmp / "uploads")
os.environ["CLOUDINARY_CLOUD_NAME"] = ""
os.environ["CLOUDINARY_API_KEY"] = ""
os.environ["CLOUDINARY_API_SECRET"] = ""

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import event  # noqa: E402

from app.api import admin as admin_api  # noqa: E402
from app.api import inquiries as inquiries_api  # noqa: E402
from app.auth.security import hash_password  # noqa: E402
from app.db.database import Base, SessionLocal, engine  # noqa: E402
from app.main import app  # noqa: E402
from app.models import Amenity, Apartment, User  # noqa: E402

if engine.dialect.name == "sqlite":

    @event.listens_for(engine, "connect")
    def _fk_on(dbapi_conn, _):
        dbapi_conn.execute("PRAGMA foreign_keys=ON")


ADMIN_EMAIL = "owner@example.com"
ADMIN_PASSWORD = "correct-horse-battery"


@pytest.fixture(scope="session", autouse=True)
def _schema():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield
    Base.metadata.drop_all(engine)


@pytest.fixture(autouse=True)
def _clean_tables():
    yield
    with engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            conn.execute(table.delete())
    inquiries_api.inquiry_limiter.reset()
    inquiries_api.lead_limiter.reset()
    admin_api.login_ip_limiter.reset()
    admin_api.login_email_limiter.reset()


@pytest.fixture
def db():
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def admin_user(db):
    user = User(email=ADMIN_EMAIL, password_hash=hash_password(ADMIN_PASSWORD), is_admin=True)
    db.add(user)
    db.commit()
    return user


@pytest.fixture
def admin_client(client, admin_user):
    r = client.post("/api/admin/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    return client


@pytest.fixture
def amenities(db):
    rows = [
        Amenity(key="wifi", name_en="WiFi", name_he="אינטרנט אלחוטי", icon="wifi", sort_order=0),
        Amenity(key="kitchen", name_en="Kitchen", name_he="מטבח", icon="chef-hat", sort_order=1),
    ]
    db.add_all(rows)
    db.commit()
    return rows


def make_apartment(db, **overrides) -> Apartment:
    data = dict(
        name="Test Apartment",
        slug=f"test-apartment-{overrides.get('slug_suffix', '1')}",
        neighborhood="Mamilla",
        max_guests=4,
        bedrooms=2,
        beds=2,
        bathrooms=Decimal("1"),
        price_per_night=Decimal("500"),
        cleaning_fee=Decimal("100"),
        check_in_time=time(15),
        check_out_time=time(11),
        airbnb_ical_url="https://www.airbnb.com/calendar/ical/123.ics?s=secret",
        active=True,
    )
    overrides.pop("slug_suffix", None)
    data.update(overrides)
    apt = Apartment(**data)
    db.add(apt)
    db.commit()
    return apt


@pytest.fixture
def apartment(db):
    return make_apartment(db)


def future(days: int) -> date:
    return date.today() + timedelta(days=days)


def ics(*events: str) -> bytes:
    body = "\r\n".join(events)
    return (
        "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Airbnb Inc//Hosting Calendar 0.8.8//EN\r\n"
        "CALSCALE:GREGORIAN\r\n" + body + ("\r\n" if body else "") + "END:VCALENDAR\r\n"
    ).encode()


def vevent(uid: str | None, start: date, end: date | None, summary: str = "Reserved", extra: str = "") -> str:
    lines = ["BEGIN:VEVENT", "DTSTAMP:20260101T000000Z", f"DTSTART;VALUE=DATE:{start:%Y%m%d}"]
    if end is not None:
        lines.append(f"DTEND;VALUE=DATE:{end:%Y%m%d}")
    if uid:
        lines.append(f"UID:{uid}")
    lines.append(f"SUMMARY:{summary}")
    if extra:
        lines.append(extra)
    lines.append("END:VEVENT")
    return "\r\n".join(lines)
