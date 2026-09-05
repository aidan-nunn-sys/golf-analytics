"""Handicap Index calculation, caps and Course Handicap (Rules 5.2, 5.3, 5.8, 6.1a)."""

from decimal import ROUND_HALF_UP, Decimal

from app.stats.handicap.differential import round_differential

MAX_HANDICAP_INDEX = 54.0  # Rule 5.3
SOFT_CAP_THRESHOLD = 3.0   # Rule 5.8(i)
HARD_CAP_THRESHOLD = 5.0   # Rule 5.8(ii)

# Rule 5.2a: number of differentials in the record -> (lowest N used, adjustment).
DIFFERENTIALS_TABLE: dict[int, tuple[int, float]] = {
    3: (1, -2.0),
    4: (1, -1.0),
    5: (1, 0.0),
    6: (2, -1.0),
    7: (2, 0.0),
    8: (2, 0.0),
    9: (3, 0.0),
    10: (3, 0.0),
    11: (3, 0.0),
    12: (4, 0.0),
    13: (4, 0.0),
    14: (4, 0.0),
    15: (5, 0.0),
    16: (5, 0.0),
    17: (6, 0.0),
    18: (6, 0.0),
    19: (7, 0.0),
    20: (8, 0.0),
}


def handicap_index(differentials: list[float]) -> float | None:
    """Handicap Index from a scoring record, most recent LAST.

    Rules 5.2a and 5.2b. Returns None below three acceptable scores. The
    result is uncapped — `apply_caps` handles Rule 5.8 separately, because
    caps need the Low Handicap Index which only `history` can supply.
    """
    if len(differentials) < 3:
        return None

    recent = differentials[-20:]
    used, adjustment = DIFFERENTIALS_TABLE[len(recent)]
    lowest = sorted(recent)[:used]
    average = sum(lowest) / len(lowest)
    return min(round_differential(average + adjustment), MAX_HANDICAP_INDEX)


def apply_caps(
    calculated: float, low_index: float | None
) -> tuple[float, str | None]:
    """Rule 5.8. Returns (index, cap_applied) where cap_applied is
    "soft", "hard" or None.

    Caps take effect only once a Low Handicap Index has been established,
    which Rule 5.7 gates on having at least 20 acceptable scores. Callers
    pass low_index=None until then. There is no limit on decreases.
    """
    if low_index is None:
        return calculated, None

    increase = calculated - low_index
    if increase <= SOFT_CAP_THRESHOLD:
        return calculated, None

    softened = low_index + SOFT_CAP_THRESHOLD + (increase - SOFT_CAP_THRESHOLD) / 2
    if softened - low_index > HARD_CAP_THRESHOLD:
        return round_differential(low_index + HARD_CAP_THRESHOLD), "hard"
    return round_differential(softened), "soft"


def course_handicap(
    index: float, slope_rating: int, course_rating: float, par: int
) -> int:
    """Rule 6.1a, rounded to the nearest whole number.

    Uses explicit HALF_UP rather than round(), which is banker's rounding and
    would send 14.5 to 14.
    """
    raw = index * (slope_rating / 113) + (course_rating - par)
    return int(Decimal(str(raw)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))
