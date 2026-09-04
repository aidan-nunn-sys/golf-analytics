from datetime import date as date_type

from sqlalchemy import Boolean, Date, Float, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

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
    tee_set_id: Mapped[int | None] = mapped_column(
        ForeignKey("tee_sets.id"), nullable=True
    )
    hole_count: Mapped[int] = mapped_column(Integer, nullable=False, default=18)
    nine: Mapped[str | None] = mapped_column(String, nullable=True)  # "front" | "back"
    # Snapshotted from the applicable TeeRating at creation; never read live.
    course_rating: Mapped[float | None] = mapped_column(Float, nullable=True)
    slope_rating: Mapped[int | None] = mapped_column(Integer, nullable=True)
    course_par: Mapped[int | None] = mapped_column(Integer, nullable=True)

    holes: Mapped[list["RoundHole"]] = relationship(
        back_populates="round", cascade="all, delete-orphan"
    )


class RoundHole(Base):
    __tablename__ = "round_holes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    round_id: Mapped[int] = mapped_column(ForeignKey("rounds.id"), index=True, nullable=False)
    hole_id: Mapped[int] = mapped_column(ForeignKey("holes.id"), index=True, nullable=False)
    par: Mapped[int] = mapped_column(Integer, nullable=False)
    strokes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fairway_hit: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    putts: Mapped[int | None] = mapped_column(Integer, nullable=True)
    penalties: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    round: Mapped["Round"] = relationship(back_populates="holes")
    hole: Mapped["Hole"] = relationship()
