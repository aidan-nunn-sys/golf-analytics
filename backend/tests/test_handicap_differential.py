import pytest

from app.stats.handicap.differential import (
    adjusted_gross_score,
    round_differential,
    score_differential_9,
    score_differential_18,
)


@pytest.mark.parametrize(
    "raw,expected",
    [
        (12.34, 12.3),
        (12.35, 12.4),   # .5 rounds upwards (Rule 5.1a)
        (12.36, 12.4),
        # Rule 5.1c: minus differentials round TOWARD zero.
        (-1.54, -1.5),
        (-1.55, -1.5),
        (-1.56, -1.6),
        (0.0, 0.0),
    ],
)
def test_round_differential(raw, expected):
    assert round_differential(raw) == expected


def _holes(strokes, par=4, si_start=1):
    return [
        {"par": par, "stroke_index": si_start + i, "strokes": s}
        for i, s in enumerate(strokes)
    ]


def test_ags_caps_at_net_double_bogey():
    # Course Handicap 0, par 4, so the cap is 6 everywhere.
    holes = _holes([4, 5, 9, 6])
    assert adjusted_gross_score(holes, course_handicap=0) == 4 + 5 + 6 + 6


def test_ags_caps_at_par_plus_5_without_index():
    holes = _holes([4, 12])
    assert adjusted_gross_score(holes, course_handicap=None) == 4 + 9


def test_ags_fills_unplayed_holes_with_net_par():
    # Course Handicap 2: strokes on SI 1 and 2 only.
    holes = _holes([5, None, None])  # SI 1, 2, 3
    # 5 + net par on SI2 (4+1) + net par on SI3 (4+0)
    assert adjusted_gross_score(holes, course_handicap=2) == 5 + 5 + 4


def test_score_differential_18():
    # Rule 5.1a: (113 / 132) * (85 - 71.2 - 0) = 11.81... -> 11.8
    assert score_differential_18(85, course_rating=71.2, slope_rating=132) == 11.8


def test_score_differential_18_applies_pcc():
    assert score_differential_18(85, 71.2, 132, pcc=1.0) == 11.0


def test_score_differential_9_halves_pcc_and_stays_unrounded():
    # Rule 5.1b: (113 / 130) * (44 - 35.6 - 0.5 * 1.0)
    result = score_differential_9(44, course_rating=35.6, slope_rating=130, pcc=1.0)
    assert result == pytest.approx((113 / 130) * (44 - 35.6 - 0.5), abs=1e-9)
