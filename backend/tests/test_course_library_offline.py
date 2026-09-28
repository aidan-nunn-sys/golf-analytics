import json
import pytest


def card(name='Cedar Course'):
    return {'version':1,'name':name,'holes':[{'number':n,'par':4,'stroke_index':n} for n in range(1,19)],
        'tees':[{'name':'Blue','yardage':6300,'hole_yardages':{str(n):350 for n in range(1,19)},
                 'ratings':[{'scope':'18','par':72,'course_rating':71.2,'slope_rating':120}]}]}


def payload(document):
    return {'format':'json','content':json.dumps(document)}


def test_preview_apply_export_duplicate(client,auth_headers):
    data=payload(card())
    preview=client.post('/api/courses/file/preview',json=data,headers=auth_headers)
    assert preview.status_code==200,preview.text
    assert client.get('/api/courses/library',headers=auth_headers).json()==[]
    response=client.post('/api/courses/file/apply',json=data,headers=auth_headers)
    assert response.status_code==201,response.text
    cid=response.json()['id']
    exported=client.get(f'/api/courses/{cid}/export',headers=auth_headers)
    assert exported.status_code==200,exported.text
    assert exported.json()==preview.json()['card']
    assert client.post('/api/courses/file/apply',json=data,headers=auth_headers).status_code==409
    assert client.post('/api/courses/file/preview',json=data,headers=auth_headers).json()['duplicates'][0]['id']==cid
    assert client.post('/api/courses/file/apply',json={**data,'allow_duplicate':True},headers=auth_headers).status_code==201


def test_csv_multiple_tees(client,auth_headers):
    content='course,hole,par,stroke_index,tee,yardage\nCedar,1,4,1,Blue,360\nCedar,1,4,1,White,320\nCedar,2,3,2,Blue,170\nCedar,2,3,2,White,140'
    response=client.post('/api/courses/file/preview',json={'format':'csv','content':content},headers=auth_headers)
    assert response.status_code==200,response.text
    assert response.json()['card']['tees'][0]['yardage']==530
    for invalid in [content+'\nCedar,1,4,1,Blue,360',content.replace('Cedar,2,3,2,White','Cedar,2,5,2,White'),'course,hole,par,unexpected\nCedar,1,4,x']:
        assert client.post('/api/courses/file/apply',json={'format':'csv','content':invalid},headers=auth_headers).status_code==422
    assert client.get('/api/courses/library',headers=auth_headers).json()==[]


@pytest.mark.parametrize('modify',[
    lambda c:c['holes'].append(c['holes'][0]),lambda c:c['holes'][0].update(green_lat=91,green_lng=0),
    lambda c:c['holes'][0].update(green_lat=0),lambda c:c['tees'][0]['hole_yardages'].update({'19':100}),
    lambda c:c['tees'][0].update(yardage=100),lambda c:c['tees'][0]['ratings'][0].update(par=71),lambda c:c.update(version=2)])
def test_invalid_import_atomic(client,auth_headers,modify):
    document=card();modify(document)
    response=client.post('/api/courses/file/apply',json=payload(document),headers=auth_headers)
    assert response.status_code==422,response.text
    assert client.get('/api/courses/library',headers=auth_headers).json()==[]


def test_repair_archive_and_tee_deletion_preserve_round(client,auth_headers):
    course=client.post('/api/courses/file/apply',json=payload(card()),headers=auth_headers).json();cid=course['id']
    tee=client.get(f'/api/courses/{cid}/tees',headers=auth_headers).json()[0]
    original=client.post('/api/rounds',json={'course_id':cid,'tee_set_id':tee['id']},headers=auth_headers).json()
    assert original['course_name']=='Cedar Course' and original['hole_yardages']['1']==350
    changed=card('Renamed');changed['holes'][0]['par']=5
    response=client.put(f'/api/courses/{cid}/details',json={k:changed[k] for k in ['name','holes']},headers=auth_headers)
    assert response.status_code==200,response.text
    assert response.json()['holes'][0]['id']==course['holes'][0]['id']
    assert client.get(f"/api/rounds/{original['id']}",headers=auth_headers).json()==original
    assert client.get(f'/api/courses/{cid}/tees',headers=auth_headers).json()[0]['ratings']==[]
    changed['holes'].pop()
    assert client.put(f'/api/courses/{cid}/details',json={k:changed[k] for k in ['name','holes']},headers=auth_headers).status_code==409
    assert client.post(f'/api/courses/{cid}/archive',headers=auth_headers).status_code==200
    assert client.get('/api/courses/library',headers=auth_headers).json()==[]
    assert client.get('/api/courses/library?archived=true',headers=auth_headers).json()[0]['id']==cid
    assert client.post('/api/rounds',json={'course_id':cid},headers=auth_headers).status_code==409
    assert client.get(f"/api/rounds/{original['id']}",headers=auth_headers).status_code==200
    assert client.post(f'/api/courses/{cid}/restore',headers=auth_headers).status_code==200
    assert client.delete(f"/api/tees/{tee['id']}",headers=auth_headers).status_code==204
    after=client.get(f"/api/rounds/{original['id']}",headers=auth_headers).json()
    assert after['tee_name']=='Blue' and after['course_rating']==original['course_rating'] and after['tee_set_id'] is None


