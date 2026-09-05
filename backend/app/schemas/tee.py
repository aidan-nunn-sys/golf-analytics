from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

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

    @model_validator(mode="after")
    def reject_null_name(self):
        """`TeeSet.name` is non-nullable, so an explicit `{"name": null}` would
        reach the DB and surface as a 500. Reject it as a 422 instead.
        `yardage: null` stays legal — it clears an optional column."""
        if "name" in self.model_fields_set and self.name is None:
            raise ValueError("name cannot be null")
        return self


class TeeSetOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    course_id: int
    name: str
    yardage: int | None
    ratings: list[TeeRatingOut] = []


class StrokeIndexIn(BaseModel):
    stroke_indexes: list[int] = Field(min_length=1)
