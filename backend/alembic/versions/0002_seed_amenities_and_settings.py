"""seed amenities and the site settings row

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-08 09:00:00

"""
from collections.abc import Sequence
from datetime import UTC, datetime

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Data is inlined (not imported from app code) so this migration never changes.
AMENITIES = [
    ("wifi", "WiFi", "אינטרנט אלחוטי", "wifi"),
    ("air_conditioning", "Air conditioning", "מיזוג אוויר", "snowflake"),
    ("heating", "Heating", "חימום", "flame"),
    ("kitchen", "Kitchen", "מטבח", "chef-hat"),
    ("washing_machine", "Washing machine", "מכונת כביסה", "washing-machine"),
    ("dryer", "Dryer", "מייבש כביסה", "wind"),
    ("elevator", "Elevator", "מעלית", "arrow-up-down"),
    ("balcony", "Balcony", "מרפסת", "sun"),
    ("parking", "Parking", "חניה", "car"),
    ("smart_tv", "Smart TV", "טלוויזיה חכמה", "tv"),
    ("crib", "Crib", "עריסה", "baby"),
    ("high_chair", "High chair", "כיסא תינוק", "armchair"),
    ("shabbat_hot_plate", "Shabbat hot plate", "פלטת שבת", "flame-kindling"),
    ("shabbat_kettle", "Shabbat kettle", "מיחם שבת", "coffee"),
]


def upgrade() -> None:
    amenities = sa.table(
        "amenities",
        sa.column("key", sa.String),
        sa.column("name_en", sa.String),
        sa.column("name_he", sa.String),
        sa.column("icon", sa.String),
        sa.column("sort_order", sa.Integer),
    )
    op.bulk_insert(
        amenities,
        [
            {"key": k, "name_en": en, "name_he": he, "icon": icon, "sort_order": i}
            for i, (k, en, he, icon) in enumerate(AMENITIES)
        ],
    )
    now = datetime.now(UTC)
    settings = sa.table(
        "site_settings",
        sa.column("id", sa.Integer),
        sa.column("site_name", sa.String),
        sa.column("site_name_he", sa.String),
        sa.column("logo_url", sa.String),
        sa.column("hero_image_url", sa.String),
        sa.column("phone", sa.String),
        sa.column("whatsapp_number", sa.String),
        sa.column("email", sa.String),
        sa.column("instagram_url", sa.String),
        sa.column("facebook_url", sa.String),
        sa.column("default_currency", sa.String),
        sa.column("about_text_en", sa.Text),
        sa.column("about_text_he", sa.Text),
        sa.column("footer_text_en", sa.Text),
        sa.column("footer_text_he", sa.Text),
        sa.column("created_at", sa.DateTime(timezone=True)),
        sa.column("updated_at", sa.DateTime(timezone=True)),
    )
    op.bulk_insert(
        settings,
        [
            {
                "id": 1,
                "site_name": "Jerusalem Stays",
                "site_name_he": "ירושלים סטייז",
                "logo_url": "",
                "hero_image_url": "",
                "phone": "",
                "whatsapp_number": "",
                "email": "",
                "instagram_url": "",
                "facebook_url": "",
                "default_currency": "ILS",
                "about_text_en": "Hand-picked apartments in the most beautiful neighborhoods of "
                "Jerusalem, hosted personally by us. Book directly for the best price "
                "and a direct line to your host.",
                "about_text_he": "דירות נבחרות בשכונות היפות ביותר של ירושלים, באירוח אישי. "
                "הזמינו ישירות למחיר הטוב ביותר וקשר ישיר עם המארח.",
                "footer_text_en": "Boutique vacation apartments in Jerusalem.",
                "footer_text_he": "דירות נופש בוטיק בירושלים.",
                "created_at": now,
                "updated_at": now,
            }
        ],
    )


def downgrade() -> None:
    op.execute("DELETE FROM site_settings WHERE id = 1")
    keys = ", ".join(f"'{k}'" for k, *_ in AMENITIES)
    op.execute(f"DELETE FROM amenities WHERE key IN ({keys})")
