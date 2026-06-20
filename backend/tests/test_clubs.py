def test_bag_listed_for_admin(client, auth_headers):
    resp = client.get("/clubs", headers=auth_headers)
    assert resp.status_code == 200
    labels = [c["label"] for c in resp.json()]
    assert "Driver" in labels


def test_create_update_delete_club(client, auth_headers):
    created = client.post(
        "/clubs",
        headers=auth_headers,
        json={"label": "60° Lob", "category": "wedge", "order_index": 99},
    )
    assert created.status_code == 201
    club_id = created.json()["id"]

    updated = client.patch(
        f"/clubs/{club_id}", headers=auth_headers, json={"label": "60° LW"}
    )
    assert updated.json()["label"] == "60° LW"

    assert client.delete(f"/clubs/{club_id}", headers=auth_headers).status_code == 204


def test_cannot_touch_other_users_club(client, auth_headers):
    client.post(
        "/admin/users",
        headers=auth_headers,
        json={"email": "friend@example.com", "password": "pw"},
    )
    login = client.post(
        "/auth/login", data={"username": "friend@example.com", "password": "pw"}
    )
    friend_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    friend_club = client.get("/clubs", headers=friend_headers).json()[0]["id"]
    resp = client.patch(
        f"/clubs/{friend_club}", headers=auth_headers, json={"label": "hijack"}
    )
    assert resp.status_code == 404
