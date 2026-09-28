from uuid import uuid4
from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, ForeignKey, Integer, JSON, String, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


class Shot(Base):
    __tablename__ = "shots"
    __table_args__ = (UniqueConstraint("round_id", "client_id", name="uq_round_shot_client"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    device_key: Mapped[str | None] = mapped_column(String(100), nullable=True, unique=True, index=True)
    client_id: Mapped[str | None] = mapped_column(String(36), nullable=True, default=lambda: str(uuid4()))
    sequence: Mapped[int | None] = mapped_column(Integer, nullable=True)
    start_position: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    end_position: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    club_label: Mapped[str | None] = mapped_column(String, nullable=True)
    start_lie: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown", server_default="unknown")
    end_lie: Mapped[str] = mapped_column(String(20), nullable=False, default="unknown", server_default="unknown")
    penalties: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    holed_out: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    deleted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default="0")
    revision: Mapped[int] = mapped_column(Integer, nullable=False, default=1, server_default="1")
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
    carry_yards: Mapped[float | None] = mapped_column(Float, nullable=True)
    total_yards: Mapped[float | None] = mapped_column(Float, nullable=True)
    direction: Mapped[str] = mapped_column(String, nullable=False, default="straight")
    source: Mapped[str] = mapped_column(String, nullable=False, default="manual")
    accuracy: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
