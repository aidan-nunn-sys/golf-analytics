from app.stats.engine import compute_club_stats, compute_gapping


def test_club_stats_basic():
    shots = [
        {"carry_yards": 150.0, "direction": "left"},
        {"carry_yards": 160.0, "direction": "straight"},
        {"carry_yards": 170.0, "direction": "right"},
    ]
    s = compute_club_stats(shots)
    assert s["count"] == 3
    assert s["avg_carry"] == 160.0
    assert s["median_carry"] == 160.0
    assert s["consistency"] == 8.2
    assert s["min_carry"] == 150.0
    assert s["max_carry"] == 170.0
    assert s["direction"] == {"left": 1, "straight": 1, "right": 1}


def test_club_stats_empty():
    s = compute_club_stats([])
    assert s["count"] == 0
    assert s["avg_carry"] is None
    assert s["median_carry"] is None
    assert s["consistency"] is None
    assert s["min_carry"] is None
    assert s["max_carry"] is None
    assert s["direction"] == {"left": 0, "straight": 0, "right": 0}


def test_club_stats_single_shot():
    shots = [{"carry_yards": 140.0, "direction": "straight"}]
    s = compute_club_stats(shots)
    assert s["count"] == 1
    assert s["avg_carry"] == 140.0
    assert s["median_carry"] == 140.0
    assert s["consistency"] == 0.0
    assert s["min_carry"] == 140.0
    assert s["max_carry"] == 140.0
    assert s["direction"] == {"left": 0, "straight": 1, "right": 0}


def test_gapping_all_none_returns_empty():
    clubs = [{"club_id": 1, "label": "X", "avg_carry": None}]
    result = compute_gapping(clubs)
    assert result == []


def test_gapping_orders_and_computes_gap():
    clubs = [
        {"club_id": 1, "label": "7 Iron", "avg_carry": 150.0},
        {"club_id": 2, "label": "Driver", "avg_carry": 250.0},
        {"club_id": 3, "label": "8 Iron", "avg_carry": 140.0},
        {"club_id": 4, "label": "New Wedge", "avg_carry": None},
    ]
    rows = compute_gapping(clubs)
    assert [r["label"] for r in rows] == ["Driver", "7 Iron", "8 Iron"]
    assert rows[0]["gap_to_next"] == 100.0  # 250 - 150
    assert rows[1]["gap_to_next"] == 10.0   # 150 - 140
    assert rows[2]["gap_to_next"] is None
