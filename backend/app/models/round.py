from datetime import date as date_type, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Round(Base):
    __tablename__ = "rounds"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True, nullable=False)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id"), index=True, nullable=False
    )
    device_key: Mapped[str | None] = mapped_column(String(80), nullable=True, unique=True, index=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
    __mapper_args__ = {"version_id_col": revision}
    course_name: Mapped[str | None] = mapped_column(String, nullable=True)
    tee_name: Mapped[str | None] = mapped_column(String, nullable=True)
    hole_yardages: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default="{}")
    green_notes: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default="{}")
    date: Mapped[date_type] = mapped_column(Date, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="in_progress")
    notes: Mapped[str] = mapped_column(String(4000), nullable=False, default="", server_default="")
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
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
    stroke_index: Mapped[int | None] = mapped_column(Integer, nullable=True)
    par: Mapped[int] = mapped_column(Integer, nullable=False)
    strokes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    fairway_hit: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    putts: Mapped[int | None] = mapped_column(Integer, nullable=True)
    penalties: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    round: Mapped["Round"] = relationship(back_populates="holes")
    hole: Mapped["Hole"] = relationship()
