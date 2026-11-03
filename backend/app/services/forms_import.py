"""Map J-Hills Google Forms answers to validated apartment fields.

Question numbers are stable identifiers: changing the visible question wording
does not break the integration. No AI guesses data or prices.
"""
import re
from datetime import time

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Amenity
from app.schemas.apartment import ApartmentCreate

QUESTION = re.compile(r"^\s*(\d+)(?:[א-ת])?\s*[.]\s*")


def numbered_answers(raw: dict) -> dict[str, str]:
    values = {}
    for title, response in raw.items():
        match = QUESTION.match(title)
        if match:
            suffix = "א" if re.match(r"^\\s*21א\\.", title) else ""
            values[match.group(1) + suffix] = ", ".join(str(x) for x in response) if isinstance(response, list) else str(response or "").strip()
    return values


def required(a: dict, key: str) -> str:
    value = a.get(key, "").strip()
    if not value:
        raise HTTPException(status_code=422, detail=f"Google Forms question {key} is required.")
    return value


def number(a: dict, key: str, *, default=None, integer=False):
    raw = a.get(key, "").strip()
    if not raw:
        if default is not None:
            return default
        raise HTTPException(status_code=422, detail=f"Google Forms question {key} is required.")
    try:
        val = float(raw.replace(",", "").replace("₪", "").strip())
        if integer and not val.is_integer():
            raise ValueError
        return int(val) if integer else val
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid numeric answer for question {key}.") from exc


def clock(a: dict, key: str) -> str:
    raw = required(a, key)
    try:
        return time.fromisoformat(raw).strftime("%H:%M")
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=f"Invalid time in question {key}. Use HH:MM.") from exc


def amenities_for(db: Session, a: dict) -> list[int]:
    haystack = " ".join(a.get(str(i), "") for i in (10, 22, 23, 24, 25, 26, 27, 31, 33)).lower()
    terms = {
        "wifi": ("wi-fi", "wifi", "אינטרנט אלחוטי"),
        "air_conditioning": ("מזגן", "מיזוג"),
        "heating": ("חימום", "רדיאטור"),
        "kitchen": ("מקרר", "תנור", "מטבח", "כיריים"),
        "washing_machine": ("מכונת כביסה",),
        "dryer": ("מייבש",),
        "elevator": ("מעלית",),
        "balcony": ("מרפסת",),
        "parking": ("חניה פרטית", "פרטית"),
        "smart_tv": ("טלוויזיה",),
        "crib": ("עריסה", "לול", "מיטת תינוק"),
        "high_chair": ("כיסא אוכל",),
        "shabbat_hot_plate": ("פלטה",),
        "shabbat_kettle": ("מיחם",),
    }
    if a.get("10", "").strip() in ("כן", "Yes", "yes"):
        haystack += " מעלית"
    elif a.get("10", "").strip() in ("לא", "No", "no"):
        terms.pop("elevator", None)
    return [
        item.id for item in db.scalars(select(Amenity))
        if item.key in terms and any(token in haystack for token in terms[item.key])
    ]


def apartment_from_answers(db: Session, raw: dict) -> ApartmentCreate:
    a = numbered_answers(raw)
    consent = required(a, "56")
    if "מאשר" not in consent:
        raise HTTPException(status_code=422, detail="Publication authorization is required.")

    he_name = required(a, "6")
    english_name = a.get("50", "").strip() or he_name
    he_description = "\n\n".join(filter(None, [a.get("47"), a.get("48"), a.get("49")]))
    extra_lines = []
    for key, label in [
        ("9", "קומה"), ("10", "מעלית"), ("11", "מדרגות"),
        ("18", "מיטות לפי חדר"), ("19", "מספר שירותים"),
        ("20", "מיטת תינוק"), ("21", "שינה בסלון"),
        ("21א", "פירוט שינה בסלון"),
        ("22", "מיזוג וחימום"), ("23", "ציוד מטבח"),
        ("24", "כביסה"), ("25", "אינטרנט ובידור"), ("26", "שטחי חוץ"),
        ("27", "חניה"), ("28", "נגישות"), ("29", "מתקנים נוספים"),
        ("30", "כשרות"), ("31", "שבת"), ("32", "בתי כנסת"),
        ("33", "ציוד לתינוקות"), ("34", "התאמה לילדים"), ("35", "הערות למשפחות"),
    ]:
        if a.get(key):
            extra_lines.append(f"{label}: {a[key]}")
    if extra_lines:
        he_description = (he_description + "\n\n" if he_description else "") + "\n".join(extra_lines)
    he_rules = "\n".join(filter(None, [
        f"עישון: {a['43']}" if a.get("43") else "",
        f"בעלי חיים: {a['44']}" if a.get("44") else "",
        f"מסיבות: {a['45']}" if a.get("45") else "",
        a.get("46", ""),
    ]))
    # The site defaults to English; preserve supplied Hebrew truthfully instead
    # of inventing an English translation. Admin can translate before publication.
    name = english_name
    description = a.get("51", "").strip() or he_description
    neighborhood_he = required(a, "8")
    neighborhoods = {
        "רחביה": "Rehavia", "נחלאות": "Nachlaot",
        "מרכז העיר": "City Center", "ממילא": "Mamilla",
        "בקעה": "Baka", "קטמון": "Katamon",
        "המושבה הגרמנית": "German Colony",
    }
    payload = {
        "name": name, "neighborhood": neighborhoods.get(neighborhood_he, neighborhood_he),
        "address": required(a, "7"), "description": description,
        "short_description": (a.get("51", "").strip() or a.get("47", "").strip())[:500],
        "house_rules": he_rules,
        "max_guests": number(a, "14", integer=True),
        "bedrooms": number(a, "15", integer=True),
        "beds": number(a, "16", integer=True),
        "bathrooms": number(a, "17"),
        "price_per_night": number(a, "36"),
        "cleaning_fee": number(a, "37"),
        "min_nights": number(a, "38", integer=True),
        "check_in_time": clock(a, "39"), "check_out_time": clock(a, "40"),
        "owner_whatsapp": required(a, "2"),
        "owner_email": required(a, "3"),
        "google_maps_url": a.get("12", ""),
        "airbnb_ical_url": a.get("55", ""),
        "featured": False, "active": False,
        "amenity_ids": amenities_for(db, a),
        "translations": {"he": {
            "name": he_name, "neighborhood": neighborhood_he,
            "description": he_description, "short_description": a.get("47", "")[:500],
            "house_rules": he_rules
        }},
    }
    try:
        return ApartmentCreate.model_validate(payload)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Form answers do not satisfy apartment requirements: {exc}") from exc
