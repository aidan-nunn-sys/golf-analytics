from datetime import date as date_type, datetime
from typing import Literal, Annotated

from pydantic import BaseModel, Field, model_validator

RoundStatus = Literal["in_progress", "completed", "abandoned"]


class GreenNote(BaseModel):
    break_direction: Literal['unknown', 'left', 'right', 'straight'] = 'unknown'
    pace: Literal['unknown', 'uphill', 'downhill', 'level'] = 'unknown'
    note: str = Field(default='', max_length=500)


GreenNotes = dict[Annotated[str, Field(pattern=r'^(?:[1-9]|1[0-8])$')], GreenNote]


class RoundHoleOut(BaseModel):
    hole_number: int
    par: int
    strokes: int | None
    putts: int | None
    fairway_hit: bool | None
    penalties: int


class RoundOut(BaseModel):
    green_notes: GreenNotes = Field(default_factory=dict)
    revision: int = 1
    course_name: str | None = None
    tee_name: str | None = None
    hole_yardages: dict[str, int] = Field(default_factory=dict)
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
    notes: str
    deleted_at: datetime | None
    holes: list[RoundHoleOut]


class RoundHoleIn(BaseModel):
    number: int = Field(ge=1, le=18)
    strokes: int | None = Field(default=None, ge=1)
    putts: int | None = Field(default=None, ge=0)
    fairway_hit: bool | None = None
    penalties: int = Field(default=0, ge=0)

    @model_validator(mode="after")
    def valid_score_parts(self):
        if self.strokes is not None and (self.putts or 0) + self.penalties > self.strokes:
            raise ValueError("Putts and penalties cannot exceed total strokes")
        return self


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
    def unique_holes(self):
        if self.holes and len({h.number for h in self.holes}) != len(self.holes):
            raise ValueError("Each hole number must appear once")
        return self

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
    green_notes: GreenNotes | None = None
    date: date_type | None = None
    notes: str | None = Field(default=None, max_length=4000)
    current_hole: int | None = Field(default=None, ge=1, le=18)
    status: RoundStatus | None = None

    @model_validator(mode="after")
    def reject_nulls(self):
        if any(getattr(self, field) is None for field in self.model_fields_set):
            raise ValueError("Round fields cannot be null")
        return self


class RoundHolePatch(BaseModel):
    strokes: int | None = Field(default=None, ge=1)
    putts: int | None = Field(default=None, ge=0)
    fairway_hit: bool | None = None
    penalties: int | None = Field(default=None, ge=0)

    @model_validator(mode="after")
    def nonnull_penalties(self):
        if "penalties" in self.model_fields_set and self.penalties is None:
            raise ValueError("Penalties cannot be null; use zero")
        return self
