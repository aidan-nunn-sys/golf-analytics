from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Shot(Base):
    __tablename__ = "shots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    session_id: Mapped[int | None] = mapped_column(
        ForeignKey("sessions.id"), index=True, nullable=True
    )
    round_id: Mapped[int | None] = mapped_column(
        ForeignKey("rounds.id"), index=True, nullable=True
    )
    hole_number: Mapped[int | None] = mapped_column(Integer, nullable=True)
    club_id: Mapped[int] = mapped_column(
        ForeignKey("clubs.id"), index=True, nullable=False
    )
    carry_yards: Mapped[float] = mapped_column(Float, nullable=False)
    total_yards: Mapped[float | None] = mapped_column(Float, nullable=True)
    direction: Mapped[str] = mapped_column(String, nullable=False, default="straight")
    source: Mapped[str] = mapped_column(String, nullable=False, default="manual")
    accuracy: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
