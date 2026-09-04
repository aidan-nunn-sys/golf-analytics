from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Club, RangeSession, Round, Shot, User
from app.schemas.stats import (
    ClubStats,
    Dashboard,
    DifferentialRow,
    GapRow,
    HandicapOut,
    RoundStats,
    RoundTrendOut,
)
from app.stats.engine import compute_club_stats, compute_gapping
from app.stats.handicap.history import current_state, walk_history
from app.stats.handicap.scope import covers_hole, scope_for
from app.stats.round_stats import compute_round_stats

router = APIRouter(tags=["stats"])

# A round only feeds the handicap walk / trend views once it has a final
# scorecard. `completed` and `abandoned` both qualify: an 18-hole round
# walked off after 13 holes is `abandoned`, not `completed`, but it still
# produces a valid differential (Rule 2.2a needs only 10 scored holes) and
# the project spec treats partial rounds as first-class, not silently
# dropped. `in_progress` rounds are excluded — their scorecard isn't final.
_SCORED_STATUSES = ("completed", "abandoned")


def _shots_for_club(db: Session, club_id: int, user_id: int) -> list[dict]:
    range_rows = db.execute(
        select(Shot.carry_yards, Shot.direction)
        .join(RangeSession, Shot.session_id == RangeSession.id)
        .where(Shot.club_id == club_id, RangeSession.user_id == user_id)
    ).all()
    # On-course GPS shots store ground distance (carry + roll) in total_yards,
    # a different quantity from range shots' flight-carry — see 2026-07-15
    # decision log entry. Both feed club stats/gapping as a "distance" value.
    round_rows = db.execute(
        select(Shot.total_yards, Shot.direction)
        .join(Round, Shot.round_id == Round.id)
        .where(Shot.club_id == club_id, Round.user_id == user_id)
    ).all()
    return [{"carry_yards": r.carry_yards, "direction": r.direction} for r in range_rows] + [
        {"carry_yards": r.total_yards, "direction": r.direction} for r in round_rows
    ]


@router.get("/clubs/{club_id}/stats", response_model=ClubStats)
def club_stats(
    club_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    club = db.get(Club, club_id)
    if club is None or club.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Club not found")
    return compute_club_stats(_shots_for_club(db, club_id, user.id))


def _gapping_rows(db: Session, user_id: int) -> list[dict]:
    clubs = db.scalars(
        select(Club).where(Club.user_id == user_id, Club.is_active.is_(True))
    ).all()
    enriched = []
    for club in clubs:
        stats = compute_club_stats(_shots_for_club(db, club.id, user_id))
        enriched.append(
            {"club_id": club.id, "label": club.label, "avg_carry": stats["avg_carry"]}
        )
    return compute_gapping(enriched)


@router.get("/stats/gapping", response_model=list[GapRow])
def gapping(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[dict]:
    return _gapping_rows(db, user.id)


@router.get("/stats/dashboard", response_model=Dashboard)
def dashboard(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> dict:
    clubs = db.scalars(
        select(Club)
        .where(Club.user_id == user.id, Club.is_active.is_(True))
        .order_by(Club.order_index)
    ).all()
    club_blocks = [
        {
            "club_id": c.id,
            "label": c.label,
            "category": c.category,
            "order_index": c.order_index,
            "stats": compute_club_stats(_shots_for_club(db, c.id, user.id)),
        }
        for c in clubs
    ]
    return {"clubs": club_blocks, "gapping": _gapping_rows(db, user.id)}


def _round_records(db: Session, user: User) -> list[dict]:
    """Load the user's rounds as RoundRecords for the handicap walk.

    Scope comes from the round's declared hole_count/nine, and rating values
    from the round's own snapshot — never live from the tee (spec 3.2).
    Includes both `completed` and `abandoned` rounds: see _SCORED_STATUSES.

    Holes are sliced to the round's declared scope. `create_round` always
    lays down all 18 `RoundHole` rows (the course has 18 holes whichever
    nine you walk), so a front-nine round carries nine rows it never played.
    Handing those to the engine padded the unplayed nine at net par and then
    divided an 18-hole-sized gross by the 9-hole Course Rating — a ~90x wrong
    differential. Slicing here rather than at creation also repairs rounds
    already in the database.

    `stroke_index` is passed through as-is, INCLUDING None. Substituting the
    hole number fabricated a stroke allocation: net double bogey and net par
    both allocate by stroke index, so an index-less course produced a
    plausible-looking differential and an Index with no stated reason. Spec
    3.1 makes stroke index a precondition for acceptability, so the engine
    now names it missing instead (`history._acceptability`).
    """
    rounds = (
        db.query(Round)
        .filter(Round.user_id == user.id, Round.status.in_(_SCORED_STATUSES))
        .all()
    )
    records = []
    for r in rounds:
        scope = scope_for(r.hole_count, r.nine)
        holes = [
            {
                "par": rh.par,
                "stroke_index": rh.hole.stroke_index,
                "strokes": rh.strokes,
            }
            for rh in sorted(r.holes, key=lambda rh: rh.hole.number)
            if covers_hole(scope, rh.hole.number)
        ]
        records.append(
            {
                "round_id": r.id,
                "date": r.date,
                "scope": scope,
                "tee_set_id": r.tee_set_id,
                "course_rating": r.course_rating,
                "slope_rating": r.slope_rating,
                "par": r.course_par,
                "holes": holes,
            }
        )
    return records


def _round_stats_for(r: Round, result: dict | None) -> RoundStats:
    holes = [
        {
            "par": rh.par,
            "strokes": rh.strokes,
            "putts": rh.putts,
            "fairway_hit": rh.fairway_hit,
            "penalties": rh.penalties,
        }
        for rh in r.holes
    ]
    return RoundStats(
        **compute_round_stats(holes),
        differential=(result or {}).get("differential"),
        counts_toward_index=(result or {}).get("counts_toward_index", False),
        reason=(result or {}).get("reason"),
    )


@router.get("/stats/handicap", response_model=HandicapOut)
def get_handicap(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> HandicapOut:
    results = walk_history(_round_records(db, user))
    state = current_state(results)
    counting_ids = set(state["counting_round_ids"])
    return HandicapOut(
        index=state["index"],
        low_index=state["low_index"],
        cap_applied=state["cap_applied"],
        cap_adjustment=state["cap_adjustment"],
        rounds_needed=state["rounds_needed"],
        differentials=[
            DifferentialRow(
                round_id=r["round_id"],
                date=r["date"],
                differential=r["differential"],
                counts_toward_index=r["counts_toward_index"],
                reason=r["reason"],
                is_counting=r["round_id"] in counting_ids,
                index_after=r["index_after"],
            )
            for r in results
        ],
    )


@router.get("/stats/rounds", response_model=RoundTrendOut)
def get_round_trend(
    limit: int = 20,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RoundTrendOut:
    results = {r["round_id"]: r for r in walk_history(_round_records(db, user))}
    rounds = (
        db.query(Round)
        .filter(Round.user_id == user.id, Round.status.in_(_SCORED_STATUSES))
        .order_by(Round.date.desc())
        .limit(limit)
        .all()
    )
    stats = [_round_stats_for(r, results.get(r.id)) for r in rounds]

    def _mean(key: str) -> float | None:
        values = [getattr(s, key) for s in stats if getattr(s, key) is not None]
        return round(sum(values) / len(values), 1) if values else None

    return RoundTrendOut(
        rounds=stats,
        averages={k: _mean(k) for k in ("score", "putts", "gir_pct", "fairway_pct")},
    )
