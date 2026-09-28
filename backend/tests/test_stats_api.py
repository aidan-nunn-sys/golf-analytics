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


def test_measurements_and_gaps_are_independent(client, auth_headers, db_session):
    from app.models import Shot

    driver = _setup_shots(client, auth_headers, [200, 220])
    shots = db_session.query(Shot).filter_by(club_id=driver).order_by(Shot.id).all()
    shots[0].total_yards = 300
    clubs = client.get("/api/clubs", headers=auth_headers).json()
    iron = next(c["id"] for c in clubs if c["category"] == "iron")
    putter = next(c["id"] for c in clubs if c["category"] == "putter")
    db_session.add_all([
        Shot(session_id=shots[0].session_id, club_id=iron, carry_yards=150, total_yards=320, direction="left"),
        Shot(session_id=shots[0].session_id, club_id=putter, carry_yards=10, total_yards=15, direction="straight"),
    ])
    db_session.commit()
    stats = client.get(f"/api/clubs/{driver}/stats", headers=auth_headers).json()
    assert stats["count"] == 2 and stats["avg_carry"] == 210
    assert stats["total"]["count"] == 1 and stats["total"]["average"] == 300
    assert stats["total"]["direction"] == {"left": 0, "straight": 1, "right": 0}
    gaps = {r["club_id"]: r for r in client.get("/api/stats/gapping", headers=auth_headers).json()}
    assert gaps[driver]["gap_to_next"] == 60
    assert gaps[driver]["total_gap_to_next"] is None
    assert gaps[iron]["total_gap_to_next"] == 20
    assert gaps[iron]["gap_to_next"] is None
    assert gaps[driver]["carry_count"] == 2 and gaps[driver]["total_count"] == 1
    assert putter not in gaps
    dashboard = client.get("/api/stats/dashboard", headers=auth_headers).json()
    assert putter not in [c["club_id"] for c in dashboard["clubs"]]
    assert next(c["stats"] for c in dashboard["clubs"] if c["club_id"] == driver) == stats


def test_total_only_club_and_other_users_data(client, auth_headers, db_session):
    from app.models import Shot, RangeSession
    from app.seed import create_user
    from datetime import date

    club = _setup_shots(client, auth_headers, [])
    session_id = client.get("/api/sessions", headers=auth_headers).json()[0]["id"]
    db_session.add(Shot(session_id=session_id, club_id=club, total_yards=240, direction="right"))
    other = create_user(db_session, email="measurements@example.com", password="pw12345")
    other_session = RangeSession(user_id=other.id, date=date(2026, 9, 26))
    db_session.add(other_session)
    db_session.flush()
    db_session.add(Shot(session_id=other_session.id, club_id=club, carry_yards=999, total_yards=999, direction="left"))
    db_session.commit()
    stats = client.get(f"/api/clubs/{club}/stats", headers=auth_headers).json()
    assert stats["count"] == 0 and stats["avg_carry"] is None
    assert stats["total"]["count"] == 1 and stats["total"]["average"] == 240
    gaps = client.get("/api/stats/gapping", headers=auth_headers).json()
    assert len(gaps) == 1 and gaps[0]["avg_carry"] is None and gaps[0]["avg_total"] == 240
    token = client.post("/api/auth/login", data={"username": "measurements@example.com", "password": "pw12345"}).json()["access_token"]
    assert client.get(f"/api/clubs/{club}/stats", headers={"Authorization": f"Bearer {token}"}).status_code == 404


def test_club_stats_keeps_on_course_gps_separate(client, auth_headers, db_session):
    from app.models import Course, Hole

    club_id = _setup_shots(client, auth_headers, [200.0])

    course = Course(name="Test Links", import_source="manual")
    db_session.add(course)
    db_session.commit()
    db_session.refresh(course)
    db_session.add_all([Hole(course_id=course.id, number=n, par=4) for n in range(1, 19)])
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
    assert resp.json()["count"] == 1
    assert resp.json()["avg_carry"] == 200.0
    assert resp.json()["total"]["count"] == 1
    assert resp.json()["total"]["average"] > 0
