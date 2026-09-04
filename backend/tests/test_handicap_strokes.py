import pytest

from app.stats.handicap.strokes import (
    max_hole_score,
    net_double_bogey,
    net_par,
    strokes_received,
)


@pytest.mark.parametrize(
    "handicap,stroke_index,expected",
    [
        (0, 1, 0),
        (0, 18, 0),
        (5, 5, 1),    # SI <= H
        (5, 6, 0),    # SI > H
        (18, 18, 1),  # exactly one stroke everywhere
        (20, 2, 2),   # SI <= H-18 gets a second stroke
        (20, 3, 1),
        (36, 18, 2),
        (54, 18, 3),
    ],
)
def test_strokes_received_positive(handicap, stroke_index, expected):
    assert strokes_received(handicap, stroke_index) == expected


@pytest.mark.parametrize(
    "handicap,stroke_index,expected",
    [
        # Appendix C: plus handicaps give strokes back BEGINNING AT STROKE INDEX 18.
        (-2, 18, -1),
        (-2, 17, -1),
        (-2, 16, 0),
        (-1, 18, -1),
        (-1, 1, 0),
    ],
)
def test_strokes_received_plus_handicap(handicap, stroke_index, expected):
    assert strokes_received(handicap, stroke_index) == expected


def test_net_double_bogey():
    # Rule 3.1b: par + 2 + strokes received.
    assert net_double_bogey(par=4, stroke_index=5, course_handicap=5) == 7
    assert net_double_bogey(par=4, stroke_index=6, course_handicap=5) == 6
    assert net_double_bogey(par=3, stroke_index=2, course_handicap=20) == 7


def test_max_hole_score_without_established_index():
    # Rule 3.1a: par + 5 before an Index exists.
    assert max_hole_score(par=4, stroke_index=1, course_handicap=None) == 9
    assert max_hole_score(par=5, stroke_index=18, course_handicap=None) == 10


def test_max_hole_score_with_established_index():
    assert max_hole_score(par=4, stroke_index=5, course_handicap=5) == 7


def test_net_par():
    # Used for holes not played (spec 2.3, documented divergence from Rule 3.2b).
    assert net_par(par=4, stroke_index=5, course_handicap=5) == 5
    assert net_par(par=4, stroke_index=6, course_handicap=5) == 4
