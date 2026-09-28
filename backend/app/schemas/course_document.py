from typing import Literal
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.schemas.tee import TeeSetIn, TeeRatingIn, Scope


class CardHole(BaseModel):
    model_config = ConfigDict(extra="forbid")
    number: int = Field(ge=1, le=18)
    par: int | None = Field(default=None, ge=3, le=6)
    stroke_index: int | None = Field(default=None, ge=1, le=18)
    green_lat: float | None = Field(default=None, ge=-90, le=90)
    green_lng: float | None = Field(default=None, ge=-180, le=180)

    @model_validator(mode="after")
    def coordinate_pair(self):
        if (self.green_lat is None) != (self.green_lng is None):
            raise ValueError("Provide both green coordinates or leave both blank")
        return self


class CardRating(TeeRatingIn):
    model_config = ConfigDict(extra="forbid")
    scope: Scope


class CardTee(TeeSetIn):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    ratings: list[CardRating] = Field(default_factory=list, max_length=3)

    @model_validator(mode="after")
    def unique_ratings(self):
        if len({r.scope for r in self.ratings}) != len(self.ratings):
            raise ValueError("Each rating scope must appear once per tee")
        return self


class CourseDocument(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    version: Literal[1] = 1
    name: str = Field(min_length=1, max_length=200)
    holes: list[CardHole] = Field(min_length=1, max_length=18)
    tees: list[CardTee] = Field(default_factory=list, max_length=30)

    @model_validator(mode="after")
    def unique_entries(self):
        numbers = {h.number for h in self.holes}
        if len(numbers) != len(self.holes):
            raise ValueError("Each hole number must appear once")
        indexes = [h.stroke_index for h in self.holes if h.stroke_index is not None]
        if len(set(indexes)) != len(indexes):
            raise ValueError("Stroke indexes must be unique")
        if len({t.name.casefold() for t in self.tees}) != len(self.tees):
            raise ValueError("Tee names must be unique")
        for tee in self.tees:
            if any(int(n) not in numbers for n in tee.hole_yardages):
                raise ValueError("Tee yardages must refer to configured holes")
            if len(tee.hole_yardages) == len(numbers) and tee.yardage is not None and sum(tee.hole_yardages.values()) != tee.yardage:
                raise ValueError(f"{tee.name}: total yardage does not match the hole yardages")
            for rating in tee.ratings:
                expected = set(range(1, 19) if rating.scope == "18" else range(1, 10) if rating.scope == "front9" else range(10, 19))
                selected = [h for h in self.holes if h.number in expected]
                if {h.number for h in selected} != expected or any(h.par is None for h in selected):
                    raise ValueError(f"{tee.name}: {rating.scope} rating requires a complete scorecard")
                if sum(h.par for h in selected) != rating.par:
                    raise ValueError(f"{tee.name}: rating par must match the selected hole pars")
        return self


class FileImport(BaseModel):
    format: Literal["csv", "json"]
    content: str = Field(min_length=1, max_length=500_000)
    allow_duplicate: bool = False


class CourseRepair(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=200)
    holes: list[CardHole] = Field(min_length=1, max_length=18)

    @model_validator(mode="after")
    def unique_holes(self):
        CourseDocument(name=self.name, holes=self.holes)
        return self
