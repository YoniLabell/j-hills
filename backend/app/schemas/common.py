from datetime import date

from pydantic import BaseModel, ConfigDict


class ORMModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Message(BaseModel):
    detail: str


class PeriodOut(BaseModel):
    start_date: date
    end_date: date
