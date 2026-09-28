from datetime import datetime
from typing import Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Club, Shot, User
from app.routers.rounds import _owned_round
from app.schemas.shot import Direction, Source
from app.stats.geo import haversine_yards

router = APIRouter(prefix="/rounds", tags=["shot history"])
Lie = Literal["unknown", "tee", "fairway", "rough", "sand", "green", "recovery"]


class Position(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    accuracy: float | None = Field(default=None, ge=0)
    timestamp: float | None = Field(default=None, ge=0)


class HistoryIn(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    expected_revision: int = Field(ge=0)
    club_id: int
    hole_number: int = Field(ge=1, le=18)
    sequence: int | None = Field(default=None, ge=1, le=1000)
    start: Position | None = None
    end: Position | None = None
    start_lie: Lie = "unknown"
    end_lie: Lie = "unknown"
    penalties: int = Field(default=0, ge=0, le=10)
    holed_out: bool = False
    deleted: bool = False
    direction: Direction = "straight"
    source: Source = "manual"
    total_yards: float | None = Field(default=None, ge=0, le=2000)

    @model_validator(mode="after")
    def paired_positions(self):
        if (self.start is None) != (self.end is None):
            raise ValueError("Provide both shot endpoints or neither")
        # Older GPS records may lack positions; retain their known distance.
        return self


class HistoryOut(BaseModel):
    client_id: str
    id: int
    club_id: int
    club_label: str
    hole_number: int
    sequence: int | None
    start: Position | None
    end: Position | None
    start_lie: Lie
    end_lie: Lie
    penalties: int
    holed_out: bool
    deleted: bool
    direction: Direction
    source: Source
    carry_yards: float | None
    total_yards: float | None
    revision: int
    created_at: datetime


def output(shot: Shot, db: Session):
    return HistoryOut(
        client_id=shot.client_id, id=shot.id, club_id=shot.club_id,
        club_label=shot.club_label or db.get(Club, shot.club_id).label,
        hole_number=shot.hole_number, sequence=shot.sequence, start=shot.start_position,
        end=shot.end_position, start_lie=shot.start_lie, end_lie=shot.end_lie,
        penalties=shot.penalties, holed_out=shot.holed_out, deleted=shot.deleted,
        direction=shot.direction, source=shot.source, carry_yards=shot.carry_yards,
        total_yards=shot.total_yards, revision=shot.revision, created_at=shot.created_at,
    )


@router.get("/{round_id}/shot-history", response_model=list[HistoryOut])
def history(round_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    _owned_round(db, round_id, user)
    shots = db.scalars(select(Shot).where(Shot.round_id == round_id).order_by(Shot.hole_number, Shot.sequence, Shot.id)).all()
    return [output(shot, db) for shot in shots]


@router.put("/{round_id}/shot-history/{client_id}", response_model=HistoryOut)
def save_shot(round_id: int, client_id: UUID, payload: HistoryIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    round = _owned_round(db, round_id, user)
    if payload.hole_number not in {h.hole.number for h in round.holes}:
        raise HTTPException(422, "This hole is not in the round")
    club = db.get(Club, payload.club_id)
    if not club or club.user_id != user.id:
        raise HTTPException(404, "Club not found")
    condition = (Shot.round_id == round_id, Shot.client_id == str(client_id))
    current = db.scalar(select(Shot).where(*condition))
    values = payload.model_dump(exclude={"expected_revision", "start", "end"})
    values.update(start_position=payload.start.model_dump() if payload.start else None, end_position=payload.end.model_dump() if payload.end else None)
    if payload.start and payload.end:
        values["total_yards"] = haversine_yards(payload.start.lat, payload.start.lng, payload.end.lat, payload.end.lng)
    if current and all(getattr(current, k) == v for k, v in values.items()):
        return output(current, db)
    values["club_label"] = current.club_label if current and current.club_id == club.id and current.club_label else club.label
    if payload.source == 'gps':
        values["carry_yards"] = None
    if not current and payload.expected_revision == 0:
        current = Shot(round_id=round_id, client_id=str(client_id), revision=1, **values)
        db.add(current)
        try:
            db.commit()
            db.refresh(current)
            return output(current, db)
        except IntegrityError:
            db.rollback()
    elif current and current.revision == payload.expected_revision:
        changed = db.execute(update(Shot).where(*condition, Shot.revision == payload.expected_revision).values(**values, revision=payload.expected_revision + 1)).rowcount
        db.commit()
        if changed:
            db.expire_all()
            return output(db.scalar(select(Shot).where(*condition)), db)
    raise HTTPException(409, "This shot changed on another device. Review both versions before saving.")
