# Jerusalem Apartments — direct-booking website

An independent website for your own vacation apartments in Jerusalem. Guests browse apartments, see live availability and prices, pick dates and **book on WhatsApp** with one tap (or by email), in **English or Hebrew**. Every WhatsApp/email click is silently recorded as an inquiry in the owner dashboard, where it can be confirmed to block the dates. You manage everything from a secure **owner dashboard**. Availability stays **synchronized with Airbnb** through iCal (ICS) calendar feeds, in both directions.

The project is built to deploy on **[Render](https://render.com)** with a Blueprint. Two are included:

- **`render.yaml` (free):** everything in one free Docker web service, plus a free PostgreSQL database. See [Free single-service deployment](#free-single-service-deployment-renderyaml).
- **`render.paid.yaml`:** separate API, website and Cron Job services on paid plans. That's the layout shown below and described in sections 11–13.

```
Render
├── Web Service ── jerusalem-apartments-web  (Next.js website + owner dashboard)
├── Web Service ── jerusalem-apartments-api  (FastAPI backend)
├── PostgreSQL ─── jerusalem-apartments-db
└── Cron Job ───── airbnb-calendar-sync      (hourly: python -m app.scripts.sync_calendars)
Cloudinary ─────── image storage and optimization
```

---

## Contents

1. [Architecture](#1-architecture)
2. [Folder structure](#2-folder-structure)
3. [Local development](#3-local-development)
4. [Environment variables](#4-environment-variables)
5. [Database migrations](#5-database-migrations)
6. [Creating the first admin](#6-creating-the-first-admin)
7. [Adding an apartment](#7-adding-an-apartment)
8. [Uploading images](#8-uploading-images)
9. [Connecting Airbnb iCal](#9-connecting-airbnb-ical)
10. [How automatic synchronization works](#10-how-automatic-synchronization-works)
11. [Deploying to Render](#11-deploying-to-render) ([free single-service](#free-single-service-deployment-renderyaml))
12. [render.paid.yaml explained](#12-renderpaidyaml-explained)
13. [Render environment variables](#13-render-environment-variables)
14. [Tests](#14-tests)
15. [API reference](#15-api-reference)
16. [Security notes](#16-security-notes)
17. [Extending the project](#17-extending-the-project)

---

## 1. Architecture

| Layer | Technology |
| --- | --- |
| Website and owner dashboard | Next.js 16 (App Router), TypeScript, Tailwind CSS 4, react-day-picker |
| API | Python 3.13, FastAPI, SQLAlchemy 2, Alembic, Pydantic 2 |
| Database | PostgreSQL 16 |
| Images | Cloudinary (production) or local disk (development) |
| Calendar | `icalendar` for parsing Airbnb ICS feeds and exporting your own feed |
| Auth | bcrypt password hashes and a signed JWT in an HTTP-only, SameSite cookie |

**Request flow.** The Next.js server renders public pages by calling the API directly (`NEXT_PUBLIC_API_URL`). Requests from the browser to `/api/*` (and `/uploads/*`) go to the website's own domain, and Next.js rewrites proxy them to the API. Because the admin session cookie belongs to the website's own domain, it's a first-party cookie, so it works even in browsers that block third-party cookies. The API still sets strict CORS (`FRONTEND_URL`) for any direct calls.

**Hotel-style dates.** Every stay and blocked period is a half-open range `[check_in, check_out)`. A stay from 10 to 13 October occupies the nights of the 10th, 11th and 12th. The 13th is free for the next guest to check in. Two ranges overlap if and only if `a.start < b.end and b.start < a.end`. This rule lives in `backend/app/services/availability_service.py` and has dedicated tests.

**Availability is always checked on the server.** The calendar in the browser only helps visitors. The API checks availability again when an inquiry is submitted, and once more when you confirm it. Confirmation runs in a transaction that holds a row lock (`SELECT … FOR UPDATE`) on the apartment, so two confirmations, or a confirmation and a calendar sync, can't double-book the same nights.

**Sources of blocked dates** (`blocked_dates.source`):

| Source | Created by | Can be removed in the admin? |
| --- | --- | --- |
| `airbnb` | Calendar sync, keyed by the Airbnb VEVENT `UID` | No. Change it on Airbnb and the next sync updates it. |
| `website_booking` | Confirming an inquiry, or adding a booking manually | Cancel the booking to free the dates |
| `manual` | You, on the apartment's calendar page (maintenance, personal use) | Yes |

## 2. Folder structure

```
/
├── render.yaml                  Free Render Blueprint (one Docker service + database)
├── render.paid.yaml             Paid Blueprint (API + website + cron job + database)
├── Dockerfile, start.sh         Single-container image (website + API)
├── .github/workflows/           Hourly calendar sync trigger for the free deploy
├── .env.example                 Every environment variable, documented
├── backend/
│   ├── app/
│   │   ├── main.py              FastAPI app, CORS, /health, error handling
│   │   ├── config.py            Settings from environment variables
│   │   ├── api/
│   │   │   ├── apartments.py    Public: list, search, detail, quote, settings
│   │   │   ├── availability.py  Public availability + outgoing iCal feed
│   │   │   ├── inquiries.py     Public inquiry form + admin inquiry management
│   │   │   ├── bookings.py      Admin bookings dashboard
│   │   │   ├── admin.py         Login/logout, dashboard, site settings
│   │   │   └── admin_apartments.py  Apartment CRUD, images, calendar, sync
│   │   ├── models/              SQLAlchemy models
│   │   ├── schemas/             Pydantic request/response models
│   │   ├── auth/                Password hashing, JWT, admin dependency
│   │   ├── services/
│   │   │   ├── calendar_sync.py         Airbnb ICS download/parse/import
│   │   │   ├── calendar_export.py       Your bookings as an ICS feed for Airbnb
│   │   │   ├── availability_service.py  Date logic and overlap queries
│   │   │   ├── booking_service.py       Confirm/cancel with double-booking protection
│   │   │   ├── image_service.py         Validation, optimization, Cloudinary/local storage
│   │   │   ├── pricing.py, rate_limit.py, serializers.py, site_settings.py
│   │   ├── scripts/
│   │   │   ├── sync_calendars.py   Run by the Render Cron Job
│   │   │   ├── create_admin.py     Create or reset an admin user
│   │   │   └── seed.py             Development sample data
│   │   └── db/database.py       Engine and session
│   ├── alembic/                 Migrations (0001 schema, 0002 amenities + settings)
│   ├── tests/                   pytest suite
│   ├── requirements.txt         Production dependencies
│   ├── requirements-dev.txt     + pytest, ruff
│   └── alembic.ini
└── frontend/
    ├── app/
    │   ├── (site)/              Public pages: /, /apartments, /apartments/[slug]
    │   ├── admin/               /admin/login and the owner dashboard pages
    │   ├── sitemap.ts, robots.ts
    │   └── layout.tsx           <html lang dir> from the visitor's language
    ├── components/              site/, apartments/, admin/, ui/
    ├── lib/                     API clients, i18n dictionaries (en/he), formatting, WhatsApp
    ├── proxy.ts                 ?lang= handling + admin route guard
    ├── public/images/           Hero illustration and placeholder photos
    ├── next.config.ts           /api and /uploads rewrites to the backend
    └── package.json
```

## 3. Local development

Requirements: Python 3.12+ (3.13 recommended), Node.js 20.9+ (22 recommended) and PostgreSQL 14+.

### Database

```bash
# macOS (Homebrew): brew install postgresql@16 && brew services start postgresql@16
# Ubuntu:           sudo apt install postgresql && sudo service postgresql start
createuser -s "$USER" 2>/dev/null || true
psql -d postgres -c "CREATE USER ja WITH PASSWORD 'ja' CREATEDB;"
createdb -O ja jerusalem_apartments
```

```bash
cp .env.example .env     # then set SECRET_KEY (any long random string locally)
```

The default `DATABASE_URL` in `.env.example` points to the database created above.

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate            # Windows: venv\Scripts\activate
pip install -r requirements-dev.txt # or requirements.txt without the test tools
alembic upgrade head
python -m app.scripts.create_admin  # asks for email + password
python -m app.scripts.seed          # optional: 3 sample apartments
uvicorn app.main:app --reload       # http://localhost:8000  (API docs: /docs)
```

### Frontend

```bash
cd frontend
npm install
npm run dev                         # http://localhost:3000
```

The frontend uses `http://localhost:8000` for the API by default. To point it somewhere else, create `frontend/.env.local` with `NEXT_PUBLIC_API_URL=...`.

Open <http://localhost:3000> for the website and <http://localhost:3000/admin> for the dashboard.

Without Cloudinary credentials, uploaded images are optimized (resized to 2400 px max and converted to WebP) and stored in `backend/uploads/`. That folder is served by the API and git-ignored.

## 4. Environment variables

All variables are documented in [`.env.example`](.env.example).

| Variable | Service | Required | Description |
| --- | --- | --- | --- |
| `DATABASE_URL` | API, cron | yes | PostgreSQL URL. `postgres://` and `postgresql://` are both accepted and converted for psycopg 3. |
| `SECRET_KEY` | API | yes (prod) | Signs admin sessions. At least 32 random characters. The API refuses to start in production without it. |
| `ENVIRONMENT` | API, cron | yes (prod) | `production` turns on Secure cookies, hides `/docs` and enforces `SECRET_KEY`. |
| `FRONTEND_URL` | API | yes | The website's URL, used for CORS. Comma-separate several (e.g. Render URL + custom domain). |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | API | yes (prod) | Image storage. The secret stays on the server; uploads are signed by the API. |
| `CRON_SECRET` | API | free deploy | Secret for `POST /api/cron/sync-calendars`, which GitHub Actions calls hourly. Empty disables the endpoint. |
| `ADMIN_PASSWORD` | API | free deploy | With `ADMIN_EMAIL`, creates the first admin on startup if none exists. |
| `CLOUDINARY_FOLDER` | API | no | Folder prefix in Cloudinary (default `jerusalem-apartments`). |
| `MAX_UPLOAD_MB` | API | no | Maximum size per image (default 10). |
| `PUBLIC_API_URL` | API | no | The API's public URL. Defaults to Render's `RENDER_EXTERNAL_URL`. Used in the export-feed URL. |
| `ADMIN_EMAIL` | API | no | Default contact email for site settings; also used by `create_admin`. |
| `WHATSAPP_NUMBER` | API | no | Initial WhatsApp number (e.g. `972501234567`). You can edit it later in **Settings**. |
| `FORWARDED_ALLOW_IPS` | API | Render | `*` so uvicorn trusts Render's proxy headers. |
| `NEXT_PUBLIC_API_URL` | Web | yes | The API's public URL. **Read at build time**, so redeploy the website after changing it. |
| `SITE_URL` | Web | no | The website's public URL, used for sitemap and canonical/OG links. Defaults to `RENDER_EXTERNAL_URL`. |

Never commit `.env`. It's in `.gitignore`.

## 5. Database migrations

```bash
cd backend
alembic upgrade head                              # apply all migrations
alembic revision --autogenerate -m "describe"     # after changing models
alembic downgrade -1                              # roll back one migration
alembic current                                   # show the current revision
```

Migration `0002` inserts the 14 standard amenities (WiFi, air conditioning, heating, kitchen, washing machine, dryer, elevator, balcony, parking, Smart TV, crib, high chair, Shabbat hot plate, Shabbat kettle) and the site-settings row. A production database is ready to use as soon as migrations finish.

**Concurrency safety.** `alembic/env.py` takes a PostgreSQL advisory lock before migrating. Two migration runs (for example a deploy and a manual `alembic upgrade head` in the Render Shell) can never execute at the same time: the second one waits, then has nothing to do. Only the API service runs migrations; the website and the cron job never do.

## 6. Creating the first admin

Interactive:

```bash
cd backend && python -m app.scripts.create_admin
# Email: you@example.com
# Password: (at least 10 characters)
```

Non-interactive, for example in the Render Shell:

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='a long password' python -m app.scripts.create_admin
python -m app.scripts.create_admin --email you@example.com --reset   # reset a forgotten password
```

## 7. Adding an apartment

1. Go to **/admin/login** and sign in.
2. Open **Apartments → Add apartment**.
3. Fill in:
   - **Description:** the English texts, plus Hebrew in the **עברית** tab. An empty Hebrew field falls back to English.
   - **Capacity and pricing:** guests, bedrooms, beds, bathrooms, price per night, cleaning fee, minimum nights, check-in and check-out times.
   - **Owner WhatsApp:** the apartment owner's WhatsApp number. The **Send details on WhatsApp** button on the apartment page opens WhatsApp with a ready message to this number: apartment, dates, nights, guests, estimated total, the guest's name and message, and a link to the apartment. If empty, the general number from **Settings** is used.
   - **Owner email:** guests without WhatsApp can email this address from the apartment page (same details). If empty, the email from **Settings** is used. The guest's name is required before WhatsApp or email opens.
   - **Location:** choose a preset neighborhood (Mamilla, City Center, Nachlaot, Rehavia, Talbiya, German Colony, Old City) or type your own. Pasting a Google Maps link fills in the coordinates automatically. The street address stays private.
   - **Amenities:** tick the checkboxes.
   - **Airbnb iCal URL**, plus the **Active** and **Featured** switches.
   - **SEO title and meta description:** optional; they default to the name and short description. The Open Graph image is the cover photo.
4. Click **Create apartment**. You land on the edit page, where you can add photos and sync the calendar.

From the apartments list you can also **Duplicate**, **Deactivate/Activate** and **Delete** an apartment. Deleting is only allowed when the apartment has no bookings or inquiries; otherwise deactivate it so its history is kept. A duplicate starts inactive, without photos and without an Airbnb URL.

## 8. Uploading images

On the apartment's edit page, under **Photos**:

- Drag and drop several photos at once, or click **Choose files**. JPEG, PNG and WebP up to 10 MB each are accepted. Previews appear immediately and each photo uploads one at a time.
- **Reorder** by dragging a photo, or with the arrows (easier on a phone).
- **Make cover** picks the photo used on cards, search results and social-media previews.
- **Alt text**: describe the photo for accessibility and SEO. It saves when you leave the field.
- **Delete** removes the photo, and also deletes it from Cloudinary.

The API checks every file's real content with Pillow, not just its extension, and enforces the size limit. In production the images go to Cloudinary, limited to 2400 px. Pages request `f_auto,q_auto` versions at the right width, so visitors get WebP or AVIF in the size they need.

The logo and the homepage hero image are uploaded under **Settings**.

## 9. Connecting Airbnb iCal

**Import Airbnb → website (required):**

1. On Airbnb, open the listing's **Calendar → Availability → Connect calendars → Export calendar** and copy the link (`https://www.airbnb.com/calendar/ical/XXXX.ics?s=XXXX`).
2. Paste it into the apartment's **Airbnb iCal URL** field and click **Save changes**.
3. Click **Sync Airbnb Calendar**. The panel shows how many events were imported, the time of the last sync and any error.

The URL is a secret. It's never included in public API responses, and sync errors never show it.

**Export website → Airbnb (recommended):** the sync panel also shows your apartment's **export URL** (`…/api/calendar/<secret-token>.ics`). In Airbnb choose **Connect calendars → Import calendar** and paste it. Direct bookings and manual blocks will then block those dates on Airbnb too. Airbnb's own reservations are not re-exported, which avoids loops.

## 10. How automatic synchronization works

The Render Cron Job runs `python -m app.scripts.sync_calendars` every hour. For each **active** apartment that has an Airbnb iCal URL, it:

1. Downloads the ICS file (20 s timeout, 5 MB limit, http/https only).
2. Parses each `VEVENT`'s `DTSTART`, `DTEND`, `UID` and `SUMMARY`. It handles all-day dates and date-times, a missing `DTEND` (one night), and a missing `UID` (a stable hash is generated). Cancelled events are skipped.
3. In one transaction, while holding the apartment's row lock:
   - **inserts** events whose UID is new,
   - **updates** events whose dates or summary changed,
   - **deletes** Airbnb blocks whose UID is no longer in the feed (cancelled reservations).
4. Records the result on the apartment (shown as **Last Airbnb Sync**) and in `calendar_sync_logs`.
5. Moves on to the next apartment. **One failing feed never stops the others.** A failure also never deletes existing blocks: if Airbnb is down, or returns an HTML error page instead of a calendar, the previous availability stays in place.

The result always matches the feed exactly, so running the sync repeatedly is safe (it's idempotent). A unique constraint on `(apartment_id, source, external_uid)` prevents duplicate events. The job exits with code 0 after syncing, and it isn't a long-running loop. It exits with code 1 only if the database itself is unreachable, so Render reports that run as failed.

Manual sync from the admin uses the same code (`POST /api/admin/apartments/{id}/sync-calendar`).

## 11. Deploying to Render

> These steps describe the paid multi-service Blueprint (`render.paid.yaml`): set the Blueprint file path to `render.paid.yaml` when creating it. For the free one-service setup, see [Free single-service deployment](#free-single-service-deployment-renderyaml).

1. **Push the repository to GitHub** (or GitLab/Bitbucket).
2. **Connect the repository to Render.** Sign in at <https://dashboard.render.com> and connect your Git provider.
3. **Choose Blueprint deployment.** Click **New → Blueprint** and select the repository.
4. **Render reads the Blueprint file** (`render.paid.yaml`) and shows the four resources it will create: the API, the website, the PostgreSQL database and the cron job.
5. **The PostgreSQL database** `jerusalem-apartments-db` is created automatically. Its connection string is injected into the API and cron job as `DATABASE_URL`.
6. **Configure the backend environment variables.** Render prompts for every `sync: false` value. `SECRET_KEY` is generated for you.
   - `FRONTEND_URL`: the website URL, normally `https://jerusalem-apartments-web.onrender.com`. Check the real URL after creation, because Render adds a suffix if the name is taken.
   - `ADMIN_EMAIL`, `WHATSAPP_NUMBER` (e.g. `972501234567`).
7. **Configure the frontend.** Set `NEXT_PUBLIC_API_URL` to the API URL, normally `https://jerusalem-apartments-api.onrender.com`. `SITE_URL` can stay empty unless you use a custom domain.
8. **Check `FRONTEND_URL`** once both services exist: open each service, copy its URL from the top of the page, and make sure `FRONTEND_URL` (API) and `NEXT_PUBLIC_API_URL` (website) match the real URLs. If you change `NEXT_PUBLIC_API_URL`, click **Manual Deploy → Deploy latest commit** on the website, because the value is read at build time.
9. **Configure Cloudinary.** Create a free account at <https://cloudinary.com>, open **Dashboard → API Keys**, and set `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY` and `CLOUDINARY_API_SECRET` on the API service. Without them, uploads go to the API's local disk, which **Render wipes on every deploy**.
10. **Run the database migrations.** This happens automatically: the API's `preDeployCommand: alembic upgrade head` runs before each new version goes live, and the advisory lock prevents concurrent runs. To run them by hand, open the API service's **Shell** tab and run `alembic upgrade head`.
11. **Create the first admin.** In the API service's **Shell** tab:
    ```bash
    python -m app.scripts.create_admin
    ```
12. **Test `/health`.** `https://<your-api>.onrender.com/health` should return `{"status":"ok"}`. Render also uses this path as the health check.
13. **Add the first apartment.** Open `https://<your-site>.onrender.com/admin/login`, sign in, go to **Apartments → Add apartment**, then upload photos.
14. **Add its Airbnb iCal URL** and save. Optionally paste the export URL into Airbnb (see [section 9](#9-connecting-airbnb-ical)).
15. **Run a manual calendar sync** with **Sync Airbnb Calendar**. Check that the Airbnb dates appear in the apartment's **Calendar** and are disabled on the public page.
16. **Verify the Render Cron Job.** Open `airbnb-calendar-sync` → **Trigger Run** (or wait for the next hour). Its logs should end with `Calendar sync finished … N succeeded, 0 failed`, and **Last Airbnb Sync** in the dashboard should update.

**Custom domain:** add it to the website service (**Settings → Custom Domains**). Then add the domain to `FRONTEND_URL` (comma-separated) and set `SITE_URL` to it.

### Lower-cost options

`render.yaml` uses paid entry-level plans (`starter` instances, `basic-256mb` Postgres) because guests shouldn't wait for a sleeping server, and because `preDeployCommand` needs a paid instance. To experiment for free:

- Set `plan: free` on the two web services and the database. Free web services sleep after inactivity, and free databases expire after 30 days.
- On a free API service, `preDeployCommand` isn't available. Change the API's start command to `alembic upgrade head && uvicorn app.main:app --host 0.0.0.0 --port $PORT`. This is safe because the migration lock prevents concurrent runs.
- Cron jobs have no free plan. If you skip the cron job, use the manual **Sync Airbnb Calendar** button.

## Free single-service deployment (`render.yaml`)

`render.yaml` runs the whole application in **one free Docker web service** (`Dockerfile` + `start.sh`), plus a free PostgreSQL database. Render doesn't allow a database inside a web service, and the service's disk is wiped on every deploy, so the database stays a separate free resource.

```
Render
├── Web Service (Docker, free) ── jerusalem-apartments
│   ├── Next.js   on $PORT (public)
│   └── FastAPI   on 127.0.0.1:8000 (internal; reached via /api, /uploads, /health)
└── PostgreSQL (free) ─────────── jerusalem-apartments-db
GitHub Actions (free) ─── hourly POST /api/cron/sync-calendars  (Airbnb sync)
```

On every start, `start.sh`:

1. runs `alembic upgrade head` (safe: migrations take an advisory lock),
2. creates the first admin from `ADMIN_EMAIL` and `ADMIN_PASSWORD` if no admin exists yet (free instances have no Shell),
3. starts FastAPI and Next.js. If either one stops, the container exits and Render restarts it.

### Steps

1. Render → **New → Blueprint** → select the repository. Render reads `render.yaml`.
2. Fill in the values it asks for:
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD` (at least 10 characters): your login for `/admin`.
   - `CRON_SECRET`: any long random string, e.g. the output of `python -c "import secrets; print(secrets.token_urlsafe(32))"`.
   - `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET`: **required for photos**. Without Cloudinary, uploaded photos disappear on the next deploy.
   - `WHATSAPP_NUMBER`, e.g. `972501234567`.
3. Click **Apply** and wait until the service is **Live**. The first build takes a few minutes.
4. Open `https://<your-service>.onrender.com/health`. It should return `{"status":"ok"}`.
5. Sign in at `https://<your-service>.onrender.com/admin/login`.
6. **Hourly Airbnb sync:** in GitHub → repository **Settings → Secrets and variables → Actions → New repository secret**, add:
   - `SITE_URL` = `https://<your-service>.onrender.com`
   - `CRON_SECRET` = the same value as on Render

   Then open the **Actions** tab → **Sync Airbnb calendars** → **Run workflow** to test it. After that it runs every hour. (GitHub only runs scheduled workflows from the default branch.)

**Demo apartments:** set `SEED_DEMO_DATA` to `true` (service → **Environment**) and save. On the next start, three sample apartments with placeholder photos are added, but only if the database has no apartments yet. Delete them from **Apartments** when you add your own, and set the variable back to `false`.

`FRONTEND_URL` and `NEXT_PUBLIC_API_URL` aren't needed here: the website and the API share one URL.

### Free-plan limits

- The service **sleeps after about 15 minutes** without traffic. The next visitor waits about a minute while it starts. The hourly sync also wakes it.
- **Free PostgreSQL databases expire 30 days after creation.** Before then, change the database plan to a paid one (Render → database → Settings) to keep your data.
- To move to the paid multi-service layout later, create a Blueprint from `render.paid.yaml`.

## 12. `render.paid.yaml` explained

| Block | What it does |
| --- | --- |
| `databases[0]` | PostgreSQL 16 database `jerusalem_apartments` in Frankfurt (the closest region to Israel). `ipAllowList: []` blocks public access; services connect over Render's private network. |
| `jerusalem-apartments-api` | Python web service rooted at `backend/`. Build: `pip install -r requirements.txt`. **Pre-deploy: `alembic upgrade head`.** Start: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`. Health check: `/health`. |
| `jerusalem-apartments-web` | Node web service rooted at `frontend/`. Build: `npm install && npm run build`. Start: `npm run start -- -p $PORT`. |
| `airbnb-calendar-sync` | Cron job rooted at `backend/`, schedule `0 * * * *` (hourly, UTC). Runs `python -m app.scripts.sync_calendars` and exits. |
| `fromDatabase … connectionString` | Injects the database URL into the API and cron job. |
| `generateValue: true` | Render creates a random `SECRET_KEY` once. |
| `sync: false` | Secrets and URLs that you type in the dashboard. They're never stored in Git. |

All ports come from `$PORT` and all URLs come from environment variables; nothing is hard-coded.

## 13. Render environment variables

| Service | Variable | Value |
| --- | --- | --- |
| API | `DATABASE_URL` | *automatic* (from the database) |
| API | `SECRET_KEY` | *automatic* (generated) |
| API | `ENVIRONMENT` | `production` (set by the Blueprint) |
| API | `FORWARDED_ALLOW_IPS` | `*` (set by the Blueprint) |
| API | `PYTHON_VERSION` | `3.13.4` (set by the Blueprint) |
| API | `FRONTEND_URL` | `https://jerusalem-apartments-web.onrender.com` (your real URL) |
| API | `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | from Cloudinary |
| API | `ADMIN_EMAIL`, `WHATSAPP_NUMBER` | yours |
| Web | `NEXT_PUBLIC_API_URL` | `https://jerusalem-apartments-api.onrender.com` (your real URL) |
| Web | `SITE_URL` | optional custom domain |
| Web | `NODE_VERSION` | `22` (set by the Blueprint) |
| Cron | `DATABASE_URL`, `ENVIRONMENT`, `PYTHON_VERSION` | *automatic* / set by the Blueprint |

## 14. Tests

```bash
cd backend
source venv/bin/activate
pip install -r requirements-dev.txt

# Against PostgreSQL (recommended — same as production):
createdb -O ja jerusalem_apartments_test
TEST_DATABASE_URL=postgresql+psycopg://ja:ja@localhost:5432/jerusalem_apartments_test pytest

# Without a database server (SQLite; the row-locking concurrency test is skipped):
pytest

ruff check app tests
```

```bash
cd frontend
npm run lint && npm run typecheck && npm run build
```

The 73 backend tests cover:

- Airbnb ICS parsing, including edge cases and invalid feeds
- Importing events, duplicate prevention, modified events and deleted (cancelled) events
- Feed failures that keep the existing blocks
- One failing apartment not stopping the others, and the cron script's exit code
- Date overlap detection and same-day check-out/check-in
- Apartment availability, search availability and minimum nights
- Website double-booking prevention, including a concurrent-confirmation test on PostgreSQL
- Inquiry validation, the honeypot and rate limiting
- Admin authentication: cookie, bearer token, expired or forged tokens, inactive users, logout and login rate limit
- Apartment CRUD, translations, duplicate, safe delete, image upload/reorder/cover/delete and validation, settings and the dashboard

## 15. API reference

Interactive docs are available at `http://localhost:8000/docs` (disabled in production).

**Public**

| Method | Path | Notes |
| --- | --- | --- |
| GET | `/health` | `{"status":"ok"}` |
| GET | `/api/apartments` | `?lang=en\|he&neighborhood=&bedrooms=&guests=&featured=` |
| GET | `/api/apartments/search` | `?check_in=2026-10-10&check_out=2026-10-14&guests=4`. Returns only apartments free for the whole stay. |
| GET | `/api/apartments/{slug}` | Apartment details (`?lang=he` for Hebrew) |
| GET | `/api/apartments/{id}/availability` | `?start_date=&end_date=` → merged blocked periods |
| GET | `/api/apartments/{id}/quote` | `?check_in=&check_out=` → price and availability |
| POST | `/api/leads` | Silently records a "Book on WhatsApp" / email click (`channel`: `whatsapp` or `email`). De-duplicated for 30 minutes; rate-limited. |
| POST | `/api/booking-inquiries` | Full inquiry form (kept for API use; the website now books via WhatsApp). Rate-limited (5 per 10 min per IP). |
| GET | `/api/settings`, `/api/amenities`, `/api/neighborhoods` | Site data |
| GET | `/api/calendar/{token}.ics` | Outgoing iCal feed for Airbnb |

**Admin** (needs the session cookie or `Authorization: Bearer <token>`)

| Method | Path |
| --- | --- |
| POST | `/api/admin/login`, `/api/admin/logout` · GET `/api/admin/me`, `/api/admin/dashboard` |
| GET/POST | `/api/admin/apartments` · GET/PUT/DELETE `/api/admin/apartments/{id}` · POST `/api/admin/apartments/{id}/duplicate` |
| POST | `/api/admin/apartments/{id}/images` (multipart `files`) · PUT `/api/admin/apartments/{id}/images/order` · PATCH/DELETE `/api/admin/images/{id}` |
| POST | `/api/admin/apartments/{id}/sync-calendar` → `{"success": true, "events_imported": 5, "last_sync": "…"}` · GET `/api/admin/apartments/{id}/sync-logs` |
| GET | `/api/admin/apartments/{id}/blocked-dates` · POST `/api/admin/apartments/{id}/block-dates` · DELETE `/api/admin/blocked-dates/{id}` |
| GET/POST | `/api/admin/bookings` · PATCH `/api/admin/bookings/{id}` (cancel) |
| GET | `/api/admin/inquiries` · GET/PATCH `/api/admin/inquiries/{id}` (`status`: `NEW`, `CONTACTED`, `CONFIRMED`, `CANCELLED`) |
| GET/PUT | `/api/admin/settings` · POST `/api/admin/settings/upload/{logo\|hero}` · GET `/api/admin/amenities` |

## 16. Security notes

- **Passwords:** bcrypt (cost 12). Login timing is the same whether or not the email exists. Login is rate-limited per IP and per email.
- **Sessions:** a JWT (HS256, 12-hour expiry) in an `HttpOnly`, `SameSite=Lax` cookie, which is `Secure` in production. Every admin endpoint checks the token and that the user is an active admin. The Next.js proxy only redirects visitors without a cookie away from admin pages; the API is the real gatekeeper.
- **CORS:** explicit origins from `FRONTEND_URL` with credentials. `"*"` is never used.
- **Input validation:** Pydantic schemas on every endpoint. All database access goes through the SQLAlchemy ORM with bound parameters.
- **Uploads:** checked by type, size and real image decoding (Pillow), with a pixel-count limit against decompression bombs. Cloudinary uploads are signed on the server.
- **Errors:** unhandled exceptions are logged on the server and return a generic `500` with no stack trace. `/docs` is hidden in production. Airbnb feed URLs never appear in error messages.
- **Spam:** the inquiry form uses a honeypot field and per-IP rate limiting. The rate limiter is in memory, which suits a single API instance; use a shared store if you scale out.

## 17. Extending the project

The code is structured so these can be added without rewrites:

- **Booking.com / Vrbo sync:** add a value to `BlockSource`, store the feed URL, and call `calendar_sync.sync_apartment` with that source. Parsing, idempotent import and logging are already provider-agnostic.
- **Online payments:** add a payment step between inquiry and `booking_service.create_booking`. The confirmation logic and its locking stay the same.
- **Coupons and dynamic pricing:** all prices come from `services/pricing.quote()`.
- **More currencies:** `SUPPORTED_CURRENCIES` in `config.py`. Prices are formatted with `Intl.NumberFormat`.
- **Email confirmations, cleaning schedules, self check-in, analytics:** build them on the `Booking` and `BlockedDate` tables and the existing admin API.
