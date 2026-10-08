from app.config import get_settings
from app.scripts import create_admin
from tests.conftest import future, ics, make_apartment, vevent


def test_cron_endpoint_disabled_without_secret(client):
    assert client.post("/api/cron/sync-calendars").status_code == 404


def test_cron_endpoint_requires_secret_and_syncs(client, db, monkeypatch):
    monkeypatch.setattr(get_settings(), "cron_secret", "s3cret-value-for-tests")
    from app.api import cron
    from app.services import calendar_sync

    feed = ics(vevent("c1", future(3), future(5)))
    monkeypatch.setattr(
        cron,
        "sync_all",
        lambda factory, trigger: calendar_sync.sync_all(factory, trigger=trigger, fetcher=lambda url: feed),
    )
    make_apartment(db, slug_suffix="cron")
    assert client.post("/api/cron/sync-calendars", headers={"X-Cron-Secret": "wrong"}).status_code == 401
    r = client.post("/api/cron/sync-calendars", headers={"X-Cron-Secret": "s3cret-value-for-tests"})
    assert r.status_code == 200, r.text
    assert r.json() == {"apartments": 1, "succeeded": 1, "failed": []}


def test_create_admin_if_missing(db, monkeypatch, admin_user):
    # Admin exists -> no-op, exit 0.
    assert create_admin.main(["--if-missing"]) == 0


def test_create_admin_if_missing_creates_from_env(db, monkeypatch):
    from sqlalchemy import select

    from app.models import User

    monkeypatch.setenv("ADMIN_PASSWORD", "a-long-startup-password")
    assert create_admin.main(["--if-missing", "--email", "boot@example.com"]) == 0
    assert db.scalar(select(User.email)) == "boot@example.com"
    # Running again on the next restart changes nothing.
    assert create_admin.main(["--if-missing", "--email", "other@example.com"]) == 0
    assert list(db.scalars(select(User.email))) == ["boot@example.com"]
