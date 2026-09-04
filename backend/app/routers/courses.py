from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.integrations import overpass
from app.models import Course, Hole, User
from app.schemas.course import CourseCreate, CourseOut, CourseSearchResult, HoleOut

router = APIRouter(prefix="/courses", tags=["courses"])


def _course_out(db: Session, course: Course) -> CourseOut:
    holes = db.scalars(
        select(Hole).where(Hole.course_id == course.id).order_by(Hole.number)
    ).all()
    return CourseOut(
        id=course.id,
        name=course.name,
        osm_id=course.osm_id,
        import_source=course.import_source,
        location_lat=course.location_lat,
        location_lng=course.location_lng,
        imported_at=course.imported_at,
        holes=[HoleOut.model_validate(h) for h in holes],
    )


@router.get("", response_model=list[CourseSearchResult])
def search_courses(
    search: str,
    min_lat: float | None = None,
    min_lng: float | None = None,
    max_lat: float | None = None,
    max_lng: float | None = None,
    user: User = Depends(get_current_user),
) -> list[CourseSearchResult]:
    bbox = None
    if None not in (min_lat, min_lng, max_lat, max_lng):
        bbox = (min_lat, min_lng, max_lat, max_lng)
    results = overpass.search_courses(search, settings.overpass_base_url, bbox=bbox)
    return [CourseSearchResult(**r) for r in results]


@router.post("", response_model=CourseOut, status_code=status.HTTP_201_CREATED)
def import_course(
    payload: CourseCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CourseOut:
    if payload.osm_id is not None:
        existing = db.scalars(
            select(Course).where(Course.osm_id == payload.osm_id)
        ).first()
        if existing is not None:
            return _course_out(db, existing)

        course = Course(
            name=payload.name,
            osm_id=payload.osm_id,
            import_source="osm",
            location_lat=payload.location_lat,
            location_lng=payload.location_lng,
        )
        db.add(course)
        db.flush()  # obtain course.id without committing

        holes_data = overpass.fetch_course_holes(payload.osm_id, settings.overpass_base_url)
        for h in holes_data:
            db.add(Hole(course_id=course.id, **h))

        db.commit()
        db.refresh(course)  # imported_at is a server_default, needs refresh to populate
        return _course_out(db, course)

    if not payload.holes:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Manual course import requires at least one hole",
        )
    course = Course(name=payload.name, import_source="manual")
    db.add(course)
    db.commit()
    db.refresh(course)
    for h in payload.holes:
        db.add(Hole(course_id=course.id, number=h.number, par=h.par))
    db.commit()
    return _course_out(db, course)


@router.get("/{course_id}", response_model=CourseOut)
def get_course(
    course_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CourseOut:
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    return _course_out(db, course)
