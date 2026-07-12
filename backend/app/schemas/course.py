from datetime import datetime

from pydantic import BaseModel, ConfigDict


class HoleOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    course_id: int
    number: int
    par: int | None = None
    green_lat: float | None = None
    green_lng: float | None = None
    hazards: list | None = None


class HoleCreate(BaseModel):
    number: int
    par: int | None = None
    green_lat: float | None = None
    green_lng: float | None = None
    hazards: list | None = None


class CourseOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    osm_id: str | None = None
    import_source: str
    location_lat: float | None = None
    location_lng: float | None = None
    imported_at: datetime


class CourseCreate(BaseModel):
    name: str
    osm_id: str | None = None
    import_source: str = "manual"
    location_lat: float | None = None
    location_lng: float | None = None
