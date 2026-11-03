"""Google Forms import idempotency keys.

Revision ID: 0007
Revises: 0006
"""
from alembic import op
import sqlalchemy as sa

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None

def upgrade():
    op.add_column("apartments", sa.Column("google_form_source_id", sa.String(370), nullable=True))
    op.create_index("ix_apartments_google_form_source_id", "apartments", ["google_form_source_id"], unique=True)
    op.add_column("apartment_images", sa.Column("google_form_drive_file_id", sa.String(160), nullable=True))
    op.create_index("ix_apartment_images_google_form_drive_file_id", "apartment_images", ["google_form_drive_file_id"], unique=True)

def downgrade():
    op.drop_index("ix_apartment_images_google_form_drive_file_id", table_name="apartment_images")
    op.drop_column("apartment_images", "google_form_drive_file_id")
    op.drop_index("ix_apartments_google_form_source_id", table_name="apartments")
    op.drop_column("apartments", "google_form_source_id")
