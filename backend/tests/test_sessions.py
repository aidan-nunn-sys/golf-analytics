def test_create_and_list_session(client, auth_headers):
    created = client.post(
        "/api/sessions",
        headers=auth_headers,
        json={"date": "2026-06-19", "surface": "grass"},
    )
    assert created.status_code == 201
    sid = created.json()["id"]

    listed = client.get("/api/sessions", headers=auth_headers)
    assert any(s["id"] == sid for s in listed.json())


def test_get_missing_session_404(client, auth_headers):
    assert client.get("/api/sessions/999", headers=auth_headers).status_code == 404


def test_cross_user_isolation(client, auth_headers):
    client.post(
        "/api/admin/users",
        headers=auth_headers,
        json={"email": "friend@example.com", "password": "pw"},
    )
    login = client.post(
        "/api/auth/login", data={"username": "friend@example.com", "password": "pw"}
    )
    friend_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}

    created = client.post(
        "/api/sessions",
        headers=auth_headers,
        json={"date": "2026-06-19"},
    )
    sid = created.json()["id"]

    assert client.get(f"/api/sessions/{sid}", headers=friend_headers).status_code == 404
    assert client.patch(
        f"/api/sessions/{sid}", headers=friend_headers, json={"name": "hijack"}
    ).status_code == 404


def test_update_session(client, auth_headers):
    created = client.post(
        "/api/sessions",
        headers=auth_headers,
        json={"date": "2026-06-19"},
    )
    sid = created.json()["id"]

    updated = client.patch(
        f"/api/sessions/{sid}",
        headers=auth_headers,
        json={"name": "Morning range"},
    )
    assert updated.status_code == 200
    assert updated.json()["name"] == "Morning range"


def test_delete_session(client, auth_headers):
    created = client.post(
        "/api/sessions",
        headers=auth_headers,
        json={"date": "2026-06-19"},
    )
    sid = created.json()["id"]

    deleted = client.delete(f"/api/sessions/{sid}", headers=auth_headers)
    assert deleted.status_code == 204

    assert client.get(f"/api/sessions/{sid}", headers=auth_headers).status_code == 404
