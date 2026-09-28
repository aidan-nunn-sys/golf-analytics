from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import pytest

from app.integrations.scorecards import SourceFormatError, Tables, parse_lonnie, parse_rga
from app.models import Hole, RoundHole
from app.schemas.scorecard import ScorecardData

FIXTURES = Path(__file__).parent / 'fixtures'


def rga_card():
    return ScorecardData(source_id='rga-public', course_name='Raleigh Golf Association — Public 18',
                        source_urls=['https://www.rgagolf.net/18-hole-course/'], retrieved_at=datetime.now(timezone.utc),
                        **parse_rga((FIXTURES / 'rga-scorecard.txt').read_text()))


def test_official_scorecard_parsers():
    rga = rga_card()
    assert len(rga.holes) == 18 and sum(h.par for h in rga.holes) == 71
    assert rga.tees[0].yardage == 5991
    assert rga.tees[0].ratings[0].course_rating == 68.3
    lonnie = ScorecardData(source_id='lonnie-poole', course_name='Lonnie Poole', source_urls=[],
                          retrieved_at=datetime.now(timezone.utc), **parse_lonnie(
                              (FIXTURES / 'lonnie-scorecard.html').read_text(),
                              (FIXTURES / 'lonnie-ratings.html').read_text()))
    assert len(lonnie.tees) == 12
    assert len(lonnie.holes) == 18
    assert next(t for t in lonnie.tees if t.key == 'Red:W').ratings[0].course_rating == 76.5
    assert next(t for t in lonnie.tees if t.key == 'Red:M').ratings[0].course_rating == 70.8
    assert lonnie.tees[0].yardage == 7358


def test_missing_optional_html_row_end_keeps_rating():
    table = Tables()
    table.feed('<table><tr><td>Red</td><td>W</td><tr><td>Black</td><td>M</td></tr></table>')
    assert table.rows == [['Red', 'W'], ['Black', 'M']]


def test_changed_pdf_layout_is_not_silently_accepted():
    with pytest.raises(SourceFormatError):
        parse_rga('An unreadable scorecard')
    with pytest.raises(SourceFormatError):
        parse_rga((FIXTURES / 'rga-scorecard.txt').read_text().replace('5991', '6991'))


def preview(client, auth_headers, course_id):
    with patch('app.routers.scorecards.fetch_scorecard', return_value=rga_card()):
        response = client.post(f'/api/courses/{course_id}/scorecard/preview', json={'source_id': 'rga-public'}, headers=auth_headers)
    assert response.status_code == 200, response.text
    return response.json()


def test_import_fills_holes_preserves_geometry_and_is_idempotent(client, auth_headers, db_session):
    course = client.post('/api/courses', headers=auth_headers, json={'name': 'RGA', 'holes': [{'number': 1, 'par': 3}]}).json()
    hole = db_session.query(Hole).filter_by(course_id=course['id']).one()
    hole.green_lat, hole.green_lng = 35.73, -78.66
    db_session.commit()
    hole_id = hole.id
    for _ in range(2):
        data = preview(client, auth_headers, course['id'])
        assert data['conflicts'] == []
        response = client.post(f"/api/courses/{course['id']}/scorecard/apply", headers=auth_headers, json={'token': data['token']})
        assert response.status_code == 200, response.text
        assert len(response.json()['holes']) == 18
        assert response.json()['holes'][0]['id'] == hole_id
        assert response.json()['holes'][0]['green_lat'] == 35.73
    assert len(client.get(f"/api/courses/{course['id']}/tees", headers=auth_headers).json()) == 5


def test_import_conflicts_are_explicit_and_round_snapshots_do_not_change(client, auth_headers, rated_course, db_session):
    course_id, tee_id = rated_course
    created = client.post('/api/rounds', headers=auth_headers, json={'course_id': course_id, 'tee_set_id': tee_id}).json()
    before = client.get(f"/api/rounds/{created['id']}", headers=auth_headers).json()
    data = preview(client, auth_headers, course_id)
    assert data['conflicts']
    assert client.post(f'/api/courses/{course_id}/scorecard/apply', headers=auth_headers, json={'token': data['token']}).status_code == 409
    response = client.post(f'/api/courses/{course_id}/scorecard/apply', headers=auth_headers,
                           json={'token': data['token'], 'replace_conflicts': True})
    assert response.status_code == 200
    assert client.get(f"/api/rounds/{created['id']}", headers=auth_headers).json() == before
    db_session.expire_all()
    rows = db_session.query(RoundHole).filter_by(round_id=created['id']).all()
    assert sorted(h.stroke_index for h in rows) == list(range(1, 19))
    assert all(h.par == 4 for h in rows)


def test_stale_or_tampered_previews_cannot_apply(client, auth_headers, seeded_course_via_api):
    cid = seeded_course_via_api
    data = preview(client, auth_headers, cid)
    client.post(f'/api/courses/{cid}/tees', json={'name': 'A manual edit'}, headers=auth_headers)
    assert client.post(f'/api/courses/{cid}/scorecard/apply', headers=auth_headers,
                       json={'token': data['token'], 'replace_conflicts': True}).status_code == 409
    assert client.post(f'/api/courses/{cid}/scorecard/apply', headers=auth_headers,
                       json={'token': data['token'] + 'bad', 'replace_conflicts': True}).status_code == 422


def test_import_requires_auth_and_handles_source_outage(client, auth_headers, seeded_course_via_api):
    import httpx
    cid = seeded_course_via_api
    assert client.get('/api/scorecard-sources').status_code == 401
    assert client.post(f'/api/courses/{cid}/scorecard/preview', json={'source_id': 'rga-public'}).status_code == 401
    with patch('app.routers.scorecards.fetch_scorecard', side_effect=httpx.ReadTimeout('busy')):
        response = client.post(f'/api/courses/{cid}/scorecard/preview', json={'source_id': 'rga-public'}, headers=auth_headers)
    assert response.status_code == 503
    assert client.get(f'/api/courses/{cid}/tees', headers=auth_headers).json() == []
