from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Club, Shot, User
from app.routers.sessions import _owned_session
from app.schemas.shot import ShotCreate, ShotOut, ShotUpdate

router = APIRouter(tags=["shots"])


@router.post(
    "/sessions/{session_id}/shots",
    response_model=ShotOut,
    status_code=status.HTTP_201_CREATED,
)
def create_shot(
    session_id: int,
    payload: ShotCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Shot:
    _owned_session(db, session_id, user)
    club = db.get(Club, payload.club_id)
    if club is None or club.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Club not found")
    shot = Shot(session_id=session_id, **payload.model_dump())
    db.add(shot)
    db.commit()
    db.refresh(shot)
    return shot


@router.get("/sessions/{session_id}/shots", response_model=list[ShotOut])
def list_shots(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[Shot]:
    _owned_session(db, session_id, user)
    return list(
        db.scalars(
            select(Shot).where(Shot.session_id == session_id).order_by(Shot.id)
        ).all()
    )


@router.patch("/shots/{shot_id}", response_model=ShotOut)
def update_shot(
    shot_id: int,
    payload: ShotUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Shot:
    shot = db.get(Shot, shot_id)
    if shot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shot not found")
    _owned_session(db, shot.session_id, user)  # ownership via parent session
    data = payload.model_dump(exclude_unset=True)
    if "club_id" in data:
        club = db.get(Club, data["club_id"])
        if club is None or club.user_id != user.id:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Club not found")
    for field, value in data.items():
        setattr(shot, field, value)
    db.commit()
    db.refresh(shot)
    return shot


@router.delete("/shots/{shot_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_shot(
    shot_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    shot = db.get(Shot, shot_id)
    if shot is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Shot not found")
    _owned_session(db, shot.session_id, user)  # verifies ownership via session
    db.delete(shot)
    db.commit()
