from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_admin
from app.models import User
from app.schemas.user import UserCreate, UserOut
from app.seed import create_user

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/users", response_model=UserOut, status_code=status.HTTP_201_CREATED)
def create_account(
    payload: UserCreate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_admin),
) -> User:
    exists = db.scalars(select(User).where(User.email == payload.email)).first()
    if exists is not None:
        raise HTTPException(status.HTTP_409_CONFLICT, "Email already registered")
    return create_user(
        db, payload.email, payload.password, payload.display_name, is_admin=False
    )
