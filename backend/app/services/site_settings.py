from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.models import SITE_SETTINGS_ID, SiteSettings


def get_site_settings(db: Session) -> SiteSettings:
    """Return the singleton settings row, creating it with defaults if missing."""
    row = db.get(SiteSettings, SITE_SETTINGS_ID)
    if row is not None:
        return row
    env = get_settings()
    row = SiteSettings(
        id=SITE_SETTINGS_ID,
        whatsapp_number="".join(c for c in env.whatsapp_number if c.isdigit()),
        email=env.admin_email,
    )
    db.add(row)
    try:
        db.commit()
    except IntegrityError:  # created concurrently
        db.rollback()
        row = db.get(SiteSettings, SITE_SETTINGS_ID)
    return row
