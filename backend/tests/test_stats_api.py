def _setup_shots(client, headers, carries):
    sid = client.post("/sessions", headers=headers, json={"date": "2026-06-19"}).json()[
        "id"
    ]
    club_id = client.get("/clubs", headers=headers).json()[0]["id"]
    for c in carries:
        client.post(
            f"/sessions/{sid}/shots",
            headers=headers,
            json={"club_id": club_id, "carry_yards": c, "direction": "straight"},
        )
    return club_id


def test_club_stats_endpoint(client, auth_headers):
    club_id = _setup_shots(client, auth_headers, [200.0, 210.0, 220.0])
    resp = client.get(f"/clubs/{club_id}/stats", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["count"] == 3
    assert resp.json()["avg_carry"] == 210.0


def test_dashboard_endpoint(client, auth_headers):
    _setup_shots(client, auth_headers, [200.0, 210.0])
    resp = client.get("/stats/dashboard", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.json()
    assert "clubs" in body and "gapping" in body
    assert any(c["stats"]["count"] == 2 for c in body["clubs"])
