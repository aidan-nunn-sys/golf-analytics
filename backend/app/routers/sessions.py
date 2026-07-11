from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import RangeSession, User
from app.schemas.session import SessionCreate, SessionOut, SessionUpdate

router = APIRouter(prefix="/sessions", tags=["sessions"])


def _owned_session(db: Session, session_id: int, user: User) -> RangeSession:
    rs = db.get(RangeSession, session_id)
    if rs is None or rs.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found")
    return rs


@router.get("", response_model=list[SessionOut])
def list_sessions(
    db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[RangeSession]:
    return list(
        db.scalars(
            select(RangeSession)
            .where(RangeSession.user_id == user.id)
            .order_by(RangeSession.date.desc(), RangeSession.id.desc())
        ).all()
    )


@router.post("", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
def create_session(
    payload: SessionCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RangeSession:
    rs = RangeSession(user_id=user.id, **payload.model_dump())
    db.add(rs)
    db.commit()
    db.refresh(rs)
    return rs


@router.get("/{session_id}", response_model=SessionOut)
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RangeSession:
    return _owned_session(db, session_id, user)


@router.patch("/{session_id}", response_model=SessionOut)
def update_session(
    session_id: int,
    payload: SessionUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> RangeSession:
    rs = _owned_session(db, session_id, user)
    for field, value in payload.model_dump(exclude_unset=True).items():
        setattr(rs, field, value)
    db.commit()
    db.refresh(rs)
    return rs


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    rs = _owned_session(db, session_id, user)
    db.delete(rs)
    db.commit()
