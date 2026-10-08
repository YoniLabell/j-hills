#!/bin/sh
# Container entrypoint for the single-service deploy (see Dockerfile).
set -e

cd /app/backend

# 1. Migrations (an advisory lock in alembic/env.py prevents concurrent runs).
alembic upgrade head

# 2. First admin from ADMIN_EMAIL / ADMIN_PASSWORD, only if none exists yet
#    (free Render instances have no Shell).
python -m app.scripts.create_admin --if-missing

# 3. API on the container's loopback only; Next.js is the public entry point.
uvicorn app.main:app --host 127.0.0.1 --port 8000 --proxy-headers --forwarded-allow-ips="*" &
API_PID=$!

# 4. Website on Render's $PORT.
cd /app/web
HOSTNAME=0.0.0.0 PORT="${PORT:-10000}" node server.js &
WEB_PID=$!

# If either process exits, stop the other so Render restarts the container.
trap 'kill $API_PID $WEB_PID 2>/dev/null' TERM INT
while kill -0 $API_PID 2>/dev/null && kill -0 $WEB_PID 2>/dev/null; do
  sleep 5
done
echo "A process exited; shutting down." >&2
kill $API_PID $WEB_PID 2>/dev/null || true
exit 1
