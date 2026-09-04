import pytest


def _post_round(client, auth_headers, course_id, tee_id, date, strokes):
    return client.post(
        "/api/rounds",
        json={
            "course_id": course_id, "date": date, "tee_set_id": tee_id,
            "status": "completed",
            "holes": [
                {"number": n, "strokes": strokes, "putts": 2, "fairway_hit": True}
                for n in range(1, 19)
            ],
        },
        headers=auth_headers,
    )


def test_round_stats_endpoint(client, auth_headers, rated_course):
    course_id, tee_id = rated_course
    round_id = _post_round(
        client, auth_headers, course_id, tee_id, "2026-09-01", 5
    ).json()["id"]

    resp = client.get(f"/api/rounds/{round_id}/stats", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["score"] == 90
    assert body["to_par"] == 18
    assert body["gir"] == 0          # 5 strokes - 2 putts = 3 > par - 2
    assert body["putts"] == 36
    assert body["differential"] is not None
    assert body["counts_toward_index"] is True


def test_round_stats_endpoint_requires_ownership(client, auth_headers, rated_course):
    """A non-owner gets 404, never another user's stats."""
    course_id, tee_id = rated_course
    round_id = _post_round(
        client, auth_headers, course_id, tee_id, "2026-09-01", 5
    ).json()["id"]

    client.post(
        "/api/admin/users",
        json={"email": "friend2@example.com", "password": "pw12345678",
              "display_name": "Friend2"},
        headers=auth_headers,
    )
    token = client.post(
        "/api/auth/login",
        data={"username": "friend2@example.com", "password": "pw12345678"},
    ).json()["access_token"]
    other = {"Authorization": f"Bearer {token}"}

    resp = client.get(f"/api/rounds/{round_id}/stats", headers=other)
    assert resp.status_code == 404


def test_handicap_null_until_three_rounds(client, auth_headers, rated_course):
    course_id, tee_id = rated_course
    _post_round(client, auth_headers, course_id, tee_id, "2026-09-01", 5)

    resp = client.get("/api/stats/handicap", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert body["index"] is None
    assert body["rounds_needed"] == 2


def test_handicap_appears_at_three_rounds(client, auth_headers, rated_course):
    course_id, tee_id = rated_course
    for i, strokes in enumerate([5, 6, 5], start=1):
        _post_round(client, auth_headers, course_id, tee_id, f"2026-09-0{i}", strokes)

    body = client.get("/api/stats/handicap", headers=auth_headers).json()
    assert body["index"] is not None
    assert body["rounds_needed"] == 0
    assert len(body["differentials"]) == 3
    assert body["low_index"] is None      # needs 20 scores
    assert body["cap_applied"] is None


def test_handicap_reports_non_counting_rounds_with_a_reason(
    client, auth_headers, rated_course
):
    course_id, tee_id = rated_course
    client.post(
        "/api/rounds",
        json={
            "course_id": course_id, "date": "2026-09-05", "tee_set_id": tee_id,
            "hole_count": 9, "nine": "front", "status": "completed",
            "holes": [{"number": n, "strokes": 5} for n in range(1, 10)],
        },
        headers=auth_headers,
    )
    body = client.get("/api/stats/handicap", headers=auth_headers).json()
    excluded = [d for d in body["differentials"] if not d["counts_toward_index"]]
    assert excluded and "9-hole" in excluded[0]["reason"]


def test_abandoned_round_with_ten_scored_holes_feeds_the_index(
    client, auth_headers, rated_course
):
    """An 18-hole round walked off after 10 holes is `abandoned`, not
    `completed` — but Rule 2.2a only needs 10 scored holes for an 18-hole
    differential, so it must still count toward the Index (spec: partial
    rounds are first-class, not silently dropped)."""
    course_id, tee_id = rated_course
    _post_round(client, auth_headers, course_id, tee_id, "2026-09-01", 5)
    _post_round(client, auth_headers, course_id, tee_id, "2026-09-02", 5)

    resp = client.post(
        "/api/rounds",
        json={
            "course_id": course_id, "date": "2026-09-03", "tee_set_id": tee_id,
            "status": "abandoned",
            "holes": [
                {"number": n, "strokes": 5, "putts": 2, "fairway_hit": True}
                for n in range(1, 11)
            ],
        },
        headers=auth_headers,
    )
    assert resp.status_code == 201
    round_id = resp.json()["id"]

    body = client.get("/api/stats/handicap", headers=auth_headers).json()
    assert body["index"] is not None
    row = next(d for d in body["differentials"] if d["round_id"] == round_id)
    assert row["differential"] is not None
    assert row["counts_toward_index"] is True


def test_handicap_is_per_user(client, auth_headers, rated_course):
    """A second user sees an empty record even though the first has rounds."""
    course_id, tee_id = rated_course
    for i in range(1, 4):
        _post_round(client, auth_headers, course_id, tee_id, f"2026-09-0{i}", 5)

    client.post(
        "/api/admin/users",
        json={"email": "friend@example.com", "password": "pw12345678",
              "display_name": "Friend"},
        headers=auth_headers,
    )
    token = client.post(
        "/api/auth/login",
        data={"username": "friend@example.com", "password": "pw12345678"},
    ).json()["access_token"]
    other = {"Authorization": f"Bearer {token}"}

    body = client.get("/api/stats/handicap", headers=other).json()
    assert body["index"] is None
    assert body["differentials"] == []

    # And the first user's own view is untouched by the second user existing.
    own = client.get("/api/stats/handicap", headers=auth_headers).json()
    assert own["index"] is not None
    assert len(own["differentials"]) == 3


def test_stats_rounds_trend(client, auth_headers, rated_course):
    course_id, tee_id = rated_course
    for i, strokes in enumerate([5, 6, 4], start=1):
        _post_round(client, auth_headers, course_id, tee_id, f"2026-09-0{i}", strokes)

    body = client.get("/api/stats/rounds?limit=2", headers=auth_headers).json()
    assert len(body["rounds"]) == 2
    assert body["averages"]["putts"] == 36.0


def test_stats_rounds_trend_is_per_user(client, auth_headers, rated_course):
    course_id, tee_id = rated_course
    _post_round(client, auth_headers, course_id, tee_id, "2026-09-01", 5)

    client.post(
        "/api/admin/users",
        json={"email": "friend3@example.com", "password": "pw12345678",
              "display_name": "Friend3"},
        headers=auth_headers,
    )
    token = client.post(
        "/api/auth/login",
        data={"username": "friend3@example.com", "password": "pw12345678"},
    ).json()["access_token"]
    other = {"Authorization": f"Bearer {token}"}

    body = client.get("/api/stats/rounds", headers=other).json()
    assert body["rounds"] == []


def test_stats_endpoints_require_auth(client):
    assert client.get("/api/stats/handicap").status_code == 401
    assert client.get("/api/stats/rounds").status_code == 401


def test_nine_hole_differential_is_computed_over_the_nine_actually_played(
    client, auth_headers, rated_course
):
    """Rule 5.1b over the front nine ONLY: (113 / 130) x (36 - 35.6) = 0.3477.

    Regression guard for the adapter bug: `_round_records` used to hand the
    engine all 18 `RoundHole` rows regardless of the round's declared scope,
    so the back nine was padded at net par and the resulting 18-hole-sized
    gross was divided by the 9-hole rating - reporting ~31.6, roughly 90x
    too large. Spec 2.3: a wrong number is worse than no number.
    """
    course_id, tee_id = rated_course
    round_id = client.post(
        "/api/rounds",
        json={
            "course_id": course_id, "date": "2026-09-01", "tee_set_id": tee_id,
            "hole_count": 9, "nine": "front", "status": "completed",
            "holes": [{"number": n, "strokes": 4} for n in range(1, 10)],
        },
        headers=auth_headers,
    ).json()["id"]

    body = client.get(f"/api/rounds/{round_id}/stats", headers=auth_headers).json()
    assert body["score"] == 36
    assert body["to_par"] == 0
    assert body["differential"] == pytest.approx((113 / 130) * (36 - 35.6), abs=1e-4)
    assert body["counts_toward_index"] is False
    assert "9-hole" in body["reason"]
