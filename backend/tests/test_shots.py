def _make_session(client, headers):
    return client.post(
        "/sessions", headers=headers, json={"date": "2026-06-19"}
    ).json()["id"]


def _first_club_id(client, headers):
    return client.get("/clubs", headers=headers).json()[0]["id"]


def test_log_and_list_shots(client, auth_headers):
    sid = _make_session(client, auth_headers)
    club_id = _first_club_id(client, auth_headers)
    resp = client.post(
        f"/sessions/{sid}/shots",
        headers=auth_headers,
        json={"club_id": club_id, "carry_yards": 250.0, "direction": "left"},
    )
    assert resp.status_code == 201
    assert resp.json()["source"] == "manual"

    shots = client.get(f"/sessions/{sid}/shots", headers=auth_headers).json()
    assert len(shots) == 1
    assert shots[0]["carry_yards"] == 250.0


def test_reject_bad_direction(client, auth_headers):
    sid = _make_session(client, auth_headers)
    club_id = _first_club_id(client, auth_headers)
    resp = client.post(
        f"/sessions/{sid}/shots",
        headers=auth_headers,
        json={"club_id": club_id, "carry_yards": 100.0, "direction": "sideways"},
    )
    assert resp.status_code == 422


def test_edit_shot(client, auth_headers):
    sid = _make_session(client, auth_headers)
    club_id = _first_club_id(client, auth_headers)
    shot_id = client.post(
        f"/sessions/{sid}/shots",
        headers=auth_headers,
        json={"club_id": club_id, "carry_yards": 100.0},
    ).json()["id"]
    resp = client.patch(
        f"/shots/{shot_id}", headers=auth_headers, json={"carry_yards": 142.0}
    )
    assert resp.status_code == 200
    assert resp.json()["carry_yards"] == 142.0


def test_reject_bad_source(client, auth_headers):
    sid = _make_session(client, auth_headers)
    club_id = _first_club_id(client, auth_headers)
    resp = client.post(
        f"/sessions/{sid}/shots",
        headers=auth_headers,
        json={"club_id": club_id, "carry_yards": 150.0, "direction": "straight", "source": "rangefinder"},
    )
    assert resp.status_code == 422


def test_cross_user_isolation(client, auth_headers):
    # Admin creates a session and shot
    admin_sid = _make_session(client, auth_headers)
    admin_club_id = _first_club_id(client, auth_headers)
    admin_shot = client.post(
        f"/sessions/{admin_sid}/shots",
        headers=auth_headers,
        json={"club_id": admin_club_id, "carry_yards": 150.0, "direction": "straight"},
    ).json()
    admin_shot_id = admin_shot["id"]

    # Create second user
    client.post(
        "/admin/users",
        headers=auth_headers,
        json={"email": "friend@example.com", "password": "pw"},
    )
    login = client.post(
        "/auth/login", data={"username": "friend@example.com", "password": "pw"}
    )
    friend_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    # Friend cannot access admin's session shots
    resp = client.get(f"/sessions/{admin_sid}/shots", headers=friend_headers)
    assert resp.status_code == 404

    # Friend cannot patch admin's shot
    resp = client.patch(
        f"/shots/{admin_shot_id}", headers=friend_headers, json={"carry_yards": 1.0}
    )
    assert resp.status_code == 404

    # Friend cannot delete admin's shot
    resp = client.delete(f"/shots/{admin_shot_id}", headers=friend_headers)
    assert resp.status_code == 404

    # Friend cannot create shot using admin's club
    friend_sid = _make_session(client, friend_headers)
    resp = client.post(
        f"/sessions/{friend_sid}/shots",
        headers=friend_headers,
        json={"club_id": admin_club_id, "carry_yards": 150.0, "direction": "straight"},
    )
    assert resp.status_code == 404
