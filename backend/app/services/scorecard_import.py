"""Preview/apply the same signed card, without refetching between user actions."""
import hashlib
import json

from sqlalchemy.orm import Session

from app.models import Course, Hole, TeeSet, TeeRating
from app.schemas.scorecard import ScorecardData


def state(db: Session, course: Course) -> dict:
    holes = db.query(Hole).filter_by(course_id=course.id).order_by(Hole.number, Hole.id).all()
    tees = db.query(TeeSet).filter_by(course_id=course.id).order_by(TeeSet.id).all()
    return {'course': [course.id, course.name, course.osm_id, course.scorecard_source],
            'holes': [{'id': h.id, 'number': h.number, 'par': h.par, 'stroke_index': h.stroke_index} for h in holes],
            'tees': [{'id': t.id, 'key': t.source_key, 'name': t.name, 'yardage': t.yardage,
                      'ratings': sorted([{'scope': r.scope, 'course_rating': r.course_rating,
                                          'slope_rating': r.slope_rating, 'par': r.par} for r in t.ratings], key=lambda r: r['scope'])} for t in tees]}


def fingerprint(current: dict) -> str:
    return hashlib.sha256(json.dumps(current, sort_keys=True).encode()).hexdigest()


def existing_tee(tees, card, tee):
    key = f'{card.source_id}:{tee.key}'
    matches = [t for t in tees if t['key'] == key]
    if not matches:
        matches = [t for t in tees if t['key'] is None and t['name'].casefold() == tee.name.casefold()]
    if len(matches) > 1:
        raise ValueError(f'Multiple existing tees match {tee.name}. Rename duplicates before importing.')
    return matches[0] if matches else None


def conflicts(current: dict, card: ScorecardData) -> list[str]:
    holes = {h['number']: h for h in current['holes']}
    if len(holes) != len(current['holes']) or set(holes) - set(range(1, 19)):
        raise ValueError('The saved course has ambiguous hole numbering. Resolve it before importing.')
    changes = []
    for incoming in card.holes:
        old = holes.get(incoming.number)
        if old:
            for field in ('par', 'stroke_index'):
                if old[field] is not None and old[field] != getattr(incoming, field):
                    changes.append(f'Hole {incoming.number}: {field.replace("_", " ")} {old[field]} → {getattr(incoming, field)}')
    for tee in card.tees:
        old = existing_tee(current['tees'], card, tee)
        if not old:
            continue
        if old['name'] != tee.name or old['yardage'] is not None and old['yardage'] != tee.yardage:
            changes.append(f'{tee.name}: update saved name/yardage')
        old_ratings = {r['scope']: r for r in old['ratings']}
        for rating in tee.ratings:
            if rating.scope in old_ratings and old_ratings[rating.scope] != rating.model_dump():
                changes.append(f'{tee.name}: replace saved {rating.scope} rating')
    return changes


def apply_card(db: Session, course: Course, card: ScorecardData, current: dict):
    by_number = {h.number: h for h in db.query(Hole).filter_by(course_id=course.id).all()}
    for incoming in card.holes:
        hole = by_number.get(incoming.number)
        if hole is None:
            hole = Hole(course_id=course.id, number=incoming.number)
            db.add(hole)
        hole.par, hole.stroke_index = incoming.par, incoming.stroke_index
    for incoming in card.tees:
        old = existing_tee(current['tees'], card, incoming)
        tee = db.get(TeeSet, old['id']) if old else TeeSet(course_id=course.id)
        tee.source_key = f'{card.source_id}:{incoming.key}'
        tee.name, tee.yardage = incoming.name, incoming.yardage
        db.add(tee)
        db.flush()
        by_scope = {r.scope: r for r in tee.ratings}
        for value in incoming.ratings:
            rating = by_scope.get(value.scope) or TeeRating(tee_set_id=tee.id, scope=value.scope)
            rating.course_rating, rating.slope_rating, rating.par = value.course_rating, value.slope_rating, value.par
            db.add(rating)
    course.scorecard_source = card.source_id
    course.scorecard_imported_at = card.retrieved_at
    course.scorecard_urls = card.source_urls
    db.commit()
