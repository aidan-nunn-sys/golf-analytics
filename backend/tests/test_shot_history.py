from uuid import uuid4

import pytest


def setup_history(client, auth_headers, rated_course):
    round = client.post('/api/rounds', headers=auth_headers, json={'course_id':rated_course[0]}).json()
    club = client.get('/api/clubs', headers=auth_headers).json()[0]
    data = dict(expected_revision=0,club_id=club['id'],hole_number=1,sequence=1,source='gps',direction='straight',
                start={'lat':36,'lng':-78,'accuracy':5,'timestamp':1770000000000},
                end={'lat':36.001,'lng':-78,'accuracy':7,'timestamp':1770000060000},
                start_lie='tee',end_lie='fairway',penalties=0,holed_out=False,deleted=False)
    base=f"/api/rounds/{round['id']}/shot-history"
    return base, f'{base}/{uuid4()}', data, round


def test_durable_positions_metadata_retry_and_correction(client,auth_headers,rated_course):
    base,url,data,round=setup_history(client,auth_headers,rated_course)
    first=client.put(url,headers=auth_headers,json=data)
    assert first.status_code==200,first.text
    shot=first.json()
    assert shot['start']==data['start'] and shot['end']==data['end']
    assert shot['revision']==1 and shot['sequence']==1
    assert 120<shot['total_yards']<123 and shot['carry_yards'] is None
    assert client.put(url,headers=auth_headers,json=data).json()==shot
    assert client.get(base,headers=auth_headers).json()==[shot]
    changed={**data,'expected_revision':1,'sequence':2,'end_lie':'green','penalties':1,'holed_out':True}
    saved=client.put(url,headers=auth_headers,json=changed).json()
    assert saved['revision']==2 and saved['holed_out'] and saved['penalties']==1
    stale=client.put(url,headers=auth_headers,json={**data,'end_lie':'sand'})
    assert stale.status_code==409
    assert client.get(f"/api/rounds/{round['id']}",headers=auth_headers).json()['holes'][0]['strokes'] is None


def test_removal_restore_and_manual_distances_affect_bag_stats(client,auth_headers,rated_course):
    base,url,data,_=setup_history(client,auth_headers,rated_course)
    data={**data,'source':'manual','start':None,'end':None,'total_yards':155,'start_lie':'green','end_lie':'green'}
    client.put(url,headers=auth_headers,json=data).raise_for_status()
    def count():
        profile=client.get('/api/stats/bag-profile',headers=auth_headers).json()
        return next(c for c in profile['clubs'] if c['club_id']==data['club_id'])['total']['count']
    assert count()==1
    removed=client.put(url,headers=auth_headers,json={**data,'expected_revision':1,'deleted':True}).json()
    assert removed['revision']==2 and count()==0
    assert client.get(base,headers=auth_headers).json()[0]['deleted'] is True
    restored=client.put(url,headers=auth_headers,json={**data,'expected_revision':2}).json()
    assert restored['revision']==3 and count()==1


def test_history_ownership_and_legacy_endpoints(client,auth_headers,rated_course,db_session):
    from app.models import User
    from app.security import create_access_token
    base,url,data,round=setup_history(client,auth_headers,rated_course)
    legacy={"club_id":data['club_id'],"hole_number":1,"start_lat":36,"start_lng":-78,"end_lat":36.001,"end_lng":-78}
    client_id=uuid4()
    old=client.put(f"/api/rounds/{round['id']}/device-shots/{client_id}",headers=auth_headers,json=legacy)
    assert old.status_code==200
    history=client.get(base,headers=auth_headers).json()
    assert history[0]['client_id']==str(client_id) and history[0]['start']['lat']==36
    assert history[0]['sequence'] is None and history[0]['start']['timestamp'] is None
    client.post(f"/api/rounds/{round['id']}/shots",headers=auth_headers,json=legacy).raise_for_status()
    assert len(client.get(base,headers=auth_headers).json())==2
    other=User(email='shot-history@test.local',display_name='Other',password_hash='unused');db_session.add(other);db_session.commit()
    headers={'Authorization':f'Bearer {create_access_token(other.email)}'}
    assert client.get(base,headers=headers).status_code==404
    assert client.put(url,headers=headers,json=data).status_code==404
    assert client.get(base).status_code==401
    client.delete(f"/api/rounds/{round['id']}",headers=auth_headers)
    assert client.get(base,headers=auth_headers).status_code==404


@pytest.mark.parametrize('changes',[
    {'penalties':-1},{'sequence':0},{'start_lie':'invented'},{'end':None},
    {'start':{'lat':100,'lng':0}},{'expected_revision':-1},{'total_yards':-5},
])
def test_invalid_history_payload(client,auth_headers,rated_course,changes):
    _,url,data,_=setup_history(client,auth_headers,rated_course)
    assert client.put(url,headers=auth_headers,json={**data,**changes}).status_code==422


def test_unknown_order_missing_positions_and_club_label_snapshot(client,auth_headers,rated_course):
    base,url,data,_=setup_history(client,auth_headers,rated_course)
    data={**data,'sequence':None,'start':None,'end':None,'total_yards':140}
    saved=client.put(url,headers=auth_headers,json=data).json()
    client.patch(f"/api/clubs/{data['club_id']}",headers=auth_headers,json={'label':'Renamed club'}).raise_for_status()
    replay=client.get(base,headers=auth_headers).json()[0]
    assert replay['club_label']==saved['club_label']
    assert replay['start'] is None and replay['sequence'] is None and replay['total_yards']==140
