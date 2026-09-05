import pytest

from app.stats.handicap.index import (
    apply_caps,
    course_handicap,
    handicap_index,
)


def test_no_index_below_three_scores():
    assert handicap_index([]) is None
    assert handicap_index([15.0]) is None
    assert handicap_index([15.0, 16.0]) is None


def test_three_scores_uses_lowest_one_minus_two():
    # Rules of Handicapping Clarification 5.2a/1 worked example.
    assert handicap_index([15.3, 15.2, 16.6]) == 13.2


@pytest.mark.parametrize(
    "count,expected_used,expected_adjustment",
    [
        (3, 1, -2.0), (4, 1, -1.0), (5, 1, 0.0), (6, 2, -1.0),
        (7, 2, 0.0), (8, 2, 0.0), (9, 3, 0.0), (11, 3, 0.0),
        (12, 4, 0.0), (14, 4, 0.0), (15, 5, 0.0), (16, 5, 0.0),
        (17, 6, 0.0), (18, 6, 0.0), (19, 7, 0.0), (20, 8, 0.0),
    ],
)
def test_table_windows_and_adjustments(count, expected_used, expected_adjustment):
    """Feed `count` differentials where the lowest `expected_used` are all 10.0
    and the rest are 50.0, so the result isolates the window and adjustment."""
    diffs = [10.0] * expected_used + [50.0] * (count - expected_used)
    assert handicap_index(diffs) == pytest.approx(10.0 + expected_adjustment)


def test_uses_only_most_recent_twenty():
    # 25 scores: the oldest five are brilliant and must be ignored.
    diffs = [1.0] * 5 + [20.0] * 20
    assert handicap_index(diffs) == 20.0


def test_index_capped_at_54():
    assert handicap_index([90.0] * 20) == 54.0


def test_apply_caps_without_low_index_is_a_noop():
    # Caps only engage once a Low Handicap Index exists (Rules 5.7, 5.8).
    assert apply_caps(30.0, low_index=None) == (30.0, None)


def test_soft_cap_halves_increase_above_three():
    # Low 10.0, calculated 15.0 -> increase 5.0. 3.0 passes through, the
    # remaining 2.0 is halved: 10 + 3 + 1 = 14.0
    assert apply_caps(15.0, low_index=10.0) == (14.0, "soft")


def test_soft_cap_not_triggered_at_exactly_three():
    assert apply_caps(13.0, low_index=10.0) == (13.0, None)


def test_hard_cap_limits_to_five_above_low():
    # Low 10.0, calculated 30.0 -> soft cap gives 10 + 3 + 8.5 = 21.5,
    # then the hard cap clamps to 15.0.
    assert apply_caps(30.0, low_index=10.0) == (15.0, "hard")


def test_no_limit_on_decrease():
    assert apply_caps(4.0, low_index=10.0) == (4.0, None)


def test_course_handicap():
    # Rule 6.1a: 12.3 * (132/113) + (71.2 - 72) = 14.37... -> 14
    assert course_handicap(12.3, slope_rating=132, course_rating=71.2, par=72) == 14


def test_course_handicap_can_be_negative_for_plus_players():
    assert course_handicap(-2.4, slope_rating=113, course_rating=72.0, par=72) == -2
