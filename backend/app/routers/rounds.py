from datetime import datetime, timezone

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
from app.stats.handicap.scope import scope_for, covers_hole

router = APIRouter(prefix="/rounds", tags=["rounds"])


def _owned_round(db: Session, round_id: int, user: User, *, include_deleted: bool = False) -> Round:
    r = db.get(Round, round_id)
    if r is None or r.user_id != user.id or (r.deleted_at is not None and not include_deleted):
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
        for rh, number in rows if covers_hole(scope_for(r.hole_count, r.nine), number)
    ]
    return RoundOut(
        revision=r.revision,
        green_notes=r.green_notes,
        course_name=r.course_name,
        tee_name=r.tee_name,
        hole_yardages=r.hole_yardages,
        id=r.id,
        course_id=r.course_id,
        date=r.date,
        notes=r.notes,
        deleted_at=r.deleted_at,
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
    cannot rewrite this round's differential (spec 3.2).

    A tee with no rating for the scope played is NOT an error. Spec 3.2 is
    explicit that such a round is created and that `GET /rounds/{id}/stats`
    "says so by name" - refusing it lost the round, and with it the score,
    the putts and the fairways, over a rating the player can add later. The
    snapshot is left null and the handicap engine reports the round
    non-acceptable with the scope named.

    A tee belonging to a DIFFERENT course is still rejected: that is a
    mismatched request, not missing reference data.
    """
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
        return None, None, None
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
    if course.archived_at is not None:
        raise HTTPException(409, "Restore this course before starting a new round")
    holes = db.scalars(
        select(Hole).where(Hole.course_id == course.id).order_by(Hole.number)
    ).all()
    scope = scope_for(payload.hole_count, payload.nine)
    holes = [h for h in holes if covers_hole(scope, h.number)]
    expected = set(range(10, 19) if scope == "back9" else range(1, 10) if scope == "front9" else range(1, 19))
    if {h.number for h in holes} != expected or len(holes) != len(expected) or any(h.par not in (3, 4, 5, 6) for h in holes):
        raise HTTPException(422, "Complete the selected scorecard before starting: every hole needs a valid par. Import the scorecard or finish course setup.")
    if payload.holes:
        unknown = sorted({h.number for h in payload.holes} - expected)
        if unknown:
            raise HTTPException(422, f"Hole {unknown[0]} is not in the selected round scope")
    course_rating, slope_rating, course_par = _snapshot_rating(
        db, payload.tee_set_id, payload.course_id, scope
    )
    tee = db.get(TeeSet, payload.tee_set_id) if payload.tee_set_id else None
    r = Round(
        course_name=course.name,
        tee_name=tee.name if tee else None,
        hole_yardages={k: v for k, v in (tee.hole_yardages if tee else {}).items() if int(k) in expected},
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
        current_hole=min(expected),
    )
    db.add(r)
    db.flush()
    incoming = {h.number: h for h in payload.holes or []}
    for hole in holes:
        row = RoundHole(round_id=r.id, hole_id=hole.id, par=hole.par, stroke_index=hole.stroke_index)
        if hole.number in incoming:
            value = incoming[hole.number]
            row.strokes, row.putts = value.strokes, value.putts
            row.fairway_hit, row.penalties = value.fairway_hit, value.penalties
        db.add(row)
    db.commit()

    return _round_out(db, r)


@router.get("", response_model=list[RoundOut])
def list_rounds(
    deleted: bool = False,
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[RoundOut]:
    rounds = db.scalars(
        select(Round)
        .where(Round.user_id == user.id, Round.deleted_at.is_not(None) if deleted else Round.deleted_at.is_(None))
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
    if payload.current_hole is not None and (not covers_hole(scope_for(r.hole_count, r.nine), payload.current_hole) or not any(h.hole.number == payload.current_hole for h in r.holes)):
        raise HTTPException(422, "That hole is not part of this round")
    if payload.green_notes and not {int(n) for n in payload.green_notes}.issubset({h.hole.number for h in r.holes}):
        raise HTTPException(422, "Green notes must refer to a hole in this round")
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
    values = payload.model_dump(exclude_unset=True)
    strokes, putts = values.get("strokes", row.strokes), values.get("putts", row.putts)
    penalties = values.get("penalties", row.penalties)
    if strokes is not None and ((putts is not None and putts > strokes) or penalties > strokes or (putts or 0) + penalties > strokes):
        raise HTTPException(422, "Putts and penalties cannot exceed total strokes")
    for field, value in values.items():
        setattr(row, field, value)
    r.revision += 1
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
    if not covers_hole(scope_for(r.hole_count, r.nine), hole_number) or not any(h.hole.number == hole_number for h in r.holes):
        raise HTTPException(422, "That hole is not part of this round")
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
        club_label=club.label,
        start_position={"lat":payload.start_lat,"lng":payload.start_lng,"accuracy":None,"timestamp":None},
        end_position={"lat":payload.end_lat,"lng":payload.end_lng,"accuracy":None,"timestamp":None},
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


@router.delete("/{round_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_round(
    round_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    r = _owned_round(db, round_id, user, include_deleted=True)
    if r.deleted_at is None:
        r.deleted_at = datetime.now(timezone.utc)
        db.commit()


@router.post("/{round_id}/restore", response_model=RoundOut)
def restore_round(
    round_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RoundOut:
    r = _owned_round(db, round_id, user, include_deleted=True)
    r.deleted_at = None
    db.commit()
    return _round_out(db, r)
