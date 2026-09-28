from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

Scope = Literal["18", "front9", "back9"]
Yardages = dict[Annotated[str, Field(pattern=r"^([1-9]|1[0-8])$")], Annotated[int, Field(ge=1, le=1500)]]


class TeeRatingIn(BaseModel):
    course_rating: float = Field(gt=0, le=100, allow_inf_nan=False)
    slope_rating: int = Field(ge=55, le=155)
    par: int = Field(ge=27, le=100)


class TeeRatingOut(TeeRatingIn):
    model_config = ConfigDict(from_attributes=True)
    id: int
    scope: Scope


class TeeSetIn(BaseModel):
    hole_yardages: Yardages = Field(default_factory=dict)
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=60)
    yardage: int | None = Field(default=None, ge=0)


class TeeSetPatch(BaseModel):
    hole_yardages: Yardages = Field(default_factory=dict)
    model_config = ConfigDict(str_strip_whitespace=True)
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
    hole_yardages: Yardages = Field(default_factory=dict)
    model_config = ConfigDict(from_attributes=True)
    id: int
    course_id: int
    name: str
    yardage: int | None
    ratings: list[TeeRatingOut] = []


class StrokeIndexIn(BaseModel):
    stroke_indexes: list[int] = Field(min_length=1)
