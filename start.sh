#!/bin/sh
# Container entrypoint for the single-service deploy (see Dockerfile).
set -e

cd /app/backend

# On Render, never put SQLite on an ephemeral filesystem.
case "${DATABASE_URL:-sqlite:///./apartments.db}" in
  sqlite:////var/data/*) test -d /var/data && test -w /var/data || { echo "SQLite persistent disk /var/data is missing or not writable" >&2; exit 1; } ;;
  sqlite:*) if [ "${ENVIRONMENT:-}" = production ]; then echo "Production SQLite must use sqlite:////var/data/... on a persistent disk" >&2; exit 1; fi ;;
esac

# 1. Database migrations (Alembic supports SQLite and PostgreSQL).
alembic upgrade head

# 2. First admin from ADMIN_EMAIL / ADMIN_PASSWORD, only if none exists yet
#    (free Render instances have no Shell).
python -m app.scripts.create_admin --if-missing

# 3. Optional demo apartments (SEED_DEMO_DATA=true), only into an empty database.
case "$SEED_DEMO_DATA" in
  true|1|yes) python -m app.scripts.seed --if-empty ;;
esac

# Start the internal API first, and only expose Next.js after the API is ready.
# This avoids server-side Next.js fetches failing during cold start.
uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips="*" &
API_PID=$!

cleanup() {
  kill "$API_PID" "${WEB_PID:-}" 2>/dev/null || true
}
trap cleanup TERM INT EXIT

python - <<'PY'
import time
import urllib.error
import urllib.request

for attempt in range(100):
    try:
        with urllib.request.urlopen("http://127.0.0.1:8000/health", timeout=2) as response:
            if response.status == 200:
                print("Internal API is ready.", flush=True)
                break
    except (OSError, urllib.error.URLError):
        pass
    time.sleep(0.2)
else:
    raise SystemExit("Internal API failed to become ready within 20 seconds.")
PY

# Next.js is the only public listener (0.0.0.0:$PORT) on Render.
cd /app/web
HOSTNAME=0.0.0.0 PORT="${PORT:-10000}" node server.js &
WEB_PID=$!

# Fail the container if either child exits; Render can then restart it.
while kill -0 "$API_PID" 2>/dev/null && kill -0 "$WEB_PID" 2>/dev/null; do
  sleep 2
done
echo "API or website exited; shutting down." >&2
exit 1
