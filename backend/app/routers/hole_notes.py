from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Course, Hole, User
from app.models.hole_note import HoleNote

router = APIRouter(prefix="/courses", tags=["personal hole notes"])


class NoteIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    text: str = Field(max_length=2000)
    expected_revision: int = Field(ge=0)


class NoteOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    hole_number: int
    text: str
    revision: int
    updated_at: datetime


@router.get("/{course_id}/personal-notes", response_model=list[NoteOut])
def list_notes(course_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not db.get(Course, course_id):
        raise HTTPException(404, "Course not found")
    return db.scalars(select(HoleNote).where(HoleNote.user_id == user.id, HoleNote.course_id == course_id).order_by(HoleNote.hole_number)).all()


@router.put("/{course_id}/personal-notes/{hole_number}", response_model=NoteOut)
def save_note(course_id: int, hole_number: int, payload: NoteIn, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    if not db.scalar(select(Hole.id).where(Hole.course_id == course_id, Hole.number == hole_number)):
        raise HTTPException(404, "Course hole not found")
    condition = (HoleNote.user_id == user.id, HoleNote.course_id == course_id, HoleNote.hole_number == hole_number)
    current = db.scalar(select(HoleNote).where(*condition))
    # Retrying after a lost response is harmless, including clearing a note.
    if current and current.text == payload.text:
        return current
    if payload.expected_revision == 0 and current is None:
        current = HoleNote(user_id=user.id, course_id=course_id, hole_number=hole_number, text=payload.text, revision=1)
        db.add(current)
        try:
            db.commit()
            db.refresh(current)
            return current
        except IntegrityError:
            db.rollback()
    elif current and current.revision == payload.expected_revision:
        changed = db.execute(update(HoleNote).where(*condition, HoleNote.revision == payload.expected_revision).values(
            text=payload.text, revision=payload.expected_revision + 1, updated_at=datetime.now(timezone.utc),
        )).rowcount
        db.commit()
        if changed:
            db.expire_all()
            return db.scalar(select(HoleNote).where(*condition))
    raise HTTPException(409, "This personal note changed on another device. Refresh and review both versions.")
