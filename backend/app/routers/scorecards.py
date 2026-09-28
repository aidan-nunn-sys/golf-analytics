from datetime import datetime, timedelta, timezone

import httpx
from fastapi import APIRouter, Depends, HTTPException
from jose import JWTError, jwt
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_user
from app.integrations.scorecards import SOURCES, fetch_scorecard
from app.models import Course, User
from app.routers.courses import _course_out
from app.schemas.course import CourseOut
from app.schemas.scorecard import ScorecardApply, ScorecardData, ScorecardPreview, ScorecardRequest
from app.services.scorecard_import import apply_card, conflicts, fingerprint, state

router = APIRouter(tags=['scorecards'])


def course_for(db, course_id):
    course = db.get(Course, course_id)
    if course is None:
        raise HTTPException(404, 'Course not found')
    return course


@router.get('/scorecard-sources')
def sources(user: User = Depends(get_current_user)):
    return SOURCES


@router.post('/courses/{course_id}/scorecard/preview', response_model=ScorecardPreview)
def preview(course_id: int, payload: ScorecardRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    course = course_for(db, course_id)
    source = next(s for s in SOURCES if s['id'] == payload.source_id)
    if course.osm_id and course.osm_id != source['osm_id']:
        raise HTTPException(422, 'This source does not match the mapped course. Choose the correct course/layout.')
    if course.scorecard_source and course.scorecard_source != payload.source_id:
        raise HTTPException(422, 'This course is already linked to a different scorecard source.')
    try:
        card = fetch_scorecard(payload.source_id)
        current = state(db, course)
        changes = conflicts(current, card)
    except httpx.HTTPError as exc:
        raise HTTPException(503, 'The official course website is unavailable. Your saved course is unchanged; try again later.') from exc
    except (ValueError, KeyError, IndexError) as exc:
        raise HTTPException(422, 'The official scorecard could not be safely imported. Check the source layout and try manual setup. ' + str(exc)) from exc
    token = jwt.encode({'purpose': 'scorecard-import', 'sub': str(user.id), 'course_id': course_id,
                        'fingerprint': fingerprint(current), 'card': card.model_dump(mode='json'),
                        'exp': datetime.now(timezone.utc) + timedelta(minutes=15)}, settings.secret_key, algorithm='HS256')
    return ScorecardPreview(card=card, conflicts=changes, token=token)


@router.post('/courses/{course_id}/scorecard/apply', response_model=CourseOut)
def apply(course_id: int, payload: ScorecardApply, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    course = course_for(db, course_id)
    try:
        signed = jwt.decode(payload.token, settings.secret_key, algorithms=['HS256'])
        if signed.get('purpose') != 'scorecard-import' or signed.get('sub') != str(user.id) or signed.get('course_id') != course_id:
            raise ValueError('Wrong preview')
        card = ScorecardData.model_validate(signed['card'])
    except (JWTError, ValueError, KeyError) as exc:
        raise HTTPException(422, 'This preview expired or is invalid. Fetch a new preview.') from exc
    current = state(db, course)
    if signed.get('fingerprint') != fingerprint(current):
        raise HTTPException(409, 'The course changed since this preview. Fetch a new preview to keep those edits safe.')
    changes = conflicts(current, card)
    if changes and not payload.replace_conflicts:
        raise HTTPException(409, 'Review and accept the listed changes before replacing saved values.')
    try:
        apply_card(db, course, card, current)
    except IntegrityError as exc:
        db.rollback()
        raise HTTPException(409, 'The course was updated concurrently. Fetch a new preview.') from exc
    return _course_out(db, course)
