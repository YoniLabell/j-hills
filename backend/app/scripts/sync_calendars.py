"""Synchronize every active apartment's Airbnb calendar, then exit.

Run by the Render Cron Job (hourly):

    python -m app.scripts.sync_calendars

Safe to run repeatedly or concurrently with a manual sync from the admin:
each apartment is synced in its own transaction under a row lock, and events
are matched by their iCal UID, so the result is always identical to the feed.
A failing apartment is logged and skipped; the rest still sync.
"""

import logging
import sys
import time

from app.db.database import SessionLocal
from app.models import SyncTrigger
from app.services.calendar_sync import sync_all

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("sync_calendars")


def main() -> int:
    started = time.monotonic()
    try:
        results = sync_all(SessionLocal, trigger=SyncTrigger.CRON)
    except Exception:
        # Database unreachable or similar: a real failure Render should report.
        logger.exception("Calendar sync could not run")
        return 1

    ok = [r for r in results if r.success]
    failed = [r for r in results if not r.success]
    for r in results:
        if r.success:
            logger.info(
                "apartment=%s OK events=%s created=%s updated=%s removed=%s",
                r.apartment_id,
                r.events_imported,
                r.created,
                r.updated,
                r.removed,
            )
        else:
            logger.error("apartment=%s FAILED: %s", r.apartment_id, r.error)
    logger.info(
        "Calendar sync finished in %.1fs: %s apartments, %s succeeded, %s failed",
        time.monotonic() - started,
        len(results),
        len(ok),
        len(failed),
    )
    # Individual feed failures are recorded per apartment (visible in the admin),
    # so the job itself still exits successfully.
    return 0


if __name__ == "__main__":
    sys.exit(main())
