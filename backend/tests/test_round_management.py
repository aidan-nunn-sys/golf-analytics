from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from sqlalchemy import create_engine, text

from app.config import settings
from app.models import RoundHole, Shot
from app.seed import create_user


@pytest.fixture
def course_id(rated_course):
    return rated_course[0]


@pytest.fixture
def tee_id(rated_course):
    return rated_course[1]


def create_round(client, headers, course_id, tee_id):
    response = client.post('/api/rounds', headers=headers, json={
        'course_id': course_id, 'tee_set_id': tee_id, 'date': '2026-09-01',
        'status': 'completed', 'holes': [
            {'number': n, 'strokes': 5, 'putts': 2} for n in range(1, 19)
        ],
    })
    assert response.status_code == 201, response.text
    return response.json()


def test_date_and_notes_correction_reorders_history(client, auth_headers, course_id, tee_id):
    first = create_round(client, auth_headers, course_id, tee_id)
    second = create_round(client, auth_headers, course_id, tee_id)
    assert first['notes'] == '' and first['deleted_at'] is None
    changed = client.patch(f"/api/rounds/{first['id']}", headers=auth_headers,
                           json={'date': '2026-09-02', 'notes': 'Aim left on 7.\nGood putting.'})
    assert changed.status_code == 200
    assert changed.json()['notes'] == 'Aim left on 7.\nGood putting.'
    assert changed.json()['holes'] == first['holes']
    assert changed.json()['course_rating'] == first['course_rating']
    assert [r['id'] for r in client.get('/api/rounds', headers=auth_headers).json()] == [first['id'], second['id']]
    trends = client.get('/api/stats/rounds', headers=auth_headers).json()['rounds']
    assert trends[0]['date'] == '2026-09-02'
    rows = client.get('/api/stats/handicap', headers=auth_headers).json()['differentials']
    assert next(r for r in rows if r['round_id'] == first['id'])['date'] == '2026-09-02'


@pytest.mark.parametrize('body', [{'date': None}, {'notes': None}, {'notes': 'a' * 4001}, {'date': 'not-a-date'}])
def test_metadata_validation(client, auth_headers, course_id, tee_id, body):
    record = create_round(client, auth_headers, course_id, tee_id)
    assert client.patch(f"/api/rounds/{record['id']}", headers=auth_headers, json=body).status_code == 422


def test_trash_excludes_stats_and_restores_full_round(client, auth_headers, course_id, tee_id, db_session):
    record = create_round(client, auth_headers, course_id, tee_id)
    rid = record['id']
    client.patch(f'/api/rounds/{rid}', headers=auth_headers, json={'notes': 'Keep this journal entry'})
    club = client.get('/api/clubs', headers=auth_headers).json()[0]['id']
    response = client.post(f'/api/rounds/{rid}/shots', headers=auth_headers, json={
        'club_id': club, 'start_lat': 35.0, 'start_lng': -78.0,
        'end_lat': 35.001, 'end_lng': -78.0, 'direction': 'straight',
    })
    assert response.status_code == 201, response.text
    endpoints = [f'/api/clubs/{club}/stats', '/api/stats/gapping', '/api/stats/dashboard', '/api/stats/rounds', '/api/stats/handicap']
    before = {url: client.get(url, headers=auth_headers).json() for url in endpoints}
    assert client.delete(f'/api/rounds/{rid}', headers=auth_headers).status_code == 204
    assert client.delete(f'/api/rounds/{rid}', headers=auth_headers).status_code == 204
    assert client.get('/api/rounds', headers=auth_headers).json() == []
    trash = client.get('/api/rounds?deleted=true', headers=auth_headers).json()
    assert len(trash) == 1 and trash[0]['deleted_at'] is not None
    assert trash[0]['holes'] == record['holes']
    assert client.get(f'/api/rounds/{rid}', headers=auth_headers).status_code == 404
    assert client.get(f'/api/rounds/{rid}/stats', headers=auth_headers).status_code == 404
    assert client.patch(f'/api/rounds/{rid}', headers=auth_headers, json={'notes': 'no'}).status_code == 404
    assert client.patch(f'/api/rounds/{rid}/holes/1', headers=auth_headers, json={'strokes': 4}).status_code == 404
    after = {url: client.get(url, headers=auth_headers).json() for url in endpoints}
    for url in endpoints:
        assert before[url] != after[url], url
    assert after['/api/stats/rounds']['rounds'] == []
    assert after['/api/stats/handicap']['differentials'] == []
    assert db_session.query(RoundHole).filter_by(round_id=rid).count() == 18
    assert db_session.query(Shot).filter_by(round_id=rid).count() == 1
    restored = client.post(f'/api/rounds/{rid}/restore', headers=auth_headers)
    assert restored.status_code == 200
    assert restored.json()['deleted_at'] is None
    assert restored.json()['status'] == 'completed'
    assert restored.json()['notes'] == 'Keep this journal entry'
    assert restored.json()['holes'] == record['holes']
    assert client.post(f'/api/rounds/{rid}/restore', headers=auth_headers).status_code == 200
    assert client.get('/api/rounds?deleted=true', headers=auth_headers).json() == []
    for url in endpoints:
        assert client.get(url, headers=auth_headers).json() == before[url], url


