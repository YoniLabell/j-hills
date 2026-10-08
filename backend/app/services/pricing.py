from dataclasses import dataclass
from datetime import date
from decimal import ROUND_HALF_UP, Decimal

from app.models import Apartment
from app.services.availability_service import count_nights

TWO_PLACES = Decimal("0.01")


@dataclass(frozen=True)
class Quote:
    nights: int
    nightly_rate: Decimal
    accommodation: Decimal
    cleaning_fee: Decimal
    total: Decimal


def quote(apartment: Apartment, check_in: date, check_out: date) -> Quote:
    """Price a stay. Kept separate so seasonal pricing, coupons or dynamic
    pricing can later replace this single function."""
    nights = count_nights(check_in, check_out)
    rate = Decimal(apartment.price_per_night or 0)
    cleaning = Decimal(apartment.cleaning_fee or 0)
    accommodation = (rate * nights).quantize(TWO_PLACES, ROUND_HALF_UP)
    total = (accommodation + cleaning).quantize(TWO_PLACES, ROUND_HALF_UP)
    return Quote(nights, rate, accommodation, cleaning, total)
