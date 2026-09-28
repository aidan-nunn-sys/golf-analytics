from datetime import date

from app.stats.bag import distribution


def test_distribution_keeps_mishits_and_interpolates_percentiles():
    result = distribution([(v, date(2026, 9, 1)) for v in [10, 140, 150, 160, 190]])
    assert result == dict(count=5, excluded=0, median=150, p10=62, p90=178,
                          minimum=10, maximum=190, last_played="2026-09-01")


def test_distribution_excludes_missing_nonfinite_and_nonpositive():
    result = distribution([(v, date(2026, 9, 1)) for v in [None, 0, -1, float('nan'), float('inf')]])
    assert result['count'] == 0
    assert result['excluded'] == 4  # missing measurements are not invalid values
    assert result['median'] is None and result['last_played'] is None


def test_profile_filters_source_and_owner(client, auth_headers, db_session):
    from app.models import Shot, RangeSession
    from app.seed import create_user
    clubs = client.get('/api/clubs', headers=auth_headers).json()
    club = clubs[0]['id']
    sid = client.post('/api/sessions', headers=auth_headers, json={'date': '2026-09-01'}).json()['id']
    db_session.add_all([
        Shot(session_id=sid, club_id=club, carry_yards=150, total_yards=160, source='manual'),
        Shot(session_id=sid, club_id=club, total_yards=180, source='gps'),
    ])
    other = create_user(db_session, email='bag-other@example.com', password='testing')
    session = RangeSession(user_id=other.id, date=date(2026, 9, 20))
    db_session.add(session)
    db_session.flush()
    db_session.add(Shot(session_id=session.id, club_id=club, carry_yards=999))
    db_session.commit()
    response = client.get('/api/stats/bag-profile', headers=auth_headers)
    assert response.status_code == 200
    profile = response.json()
    row = next(c for c in profile['clubs'] if c['club_id'] == club)
    assert row['carry']['median'] == 150
    assert row['total']['count'] == 2
    assert row['carry']['last_played'] == '2026-09-01'
    assert all(c['label'] != 'Putter' for c in profile['clubs'])
    gps = client.get('/api/stats/bag-profile?source=gps', headers=auth_headers).json()
    row = next(c for c in gps['clubs'] if c['club_id'] == club)
    assert row['carry']['count'] == 0 and row['total']['median'] == 180
    assert client.get('/api/stats/bag-profile?source=invalid', headers=auth_headers).status_code == 422
    assert client.get('/api/stats/bag-profile').status_code == 401


def test_profile_excludes_deleted_rounds_and_inactive_clubs(client, auth_headers, db_session, seeded_course_via_api):
    from datetime import datetime, timezone
    from app.models import Shot, Round, Club
    clubs = client.get('/api/clubs', headers=auth_headers).json()
    club = clubs[0]['id']
    round_id = client.post('/api/rounds', headers=auth_headers, json={'course_id': seeded_course_via_api}).json()['id']
    db_session.add(Shot(round_id=round_id, club_id=club, total_yards=250, source='gps'))
    db_session.commit()
    def row():
        return next(c for c in client.get('/api/stats/bag-profile', headers=auth_headers).json()['clubs'] if c['club_id'] == club)
    assert row()['total']['count'] == 1
    db_session.get(Round, round_id).deleted_at = datetime.now(timezone.utc)
    db_session.commit()
    assert row()['total']['count'] == 0
    db_session.get(Club, club).is_active = False
    db_session.commit()
    assert club not in [c['club_id'] for c in client.get('/api/stats/bag-profile', headers=auth_headers).json()['clubs']]
