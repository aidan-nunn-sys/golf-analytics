from app.config import settings


def test_login_succeeds_for_bootstrap_admin(client, db_session):
    from app.seed import bootstrap_admin

    bootstrap_admin(db_session)
    resp = client.post(
        "/api/auth/login",
        data={"username": settings.admin_email, "password": settings.admin_password},
    )
    assert resp.status_code == 200
    assert "access_token" in resp.json()


def test_me_requires_auth(client):
    assert client.get("/api/auth/me").status_code == 401


def test_admin_creates_account(client, auth_headers):
    resp = client.post(
        "/api/admin/users",
        headers=auth_headers,
        json={"email": "friend@example.com", "password": "pw", "display_name": "Friend"},
    )
    assert resp.status_code == 201
    assert resp.json()["email"] == "friend@example.com"
    assert resp.json()["is_admin"] is False


def test_non_admin_cannot_create_account(client, auth_headers):
    client.post(
        "/api/admin/users",
        headers=auth_headers,
        json={"email": "friend@example.com", "password": "pw"},
    )
    login = client.post(
        "/api/auth/login", data={"username": "friend@example.com", "password": "pw"}
    )
    friend_headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    resp = client.post(
        "/api/admin/users",
        headers=friend_headers,
        json={"email": "x@example.com", "password": "pw"},
    )
    assert resp.status_code == 403


def test_update_own_unit_preference(client, auth_headers):
    resp = client.patch(
        "/api/auth/me", headers=auth_headers, json={"unit_preference": "meters"}
    )
    assert resp.status_code == 200
    assert resp.json()["unit_preference"] == "meters"


def test_duplicate_email_returns_409(client, auth_headers):
    resp = client.post(
        "/api/admin/users",
        headers=auth_headers,
        json={"email": "dupe@example.com", "password": "pw"},
    )
    assert resp.status_code == 201
    resp2 = client.post(
        "/api/admin/users",
        headers=auth_headers,
        json={"email": "dupe@example.com", "password": "pw"},
    )
    assert resp2.status_code == 409


def test_authenticated_me_shape(client, auth_headers):
    resp = client.get("/api/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.json()["email"] == settings.admin_email
    assert resp.json()["is_admin"] is True
    assert "password_hash" not in resp.json()
