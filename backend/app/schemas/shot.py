from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Direction = Literal["left", "straight", "right"]
Source = Literal["manual", "launch_monitor", "gps"]


class ShotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int | None
    round_id: int | None
    hole_number: int | None
    club_id: int
    carry_yards: float | None
    total_yards: float | None
    direction: Direction
    source: Source
    accuracy: str | None
    created_at: datetime


class ShotCreate(BaseModel):
    club_id: int
    carry_yards: float
    total_yards: float | None = None
    direction: Direction = "straight"
    source: Source = "manual"


class ShotUpdate(BaseModel):
    club_id: int | None = None
    carry_yards: float | None = None
    total_yards: float | None = None
    direction: Direction | None = None
    source: Source | None = None


class RoundShotCreate(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    club_id: int
    start_lat: float = Field(ge=-90, le=90)
    start_lng: float = Field(ge=-180, le=180)
    end_lat: float = Field(ge=-90, le=90)
    end_lng: float = Field(ge=-180, le=180)
    direction: Direction = "straight"
    accuracy: str | None = None
    hole_number: int | None = None
