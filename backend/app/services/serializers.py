"""Convert ORM objects into API schemas (with localization)."""

from app.config import DEFAULT_LOCALE, SUPPORTED_CURRENCIES, SUPPORTED_LOCALES
from app.models import Apartment, ApartmentImage, ApartmentTranslation, BookingInquiry
from app.schemas.apartment import (
    AmenityOut,
    ApartmentAdminOut,
    ApartmentCard,
    ApartmentPublic,
    ImageAdminOut,
    ImageOut,
    TranslationIn,
)
from app.schemas.booking import InquiryOut
from app.services.availability_service import count_nights


def normalize_locale(locale: str | None) -> str:
    return locale if locale in SUPPORTED_LOCALES else DEFAULT_LOCALE


def localized(apartment: Apartment, field: str, locale: str) -> str:
    if locale != DEFAULT_LOCALE:
        t = apartment.translation(locale)
        value = getattr(t, field, None) if t else None
        if value:
            return value
    return getattr(apartment, field) or ""


def image_out(img: ApartmentImage) -> ImageOut:
    return ImageOut(
        id=img.id,
        url=img.image_url,
        alt_text=img.alt_text,
        is_cover=img.is_cover,
        sort_order=img.sort_order,
        width=img.width,
        height=img.height,
    )


def _card_fields(apartment: Apartment, locale: str, currency: str) -> dict:
    cover = apartment.cover_image
    return dict(
        id=apartment.id,
        slug=apartment.slug,
        name=localized(apartment, "name", locale),
        neighborhood=localized(apartment, "neighborhood", locale),
        short_description=localized(apartment, "short_description", locale),
        max_guests=apartment.max_guests,
        bedrooms=apartment.bedrooms,
        beds=apartment.beds,
        bathrooms=float(apartment.bathrooms),
        price_per_night=float(apartment.price_per_night),
        cleaning_fee=float(apartment.cleaning_fee),
        currency=currency,
        featured=apartment.featured,
        cover_image=image_out(cover) if cover else None,
    )


def apartment_card(apartment: Apartment, locale: str, currency: str = "ILS") -> ApartmentCard:
    return ApartmentCard(**_card_fields(apartment, locale, currency))


def apartment_public(
    apartment: Apartment, locale: str, currency: str = "ILS", site_whatsapp: str = ""
) -> ApartmentPublic:
    name = localized(apartment, "name", locale)
    return ApartmentPublic(
        **_card_fields(apartment, locale, currency),
        description=localized(apartment, "description", locale),
        house_rules=localized(apartment, "house_rules", locale),
        min_nights=apartment.min_nights,
        check_in_time=apartment.check_in_time,
        check_out_time=apartment.check_out_time,
        latitude=float(apartment.latitude) if apartment.latitude is not None else None,
        longitude=float(apartment.longitude) if apartment.longitude is not None else None,
        google_maps_url=apartment.google_maps_url,
        whatsapp_number=apartment.owner_whatsapp or site_whatsapp,
        images=[image_out(i) for i in apartment.images],
        amenities=[
            AmenityOut(id=a.id, key=a.key, name=a.name(locale), icon=a.icon) for a in apartment.amenities
        ],
        seo_title=localized(apartment, "seo_title", locale) or name,
        seo_description=localized(apartment, "seo_description", locale)
        or localized(apartment, "short_description", locale),
    )


def apartment_admin(apartment: Apartment, export_base_url: str) -> ApartmentAdminOut:
    cover = apartment.cover_image
    translations = {
        t.locale: TranslationIn(**{f: getattr(t, f) for f in ApartmentTranslation.TRANSLATABLE_FIELDS})
        for t in apartment.translations
    }
    return ApartmentAdminOut(
        id=apartment.id,
        name=apartment.name,
        slug=apartment.slug,
        short_description=apartment.short_description,
        description=apartment.description,
        house_rules=apartment.house_rules,
        neighborhood=apartment.neighborhood,
        address=apartment.address,
        latitude=float(apartment.latitude) if apartment.latitude is not None else None,
        longitude=float(apartment.longitude) if apartment.longitude is not None else None,
        google_maps_url=apartment.google_maps_url,
        owner_whatsapp=apartment.owner_whatsapp,
        max_guests=apartment.max_guests,
        bedrooms=apartment.bedrooms,
        beds=apartment.beds,
        bathrooms=float(apartment.bathrooms),
        price_per_night=float(apartment.price_per_night),
        cleaning_fee=float(apartment.cleaning_fee),
        min_nights=apartment.min_nights,
        check_in_time=apartment.check_in_time,
        check_out_time=apartment.check_out_time,
        seo_title=apartment.seo_title,
        seo_description=apartment.seo_description,
        airbnb_ical_url=apartment.airbnb_ical_url,
        ical_export_url=f"{export_base_url.rstrip('/')}/api/calendar/{apartment.ical_export_token}.ics",
        featured=apartment.featured,
        active=apartment.active,
        sort_order=apartment.sort_order,
        translations=translations,
        amenity_ids=[link.amenity_id for link in apartment.amenity_links],
        images=[
            ImageAdminOut(**image_out(i).model_dump(), cloudinary_public_id=i.cloudinary_public_id)
            for i in apartment.images
        ],
        cover_image=image_out(cover) if cover else None,
        last_sync_at=apartment.last_sync_at,
        last_sync_success=apartment.last_sync_success,
        last_sync_error=apartment.last_sync_error,
        last_sync_events=apartment.last_sync_events,
        created_at=apartment.created_at,
        updated_at=apartment.updated_at,
    )


def inquiry_out(inquiry: BookingInquiry) -> InquiryOut:
    return InquiryOut(
        id=inquiry.id,
        apartment_id=inquiry.apartment_id,
        apartment_name=inquiry.apartment.name,
        apartment_slug=inquiry.apartment.slug,
        check_in=inquiry.check_in,
        check_out=inquiry.check_out,
        nights=count_nights(inquiry.check_in, inquiry.check_out),
        guests=inquiry.guests,
        full_name=inquiry.full_name,
        phone=inquiry.phone,
        email=inquiry.email,
        message=inquiry.message,
        locale=inquiry.locale,
        status=inquiry.status,
        estimated_total=float(inquiry.estimated_total) if inquiry.estimated_total is not None else None,
        currency=inquiry.currency,
        admin_notes=inquiry.admin_notes,
        booking_id=inquiry.booking.id if inquiry.booking else None,
        created_at=inquiry.created_at,
        updated_at=inquiry.updated_at,
    )


def currency_symbol(code: str) -> str:
    return SUPPORTED_CURRENCIES.get(code, code)
