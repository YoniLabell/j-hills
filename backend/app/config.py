"""Application configuration, loaded from environment variables.

Every deploy-specific value (database, URLs, secrets, Cloudinary) comes from the
environment so the same code runs locally and on Render without changes.
"""

import os
from functools import lru_cache

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

SUPPORTED_LOCALES = ("en", "he")
DEFAULT_LOCALE = "en"

# Currencies the site knows how to display. Prices are stored in the site's
# default currency; adding a currency is a matter of extending this mapping.
SUPPORTED_CURRENCIES = {
    "ILS": "₪",
    "USD": "$",
    "EUR": "€",
}

INSECURE_DEFAULT_SECRET = "dev-insecure-secret-change-me"


def normalize_database_url(url: str) -> str:
    """Render (and Heroku-style providers) hand out ``postgres://`` URLs.

    SQLAlchemy needs an explicit dialect + driver, and we use psycopg 3.
    """
    if url.startswith("postgres://"):
        url = "postgresql://" + url[len("postgres://") :]
    if url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://") :]
    return url


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=(".env", "../.env"), extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql+psycopg://ja:ja@localhost:5432/jerusalem_apartments"

    secret_key: str = INSECURE_DEFAULT_SECRET
    access_token_expire_minutes: int = 60 * 12
    auth_cookie_name: str = "ja_admin_session"

    # Comma-separated list is accepted, e.g. "https://a.com,https://b.com".
    frontend_url: str = "http://localhost:3000"

    cloudinary_cloud_name: str = ""
    cloudinary_api_key: str = ""
    cloudinary_api_secret: str = ""
    cloudinary_folder: str = "jerusalem-apartments"

    # Local image storage used when Cloudinary is not configured (development).
    local_upload_dir: str = "uploads"
    public_api_url: str = ""  # Used to build absolute URLs for locally stored images.

    max_upload_mb: int = 10
    image_max_dimension: int = 2400

    admin_email: str = ""
    whatsapp_number: str = ""

    # Shared secret for POST /api/cron/sync-calendars (external scheduler such as
    # GitHub Actions). Empty disables the endpoint.
    cron_secret: str = ""

    calendar_fetch_timeout: float = 20.0
    calendar_max_bytes: int = 5 * 1024 * 1024

    inquiry_rate_limit: int = 5  # requests
    inquiry_rate_window_seconds: int = 600
    login_rate_limit: int = 10
    login_rate_window_seconds: int = 900

    @field_validator("database_url")
    @classmethod
    def _normalize_db(cls, v: str) -> str:
        return normalize_database_url(v)

    @property
    def is_production(self) -> bool:
        return self.environment.lower() == "production"

    @property
    def cors_origins(self) -> list[str]:
        origins = [o.strip().rstrip("/") for o in self.frontend_url.split(",") if o.strip()]
        # Single-service deploys: the site and the API share Render's URL.
        render_url = os.environ.get("RENDER_EXTERNAL_URL", "").rstrip("/")
        if render_url and render_url not in origins:
            origins.append(render_url)
        if not self.is_production:
            for dev in ("http://localhost:3000", "http://127.0.0.1:3000"):
                if dev not in origins:
                    origins.append(dev)
        return origins

    @property
    def cloudinary_enabled(self) -> bool:
        return bool(self.cloudinary_cloud_name and self.cloudinary_api_key and self.cloudinary_api_secret)

    def validate_for_runtime(self) -> None:
        if self.is_production and self.secret_key in ("", INSECURE_DEFAULT_SECRET):
            raise RuntimeError("SECRET_KEY must be set to a strong random value in production.")
        if self.is_production and len(self.secret_key) < 32:
            raise RuntimeError("SECRET_KEY must be at least 32 characters in production.")


@lru_cache
def get_settings() -> Settings:
    return Settings()
