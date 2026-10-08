from datetime import date
from decimal import Decimal

from sqlalchemy import CheckConstraint, Date, ForeignKey, Integer, Numeric, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.database import Base
from app.models.base import TimestampMixin
from app.models.enums import BookingStatus, InquiryChannel, InquiryStatus


class BookingInquiry(TimestampMixin, Base):
    __tablename__ = "booking_inquiries"
    __table_args__ = (CheckConstraint("check_out > check_in", name="ck_inquiry_dates_order"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    apartment_id: Mapped[int] = mapped_column(
        ForeignKey("apartments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    check_in: Mapped[date] = mapped_column(Date, nullable=False)
    check_out: Mapped[date] = mapped_column(Date, nullable=False)
    guests: Mapped[int] = mapped_column(Integer, nullable=False)
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str] = mapped_column(String(50), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False)
    message: Mapped[str] = mapped_column(Text, default="", nullable=False)
    locale: Mapped[str] = mapped_column(String(8), default="en", nullable=False)
    status: Mapped[str] = mapped_column(String(16), default=InquiryStatus.NEW, nullable=False, index=True)
    estimated_total: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    currency: Mapped[str] = mapped_column(String(3), default="ILS", nullable=False)
    admin_notes: Mapped[str] = mapped_column(Text, default="", nullable=False)
    channel: Mapped[str] = mapped_column(String(16), default=InquiryChannel.FORM, nullable=False)

    apartment = relationship("Apartment", lazy="joined")
    booking: Mapped["Booking | None"] = relationship(back_populates="inquiry", uselist=False)


class Booking(TimestampMixin, Base):
    """A confirmed direct booking (website inquiry or one entered by the owner)."""

    __tablename__ = "bookings"
    __table_args__ = (CheckConstraint("check_out > check_in", name="ck_booking_dates_order"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    apartment_id: Mapped[int] = mapped_column(
        ForeignKey("apartments.id", ondelete="RESTRICT"), nullable=False, index=True
    )
    inquiry_id: Mapped[int | None] = mapped_column(
        ForeignKey("booking_inquiries.id", ondelete="SET NULL"), unique=True
    )
    guest_name: Mapped[str] = mapped_column(String(200), nullable=False)
    guest_email: Mapped[str] = mapped_column(String(255), default="", nullable=False)
    guest_phone: Mapped[str] = mapped_column(String(50), default="", nullable=False)
    guests: Mapped[int] = mapped_column(Integer, nullable=False)
    check_in: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    check_out: Mapped[date] = mapped_column(Date, nullable=False)
    source: Mapped[str] = mapped_column(String(16), nullable=False)
    status: Mapped[str] = mapped_column(
        String(16), default=BookingStatus.CONFIRMED, nullable=False, index=True
    )
    nightly_rate: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    cleaning_fee: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    total_price: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=0, nullable=False)
    currency: Mapped[str] = mapped_column(String(3), default="ILS", nullable=False)
    notes: Mapped[str] = mapped_column(Text, default="", nullable=False)

    apartment = relationship("Apartment", lazy="joined")
    inquiry: Mapped[BookingInquiry | None] = relationship(back_populates="booking")
    blocked_date = relationship("BlockedDate", back_populates="booking", uselist=False)
