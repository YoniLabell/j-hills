from datetime import date, datetime

from pydantic import BaseModel


class UpcomingStay(BaseModel):
    apartment_id: int
    apartment_name: str
    guest_name: str
    check_in: date
    check_out: date
    source: str


class SyncStatus(BaseModel):
    apartment_id: int
    apartment_name: str
    has_feed: bool
    last_sync_at: datetime | None
    last_sync_success: bool | None
    last_sync_error: str | None
    last_sync_events: int | None


class DashboardOut(BaseModel):
    apartments_total: int
    apartments_active: int
    new_inquiries: int
    upcoming_bookings: int
    upcoming_checkins: list[UpcomingStay]
    occupancy_percent_30d: float
    sync_status: list[SyncStatus]
