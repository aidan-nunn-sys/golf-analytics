from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Club, Course, Hole, Round, RoundHole, Shot, TeeRating, TeeSet, User
from app.routers.stats import _round_records, _round_stats_for
from app.schemas.round import (
    RoundCreate,
    RoundHoleOut,
    RoundHolePatch,
    RoundOut,
    RoundUpdate,
)
from app.schemas.shot import RoundShotCreate, ShotOut
from app.schemas.stats import RoundStats
from app.stats.geo import haversine_yards
from app.stats.handicap.history import walk_history
from app.stats.handicap.scope import scope_for

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
        RoundHoleOut(
            hole_number=number,
            par=rh.par,
            strokes=rh.strokes,
            putts=rh.putts,
            fairway_hit=rh.fairway_hit,
            penalties=rh.penalties,
        )
        for rh, number in rows
    ]
    return RoundOut(
        id=r.id,
        course_id=r.course_id,
        date=r.date,
        status=r.status,
        current_hole=r.current_hole,
        tee_set_id=r.tee_set_id,
        hole_count=r.hole_count,
        nine=r.nine,
        course_rating=r.course_rating,
        slope_rating=r.slope_rating,
        course_par=r.course_par,
        holes=holes,
    )


def _snapshot_rating(db: Session, tee_set_id: int | None, course_id: int, scope: str):
    """Copy rating/slope/par off the tee at creation so a later re-rating
    cannot rewrite this round's differential (spec 3.2)."""
    if tee_set_id is None:
        return None, None, None
    tee = db.get(TeeSet, tee_set_id)
    if tee is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tee set not found")
    if tee.course_id != course_id:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            "Tee does not belong to this course",
        )
    rating = (
        db.query(TeeRating)
        .filter(TeeRating.tee_set_id == tee_set_id, TeeRating.scope == scope)
        .one_or_none()
    )
    if rating is None:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_CONTENT,
            f"This tee has no {scope} rating; add one before starting the round",
        )
    return rating.course_rating, rating.slope_rating, rating.par


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
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_CONTENT, "Course has no holes")
    scope = scope_for(payload.hole_count, payload.nine)
    course_rating, slope_rating, course_par = _snapshot_rating(
        db, payload.tee_set_id, payload.course_id, scope
    )
    r = Round(
        user_id=user.id,
        course_id=payload.course_id,
        date=payload.date,
        status=payload.status,
        tee_set_id=payload.tee_set_id,
        hole_count=payload.hole_count,
        nine=payload.nine,
        course_rating=course_rating,
        slope_rating=slope_rating,
        course_par=course_par,
    )
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
    db.refresh(r)

    if payload.holes:
        by_number = {rh.hole.number: rh for rh in r.holes}
        for incoming in payload.holes:
            rh = by_number.get(incoming.number)
            if rh is None:
                raise HTTPException(
                    status.HTTP_422_UNPROCESSABLE_CONTENT,
                    f"Course has no hole {incoming.number}",
                )
            rh.strokes = incoming.strokes
            rh.putts = incoming.putts
            rh.fairway_hit = incoming.fairway_hit
            rh.penalties = incoming.penalties
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
    payload: RoundHolePatch,
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
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(row, field, value)
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
    # GPS measures start-of-swing to ball-at-rest, i.e. carry + roll combined —
    # a different quantity from Pillar 1's manually-entered flight-carry, so it
    # goes in total_yards, not carry_yards. See 2026-07-15 decision log entry.
    ground_yards = haversine_yards(
        payload.start_lat, payload.start_lng, payload.end_lat, payload.end_lng
    )
    shot = Shot(
        round_id=round_id,
        hole_number=hole_number,
        club_id=payload.club_id,
        total_yards=round(ground_yards, 1),
        direction=payload.direction,
        source="gps",
        accuracy=payload.accuracy,
    )
    db.add(shot)
    db.commit()
    db.refresh(shot)
    return shot


@router.get("/{round_id}/stats", response_model=RoundStats)
def get_round_stats(
    round_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RoundStats:
    r = _owned_round(db, round_id, user)
    results = {x["round_id"]: x for x in walk_history(_round_records(db, user))}
    return _round_stats_for(r, results.get(r.id))
