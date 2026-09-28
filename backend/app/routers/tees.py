"""Tee sets, per-scope ratings, and course stroke indexes.

Configure these manually or import them from official scorecards using the
preview/apply routes. OpenStreetMap geometry alone does not supply ratings.
Validation catches invalid setup before it reaches the handicap calculation.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Course, Hole, Round, TeeRating, TeeSet, User
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

# Courses, tee sets and ratings are SHARED across users by design - two people
# who play the same course should not each re-enter its 20 numbers - so these
# endpoints authenticate but do not scope to an owner. Any authenticated user
# can therefore PATCH or DELETE a tee another user's rounds referenced. That
# is accepted, not an oversight: `Round` snapshots course_rating/slope_rating/
# course_par at creation (spec 3.2), so an edit here cannot rewrite a single
# existing differential - the blast radius is rounds created afterwards. This
# is a self-hosted app for the owner and friends; per-user course libraries
# would cost more than the trust model is worth. Rounds, holes and every stat
# derived from them remain strictly per-user.


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


def _validate_yardages(db: Session, course_id: int, yardages: dict, total: int | None):
    numbers = set(db.scalars(select(Hole.number).where(Hole.course_id == course_id)))
    if any(int(n) not in numbers for n in yardages):
        raise HTTPException(422, "Tee yardages must refer to configured holes")
    if yardages and len(yardages) == len(numbers) and total is not None and sum(yardages.values()) != total:
        raise HTTPException(422, "Total yardage must match the hole yardages")


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
    _validate_yardages(db, course_id, payload.hole_yardages, payload.yardage)
    tee = TeeSet(course_id=course_id, name=payload.name.strip(), yardage=payload.yardage, hole_yardages=payload.hole_yardages)
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
    values = payload.model_dump(exclude_unset=True)
    _validate_yardages(db, tee.course_id, values.get("hole_yardages", tee.hole_yardages), values.get("yardage", tee.yardage))
    for field, value in values.items():
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
    tee = _tee_or_404(db, tee_id)
    for round in db.scalars(select(Round).where(Round.tee_set_id == tee_id)):
        round.tee_set_id = None
    db.delete(tee)
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
