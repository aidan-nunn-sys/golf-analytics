from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Club, User
from app.schemas.club import ClubCreate, ClubOut, ClubUpdate

router = APIRouter(prefix="/clubs", tags=["clubs"])


def _owned_club(db: Session, club_id: int, user: User) -> Club:
    club = db.get(Club, club_id)
    if club is None or club.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Club not found")
    return club


@router.get("", response_model=list[ClubOut])
def list_clubs(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Club]:
    return list(
        db.scalars(
            select(Club).where(Club.user_id == user.id).order_by(Club.order_index)
        ).all()
    )


@router.post("", response_model=ClubOut, status_code=status.HTTP_201_CREATED)
def create_club(
    payload: ClubCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Club:
    club = Club(user_id=user.id, **payload.model_dump())
    db.add(club)
    db.commit()
    db.refresh(club)
    return club


@router.patch("/{club_id}", response_model=ClubOut)
def update_club(
    club_id: int,
    payload: ClubUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Club:
    club = _owned_club(db, club_id, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(club, field, value)
    db.commit()
    db.refresh(club)
    return club


@router.delete("/{club_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_club(
    club_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    club = _owned_club(db, club_id, user)
    db.delete(club)
    db.commit()
