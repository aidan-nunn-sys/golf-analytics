from datetime import date as date_type
from typing import Literal

from pydantic import BaseModel, Field, model_validator

RoundStatus = Literal["in_progress", "completed", "abandoned"]


class RoundHoleOut(BaseModel):
    hole_number: int
    par: int
    strokes: int | None
    putts: int | None
    fairway_hit: bool | None
    penalties: int


class RoundOut(BaseModel):
    id: int
    course_id: int
    date: date_type
    status: RoundStatus
    current_hole: int
    tee_set_id: int | None
    hole_count: int
    nine: str | None
    course_rating: float | None
    slope_rating: int | None
    course_par: int | None
    holes: list[RoundHoleOut]


class RoundHoleIn(BaseModel):
    number: int = Field(ge=1, le=18)
    strokes: int | None = Field(default=None, ge=1)
    putts: int | None = Field(default=None, ge=0)
    fairway_hit: bool | None = None
    penalties: int = Field(default=0, ge=0)


class RoundCreate(BaseModel):
    course_id: int
    # Defaulted to today only for a round being played now. See check_date.
    date: date_type | None = None
    tee_set_id: int | None = None
    hole_count: Literal[9, 18] = 18
    nine: Literal["front", "back"] | None = None
    status: RoundStatus = "in_progress"
    holes: list[RoundHoleIn] | None = None

    @model_validator(mode="after")
    def check_date(self):
        """A round entered as already played must state when it was played.

        Defaulting to today is right for a live round and a hazard for a
        backlog one: the handicap walk is ordered by date, so a round from
        last summer silently stamped with today's date reorders the record
        and changes the Adjusted Gross Score of every round after it.
        """
        if self.date is None:
            if self.status != "in_progress":
                raise ValueError(
                    "A round entered as already played must state its date"
                )
            self.date = date_type.today()
        return self

    @model_validator(mode="after")
    def check_nine(self):
        if self.hole_count == 9 and self.nine is None:
            raise ValueError("A 9-hole round must specify which nine ('front' or 'back')")
        if self.hole_count == 18 and self.nine is not None:
            raise ValueError("'nine' only applies to 9-hole rounds")
        return self


class RoundUpdate(BaseModel):
    current_hole: int | None = None
    status: RoundStatus | None = None


class RoundHolePatch(BaseModel):
    strokes: int | None = Field(default=None, ge=1)
    putts: int | None = Field(default=None, ge=0)
    fairway_hit: bool | None = None
    penalties: int | None = Field(default=None, ge=0)
