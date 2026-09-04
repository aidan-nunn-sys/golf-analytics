from datetime import date

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


class RoundStats(BaseModel):
    score: int
    to_par: int
    fairways_hit: int
    fairways_possible: int
    fairway_pct: float | None
    gir: int
    gir_pct: float | None
    putts: int
    putts_per_gir: float | None
    one_putts: int
    three_putts: int
    scrambling_pct: float | None
    penalties: int
    differential: float | None
    counts_toward_index: bool
    reason: str | None


class DifferentialRow(BaseModel):
    round_id: int
    date: date
    differential: float | None
    counts_toward_index: bool
    reason: str | None
    is_counting: bool  # one of the lowest 8 currently feeding the Index


class HandicapOut(BaseModel):
    index: float | None
    low_index: float | None
    cap_applied: str | None
    rounds_needed: int
    differentials: list[DifferentialRow]


class RoundTrendOut(BaseModel):
    rounds: list[RoundStats]
    averages: dict[str, float | None]
