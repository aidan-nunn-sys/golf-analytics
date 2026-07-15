from datetime import date as date_type

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Club, Course, Hole, Round, RoundHole, Shot, User
from app.schemas.round import (
    RoundCreate,
    RoundHoleOut,
    RoundHoleUpdate,
    RoundOut,
    RoundUpdate,
)
from app.schemas.shot import RoundShotCreate, ShotOut
from app.stats.geo import haversine_yards

router = APIRouter(prefix="/rounds", tags=["rounds"])


def _owned_round(db: Session, round_id: int, user: User) -> Round:
    r = db.get(Round, round_id)
    if r is None or r.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Round not found")
    return r


def _round_out(db: Session, r: Round) -> RoundOut:
    rows = db.execute(
        select(RoundHole, Hole.number)
        .join(Hole, RoundHole.hole_id == Hole.id)
        .where(RoundHole.round_id == r.id)
        .order_by(Hole.number)
    ).all()
    holes = [
        RoundHoleOut(hole_number=number, par=rh.par, strokes=rh.strokes)
        for rh, number in rows
    ]
    return RoundOut(
        id=r.id,
        course_id=r.course_id,
        date=r.date,
        status=r.status,
        current_hole=r.current_hole,
        holes=holes,
    )


@router.post("", response_model=RoundOut, status_code=status.HTTP_201_CREATED)
def create_round(
    payload: RoundCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RoundOut:
    course = db.get(Course, payload.course_id)
    if course is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Course not found")
    holes = db.scalars(
        select(Hole).where(Hole.course_id == course.id).order_by(Hole.number)
    ).all()
    if not holes:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Course has no holes")
    r = Round(user_id=user.id, course_id=course.id, date=date_type.today())
    db.add(r)
    db.commit()
    db.refresh(r)
    for h in holes:
        # ponytail: OSM-imported holes can have a null par (no par tag found);
        # RoundHole.par is non-nullable so we default to 4 rather than crash.
        # Manual courses always supply par (ManualHoleIn.par is required), so
        # this only ever fires for thin OSM data.
        db.add(RoundHole(round_id=r.id, hole_id=h.id, par=h.par or 4))
    db.commit()
    return _round_out(db, r)


@router.get("", response_model=list[RoundOut])
def list_rounds(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[RoundOut]:
    rounds = db.scalars(
        select(Round)
        .where(Round.user_id == user.id)
        .order_by(Round.date.desc(), Round.id.desc())
    ).all()
    return [_round_out(db, r) for r in rounds]


@router.get("/{round_id}", response_model=RoundOut)
def get_round(
    round_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RoundOut:
    return _round_out(db, _owned_round(db, round_id, user))


@router.patch("/{round_id}", response_model=RoundOut)
def update_round(
    round_id: int,
    payload: RoundUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RoundOut:
    r = _owned_round(db, round_id, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(r, field, value)
    db.commit()
    db.refresh(r)
    return _round_out(db, r)


@router.patch("/{round_id}/holes/{number}", response_model=RoundOut)
def update_round_hole(
    round_id: int,
    number: int,
    payload: RoundHoleUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RoundOut:
    r = _owned_round(db, round_id, user)
    row = db.execute(
        select(RoundHole)
        .join(Hole, RoundHole.hole_id == Hole.id)
        .where(RoundHole.round_id == r.id, Hole.number == number)
    ).scalar_one_or_none()
    if row is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hole not found in round")
    row.strokes = payload.strokes
    db.commit()
    return _round_out(db, r)


@router.post(
    "/{round_id}/shots", response_model=ShotOut, status_code=status.HTTP_201_CREATED
)
def create_round_shot(
    round_id: int,
    payload: RoundShotCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Shot:
    r = _owned_round(db, round_id, user)
    club = db.get(Club, payload.club_id)
    if club is None or club.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Club not found")
    hole_number = payload.hole_number if payload.hole_number is not None else r.current_hole
    carry_yards = haversine_yards(
        payload.start_lat, payload.start_lng, payload.end_lat, payload.end_lng
    )
    shot = Shot(
        round_id=round_id,
        hole_number=hole_number,
        club_id=payload.club_id,
        carry_yards=round(carry_yards, 1),
        direction=payload.direction,
        source="gps",
        accuracy=payload.accuracy,
    )
    db.add(shot)
    db.commit()
    db.refresh(shot)
    return shot
