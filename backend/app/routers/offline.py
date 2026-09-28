"""Idempotent whole-scorecard sync with optimistic concurrency."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field, model_validator
from sqlalchemy.orm import Session
from app.database import get_db
from app.deps import get_current_user
from app.models import User
from app.routers.rounds import _owned_round, _round_out
from app.schemas.round import RoundHoleIn, RoundOut, RoundUpdate

router = APIRouter(prefix="/rounds", tags=["offline scoring"])


class OfflineSync(BaseModel):
    expected_revision: int = Field(ge=1)
    details: RoundUpdate
    holes: list[RoundHoleIn] = Field(min_length=9, max_length=18)

    @model_validator(mode="after")
    def complete(self):
        if len({h.number for h in self.holes}) != len(self.holes):
            raise ValueError("Duplicate hole numbers")
        if self.details.model_fields_set - {"green_notes"} != {"date", "notes", "status", "current_hole"}:
            raise ValueError("Send the complete round details")
        return self


@router.put("/{round_id}/sync", response_model=RoundOut)
def sync_round(round_id: int, payload: OfflineSync, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    round = _owned_round(db, round_id, user)
    rows = {row.hole.number: row for row in round.holes}
    if set(rows) != {h.number for h in payload.holes} or payload.details.current_hole not in rows:
        raise HTTPException(422, "The scorecard must contain exactly the holes played in this round")
    details = payload.details.model_dump(exclude_unset=True)
    if payload.details.green_notes and not {int(n) for n in payload.details.green_notes}.issubset(rows):
        raise HTTPException(422, "Green notes must refer to a hole in this round")
    scores = {h.number: h.model_dump(exclude={"number"}) for h in payload.holes}
    same = all(getattr(round, k) == v for k, v in details.items()) and all(
        getattr(rows[n], k) == v for n, values in scores.items() for k, v in values.items())
    # A lost success response can be safely retried without applying a second edit.
    if same:
        return _round_out(db, round)
    if round.revision != payload.expected_revision:
        raise HTTPException(409, "This round changed on the server. Review both scorecards before syncing.")
    for key, value in details.items():
        setattr(round, key, value)
    for number, values in scores.items():
        for key, value in values.items():
            setattr(rows[number], key, value)
    round.revision += 1
    db.commit()
    return _round_out(db, round)


# A preparation token authenticates course data, never the API session. It has
# no expiry so a saved card remains usable; rotating the server secret revokes it.
from datetime import date
from uuid import UUID
from jose import JWTError, jwt
from sqlalchemy.exc import IntegrityError
from app.config import settings
from app.models import Course, Hole, Round, RoundHole, TeeSet
from app.routers.courses import _course_out
from app.routers.rounds import _snapshot_rating
from app.schemas.round import RoundCreate
from app.stats.handicap.scope import scope_for, covers_hole


@router.post('/offline/prepare')
def prepare_course(payload: RoundCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    course = db.get(Course, payload.course_id)
    if course is None:
        raise HTTPException(404, 'Course not found')
    if course.archived_at:
        raise HTTPException(409, 'Restore this course before downloading it')
    scope = scope_for(payload.hole_count, payload.nine)
    holes = sorted((h for h in course.holes if covers_hole(scope, h.number)), key=lambda h: h.number)
    expected = list(range(10, 19) if scope == 'back9' else range(1, 10) if scope == 'front9' else range(1, 19))
    if [h.number for h in holes] != expected or any(h.par not in (3, 4, 5, 6) for h in holes):
        raise HTTPException(422, 'Complete the selected holes and pars before downloading')
    cr, slope, par = _snapshot_rating(db, payload.tee_set_id, course.id, scope)
    tee = db.get(TeeSet, payload.tee_set_id) if payload.tee_set_id else None
    snapshot = dict(course_id=course.id, course_name=course.name, tee_set_id=payload.tee_set_id,
                    tee_name=tee.name if tee else None, hole_count=payload.hole_count, nine=payload.nine,
                    course_rating=cr, slope_rating=slope, course_par=par,
                    hole_yardages={k:v for k,v in (tee.hole_yardages if tee else {}).items() if int(k) in expected})
    hole_data = [dict(id=h.id, number=h.number, par=h.par, stroke_index=h.stroke_index) for h in holes]
    token = jwt.encode(dict(purpose='offline-round', sub=str(user.id), snapshot=snapshot, holes=hole_data), settings.secret_key, algorithm='HS256')
    template = dict(**snapshot, id=0, revision=1, date=date.today(), notes='', deleted_at=None,
                    status='in_progress', current_hole=expected[0], holes=[dict(hole_number=h.number, par=h.par, strokes=None, putts=None, fairway_hit=None, penalties=0) for h in holes])
    return dict(token=token, round=template, course=_course_out(db, course))


class DeviceRoundCreate(BaseModel):
    client_id: UUID
    token: str = Field(max_length=50000)
    date: date


@router.post('/offline/create', response_model=RoundOut, status_code=201)
def create_device_round(payload: DeviceRoundCreate, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    key = f'{user.id}:{payload.client_id}'
    existing = db.query(Round).filter_by(device_key=key).one_or_none()
    if existing:
        return _round_out(db, _owned_round(db, existing.id, user))
    try:
        signed = jwt.decode(payload.token, settings.secret_key, algorithms=['HS256'])
        if signed.get('purpose') != 'offline-round' or signed.get('sub') != str(user.id):
            raise ValueError('Wrong owner or token purpose')
        snapshot, holes = signed['snapshot'], signed['holes']
    except (JWTError, ValueError, KeyError) as exc:
        raise HTTPException(422, 'The downloaded course could not be verified by this server. Keep your backup and download the course again.') from exc
    # Archiving and later course/tee edits do not rewrite a round already played
    # using a prepared card. Removed holes cannot be silently remapped.
    for h in holes:
        live = db.get(Hole, h['id'])
        if live is None or live.course_id != snapshot['course_id'] or live.number != h['number']:
            raise HTTPException(409, 'Course holes were removed since download. Keep your device backup; this round needs course repair before syncing.')
    tee = db.get(TeeSet, snapshot['tee_set_id']) if snapshot['tee_set_id'] else None
    snapshot['tee_set_id'] = tee.id if tee and tee.course_id == snapshot['course_id'] else None
    r = Round(**snapshot, user_id=user.id, device_key=key, date=payload.date, status='in_progress', current_hole=holes[0]['number'])
    db.add(r)
    try:
        db.flush()
        for h in holes:
            db.add(RoundHole(round_id=r.id, hole_id=h['id'], par=h['par'], stroke_index=h['stroke_index']))
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(Round).filter_by(device_key=key).one_or_none()
        if existing:
            return _round_out(db, _owned_round(db, existing.id, user))
        raise
    return _round_out(db, r)


from app.models import Club, Shot
from app.schemas.shot import RoundShotCreate, ShotOut
from app.stats.geo import haversine_yards


class DeviceShot(RoundShotCreate):
    start_lat: float = Field(ge=-90, le=90)
    start_lng: float = Field(ge=-180, le=180)
    end_lat: float = Field(ge=-90, le=90)
    end_lng: float = Field(ge=-180, le=180)
    hole_number: int = Field(ge=1, le=18)
    accuracy: str | None = Field(default=None, max_length=100)


@router.put('/{round_id}/device-shots/{client_id}', response_model=ShotOut)
def sync_device_shot(round_id: int, client_id: UUID, payload: DeviceShot, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    r = _owned_round(db, round_id, user)
    key = f'{user.id}:{round_id}:{client_id}'
    existing = db.query(Shot).filter_by(round_id=round_id, client_id=str(client_id)).one_or_none()
    if existing:
        return existing
    if not any(h.hole.number == payload.hole_number for h in r.holes):
        raise HTTPException(422, 'This hole is not in the round')
    club = db.get(Club, payload.club_id)
    if not club or club.user_id != user.id:
        raise HTTPException(404, 'Club not found. Keep the device shot and restore its club before syncing.')
    shot = Shot(device_key=key, round_id=r.id, hole_number=payload.hole_number, club_id=club.id,
        client_id=str(client_id), club_label=club.label,
        start_position={"lat":payload.start_lat,"lng":payload.start_lng,"accuracy":None,"timestamp":None},
        end_position={"lat":payload.end_lat,"lng":payload.end_lng,"accuracy":None,"timestamp":None},
                total_yards=haversine_yards(payload.start_lat, payload.start_lng, payload.end_lat, payload.end_lng),
                direction=payload.direction, source='gps', accuracy=payload.accuracy)
    db.add(shot)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        existing = db.query(Shot).filter_by(round_id=round_id, client_id=str(client_id)).one_or_none()
        if existing:
            return existing
        raise
    db.refresh(shot)
    return shot
