from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, model_validator


class HoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: int
    number: int
    par: int | None
    green_lat: float | None
    green_lng: float | None
    hazards: list[dict] | None
    stroke_index: int | None = None


class HoleCreate(BaseModel):
    number: int
    par: int | None = None
    green_lat: float | None = None
    green_lng: float | None = None
    hazards: list[dict] | None = None


class CourseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    archived_at: datetime | None = None
    id: int
    name: str
    osm_id: str | None
    import_source: str
    location_lat: float | None
    location_lng: float | None
    scorecard_source: str | None = None
    scorecard_imported_at: datetime | None = None
    scorecard_urls: list[str] | None = None
    imported_at: datetime
    holes: list[HoleOut] = []


class CourseSearchResult(BaseModel):
    osm_id: str
    name: str
    location_lat: float | None
    location_lng: float | None
    hole_count: int | None


class ManualHoleIn(BaseModel):
    number: int = Field(ge=1, le=18)
    par: int = Field(ge=3, le=6)


class CourseCreate(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)
    name: str = Field(min_length=1, max_length=200)
    osm_id: str | None = Field(default=None, pattern=r"^(node|way|relation)/[1-9][0-9]*$")
    import_source: str = "manual"
    location_lat: float | None = None
    location_lng: float | None = None
    holes: list[ManualHoleIn] | None = None

    @model_validator(mode="after")
    def unique_holes(self):
        if self.holes and len({h.number for h in self.holes}) != len(self.holes):
            raise ValueError("Each hole number must appear once")
        return self
