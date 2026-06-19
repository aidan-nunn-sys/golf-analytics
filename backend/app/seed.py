from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import settings
from app.models import User
from app.security import hash_password


def create_user(
    db: Session,
    email: str,
    password: str,
    display_name: str = "",
    is_admin: bool = False,
) -> User:
    user = User(
        email=email,
        password_hash=hash_password(password),
        display_name=display_name,
        is_admin=is_admin,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user


def bootstrap_admin(db: Session) -> None:
    existing = db.scalars(select(User).limit(1)).first()
    if existing is not None:
        return
    create_user(
        db,
        email=settings.admin_email,
        password=settings.admin_password,
        display_name="Admin",
        is_admin=True,
    )
