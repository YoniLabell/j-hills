# Single-service image: the Next.js website and the FastAPI backend run in one
# container. Only Next.js listens on Render's $PORT; it forwards /api, /uploads
# and /health to FastAPI on 127.0.0.1:8000 inside the container.

# ---------------------------------------------------------------- website build
FROM node:22-bookworm-slim AS web-build
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
ENV NEXT_TELEMETRY_DISABLED=1 \
    NEXT_OUTPUT_STANDALONE=1 \
    NEXT_PUBLIC_API_URL=http://127.0.0.1:8000
RUN npm run build

# ---------------------------------------------------------------- runtime
FROM python:3.13-slim-bookworm
COPY --from=web-build /usr/local/bin/node /usr/local/bin/node

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    API_INTERNAL_URL=http://127.0.0.1:8000

WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install -r requirements.txt
COPY backend/ ./

WORKDIR /app/web
COPY --from=web-build /web/.next/standalone ./
COPY --from=web-build /web/.next/static ./.next/static
COPY --from=web-build /web/public ./public

COPY start.sh /app/start.sh
RUN chmod +x /app/start.sh && useradd --create-home app && chown -R app /app
USER app

ENV PORT=10000
EXPOSE 10000
CMD ["/app/start.sh"]
