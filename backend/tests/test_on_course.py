from uuid import uuid4
from app.models import Club, Shot, User
from app.security import create_access_token


def test_green_notes_sync_legacy_compatibility_and_conflicts(client,auth_headers,rated_course):
    r=client.post('/api/rounds',headers=auth_headers,json={'course_id':rated_course[0],'hole_count':9,'nine':'front'}).json()
    notes={'1':{'break_direction':'left','pace':'downhill','note':'Stay below the cup'}}
    data={'expected_revision':r['revision'],'details':{k:r[k] for k in ['date','notes','status','current_hole']},'holes':[dict(number=h['hole_number'],strokes=4,putts=2,penalties=0,fairway_hit=None) for h in r['holes']]}
    data['details']['green_notes']=notes
    url=f"/api/rounds/{r['id']}/sync"
    saved=client.put(url,headers=auth_headers,json=data)
    assert saved.status_code==200,saved.text
    assert saved.json()['green_notes']==notes
    assert client.put(url,headers=auth_headers,json=data).json()==saved.json()
    data['details']['green_notes']['1']['note']='Changed'
    assert client.put(url,headers=auth_headers,json=data).status_code==409
    del data['details']['green_notes']
    assert client.put(url,headers=auth_headers,json=data).json()['green_notes']==saved.json()['green_notes']
    data['expected_revision']=saved.json()['revision']
    data['details']['green_notes']={'10':{'note':'Wrong nine'}}
    assert client.put(url,headers=auth_headers,json=data).status_code==422
    assert client.patch(f"/api/rounds/{r['id']}",headers=auth_headers,json={'green_notes':{'1':{'note':'x'*501}}}).status_code==422


def test_device_shots_are_idempotent_owned_and_validate_location(client,auth_headers,rated_course,db_session):
    r=client.post('/api/rounds',headers=auth_headers,json={'course_id':rated_course[0]}).json()
    club=db_session.query(Club).first()
    url=f"/api/rounds/{r['id']}/device-shots/{uuid4()}"
    data=dict(club_id=club.id,hole_number=1,start_lat=36,start_lng=-78,end_lat=36.001,end_lng=-78,direction='straight',accuracy='5')
    first=client.put(url,headers=auth_headers,json=data)
    assert first.status_code==200,first.text
    assert 120<first.json()['total_yards']<123
    assert first.json()['carry_yards'] is None
    assert client.put(url,headers=auth_headers,json=data).json()==first.json()
    assert db_session.query(Shot).count()==1
    other=User(email='other-play@test.local',display_name='Other',password_hash='unused');db_session.add(other);db_session.commit()
    assert client.put(url,headers={'Authorization':f'Bearer {create_access_token(other.email)}'},json=data).status_code==404
    invalid=f"/api/rounds/{r['id']}/device-shots/{uuid4()}"
    assert client.put(invalid,headers=auth_headers,json={**data,'end_lat':100}).status_code==422
    assert client.put(invalid,headers=auth_headers,json={**data,'club_id':99999}).status_code==404
    assert db_session.query(Shot).count()==1
    client.delete(f"/api/rounds/{r['id']}",headers=auth_headers)
    assert client.put(url,headers=auth_headers,json=data).status_code==404
