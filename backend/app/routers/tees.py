"""Tee sets, their per-scope ratings, and course stroke indexes.

Course Rating, Slope Rating and stroke index are not in OpenStreetMap and
have no open API (spec 3.1), so they are entered here by hand. Validation is
strict on purpose: catching a transposed stroke index at entry is far cheaper
than discovering it inside a differential months later.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Course, Hole, TeeRating, TeeSet, User
from app.schemas.tee import (
    Scope,
    StrokeIndexIn,
    TeeRatingIn,
    TeeRatingOut,
    TeeSetIn,
    TeeSetOut,
    TeeSetPatch,
)

router = APIRouter(tags=["tees"])


def _course_or_404(db: Session, course_id: int) -> Course:
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    return course


def _tee_or_404(db: Session, tee_id: int) -> TeeSet:
    tee = db.get(TeeSet, tee_id)
    if tee is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tee set not found")
    return tee


@router.get("/courses/{course_id}/tees", response_model=list[TeeSetOut])
def list_tees(
    course_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TeeSet]:
    _course_or_404(db, course_id)
    return list(db.query(TeeSet).filter(TeeSet.course_id == course_id).all())


@router.post(
    "/courses/{course_id}/tees",
    response_model=TeeSetOut,
    status_code=status.HTTP_201_CREATED,
)
def create_tee(
    course_id: int,
    payload: TeeSetIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TeeSet:
    _course_or_404(db, course_id)
    tee = TeeSet(course_id=course_id, name=payload.name.strip(), yardage=payload.yardage)
    db.add(tee)
    db.commit()
    db.refresh(tee)
    return tee


@router.patch("/tees/{tee_id}", response_model=TeeSetOut)
def update_tee(
    tee_id: int,
    payload: TeeSetPatch,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TeeSet:
    tee = _tee_or_404(db, tee_id)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(tee, field, value.strip() if isinstance(value, str) else value)
    db.commit()
    db.refresh(tee)
    return tee


@router.delete("/tees/{tee_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_tee(
    tee_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    db.delete(_tee_or_404(db, tee_id))
    db.commit()


@router.put("/tees/{tee_id}/ratings/{scope}", response_model=TeeRatingOut)
def upsert_rating(
    tee_id: int,
    scope: Scope,
    payload: TeeRatingIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TeeRating:
    _tee_or_404(db, tee_id)
    rating = (
        db.query(TeeRating)
        .filter(TeeRating.tee_set_id == tee_id, TeeRating.scope == scope)
        .one_or_none()
    )
    if rating is None:
        rating = TeeRating(tee_set_id=tee_id, scope=scope)
        db.add(rating)
    rating.course_rating = payload.course_rating
    rating.slope_rating = payload.slope_rating
    rating.par = payload.par
    db.commit()
    db.refresh(rating)
    return rating


@router.put("/courses/{course_id}/stroke-index", response_model=list[int])
def set_stroke_indexes(
    course_id: int,
    payload: StrokeIndexIn,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[int]:
    _course_or_404(db, course_id)
    holes = (
        db.query(Hole).filter(Hole.course_id == course_id).order_by(Hole.number).all()
    )
    values = payload.stroke_indexes
    if len(values) != len(holes):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"Expected {len(holes)} stroke indexes, got {len(values)}",
        )
    if sorted(values) != list(range(1, len(holes) + 1)):
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"Stroke indexes must be a permutation of 1..{len(holes)}",
        )
    for hole, value in zip(holes, values):
        hole.stroke_index = value
    db.commit()
    return values
