from app.stats.round_stats import compute_round_stats


def _hole(par=4, strokes=4, putts=2, fairway_hit=True, penalties=0):
    return {
        "par": par, "strokes": strokes, "putts": putts,
        "fairway_hit": fairway_hit, "penalties": penalties,
    }


def test_empty_round():
    s = compute_round_stats([])
    assert s["score"] == 0
    assert s["gir_pct"] is None
    assert s["fairway_pct"] is None
    assert s["putts_per_gir"] is None


def test_score_and_to_par():
    holes = [_hole(par=4, strokes=5), _hole(par=3, strokes=3)]
    s = compute_round_stats(holes)
    assert s["score"] == 8
    assert s["to_par"] == 1


def test_gir_derived_from_strokes_minus_putts():
    # par 4, 4 strokes, 2 putts -> 2 shots to the green -> GIR (<= par - 2)
    hit = _hole(par=4, strokes=4, putts=2)
    # par 4, 5 strokes, 2 putts -> 3 shots to the green -> not GIR
    miss = _hole(par=4, strokes=5, putts=2)
    s = compute_round_stats([hit, miss])
    assert s["gir"] == 1
    assert s["gir_pct"] == 50.0


def test_par_threes_excluded_from_fairway_denominator():
    holes = [
        _hole(par=3, fairway_hit=None),
        _hole(par=4, fairway_hit=True),
        _hole(par=5, fairway_hit=False),
    ]
    s = compute_round_stats(holes)
    assert s["fairways_possible"] == 2
    assert s["fairways_hit"] == 1
    assert s["fairway_pct"] == 50.0


def test_missing_data_excluded_from_denominator_not_counted_as_zero():
    """A partially filled scorecard must not report 0% fairways."""
    holes = [_hole(par=4, fairway_hit=True), _hole(par=4, fairway_hit=None)]
    s = compute_round_stats(holes)
    assert s["fairways_possible"] == 1
    assert s["fairway_pct"] == 100.0


def test_putts_per_gir_uses_only_gir_holes():
    gir = _hole(par=4, strokes=4, putts=2)
    non_gir = _hole(par=4, strokes=6, putts=3)
    s = compute_round_stats([gir, non_gir])
    assert s["putts"] == 5
    assert s["putts_per_gir"] == 2.0


def test_one_and_three_putt_counts():
    holes = [_hole(putts=1), _hole(putts=3), _hole(putts=2), _hole(putts=4)]
    s = compute_round_stats(holes)
    assert s["one_putts"] == 1
    assert s["three_putts"] == 2  # 3 or more


def test_scrambling_counts_missed_gir_saved_for_par_or_better():
    # Missed GIR (3 shots to green) but holed in 4 -> par -> scramble saved.
    saved = _hole(par=4, strokes=4, putts=1)
    # Missed GIR and made bogey -> not saved.
    lost = _hole(par=4, strokes=5, putts=2)
    s = compute_round_stats([saved, lost])
    assert s["scrambling_pct"] == 50.0


def test_penalties_total():
    s = compute_round_stats([_hole(penalties=1), _hole(penalties=2)])
    assert s["penalties"] == 3


def test_duplicate_missed_gir_holes_are_both_counted_in_scrambling_denominator():
    """Regression test for the index-based GIR/scrambling partition.

    A naive implementation that partitions gir_eligible via
    `h not in gir_holes` (value-based `in` on dicts) is fragile: it relies
    on missed-GIR holes never being dict-equal to a made-GIR hole. Two
    identical missed-GIR holes must both still land in the scrambling
    denominator -- adding a third, distinct missed-GIR hole that IS saved
    lets the resulting percentage reveal whether the denominator is 2 or 3.
    """
    lost_a = _hole(par=4, strokes=5, putts=2)  # missed GIR, not saved
    lost_b = _hole(par=4, strokes=5, putts=2)  # identical to lost_a
    saved = _hole(par=4, strokes=4, putts=1)   # missed GIR, saved for par

    s = compute_round_stats([lost_a, lost_b, saved])
    # denominator must be 3 (all three missed GIR), not 2.
    assert s["scrambling_pct"] == 33.3
