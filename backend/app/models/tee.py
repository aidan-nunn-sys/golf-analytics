from sqlalchemy import Float, ForeignKey, Integer, JSON, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class TeeSet(Base):
    __tablename__ = "tee_sets"
    __table_args__ = (UniqueConstraint("course_id", "source_key", name="uq_course_tee_source"),)
    source_key: Mapped[str | None] = mapped_column(String, nullable=True)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id"), index=True, nullable=False
    )
    name: Mapped[str] = mapped_column(String, nullable=False)
    yardage: Mapped[int | None] = mapped_column(Integer, nullable=True)

    hole_yardages: Mapped[dict] = mapped_column(JSON, nullable=False, default=dict, server_default="{}")
    ratings: Mapped[list["TeeRating"]] = relationship(
        back_populates="tee_set", cascade="all, delete-orphan"
    )


class TeeRating(Base):
    __tablename__ = "tee_ratings"
    __table_args__ = (UniqueConstraint("tee_set_id", "scope", name="uq_tee_rating_scope"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tee_set_id: Mapped[int] = mapped_column(
        ForeignKey("tee_sets.id"), index=True, nullable=False
    )
    # "18" | "front9" | "back9"
    scope: Mapped[str] = mapped_column(String, nullable=False)
    course_rating: Mapped[float] = mapped_column(Float, nullable=False)
    slope_rating: Mapped[int] = mapped_column(Integer, nullable=False)
    par: Mapped[int] = mapped_column(Integer, nullable=False)

    tee_set: Mapped["TeeSet"] = relationship(back_populates="ratings")
