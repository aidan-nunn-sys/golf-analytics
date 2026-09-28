from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, JSON, String, func
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.database import Base


class Course(Base):
    __tablename__ = "courses"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    osm_id: Mapped[str | None] = mapped_column(String, unique=True, nullable=True)
    import_source: Mapped[str] = mapped_column(String, nullable=False, default="manual")
    location_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    location_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    imported_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )

    scorecard_source: Mapped[str | None] = mapped_column(String, nullable=True)
    scorecard_imported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    scorecard_urls: Mapped[list[str] | None] = mapped_column(JSON, nullable=True)

    holes: Mapped[list["Hole"]] = relationship(
        back_populates="course", order_by="Hole.number", cascade="all, delete-orphan"
    )


class Hole(Base):
    __tablename__ = "holes"
    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    course_id: Mapped[int] = mapped_column(
        ForeignKey("courses.id"), index=True, nullable=False
    )
    number: Mapped[int] = mapped_column(Integer, nullable=False)
    par: Mapped[int | None] = mapped_column(Integer, nullable=True)
    green_lat: Mapped[float | None] = mapped_column(Float, nullable=True)
    green_lng: Mapped[float | None] = mapped_column(Float, nullable=True)
    hazards: Mapped[list | None] = mapped_column(JSON, nullable=True)
    stroke_index: Mapped[int | None] = mapped_column(Integer, nullable=True)

    course: Mapped["Course"] = relationship(back_populates="holes")
