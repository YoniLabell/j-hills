"""Hotel-style date logic: [check_in, check_out) half-open ranges."""

from datetime import date

import pytest

from app.services.availability_service import (
    InvalidDateRange,
    Period,
    count_nights,
    merge_periods,
    occupied_nights,
    ranges_overlap,
    validate_stay,
)

D = date


def test_nights_occupied_by_stay():
    # Guest stays Oct 10 -> Oct 13: nights of the 10th, 11th and 12th.
    assert occupied_nights(D(2026, 10, 10), D(2026, 10, 13)) == [
        D(2026, 10, 10),
        D(2026, 10, 11),
        D(2026, 10, 12),
    ]
    assert count_nights(D(2026, 10, 10), D(2026, 10, 13)) == 3


@pytest.mark.parametrize(
    "a,b,expected",
    [
        # identical
        ((10, 13), (10, 13), True),
        # partial overlaps
        ((10, 13), (12, 15), True),
        ((12, 15), (10, 13), True),
        # containment
        ((10, 20), (12, 14), True),
        ((12, 14), (10, 20), True),
        # same-day turnover: check-out 13 / check-in 13 does NOT overlap
        ((10, 13), (13, 15), False),
        ((13, 15), (10, 13), False),
        # disjoint
        ((10, 12), (14, 16), False),
        # one shared night
        ((10, 14), (13, 15), True),
    ],
)
def test_ranges_overlap(a, b, expected):
    assert (
        ranges_overlap(D(2026, 10, a[0]), D(2026, 10, a[1]), D(2026, 10, b[0]), D(2026, 10, b[1])) is expected
    )


def test_checkout_day_is_available_for_checkin():
    stay = (D(2026, 10, 10), D(2026, 10, 13))
    next_guest = (D(2026, 10, 13), D(2026, 10, 16))
    assert not ranges_overlap(*stay, *next_guest)


def test_validate_stay():
    today = D(2026, 10, 1)
    validate_stay(D(2026, 10, 10), D(2026, 10, 11), today=today)
    with pytest.raises(InvalidDateRange):
        validate_stay(D(2026, 10, 10), D(2026, 10, 10), today=today)
    with pytest.raises(InvalidDateRange):
        validate_stay(D(2026, 10, 12), D(2026, 10, 10), today=today)
    with pytest.raises(InvalidDateRange):
        validate_stay(D(2026, 9, 10), D(2026, 9, 12), today=today)
    validate_stay(D(2026, 9, 10), D(2026, 9, 12), today=today, allow_past=True)


def test_merge_periods():
    merged = merge_periods(
        [
            Period(D(2026, 10, 10), D(2026, 10, 13)),
            Period(D(2026, 10, 13), D(2026, 10, 15)),  # touching -> merged
            Period(D(2026, 10, 14), D(2026, 10, 16)),  # overlapping -> merged
            Period(D(2026, 10, 20), D(2026, 10, 22)),
        ]
    )
    assert merged == [Period(D(2026, 10, 10), D(2026, 10, 16)), Period(D(2026, 10, 20), D(2026, 10, 22))]
