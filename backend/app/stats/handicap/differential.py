"""Adjusted gross score and Score Differentials (Rules 5.1a, 5.1b, 5.1c)."""

from decimal import ROUND_HALF_DOWN, ROUND_HALF_UP, Decimal
from typing import TypedDict

from app.stats.handicap.strokes import max_hole_score, net_par


class HoleScore(TypedDict):
    par: int
    stroke_index: int
    strokes: int | None  # None = hole not played


def round_differential(value: float) -> float:
    """Round a Score Differential to the nearest tenth.

    Rule 5.1a rounds .5 upwards. Rule 5.1c rounds minus differentials TOWARD
    zero, so -1.55 becomes -1.5, not -1.6. Together that is "round half toward
    positive infinity", which Decimal expresses as HALF_UP for non-negative
    values and HALF_DOWN for negative ones. Python's built-in round() is
    banker's rounding and is wrong for both cases.
    """
    mode = ROUND_HALF_UP if value >= 0 else ROUND_HALF_DOWN
    return float(Decimal(str(value)).quantize(Decimal("0.1"), rounding=mode))


def adjusted_gross_score(
    holes: list[HoleScore], course_handicap: int | None
) -> int:
    """Total score with each hole capped, and unplayed holes filled.

    Played holes cap at net double bogey, or par + 5 before an Index exists
    (Rule 3.1). Unplayed holes (`strokes is None`) take net par — see the
    divergence note in `strokes.net_par`. A player without an established
    Index has no Course Handicap, so unplayed holes fall back to plain par.
    """
    total = 0
    for hole in holes:
        par, stroke_index = hole["par"], hole["stroke_index"]
        strokes = hole["strokes"]
        if strokes is None:
            total += (
                par
                if course_handicap is None
                else net_par(par, stroke_index, course_handicap)
            )
        else:
            total += min(strokes, max_hole_score(par, stroke_index, course_handicap))
    return total


def score_differential_18(
    ags: int, course_rating: float, slope_rating: int, pcc: float = 0.0
) -> float:
    """Rule 5.1a, rounded to the nearest tenth."""
    return round_differential((113 / slope_rating) * (ags - course_rating - pcc))


def score_differential_9(
    ags: int, course_rating: float, slope_rating: int, pcc: float = 0.0
) -> float:
    """Rule 5.1b — note the halved PCC term.

    Returned UNROUNDED: the Rules round only after the 9-hole differential is
    combined with the player's expected score. That combination needs the
    unpublished expected-score table, so this value is displayed but never
    feeds the Index (spec 2.3).
    """
    return (113 / slope_rating) * (ags - course_rating - 0.5 * pcc)
