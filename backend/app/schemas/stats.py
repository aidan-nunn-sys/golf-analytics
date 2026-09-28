from datetime import date

from pydantic import BaseModel


class DirectionSplit(BaseModel):
    left: int
    straight: int
    right: int


class TotalDistanceStats(BaseModel):
    count: int
    average: float | None
    median: float | None
    consistency: float | None
    minimum: float | None
    maximum: float | None
    direction: DirectionSplit


class ClubStats(BaseModel):
    count: int
    avg_carry: float | None
    median_carry: float | None
    consistency: float | None
    min_carry: float | None
    max_carry: float | None
    direction: DirectionSplit
    total: TotalDistanceStats


class GapRow(BaseModel):
    club_id: int
    label: str
    avg_carry: float | None
    gap_to_next: float | None
    avg_total: float | None
    total_gap_to_next: float | None
    carry_count: int
    total_count: int


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
    # The Index as it stood after this round. Ordered by date, these rows are
    # the Index trend spec 2.4/6 asks `GET /stats/handicap` to return; the
    # walk already computes the value for every round.
    index_after: float | None


class HandicapOut(BaseModel):
    index: float | None
    low_index: float | None
    cap_applied: str | None
    # Strokes Rule 5.8's cap held back (uncapped Index minus reported Index).
    # Spec 2.4 requires reporting whether a cap applies AND by how much.
    cap_adjustment: float | None
    rounds_needed: int
    differentials: list[DifferentialRow]


class RoundTrendEntry(RoundStats):
    round_id: int
    date: date
    hole_count: int
    holes_scored: int
    putts_recorded: int


class RoundTrendOut(BaseModel):
    rounds: list[RoundTrendEntry]
    averages: dict[str, float | None]
