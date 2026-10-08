from datetime import date, datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base
from app.models.base import TimestampMixin, utcnow


class BlockedDate(TimestampMixin, Base):
    """A period during which an apartment can't be booked.

    Dates are hotel-style: ``start_date`` is the first occupied night and
    ``end_date`` is the check-out day (exclusive), so a block of 10→13 Oct
    occupies the nights of the 10th, 11th and 12th.
    """

    __tablename__ = "blocked_dates"
    __table_args__ = (
        UniqueConstraint("apartment_id", "source", "external_uid", name="uq_block_external_uid"),
        CheckConstraint("end_date > start_date", name="ck_block_dates_order"),
        Index("ix_blocked_dates_apartment_range", "apartment_id", "start_date", "end_date"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    apartment_id: Mapped[int] = mapped_column(ForeignKey("apartments.id", ondelete="CASCADE"), nullable=False)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False)
    source: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    external_uid: Mapped[str | None] = mapped_column(String(500))
    reason: Mapped[str] = mapped_column(String(500), default="", nullable=False)
    booking_id: Mapped[int | None] = mapped_column(ForeignKey("bookings.id", ondelete="CASCADE"), unique=True)

    apartment = relationship("Apartment", back_populates="blocked_dates")
    booking = relationship("Booking", back_populates="blocked_date")


class CalendarSyncLog(Base):
    __tablename__ = "calendar_sync_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    apartment_id: Mapped[int] = mapped_column(
        ForeignKey("apartments.id", ondelete="CASCADE"), nullable=False, index=True
    )
    source: Mapped[str] = mapped_column(String(32), nullable=False)
    trigger: Mapped[str] = mapped_column(String(16), nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    success: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    events_imported: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    events_created: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    events_updated: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    events_removed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error: Mapped[str | None] = mapped_column(Text)
