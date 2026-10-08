"""Extract coordinates from Google Maps links.

Handles full URLs (``/@31.77,35.22,17z``, ``!3d31.77!4d35.22``, ``?q=31.77,35.22``)
and short share links (``maps.app.goo.gl/...``, ``goo.gl/maps/...``), which are
resolved by following their redirects. Only Google hosts are ever fetched.
"""

import logging
import re
from urllib.parse import unquote, urlparse

import httpx

logger = logging.getLogger(__name__)

_PATTERNS = [
    re.compile(r"!3d(-?\d{1,2}\.\d+)!4d(-?\d{1,3}\.\d+)"),  # exact place pin (preferred)
    re.compile(r"@(-?\d{1,2}\.\d+),(-?\d{1,3}\.\d+)"),  # map viewport centre
    re.compile(r"[?&](?:q|query|ll|center|destination)=(-?\d{1,2}\.\d+),\s*\+?(-?\d{1,3}\.\d+)"),
    re.compile(r"/maps/(?:place|search)/(-?\d{1,2}\.\d+),\s*\+?(-?\d{1,3}\.\d+)"),
]

SHORT_HOSTS = {"maps.app.goo.gl", "goo.gl", "g.co"}
ALLOWED_HOST_SUFFIXES = ("google.com", "google.co.il", "goo.gl", "g.co", "googleusercontent.com")


def _host_allowed(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    return any(host == s or host.endswith("." + s) for s in ALLOWED_HOST_SUFFIXES)


def coords_from_url(url: str) -> tuple[float, float] | None:
    """Coordinates contained in the URL text itself (no network)."""
    text = unquote(unquote(url or ""))
    for pattern in _PATTERNS:
        if m := pattern.search(text):
            lat, lng = float(m.group(1)), float(m.group(2))
            if -90 <= lat <= 90 and -180 <= lng <= 180 and (lat, lng) != (0.0, 0.0):
                return round(lat, 6), round(lng, 6)
    return None


def resolve_coords(url: str, timeout: float = 6.0) -> tuple[float, float] | None:
    """Coordinates from a Google Maps link, following short-link redirects if needed."""
    if not url:
        return None
    if coords := coords_from_url(url):
        return coords
    if not _host_allowed(url):
        return None
    try:
        with httpx.Client(
            timeout=timeout,
            follow_redirects=False,
            headers={"User-Agent": "Mozilla/5.0 (compatible; JerusalemApartments/1.0)"},
        ) as client:
            current = url
            for _ in range(6):
                response = client.get(current)
                location = response.headers.get("location")
                # Every hop (including consent-page redirects that wrap the real URL) may hold coordinates.
                for candidate in (location or "", str(response.url)):
                    if coords := coords_from_url(candidate):
                        return coords
                if not location:
                    if coords := coords_from_url(response.text[:200_000]):
                        return coords
                    return None
                current = str(response.url.join(location))
                if not _host_allowed(current):
                    return None
    except httpx.HTTPError as exc:
        logger.warning("Could not resolve Google Maps link: %s", type(exc).__name__)
    return None
