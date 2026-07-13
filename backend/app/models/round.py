from datetime import date as date_type

from sqlalchemy import Date, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Round(Base):
    __tablename__ = "rounds"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id"), index=True, nullable=False
    )
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="in_progress")
    current_hole: Mapped[int] = mapped_column(Integer, nullable=False, default=1)


class RoundHole(Base):
    __tablename__ = "round_holes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    round_id: Mapped[int] = mapped_column(ForeignKey("rounds.id"), index=True, nullable=False)
    hole_id: Mapped[int] = mapped_column(ForeignKey("holes.id"), index=True, nullable=False)
    par: Mapped[int] = mapped_column(Integer, nullable=False)
    strokes: Mapped[int | None] = mapped_column(Integer, nullable=True)
