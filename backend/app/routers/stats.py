from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Club, RangeSession, Shot, User
from app.schemas.stats import ClubStats, Dashboard, GapRow
from app.stats.engine import compute_club_stats, compute_gapping

router = APIRouter(tags=["stats"])


def _shots_for_club(db: Session, club_id: int, user_id: int) -> list[dict]:
    rows = db.execute(
        select(Shot.carry_yards, Shot.direction)
        .join(RangeSession, Shot.session_id == RangeSession.id)
        .where(Shot.club_id == club_id, RangeSession.user_id == user_id)
    ).all()
    return [{"carry_yards": r.carry_yards, "direction": r.direction} for r in rows]


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
