# SQLite deployment on Render (J Hills)

This branch changes the default local DB to SQLite and `render.yaml` to a **paid single web service** with a persistent disk.

## Deploy without losing existing production availability

1. Keep the current Render service running while reviewing this branch. **Do not delete the PostgreSQL database until you have tested the replacement.** No production data is migrated; the SQLite DB starts empty.
2. Use Render's Blueprint preview for the new `render.yaml`, or configure the existing Docker web service as `Starter`, **one instance**, with a 1 GB persistent disk mounted at `/var/data`. The service must use this branch (or merge it after configuring the disk).
3. In Render → Service → Environment set `DATABASE_URL=sqlite:////var/data/apartments.db`, `ENVIRONMENT=production`, `LOCAL_UPLOAD_DIR=/var/data/uploads`, and keep the existing **SECRET_KEY**, **ADMIN_EMAIL**, **ADMIN_PASSWORD** (needed to create the first admin), **CRON_SECRET**, **GOOGLE_FORMS_SECRET**, Cloudinary variables, and other configured integrations. Do not copy secret values into GitHub.
4. Ensure the service uses the root `Dockerfile` and `start.sh`. The startup script runs `alembic upgrade head` against the new empty database and creates the admin if none exists. Keep `SEED_DEMO_DATA=false` if you do not want sample apartments.
5. Open `/health`, log into `/admin`, add a test apartment, test availability and booking creation, test Google Forms and image uploads. Restart or redeploy once and confirm the apartment persists.
6. For hourly Airbnb calendar sync, use `.github/workflows/sync-calendars.yml` (a request to `POST /api/cron/sync-calendars`). Set GitHub Actions secrets `SITE_URL` and `CRON_SECRET` (same value as Render). A separate Render Cron Job **must not** run the database script: it cannot access this web service's persistent disk.

**Limitations:** SQLite is suitable for a small, single-instance site; do not deploy the API and cron as independent services against a local DB file. SQLite does not support PostgreSQL row locks (`SELECT FOR UPDATE`), so overlapping write operations need concurrency testing before high-traffic booking use. Render disk services do not support zero-downtime deploys or horizontal scaling. Back up the DB regularly (including WAL consistency; use the SQLite backup API or `VACUUM INTO`, not naive live file copying) and store backups outside Render.

The older `render.paid.yaml` still describes the **PostgreSQL multi-service** deployment and is not suitable for this SQLite configuration. Deploy `render.yaml`, not `render.paid.yaml`.
