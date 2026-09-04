from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

Scope = Literal["18", "front9", "back9"]


class TeeRatingIn(BaseModel):
    course_rating: float
    slope_rating: int = Field(ge=55, le=155)
    par: int = Field(ge=27, le=100)


class TeeRatingOut(TeeRatingIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    scope: Scope


class TeeSetIn(BaseModel):
    name: str = Field(min_length=1, max_length=60)
    yardage: int | None = Field(default=None, ge=0)


class TeeSetPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    yardage: int | None = Field(default=None, ge=0)


class TeeSetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    course_id: int
    name: str
    yardage: int | None
    ratings: list[TeeRatingOut] = []


class StrokeIndexIn(BaseModel):
    stroke_indexes: list[int] = Field(min_length=1)
