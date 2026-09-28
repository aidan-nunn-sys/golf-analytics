import pytest


def path(course, hole=None):
    base = f"/api/courses/{course}/personal-notes"
    return base if hole is None else f"{base}/{hole}"


def test_personal_notes_revision_conflict_retry_and_clear(client, auth_headers, seeded_course_via_api):
    url = path(seeded_course_via_api, 1)
    assert client.get(path(seeded_course_via_api), headers=auth_headers).json() == []
    first = client.put(url, json={"text": "Aim left of the bunker", "expected_revision": 0}, headers=auth_headers)
    assert first.status_code == 200
    assert first.json()["revision"] == 1
    assert client.put(url, json={"text": "Aim left of the bunker", "expected_revision": 0}, headers=auth_headers).json()["revision"] == 1
    assert client.put(url, json={"text": "Old device", "expected_revision": 0}, headers=auth_headers).status_code == 409
    updated = client.put(url, json={"text": "Lay up with 7 iron", "expected_revision": 1}, headers=auth_headers)
    assert updated.json()["revision"] == 2
    assert client.put(url, json={"text": "", "expected_revision": 2}, headers=auth_headers).json()["revision"] == 3
    assert client.put(url, json={"text": "Resurrect old note", "expected_revision": 2}, headers=auth_headers).status_code == 409
    assert client.get(path(seeded_course_via_api), headers=auth_headers).json()[0]["text"] == ""


def test_notes_are_private_and_keyed_by_course_and_hole(client, auth_headers, seeded_course_via_api):
    course = seeded_course_via_api
    for hole in (1, 2):
        assert client.put(path(course, hole), json={"text": f"Plan {hole}", "expected_revision": 0}, headers=auth_headers).status_code == 200
    response = client.post('/api/admin/users', json={"email": "notebook@example.com", "password": "test-notebook-password"}, headers=auth_headers)
    assert response.status_code == 201, response.text
    token = client.post('/api/auth/login', data={"username": "notebook@example.com", "password": "test-notebook-password"}).json()['access_token']
    other = {"Authorization": f"Bearer {token}"}
    assert client.get(path(course), headers=other).json() == []
    assert client.put(path(course, 1), json={"text": "Private other player", "expected_revision": 0}, headers=other).status_code == 200
    assert [n['text'] for n in client.get(path(course), headers=auth_headers).json()] == ['Plan 1', 'Plan 2']
    another = client.post('/api/courses', json={"name": "Another course", "holes": [{"number": 1, "par": 4}]}, headers=auth_headers).json()['id']
    assert client.get(path(another), headers=auth_headers).json() == []
    assert client.get(path(course)).status_code == 401


@pytest.mark.parametrize('payload', [
    {"text": "x" * 2001, "expected_revision": 0},
    {"text": "note", "expected_revision": -1},
    {"text": "note", "expected_revision": 0, "user_id": 999},
])
def test_note_validation(client, auth_headers, seeded_course_via_api, payload):
    assert client.put(path(seeded_course_via_api, 1), json=payload, headers=auth_headers).status_code == 422


def test_missing_hole_or_course(client, auth_headers, seeded_course_via_api):
    assert client.put(path(seeded_course_via_api, 19), json={"text": "note", "expected_revision": 0}, headers=auth_headers).status_code == 404
    assert client.get(path(999999), headers=auth_headers).status_code == 404


def test_notes_survive_hole_record_replacement(db_session, seeded_user_and_course):
    from app.models import Hole, HoleNote
    user, course, _tee = seeded_user_and_course
    db_session.add(HoleNote(user_id=user.id, course_id=course.id, hole_number=1, text="Stay short", revision=1))
    db_session.commit()
    old = db_session.query(Hole).filter_by(course_id=course.id, number=1).one()
    db_session.delete(old)
    db_session.flush()
    db_session.add(Hole(course_id=course.id, number=1, par=5))
    db_session.commit()
    assert db_session.query(HoleNote).filter_by(user_id=user.id, course_id=course.id, hole_number=1).one().text == "Stay short"
