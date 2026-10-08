from datetime import date, datetime

from pydantic import BaseModel, Field

from app.schemas.common import ORMModel, PeriodOut


class AvailabilityOut(BaseModel):
    apartment_id: int
    start_date: date
    end_date: date
    min_nights: int
    blocked: list[PeriodOut]


class BlockCreate(BaseModel):
    start_date: date
    end_date: date
    reason: str = Field(default="", max_length=500)


class BlockOut(ORMModel):
    id: int
    apartment_id: int
    start_date: date
    end_date: date
    source: str
    reason: str
    external_uid: str | None
    booking_id: int | None
    created_at: datetime
    updated_at: datetime


class SyncResponse(BaseModel):
    success: bool
    events_imported: int
    created: int
    updated: int
    removed: int
    last_sync: datetime | None
    error: str | None = None


class SyncLogOut(ORMModel):
    id: int
    apartment_id: int
    source: str
    trigger: str
    started_at: datetime
    finished_at: datetime | None
    success: bool
    events_imported: int
    events_created: int
    events_updated: int
    events_removed: int
    error: str | None