def test_trash_is_owner_only(client, auth_headers, course_id, tee_id, db_session):
    record = create_round(client, auth_headers, course_id, tee_id)
    rid = record['id']
    create_user(db_session, email='second@example.com', password='pw12345')
    token = client.post('/api/auth/login', data={'username': 'second@example.com', 'password': 'pw12345'}).json()['access_token']
    other = {'Authorization': f'Bearer {token}'}
    assert client.delete(f'/api/rounds/{rid}', headers=other).status_code == 404
    assert client.patch(f'/api/rounds/{rid}', headers=other, json={'date': '2026-09-02'}).status_code == 404
    client.delete(f'/api/rounds/{rid}', headers=auth_headers)
    assert client.get('/api/rounds?deleted=true', headers=other).json() == []
    assert client.post(f'/api/rounds/{rid}/restore', headers=other).status_code == 404
    assert client.post('/api/rounds/999999/restore', headers=auth_headers).status_code == 404


def test_upgrade_preserves_existing_rounds(tmp_path, monkeypatch):
    database = f'sqlite:///{tmp_path / "round-management.db"}'
    monkeypatch.setattr(settings, 'database_url', database)
    config = Config(str(Path(__file__).parents[1] / 'alembic.ini'))
    command.upgrade(config, 'c61b72498d01')
    engine = create_engine(database)
    with engine.begin() as conn:
        conn.execute(text("INSERT INTO courses (id,name,import_source) VALUES (1,'Original','manual')"))
        conn.execute(text('INSERT INTO holes (id,course_id,number,par,stroke_index) VALUES (1,1,1,4,7)'))
        conn.execute(text("INSERT INTO rounds (id,user_id,course_id,date,status,current_hole,hole_count) VALUES (1,1,1,'2026-09-01','completed',1,18)"))
        conn.execute(text('INSERT INTO round_holes (round_id,hole_id,par,stroke_index,strokes) VALUES (1,1,4,7,5)'))
    command.upgrade(config, 'head')
    with engine.connect() as conn:
        assert conn.execute(text('SELECT notes, deleted_at, date FROM rounds')).one() == ('', None, '2026-09-01')
        assert conn.execute(text('SELECT revision, course_name, hole_yardages FROM rounds')).one() == (1, 'Original', '{}')
        assert conn.execute(text('SELECT archived_at FROM courses')).scalar_one() is None
        assert conn.execute(text('SELECT strokes, stroke_index FROM round_holes')).one() == (5, 7)
    command.downgrade(config, 'c61b72498d01')
    with engine.connect() as conn:
        assert conn.execute(text('SELECT strokes FROM round_holes')).scalar_one() == 5
    command.upgrade(config, 'head')
    engine.dispose()
