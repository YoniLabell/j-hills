"""Development seed data: three sample apartments with placeholder images.

    python -m app.scripts.seed

Idempotent: apartments whose slug already exists are skipped. Image URLs point
at placeholder SVGs shipped with the frontend (``frontend/public/images``).

    python -m app.scripts.seed --if-empty

Only seeds when the database has no apartments at all. Used on startup of the
single-service deploy when SEED_DEMO_DATA=true, so demo apartments you delete
don't come back after a restart once you have your own apartments.
"""

import argparse
import sys
from datetime import time
from decimal import Decimal

from sqlalchemy import select

from app.db.database import SessionLocal
from app.models import Amenity, Apartment, ApartmentAmenity, ApartmentImage, ApartmentTranslation
from app.services.site_settings import get_site_settings

APARTMENTS = [
    {
        "slug": "mamilla-luxury-apartment",
        "name": "Mamilla Luxury Apartment",
        "neighborhood": "Mamilla",
        "address": "Mamilla, Jerusalem",
        "latitude": Decimal("31.777600"),
        "longitude": Decimal("35.223700"),
        "short_description": "A light-filled two-bedroom of Jerusalem stone, steps from the Old City's Jaffa Gate.",
        "description": (
            "Wake up a five-minute walk from Jaffa Gate in this elegant two-bedroom apartment "
            "in a restored Jerusalem-stone building.\n\n"
            "Arched windows, high ceilings and a fully equipped kitchen make it a calm base for "
            "families and couples. Mamilla Avenue's cafés and shops are right outside, and the "
            "Western Wall, the Tower of David and the German Colony are all within walking distance."
        ),
        "house_rules": "No smoking indoors.\nNo parties or events.\nQuiet hours 22:00–08:00.\nShabbat-friendly kitchen; please respect it.",
        "max_guests": 4,
        "bedrooms": 2,
        "beds": 3,
        "bathrooms": Decimal("2"),
        "price_per_night": Decimal("1250"),
        "cleaning_fee": Decimal("250"),
        "min_nights": 2,
        "featured": True,
        "sort_order": 1,
        "amenities": [
            "wifi",
            "air_conditioning",
            "heating",
            "kitchen",
            "washing_machine",
            "elevator",
            "balcony",
            "smart_tv",
            "shabbat_hot_plate",
            "shabbat_kettle",
        ],
        "images": ["mamilla-1", "mamilla-2", "mamilla-3"],
        "he": {
            "name": "דירת יוקרה בממילא",
            "neighborhood": "ממילא",
            "short_description": "דירת שני חדרי שינה מוארת מאבן ירושלמית, צעדים משער יפו.",
            "description": (
                "התעוררו במרחק חמש דקות הליכה משער יפו, בדירה אלגנטית עם שני חדרי שינה "
                "בבניין אבן ירושלמית משוחזר.\n\n"
                "חלונות מקושתים, תקרות גבוהות ומטבח מאובזר במלואו – בסיס שקט למשפחות ולזוגות. "
                "בתי הקפה והחנויות של שדרות ממילא ממש בחוץ, והכותל, מגדל דוד והמושבה הגרמנית במרחק הליכה."
            ),
            "house_rules": "אין לעשן בתוך הדירה.\nאין מסיבות או אירועים.\nשעות שקט 22:00–08:00.\nמטבח מותאם לשבת – נא לכבד זאת.",
        },
    },
    {
        "slug": "nachlaot-boutique-apartment",
        "name": "Nachlaot Boutique Apartment",
        "neighborhood": "Nachlaot",
        "address": "Nachlaot, Jerusalem",
        "latitude": Decimal("31.784000"),
        "longitude": Decimal("35.210500"),
        "short_description": "A charming boutique hideaway in Nachlaot's alleys, next to the Machane Yehuda market.",
        "description": (
            "Tucked into the winding alleys of Nachlaot, this boutique one-bedroom apartment "
            "has a private courtyard, vaulted stone ceilings and handmade details throughout.\n\n"
            "Machane Yehuda market is a three-minute walk away, with the light rail and the city "
            "center just beyond. Perfect for couples looking for Jerusalem's authentic atmosphere."
        ),
        "house_rules": "No smoking.\nNo pets.\nPlease keep the courtyard quiet after 22:00.",
        "max_guests": 2,
        "bedrooms": 1,
        "beds": 1,
        "bathrooms": Decimal("1"),
        "price_per_night": Decimal("690"),
        "cleaning_fee": Decimal("150"),
        "min_nights": 1,
        "featured": True,
        "sort_order": 2,
        "amenities": [
            "wifi",
            "air_conditioning",
            "heating",
            "kitchen",
            "washing_machine",
            "smart_tv",
            "shabbat_kettle",
        ],
        "images": ["nachlaot-1", "nachlaot-2", "nachlaot-3"],
        "he": {
            "name": "דירת בוטיק בנחלאות",
            "neighborhood": "נחלאות",
            "short_description": "דירת בוטיק מקסימה בסמטאות נחלאות, ליד שוק מחנה יהודה.",
            "description": (
                "חבויה בסמטאות המתפתלות של נחלאות, דירת בוטיק עם חדר שינה אחד, חצר פרטית, "
                "תקרות אבן מקומרות ופרטים בעבודת יד.\n\n"
                "שוק מחנה יהודה במרחק שלוש דקות הליכה, והרכבת הקלה ומרכז העיר ממש מעבר לפינה. "
                "מושלם לזוגות שמחפשים את האווירה הירושלמית האותנטית."
            ),
            "house_rules": "אין לעשן.\nאין חיות מחמד.\nנא לשמור על שקט בחצר אחרי 22:00.",
        },
    },
    {
        "slug": "jerusalem-city-center-suite",
        "name": "Jerusalem City Center Suite",
        "neighborhood": "City Center",
        "address": "City Center, Jerusalem",
        "latitude": Decimal("31.781000"),
        "longitude": Decimal("35.217000"),
        "short_description": "A spacious family suite on a quiet street in the heart of downtown Jerusalem.",
        "description": (
            "A spacious three-bedroom suite on a quiet side street off Ben Yehuda, ideal for "
            "families and small groups.\n\n"
            "Enjoy a large living room, a dining table for eight, a sunny balcony and private "
            "parking — rare in the city center. Restaurants, the light rail and the Mamilla mall "
            "are all within a short walk."
        ),
        "house_rules": "No smoking.\nNo parties.\nChildren of all ages welcome — crib and high chair available on request.",
        "max_guests": 7,
        "bedrooms": 3,
        "beds": 5,
        "bathrooms": Decimal("2"),
        "price_per_night": Decimal("1490"),
        "cleaning_fee": Decimal("300"),
        "min_nights": 2,
        "featured": True,
        "sort_order": 3,
        "amenities": [
            "wifi",
            "air_conditioning",
            "heating",
            "kitchen",
            "washing_machine",
            "dryer",
            "elevator",
            "balcony",
            "parking",
            "smart_tv",
            "crib",
            "high_chair",
            "shabbat_hot_plate",
            "shabbat_kettle",
        ],
        "images": ["center-1", "center-2", "center-3"],
        "he": {
            "name": "סוויטה במרכז העיר",
            "neighborhood": "מרכז העיר",
            "short_description": "סוויטה משפחתית מרווחת ברחוב שקט בלב מרכז ירושלים.",
            "description": (
                "סוויטה מרווחת עם שלושה חדרי שינה ברחוב צדדי שקט ליד בן יהודה, אידיאלית "
                "למשפחות ולקבוצות קטנות.\n\n"
                "סלון גדול, פינת אוכל לשמונה, מרפסת שמש וחניה פרטית – נדיר במרכז העיר. "
                "מסעדות, הרכבת הקלה וקניון ממילא במרחק הליכה קצר."
            ),
            "house_rules": "אין לעשן.\nאין מסיבות.\nילדים בכל גיל מוזמנים – עריסה וכיסא תינוק לפי בקשה.",
        },
    },
]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Create demo apartments.")
    parser.add_argument("--if-empty", action="store_true", help="Only seed when there are no apartments.")
    args = parser.parse_args(argv)
    with SessionLocal() as db:
        get_site_settings(db)
        if args.if_empty and db.scalar(select(Apartment.id).limit(1)) is not None:
            print("Apartments already exist; skipping demo data.")
            return 0
        amenities = {a.key: a for a in db.scalars(select(Amenity))}
        created = 0
        for data in APARTMENTS:
            if db.scalar(select(Apartment.id).where(Apartment.slug == data["slug"])):
                print(f"skip   {data['slug']} (exists)")
                continue
            fields = {k: v for k, v in data.items() if k not in ("amenities", "images", "he")}
            apt = Apartment(**fields, check_in_time=time(15, 0), check_out_time=time(11, 0))
            apt.seo_title = f"{data['name']} | Vacation rental in {data['neighborhood']}, Jerusalem"
            apt.seo_description = data["short_description"]
            apt.translations.append(ApartmentTranslation(locale="he", **data["he"]))
            for key in data["amenities"]:
                if key in amenities:
                    apt.amenity_links.append(ApartmentAmenity(amenity_id=amenities[key].id))
            for i, name in enumerate(data["images"]):
                apt.images.append(
                    ApartmentImage(
                        image_url=f"/images/placeholders/{name}.svg",
                        sort_order=i,
                        is_cover=i == 0,
                        alt_text=f"{data['name']} – photo {i + 1}",
                        width=1600,
                        height=1066,
                    )
                )
            db.add(apt)
            created += 1
            print(f"create {data['slug']}")
        db.commit()
    print(f"Seed complete: {created} apartment(s) created.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
