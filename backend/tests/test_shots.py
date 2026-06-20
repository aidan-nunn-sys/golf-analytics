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
