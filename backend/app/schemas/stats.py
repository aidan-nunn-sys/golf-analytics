from pydantic import BaseModel


class DirectionSplit(BaseModel):
    left: int
    straight: int
    right: int


class ClubStats(BaseModel):
    count: int
    avg_carry: float | None
    median_carry: float | None
    consistency: float | None
    min_carry: float | None
    max_carry: float | None
    direction: DirectionSplit


class GapRow(BaseModel):
    club_id: int
    label: str
    avg_carry: float | None
    gap_to_next: float | None


class DashboardClub(BaseModel):
    club_id: int
    label: str
    category: str
    order_index: int
    stats: ClubStats


class Dashboard(BaseModel):
    clubs: list[DashboardClub]
    gapping: list[GapRow]
