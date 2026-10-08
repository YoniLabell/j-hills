"""Calendar sync trigger for external schedulers.

Render's free plan has no Cron Jobs, so a scheduler outside Render (the GitHub
Actions workflow in .github/workflows/sync-calendars.yml) calls this endpoint
hourly. The request also wakes a sleeping free instance.
"""

import hmac
import logging

from fastapi import APIRouter, Header, HTTPException

from app.config import get_settings
from app.db.database import SessionLocal
from app.models import SyncTrigger
from app.services.calendar_sync import sync_all

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/cron", tags=["cron"], include_in_schema=False)


@router.post("/sync-calendars")
def cron_sync_calendars(x_cron_secret: str = Header(default="")):
    secret = get_settings().cron_secret
    if not secret:
        raise HTTPException(status_code=404, detail="Not found.")
    if not hmac.compare_digest(x_cron_secret.encode(), secret.encode()):
        raise HTTPException(status_code=401, detail="Invalid cron secret.")
    results = sync_all(SessionLocal, trigger=SyncTrigger.CRON)
    failed = [r for r in results if not r.success]
    for r in failed:
        logger.error("apartment=%s FAILED: %s", r.apartment_id, r.error)
    return {
        "apartments": len(results),
        "succeeded": len(results) - len(failed),
        "failed": [{"apartment_id": r.apartment_id, "error": r.error} for r in failed],
    }
