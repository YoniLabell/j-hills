from fastapi import HTTPException, Request, status

from app.config import get_settings
from app.services.availability_service import InvalidDateRange


def bad_dates(exc: InvalidDateRange) -> HTTPException:
    return HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(exc))


def public_base_url(request: Request) -> str:
    """Public URL of this API (for export feeds and locally stored images)."""
    settings = get_settings()
    if settings.public_api_url:
        return settings.public_api_url.rstrip("/")
    import os

    if render_url := os.environ.get("RENDER_EXTERNAL_URL"):
        return render_url.rstrip("/")
    return str(request.base_url).rstrip("/")
