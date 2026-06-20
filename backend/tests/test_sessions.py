def test_create_and_list_session(client, auth_headers):
    created = client.post(
        "/sessions",
        headers=auth_headers,
        json={"date": "2026-06-19", "surface": "grass"},
    )
    assert created.status_code == 201
    sid = created.json()["id"]

    listed = client.get("/sessions", headers=auth_headers)
    assert any(s["id"] == sid for s in listed.json())


def test_get_missing_session_404(client, auth_headers):
    assert client.get("/sessions/999", headers=auth_headers).status_code == 404
