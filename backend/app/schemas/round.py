from datetime import date as date_type
from typing import Literal

from pydantic import BaseModel

RoundStatus = Literal["in_progress", "completed"]


class RoundHoleOut(BaseModel):
    hole_number: int
    par: int
    strokes: int | None


class RoundOut(BaseModel):
    id: int
    course_id: int
    date: date_type
    status: RoundStatus
    current_hole: int
    holes: list[RoundHoleOut]


class RoundCreate(BaseModel):
    course_id: int


class RoundUpdate(BaseModel):
    current_hole: int | None = None
    status: RoundStatus | None = None


class RoundHoleUpdate(BaseModel):
    strokes: int