def sync_payload(round):
    return {'expected_revision':round['revision'],'details':{k:round[k] for k in ['date','notes','status','current_hole']},
            'holes':[{'number':h['hole_number'],**{k:h[k] for k in ['strokes','putts','fairway_hit','penalties']}} for h in round['holes']]}


def test_sync_retry_conflict_and_ownership(client,auth_headers,rated_course,db_session):
    from app.models import User
    from app.security import create_access_token
    cid,tid=rated_course
    round=client.post('/api/rounds',json={'course_id':cid,'tee_set_id':tid},headers=auth_headers).json();url=f"/api/rounds/{round['id']}"
    data=sync_payload(round);data['holes'][0].update(strokes=5,putts=2);data['details']['notes']='Offline rain delay'
    saved=client.put(url+'/sync',json=data,headers=auth_headers)
    assert saved.status_code==200,saved.text
    assert saved.json()['revision']>round['revision']
    assert client.put(url+'/sync',json=data,headers=auth_headers).json()==saved.json()
    online=client.patch(url+'/holes/2',json={'strokes':3},headers=auth_headers).json()
    conflict=sync_payload(saved.json());conflict['holes'][2]['strokes']=6
    assert client.put(url+'/sync',json=conflict,headers=auth_headers).status_code==409
    assert client.get(url,headers=auth_headers).json()==online
    conflict['expected_revision']=online['revision']
    assert client.put(url+'/sync',json=conflict,headers=auth_headers).status_code==200
    other=User(email='other@golf.test',display_name='Other',password_hash='unused');db_session.add(other);db_session.commit()
    assert client.put(url+'/sync',json=conflict,headers={'Authorization':f'Bearer {create_access_token(other.email)}'}).status_code==404
    assert client.delete(url,headers=auth_headers).status_code==204
    assert client.put(url+'/sync',json=conflict,headers=auth_headers).status_code==404


def test_invalid_sync_no_partial_write(client,auth_headers,rated_course):
    round=client.post('/api/rounds',json={'course_id':rated_course[0]},headers=auth_headers).json();url=f"/api/rounds/{round['id']}"
    data=sync_payload(round);data['holes'][0].update(strokes=3,putts=4)
    assert client.put(url+'/sync',json=data,headers=auth_headers).status_code==422
    data['holes'][0].update(strokes=5);data['holes'].pop()
    assert client.put(url+'/sync',json=data,headers=auth_headers).status_code==422
    assert client.get(url,headers=auth_headers).json()==round


def test_tee_yardage_repair_validates_holes_and_totals(client,auth_headers,rated_course):
    cid,tid=rated_course
    url=f'/api/tees/{tid}'
    assert client.patch(url,json={'hole_yardages':{'19':300}},headers=auth_headers).status_code==422
    yards={str(n):350 for n in range(1,19)}
    assert client.patch(url,json={'hole_yardages':yards,'yardage':100},headers=auth_headers).status_code==422
    response=client.patch(url,json={'hole_yardages':yards,'yardage':6300},headers=auth_headers)
    assert response.status_code==200,response.text
    assert response.json()['hole_yardages']==yards


def test_concurrent_scorecard_update_rolls_back_stale_writer(client,auth_headers,rated_course,db_session):
    from sqlalchemy.orm import Session
    from sqlalchemy.orm.exc import StaleDataError
    from app.models import Round
    data=client.post('/api/rounds',json={'course_id':rated_course[0]},headers=auth_headers).json()
    with Session(db_session.bind) as first, Session(db_session.bind) as second:
        a=first.get(Round,data['id']);b=second.get(Round,data['id'])
        assert a.revision==b.revision
        a.holes[0].strokes=5;a.revision+=1;first.commit()
        b.holes[0].strokes=6;b.revision+=1
        with pytest.raises(StaleDataError):
            second.commit()
        second.rollback()
    after=client.get(f"/api/rounds/{data['id']}",headers=auth_headers).json()
    assert after['holes'][0]['strokes']==5
