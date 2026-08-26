def _setup_shots(client, headers, carries):
    sid = client.post("/api/sessions", headers=headers, json={"date": "2026-06-19"}).json()[
        "id"
    ]
    club_id = client.get("/api/clubs", headers=headers).json()[0]["id"]
    for c in carries:
        client.post(
            f"/api/sessions/{sid}/shots",
            headers=headers,
            json={"club_id": club_id, "carry_yards": c, "direction": "straight"},
        )
    return club_id


def test_club_stats_endpoint(client, auth_headers):
    club_id = _setup_shots(client, auth_headers, [200.0, 210.0, 220.0])
    resp = client.get(f"/api/clubs/{club_id}/stats", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["count"] == 3
    assert resp.json()["avg_carry"] == 210.0


def test_dashboard_endpoint(client, auth_headers):
    _setup_shots(client, auth_headers, [200.0, 210.0])
    resp = client.get("/api/stats/dashboard", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "clubs" in body and "gapping" in body
    assert any(c["stats"]["count"] == 2 for c in body["clubs"])


def test_club_stats_includes_on_course_gps_shots(client, auth_headers, db_session):
    from app.models import Course, Hole

    club_id = _setup_shots(client, auth_headers, [200.0])

    course = Course(name="Test Links", import_source="manual")
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)
    db_session.add(Hole(course_id=course.id, number=1, par=4))
    db_session.commit()
    rid = client.post(
        "/api/rounds", json={"course_id": course.id}, headers=auth_headers
    ).json()["id"]
    client.post(
        f"/api/rounds/{rid}/shots",
        json={
            "club_id": club_id,
            "start_lat": 36.5,
            "start_lng": -121.9,
            "end_lat": 36.501,
            "end_lng": -121.9,
        },
        headers=auth_headers,
    )

    resp = client.get(f"/api/clubs/{club_id}/stats", headers=auth_headers)
    assert resp.json()["count"] == 2
