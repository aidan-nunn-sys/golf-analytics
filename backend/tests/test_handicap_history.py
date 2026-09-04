from datetime import date, timedelta

from app.stats.handicap.history import current_state, walk_history


def _round(n, strokes_per_hole, scope="18", par=4, rating=71.2, slope=132, course_par=72):
    return {
        "round_id": n,
        "date": date(2026, 1, 1) + timedelta(days=n),
        "scope": scope,
        "course_rating": rating,
        "slope_rating": slope,
        "par": course_par,
        "holes": [
            {"par": par, "stroke_index": i + 1, "strokes": strokes_per_hole}
            for i in range(18)
        ],
    }


def test_no_index_until_three_rounds():
    results = walk_history([_round(1, 5), _round(2, 5)])
    state = current_state(results)
    assert state["index"] is None
    assert state["rounds_needed"] == 1


def test_index_appears_at_three_rounds():
    results = walk_history([_round(n, 5) for n in range(1, 4)])
    state = current_state(results)
    assert state["index"] is not None
    assert state["rounds_needed"] == 0


def test_early_rounds_cap_at_par_plus_five():
    """With no Index yet there is no Course Handicap, so a blow-up hole caps
    at par + 5 = 9 rather than net double bogey."""
    from app.stats.handicap.differential import round_differential

    r = _round(1, 5)
    r["holes"][0]["strokes"] = 20
    [result] = walk_history([r])
    # 17 holes at 5 plus one capped at 9
    expected_ags = 17 * 5 + 9
    assert result["differential"] == round_differential(
        (113 / 132) * (expected_ags - 71.2)
    )


def test_nine_hole_round_is_excluded_with_a_reason():
    nine = _round(1, 5, scope="front9", rating=35.6, slope=130, course_par=36)
    nine["holes"] = nine["holes"][:9]
    [result] = walk_history([nine])
    assert result["counts_toward_index"] is False
    assert "9-hole" in result["reason"]
    assert result["differential"] is not None  # still computed for display


def test_round_with_fewer_than_ten_holes_is_not_acceptable():
    short = _round(1, 5)
    for hole in short["holes"][8:]:
        hole["strokes"] = None
    [result] = walk_history([short])
    assert result["counts_toward_index"] is False
    assert "10 holes" in result["reason"]


def test_round_without_a_rating_is_not_acceptable():
    unrated = _round(1, 5, rating=None, slope=None)
    unrated["course_rating"] = None
    unrated["slope_rating"] = None
    [result] = walk_history([unrated])
    assert result["counts_toward_index"] is False
    assert "rating" in result["reason"]


def test_rounds_are_processed_in_date_order_regardless_of_input_order():
    rounds = [_round(3, 5), _round(1, 9), _round(2, 7)]
    results = walk_history(rounds)
    assert [r["round_id"] for r in results] == [1, 2, 3]


def test_low_index_and_caps_engage_only_after_twenty_scores():
    # Nineteen good rounds then a run of terrible ones. Before the 20th
    # score there is no Low Index, so no cap can apply.
    results = walk_history([_round(n, 4) for n in range(1, 20)])
    assert current_state(results)["low_index"] is None
    assert current_state(results)["cap_applied"] is None

    more = [_round(n, 4) for n in range(1, 21)] + [_round(n, 12) for n in range(21, 41)]
    state = current_state(walk_history(more))
    assert state["low_index"] is not None
    assert state["cap_applied"] in {"soft", "hard"}


def test_counting_round_ids_names_the_eight():
    results = walk_history([_round(n, 4 + (n % 5)) for n in range(1, 21)])
    state = current_state(results)
    assert len(state["counting_round_ids"]) == 8
