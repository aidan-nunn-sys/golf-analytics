from app.stats.geo import haversine_yards


def test_haversine_same_point_is_zero():
    assert haversine_yards(36.5, -121.9, 36.5, -121.9) == 0.0


def test_haversine_known_distance():
    # 0.001 degrees of latitude ~ 111 meters ~ 121.4 yards
    d = haversine_yards(36.5, -121.9, 36.501, -121.9)
    assert 115 < d < 125
