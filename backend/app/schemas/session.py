from datetime import date as date_type

from pydantic import BaseModel, ConfigDict


class SessionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    date: date_type
    name: str | None
    surface: str | None
    wind: str | None
    temperature: float | None
    notes: str | None


class SessionCreate(BaseModel):
    date: date_type
    name: str | None = None
    surface: str | None = None
    wind: str | None = None
    temperature: float | None = None
    notes: str | None = None


class SessionUpdate(BaseModel):
    date: date_type | None = None
    name: str | None = None
    surface: str | None = None
    wind: str | None = None
    temperature: float | None = None
    notes: str | None = None
