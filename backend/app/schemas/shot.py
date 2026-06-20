from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

Direction = Literal["left", "straight", "right"]


class ShotOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    session_id: int
    club_id: int
    carry_yards: float
    total_yards: float | None
    direction: Direction
    source: str
    created_at: datetime


class ShotCreate(BaseModel):
    club_id: int
    carry_yards: float
    total_yards: float | None = None
    direction: Direction = "straight"
    source: str = "manual"


class ShotUpdate(BaseModel):
    club_id: int | None = None
    carry_yards: float | None = None
    total_yards: float | None = None
    direction: Direction | None = None
