"""Image validation, optimization and storage.

Production stores images on Cloudinary (signed uploads happen here on the
server, so the API secret never reaches the browser). When Cloudinary isn't
configured — typically local development — images are optimized with Pillow
and written to ``LOCAL_UPLOAD_DIR``, which the API serves under ``/uploads``.
"""

import io
import logging
import uuid
from dataclasses import dataclass
from pathlib import Path

from PIL import Image, ImageOps, UnidentifiedImageError

from app.config import get_settings

logger = logging.getLogger(__name__)

ALLOWED_CONTENT_TYPES = {"image/jpeg", "image/png", "image/webp"}
ALLOWED_FORMATS = {"JPEG", "PNG", "WEBP", "MPO"}  # MPO = multi-picture JPEG from some phones
MAX_PIXELS = 60_000_000


class ImageValidationError(ValueError):
    pass


@dataclass
class StoredImage:
    url: str
    public_id: str | None
    local_path: str | None
    width: int | None
    height: int | None


def validate_image(data: bytes, content_type: str | None, filename: str = "") -> Image.Image:
    settings = get_settings()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if not data:
        raise ImageValidationError(f"{filename or 'File'} is empty.")
    if len(data) > max_bytes:
        raise ImageValidationError(f"{filename or 'File'} is larger than {settings.max_upload_mb} MB.")
    if content_type and content_type.lower() not in ALLOWED_CONTENT_TYPES:
        raise ImageValidationError(
            f"{filename or 'File'}: unsupported type {content_type}. Use JPEG, PNG or WebP."
        )
    try:
        probe = Image.open(io.BytesIO(data))
        probe.verify()
        img = Image.open(io.BytesIO(data))
    except (UnidentifiedImageError, OSError, SyntaxError, Image.DecompressionBombError) as exc:
        raise ImageValidationError(f"{filename or 'File'} is not a valid image.") from exc
    if img.format not in ALLOWED_FORMATS:
        raise ImageValidationError(f"{filename or 'File'}: unsupported image format. Use JPEG, PNG or WebP.")
    if img.width * img.height > MAX_PIXELS:
        raise ImageValidationError(f"{filename or 'File'} has too many pixels.")
    return img


def _optimize(img: Image.Image) -> tuple[bytes, int, int]:
    settings = get_settings()
    img = ImageOps.exif_transpose(img)
    img.thumbnail((settings.image_max_dimension, settings.image_max_dimension))
    if img.mode not in ("RGB", "RGBA"):
        img = img.convert("RGBA" if "A" in img.getbands() else "RGB")
    out = io.BytesIO()
    img.save(out, format="WEBP", quality=82, method=4)
    return out.getvalue(), img.width, img.height


def _cloudinary():
    import cloudinary
    import cloudinary.uploader

    settings = get_settings()
    cloudinary.config(
        cloud_name=settings.cloudinary_cloud_name,
        api_key=settings.cloudinary_api_key,
        api_secret=settings.cloudinary_api_secret,
        secure=True,
    )
    return cloudinary.uploader


def store_image(
    data: bytes,
    content_type: str | None,
    filename: str = "",
    *,
    folder: str = "apartments",
    base_url: str = "",
) -> StoredImage:
    img = validate_image(data, content_type, filename)
    settings = get_settings()

    if settings.cloudinary_enabled:
        uploader = _cloudinary()
        try:
            result = uploader.upload(
                data,
                folder=f"{settings.cloudinary_folder}/{folder}",
                resource_type="image",
                unique_filename=True,
                overwrite=False,
                # Normalize the stored original; delivery adds f_auto/q_auto/width.
                transformation=[
                    {
                        "width": settings.image_max_dimension,
                        "height": settings.image_max_dimension,
                        "crop": "limit",
                        "quality": "auto:good",
                    }
                ],
            )
        except Exception as exc:
            logger.exception("Cloudinary upload failed")
            raise ImageValidationError("Image upload to Cloudinary failed.") from exc
        return StoredImage(
            url=result["secure_url"],
            public_id=result["public_id"],
            local_path=None,
            width=result.get("width"),
            height=result.get("height"),
        )

    if settings.is_production:
        logger.warning(
            "Cloudinary is not configured; storing image on local disk, which is NOT persistent on Render."
        )
    optimized, width, height = _optimize(img)
    directory = Path(settings.local_upload_dir) / folder
    directory.mkdir(parents=True, exist_ok=True)
    name = f"{uuid.uuid4().hex}.webp"
    path = directory / name
    path.write_bytes(optimized)
    base = (settings.public_api_url or base_url).rstrip("/")
    return StoredImage(
        url=f"{base}/uploads/{folder}/{name}",
        public_id=None,
        local_path=str(path),
        width=width,
        height=height,
    )


def delete_stored_image(public_id: str | None, local_path: str | None) -> None:
    """Best-effort removal of the underlying file; failures are logged only."""
    settings = get_settings()
    if public_id and settings.cloudinary_enabled:
        try:
            _cloudinary().destroy(public_id, invalidate=True, resource_type="image")
        except Exception:
            logger.exception("Failed to delete Cloudinary image %s", public_id)
    if local_path:
        try:
            root = Path(settings.local_upload_dir).resolve()
            path = Path(local_path).resolve()
            if root in path.parents:
                path.unlink(missing_ok=True)
        except OSError:
            logger.exception("Failed to delete local image %s", local_path)
