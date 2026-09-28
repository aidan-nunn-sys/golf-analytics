"""Portable scorecards and repairs; preserve referenced hole IDs and round data."""
import csv
import io
import json
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_user
from app.models import Course, Hole, RoundHole, TeeSet, TeeRating, User
from app.routers.courses import _course_out
from app.routers.tees import _course_or_404
from app.schemas.course import CourseOut
from app.schemas.course_document import CourseDocument, CourseRepair, FileImport

router = APIRouter(prefix="/courses", tags=["course library"])


def parse_file(payload: FileImport) -> CourseDocument:
    try:
        if payload.format == "json":
            return CourseDocument.model_validate_json(payload.content)
        reader = csv.DictReader(io.StringIO(payload.content.lstrip("\ufeff")))
        required = {"course", "hole", "par"}
        allowed = required | {"stroke_index", "tee", "yardage", "green_lat", "green_lng"}
        fields = reader.fieldnames or []
        if not required.issubset(fields) or len(fields) != len(set(fields)) or set(fields) - allowed:
            raise ValueError("CSV headers: course,hole,par,stroke_index,tee,yardage,green_lat,green_lng (only course,hole,par are required)")
        name, holes, tees, seen = None, {}, {}, set()
        for line, row in enumerate(reader, 2):
            if line > 550:
                raise ValueError("Too many CSV rows; maximum 549")
            if None in row or any(value is None for value in row.values()):
                raise ValueError(f"Row {line}: wrong number of columns")
            row = {k: v.strip() for k, v in row.items()}
            if not row["course"] or (name is not None and row["course"] != name):
                raise ValueError(f"Row {line}: use one non-empty course name per file")
            name = row["course"]
            number = int(row["hole"])
            hole = {"number": number, "par": int(row["par"]) if row["par"] else None,
                    "stroke_index": int(row["stroke_index"]) if row.get("stroke_index") else None,
                    "green_lat": float(row["green_lat"]) if row.get("green_lat") else None,
                    "green_lng": float(row["green_lng"]) if row.get("green_lng") else None}
            if number in holes and holes[number] != hole:
                raise ValueError(f"Row {line}: conflicting details for hole {number}")
            holes[number] = hole
            tee = row.get("tee", "")
            key = (number, tee.casefold())
            if key in seen:
                raise ValueError(f"Row {line}: duplicate hole/tee")
            seen.add(key)
            if row.get("yardage") and not tee:
                raise ValueError(f"Row {line}: a yardage needs a tee name")
            if tee:
                target = tees.setdefault(tee, {"name": tee, "hole_yardages": {}})
                if row.get("yardage"):
                    target["hole_yardages"][str(number)] = int(row["yardage"])
        for tee in tees.values():
            if len(tee["hole_yardages"]) == len(holes):
                tee["yardage"] = sum(tee["hole_yardages"].values())
        return CourseDocument(name=name, holes=list(holes.values()), tees=list(tees.values()))
    except (ValueError, TypeError, csv.Error, ValidationError) as exc:
        raise HTTPException(422, str(exc)) from exc


def duplicates(db: Session, name: str):
    return [{"id": c.id, "name": c.name, "archived": c.archived_at is not None}
            for c in db.scalars(select(Course)) if c.name.strip().casefold() == name.casefold()]


@router.post("/file/preview")
def preview_file(payload: FileImport, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    card = parse_file(payload)
    warnings = []
    if len(card.holes) not in (9, 18) or any(h.par is None for h in card.holes):
        warnings.append("This scorecard needs repair before you can start a complete round.")
    if not any(t.ratings for t in card.tees):
        warnings.append("No course/slope ratings supplied. Add verified ratings to enable handicap calculations.")
    return {"card": card, "duplicates": duplicates(db, card.name), "warnings": warnings}


@router.post("/file/apply", response_model=CourseOut, status_code=201)
def apply_file(payload: FileImport, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    card = parse_file(payload)
    if duplicates(db, card.name) and not payload.allow_duplicate:
        raise HTTPException(409, "A course with this name already exists. Review it or confirm importing another copy.")
    course = Course(name=card.name, import_source="manual")
    db.add(course)
    db.flush()
    for hole in card.holes:
        db.add(Hole(course_id=course.id, **hole.model_dump()))
    for value in card.tees:
        tee = TeeSet(course_id=course.id, **value.model_dump(exclude={"ratings"}))
        db.add(tee)
        db.flush()
        for rating in value.ratings:
            db.add(TeeRating(tee_set_id=tee.id, **rating.model_dump()))
    db.commit()
    return _course_out(db, course)


@router.get("/{course_id}/export")
def export_course(course_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    course = _course_or_404(db, course_id)
    return dict(version=1, name=course.name,
        holes=[{k: getattr(h, k) for k in ("number", "par", "stroke_index", "green_lat", "green_lng")} for h in course.holes],
        tees=[{"name": t.name, "yardage": t.yardage, "hole_yardages": t.hole_yardages,
            "ratings": [{k: getattr(r, k) for k in ("scope", "course_rating", "slope_rating", "par")} for r in t.ratings]}
            for t in db.scalars(select(TeeSet).where(TeeSet.course_id == course_id))])


@router.put("/{course_id}/details", response_model=CourseOut)
def repair_course(course_id: int, payload: CourseRepair, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    course = _course_or_404(db, course_id)
    existing = {h.number: h for h in course.holes}
    incoming = {h.number for h in payload.holes}
    removed = [h for n, h in existing.items() if n not in incoming]
    if removed and db.scalar(select(RoundHole.id).where(RoundHole.hole_id.in_([h.id for h in removed])).limit(1)):
        raise HTTPException(409, "A removed hole is used by a round. Keep its number or create a separate course layout.")
    course.name = payload.name
    for hole in removed:
        db.delete(hole)
    for value in payload.holes:
        hole = existing.get(value.number)
        if hole is None:
            hole = Hole(course_id=course.id, number=value.number)
            db.add(hole)
        for key, val in value.model_dump().items():
            setattr(hole, key, val)
    pars = {h.number: h.par for h in payload.holes}
    for tee in db.scalars(select(TeeSet).where(TeeSet.course_id == course_id)):
        if set(existing) != incoming:
            tee.hole_yardages = {n: y for n, y in tee.hole_yardages.items() if int(n) in incoming}
            tee.yardage = sum(tee.hole_yardages.values()) if len(tee.hole_yardages) == len(incoming) else None
        for rating in list(tee.ratings):
            numbers = set(range(1, 19) if rating.scope == "18" else range(1, 10) if rating.scope == "front9" else range(10, 19))
            if not numbers.issubset(pars) or any(pars[n] is None for n in numbers) or sum(pars[n] for n in numbers) != rating.par:
                db.delete(rating)
    # Edited scorecards no longer claim to match the official imported source.
    course.scorecard_source = None
    course.scorecard_imported_at = None
    course.scorecard_urls = None
    db.commit()
    return _course_out(db, course)


@router.post("/{course_id}/archive", response_model=CourseOut)
def archive_course(course_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    course = _course_or_404(db, course_id)
    course.archived_at = course.archived_at or datetime.now(timezone.utc)
    db.commit()
    return _course_out(db, course)


@router.post("/{course_id}/restore", response_model=CourseOut)
def restore_course(course_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    course = _course_or_404(db, course_id)
    course.archived_at = None
    db.commit()
    return _course_out(db, course)
