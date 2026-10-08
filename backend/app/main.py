import logging
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from app.api import admin, admin_apartments, apartments, availability, bookings, cron, inquiries
from app.config import get_settings

settings = get_settings()
settings.validate_for_runtime()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)
logger = logging.getLogger("app")

app = FastAPI(
    title="Jerusalem Apartments API",
    version="1.0.0",
    docs_url=None if settings.is_production else "/docs",
    redoc_url=None,
    openapi_url=None if settings.is_production else "/openapi.json",
)

# Explicit origins (never "*") because admin requests carry credentials.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept-Language"],
)


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers.setdefault("X-Content-Type-Options", "nosniff")
    response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
    response.headers.setdefault("X-Frame-Options", "DENY")
    if request.url.path.startswith("/api/admin"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


@app.exception_handler(Exception)
async def unhandled_exception(request: Request, exc: Exception):
    # Log the details server-side; never leak stack traces or secrets to clients.
    logger.exception("Unhandled error on %s %s", request.method, request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal server error."})


@app.get("/health", tags=["health"])
def health():
    return {"status": "ok"}


app.include_router(apartments.router)
app.include_router(availability.router)
app.include_router(inquiries.router)
app.include_router(inquiries.admin_router)
app.include_router(admin.public_router)
app.include_router(admin.router)
app.include_router(admin_apartments.router)
app.include_router(bookings.router)
app.include_router(cron.router)

# Locally stored uploads (development fallback when Cloudinary isn't configured).
upload_dir = Path(settings.local_upload_dir)
upload_dir.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=upload_dir), name="uploads")
