from datetime import date, timedelta

from app.stats.handicap.history import current_state, walk_history


def _round(
    n,
    strokes_per_hole,
    scope="18",
    par=4,
    rating=71.2,
    slope=132,
    course_par=72,
    when=None,
    tee_set_id=1,
    stroke_indexes=True,
):
    return {
        "round_id": n,
        "date": when or date(2026, 1, 1) + timedelta(days=n),
        "scope": scope,
        "tee_set_id": tee_set_id,
        "course_rating": rating,
        "slope_rating": slope,
        "par": course_par,
        "holes": [
            {
                "par": par,
                "stroke_index": (i + 1) if stroke_indexes else None,
                "strokes": strokes_per_hole,
            }
            for i in range(18)
        ],
    }


def test_no_index_until_three_rounds():
    results = walk_history([_round(1, 5), _round(2, 5)])
    state = current_state(results)
    assert state["index"] is None
    assert state["rounds_needed"] == 1


def test_index_appears_at_three_rounds():
    """Three rounds of 90 (18 x 5) on CR 71.2 / slope 132.

    No Index exists while these are walked, so each caps at par + 5 and the
    AGS is the gross 90. Differential = (113/132) x (90 - 71.2) = 16.1 each.
    Rule 5.2a at three scores takes the lowest 1 and adjusts by -2.0.
    """
    results = walk_history([_round(n, 5) for n in range(1, 4)])
    assert [r["differential"] for r in results] == [16.1, 16.1, 16.1]
    state = current_state(results)
    assert state["index"] == 14.1
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


def test_nine_hole_round_with_too_few_holes_is_not_acceptable():
    short_nine = _round(1, 5, scope="front9", rating=35.6, slope=130, course_par=36)
    short_nine["holes"] = short_nine["holes"][:9]
    for hole in short_nine["holes"][4:]:
        hole["strokes"] = None
    [result] = walk_history([short_nine])
    assert result["counts_toward_index"] is False
    assert result["differential"] is None
    assert "9-hole rounds do not count" not in result["reason"]
    assert "4 holes" in result["reason"]


def test_eighteen_hole_round_too_short_has_no_differential():
    short = _round(1, 5)
    for hole in short["holes"][6:]:
        hole["strokes"] = None
    [result] = walk_history([short])
    assert result["differential"] is None


def test_net_double_bogey_uses_a_course_handicap_from_the_earlier_rounds():
    """The index_before -> course_handicap -> adjusted_gross_score wiring.

    Three rounds of 90 establish an Index of 14.1 (see above). The fourth
    round is played off it: Course Handicap = round(14.1 x 132/113 +
    (71.2 - 72)) = round(15.67) = 16, so holes with stroke index <= 16
    receive a stroke and cap at net double bogey 4 + 2 + 1 = 7.

    A blow-up 20 on stroke index 1 therefore counts as 7, not the par + 5 = 9
    of the pre-Index branch that the existing tests exercise. AGS = 17 x 5 + 7
    = 92, and the differential is (113/132) x (92 - 71.2) = 17.8.
    """
    prior = [_round(n, 5) for n in range(1, 4)]
    fourth = _round(4, 5)
    fourth["holes"][0]["strokes"] = 20

    results = walk_history(prior + [fourth])

    assert results[-1]["differential"] == 17.8
    # The par + 5 branch would have scored the hole 9 and given 19.5 - so this
    # asserts net double bogey specifically, not merely "some cap applied".
    assert results[-1]["differential"] != 19.5


def test_the_walk_computes_with_the_capped_index_it_reports():
    """Spec 2.4/2.5: the Index established by earlier rounds is the POST-CAP
    one, so it is the Index the walk must adjust later rounds with.

    Twenty even-par rounds then a run of 12-per-hole disasters drives the hard
    cap. The last round is adjusted off the capped Index of 3.1 (Course
    Handicap 3, one stroke on stroke indexes 1-3, net double bogey 7 there and
    6 elsewhere -> AGS 111 -> differential 34.1). Using the uncapped 4.6
    instead gave Course Handicap 5 and a differential of 35.8.
    """
    rounds = [_round(n, 4) for n in range(1, 21)] + [
        _round(n, 12) for n in range(21, 35)
    ]
    results = walk_history(rounds)
    state = current_state(results)

    assert state["cap_applied"] == "hard"
    assert results[-1]["differential"] == 34.1
    # The Index carried through the walk and the Index reported are one value.
    assert results[-1]["index_after"] == state["index"] == 3.7


def test_low_index_window_excludes_indexes_older_than_365_days():
    """Rule 5.7's window is a filter, not decoration.

    The same forty rounds, differing only in whether the good years are
    inside the 365 days preceding the most recent score. When they have aged
    out, the Low Index is taken from the recent bad run instead.
    """
    good = [
        _round(n, 4, when=date(2024, 1, 1) + timedelta(days=n)) for n in range(1, 21)
    ]
    recent_bad = [
        _round(n, 12, when=date(2024, 1, 21) + timedelta(days=n - 20))
        for n in range(21, 41)
    ]
    delayed_bad = [
        _round(n, 12, when=date(2025, 7, 1) + timedelta(days=n - 20))
        for n in range(21, 41)
    ]

    inside_window = current_state(walk_history(good + recent_bad))["low_index"]
    rolled_off = current_state(walk_history(good + delayed_bad))["low_index"]

    assert inside_window is not None and rolled_off is not None
    assert rolled_off > inside_window


def test_round_on_a_course_without_stroke_indexes_is_not_acceptable():
    """Spec 3.1: stroke index is required before a round is acceptable.

    Net double bogey and net par both allocate strokes by it, so without it
    there is no defensible AGS - and no differential to display either.
    """
    unindexed = _round(1, 5, stroke_indexes=False)
    [result] = walk_history([unindexed])
    assert result["counts_toward_index"] is False
    assert result["differential"] is None
    assert "stroke index" in result["reason"]


def test_missing_rating_reason_names_the_scope():
    """Spec 3.2 asks for the reason by name: "this tee has no front-9 rating"."""
    unrated_nine = _round(1, 5, scope="front9", rating=None, slope=None)
    unrated_nine["holes"] = unrated_nine["holes"][:9]
    [result] = walk_history([unrated_nine])
    assert result["reason"] == "This tee has no front-9 rating"


def test_round_with_no_tee_attached_is_distinguished_from_an_unrated_tee():
    no_tee = _round(1, 5, rating=None, slope=None, tee_set_id=None)
    [result] = walk_history([no_tee])
    assert "No tee set" in result["reason"]
