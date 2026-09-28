from uuid import uuid4
from app.models import Round, Hole, TeeSet


def prepare(client, headers, course_id, tee_id=None, **extra):
    response = client.post('/api/rounds/offline/prepare', headers=headers, json=dict(course_id=course_id, tee_set_id=tee_id, **extra))
    assert response.status_code == 200, response.text
    return response.json()


def test_preparation_creates_no_round_and_retries_keep_identity(client, auth_headers, rated_course, db_session):
    course, tee = rated_course
    card = prepare(client, auth_headers, course, tee, hole_count=9, nine='back')
    assert db_session.query(Round).count() == 0
    assert card['round']['current_hole'] == 10
    assert card['round']['slope_rating'] == 134
    payload = dict(client_id=str(uuid4()), token=card['token'], date='2026-09-25')
    first = client.post('/api/rounds/offline/create', headers=auth_headers, json=payload)
    assert first.status_code == 201, first.text
    rid = first.json()['id']
    assert first.json()['date'] == '2026-09-25'
    assert len(first.json()['holes']) == 9
    client.patch(f'/api/rounds/{rid}/holes/10', headers=auth_headers, json={'strokes':5,'putts':2})
    retry = client.post('/api/rounds/offline/create', headers=auth_headers, json=payload)
    assert retry.json()['id'] == rid
    assert retry.json()['holes'][0]['strokes'] == 5
    assert db_session.query(Round).count() == 1
    client.delete(f'/api/rounds/{rid}', headers=auth_headers)
    assert client.post('/api/rounds/offline/create', headers=auth_headers, json=payload).status_code == 404
    assert db_session.query(Round).count() == 1


def test_prepared_snapshot_survives_edits_archive_and_removed_tee(client, auth_headers, rated_course, db_session):
    course, tee = rated_course
    card = prepare(client, auth_headers, course, tee)
    old = db_session.query(Hole).filter_by(course_id=course, number=1).one()
    old.par = 5
    db_session.commit()
    client.post(f'/api/courses/{course}/archive', headers=auth_headers)
    client.delete(f'/api/tees/{tee}', headers=auth_headers)
    result = client.post('/api/rounds/offline/create', headers=auth_headers, json=dict(client_id=str(uuid4()),token=card['token'],date='2026-09-25'))
    assert result.status_code == 201, result.text
    r = result.json()
    assert r['holes'][0]['par'] == 4
    assert r['course_rating'] == 71.2
    assert r['tee_name'] == 'Blue'
    assert r['tee_set_id'] is None
    assert client.post('/api/rounds/offline/prepare',headers=auth_headers,json={'course_id':course}).status_code == 409


def test_tampered_or_foreign_token_and_removed_holes_do_not_create(client, auth_headers, rated_course, db_session):
    from jose import jwt
    from app.config import settings
    course, tee = rated_course
    card = prepare(client, auth_headers, course, tee)
    claims = jwt.decode(card['token'],settings.secret_key,algorithms=['HS256'])
    claims['sub'] = '99999'
    wrong = jwt.encode(claims,settings.secret_key,algorithm='HS256')
    for token in ['broken',wrong]:
        result = client.post('/api/rounds/offline/create',headers=auth_headers,json=dict(client_id=str(uuid4()),token=token,date='2026-09-25'))
        assert result.status_code == 422
    db_session.delete(db_session.query(Hole).filter_by(course_id=course,number=1).one())
    db_session.commit()
    result=client.post('/api/rounds/offline/create',headers=auth_headers,json=dict(client_id=str(uuid4()),token=card['token'],date='2026-09-25'))
    assert result.status_code == 409
    assert db_session.query(Round).count() == 0


def test_created_round_scores_sync_idempotently(client, auth_headers, rated_course):
    course, tee = rated_course
    card = prepare(client, auth_headers, course, tee)
    identity = dict(client_id=str(uuid4()),token=card['token'],date='2026-09-25')
    created = client.post('/api/rounds/offline/create',headers=auth_headers,json=identity).json()
    holes = [dict(number=h['hole_number'],strokes=5,putts=2,penalties=0,fairway_hit=True) for h in created['holes']]
    data=dict(expected_revision=1, details=dict(date=identity['date'],notes='Played without reception',status='completed',current_hole=18),holes=holes)
    first=client.put(f"/api/rounds/{created['id']}/sync",headers=auth_headers,json=data)
    assert first.status_code == 200, first.text
    retry=client.put(f"/api/rounds/{created['id']}/sync",headers=auth_headers,json=data)
    assert retry.json()==first.json()
    assert retry.json()['status']=='completed'


def test_preparation_rejects_incomplete_scope(client, auth_headers, rated_course, db_session):
    course, tee = rated_course
    db_session.query(Hole).filter_by(course_id=course,number=18).one().par=None
    db_session.commit()
    assert client.post('/api/rounds/offline/prepare',headers=auth_headers,json={'course_id':course}).status_code==422
    assert len(prepare(client,auth_headers,course,tee,hole_count=9,nine='front')['round']['holes'])==9
