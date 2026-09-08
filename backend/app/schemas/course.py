from datetime import datetime

from pydantic import BaseModel, ConfigDict


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

    id: int
    name: str
    osm_id: str | None
    import_source: str
    location_lat: float | None
    location_lng: float | None
    imported_at: datetime
    holes: list[HoleOut] = []


class CourseSearchResult(BaseModel):
    osm_id: str
    name: str
    location_lat: float | None
    location_lng: float | None
    hole_count: int


class ManualHoleIn(BaseModel):
    number: int
    par: int


class CourseCreate(BaseModel):
    name: str
    osm_id: str | None = None
    import_source: str = "manual"
    location_lat: float | None = None
    location_lng: float | None = None
    holes: list[ManualHoleIn] | None = None
