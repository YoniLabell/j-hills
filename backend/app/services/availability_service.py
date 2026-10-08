"""Availability engine.

All date ranges are hotel-style half-open intervals ``[check_in, check_out)``:
the check-in day is the first occupied night and the check-out day is *not*
occupied. A stay of 10→13 Oct occupies the nights of the 10th, 11th and 12th,
so another guest may check in on the 13th.

Two ranges overlap iff ``a_start < b_end and b_start < a_end``.
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Apartment, BlockedDate

MAX_STAY_NIGHTS = 90
MAX_RANGE_DAYS = 800


class InvalidDateRange(ValueError):
    pass


@dataclass(frozen=True)
class Period:
    start_date: date
    end_date: date


def ranges_overlap(a_start: date, a_end: date, b_start: date, b_end: date) -> bool:
    """True if two half-open date ranges share at least one night."""
    return a_start < b_end and b_start < a_end


def count_nights(check_in: date, check_out: date) -> int:
    return (check_out - check_in).days


def occupied_nights(start: date, end: date) -> list[date]:
    return [start + timedelta(days=i) for i in range((end - start).days)]


def validate_stay(
    check_in: date,
    check_out: date,
    *,
    allow_past: bool = False,
    today: date | None = None,
    max_nights: int = MAX_STAY_NIGHTS,
) -> None:
    if check_out <= check_in:
        raise InvalidDateRange("Check-out must be after check-in.")
    if not allow_past and check_in < (today or date.today()):
        raise InvalidDateRange("Check-in can't be in the past.")
    if count_nights(check_in, check_out) > max_nights:
        raise InvalidDateRange(f"Stays are limited to {max_nights} nights.")


def validate_window(start: date, end: date) -> None:
    if end <= start:
        raise InvalidDateRange("end_date must be after start_date.")
    if (end - start).days > MAX_RANGE_DAYS:
        raise InvalidDateRange(f"Date window is limited to {MAX_RANGE_DAYS} days.")


def overlapping_blocks_query(apartment_id: int, start: date, end: date):
    return (
        select(BlockedDate)
        .where(
            BlockedDate.apartment_id == apartment_id,
            BlockedDate.start_date < end,
            BlockedDate.end_date > start,
        )
        .order_by(BlockedDate.start_date)
    )


def find_conflicts(db: Session, apartment_id: int, check_in: date, check_out: date) -> list[BlockedDate]:
    return list(db.scalars(overlapping_blocks_query(apartment_id, check_in, check_out)))


def is_available(db: Session, apartment_id: int, check_in: date, check_out: date) -> bool:
    return not find_conflicts(db, apartment_id, check_in, check_out)


def unavailable_apartment_ids(db: Session, check_in: date, check_out: date) -> set[int]:
    """IDs of apartments with at least one blocked night inside the range."""
    rows = db.scalars(
        select(BlockedDate.apartment_id)
        .where(BlockedDate.start_date < check_out, BlockedDate.end_date > check_in)
        .distinct()
    )
    return set(rows)


def merge_periods(periods: Iterable[Period]) -> list[Period]:
    """Merge overlapping or touching periods (used for public output so the
    source of each block isn't revealed)."""
    merged: list[Period] = []
    for p in sorted(periods, key=lambda p: (p.start_date, p.end_date)):
        if merged and p.start_date <= merged[-1].end_date:
            last = merged[-1]
            merged[-1] = Period(last.start_date, max(last.end_date, p.end_date))
        else:
            merged.append(p)
    return merged


def blocked_periods(db: Session, apartment_id: int, start: date, end: date) -> list[Period]:
    blocks = db.scalars(overlapping_blocks_query(apartment_id, start, end))
    return merge_periods(Period(b.start_date, b.end_date) for b in blocks)


def lock_apartment(db: Session, apartment_id: int) -> Apartment | None:
    """Take a row lock on the apartment for the rest of the transaction.

    Every write that changes an apartment's calendar (booking confirmation,
    calendar sync) takes this lock first, which serializes them per apartment
    and makes "check availability, then insert block" race-free on PostgreSQL.
    """
    return db.scalar(
        select(Apartment)
        .where(Apartment.id == apartment_id)
        .with_for_update()
        .execution_options(populate_existing=True)
    )
