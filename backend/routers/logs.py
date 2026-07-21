from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, defer
from typing import List, Optional
from datetime import datetime, timedelta, date as date_type

from database import get_db
import models
import schemas
from auth import get_current_user

router = APIRouter()

# All DailyLogResponse fields except `photo`, which is handled separately so
# list responses can defer loading it at the SQL level (see get_logs below).
_LOG_RESPONSE_FIELDS = [
    "id", "patient_id", "logged_by", "date", "medications_taken", "symptoms",
    "medication_side_effects", "sleep_hours", "mood_score", "water_intake_oz",
    "activities", "lifestyle", "notes", "episode", "vitals", "socialization",
    "log_type", "created_at",
]


def _serialize_log_field(value):
    """Convert Pydantic models in lists/dicts to plain dicts for JSON storage."""
    if isinstance(value, list):
        return [item.model_dump() if hasattr(item, "model_dump") else item for item in value]
    if hasattr(value, "model_dump"):
        return value.model_dump()
    return value


def _verify_patient(patient_id: int, current_user: models.User, db: Session) -> models.Patient:
    patient = (
        db.query(models.Patient)
        .filter(
            models.Patient.id == patient_id,
            models.Patient.caregiver_id == current_user.id,
        )
        .first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


@router.post("/", response_model=schemas.DailyLogResponse)
def create_or_update_log(
    log_data: schemas.DailyLogCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    patient = (
        db.query(models.Patient)
        .filter(
            models.Patient.id == log_data.patient_id,
            models.Patient.caregiver_id == current_user.id,
        )
        .first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    fields = {
        "medications_taken": _serialize_log_field(log_data.medications_taken),
        "symptoms": _serialize_log_field(log_data.symptoms),
        "medication_side_effects": _serialize_log_field(log_data.medication_side_effects),
        "sleep_hours": log_data.sleep_hours,
        "mood_score": log_data.mood_score,
        "water_intake_oz": log_data.water_intake_oz,
        "activities": _serialize_log_field(log_data.activities),
        "lifestyle": _serialize_log_field(log_data.lifestyle),
        "notes": log_data.notes,
        "episode": log_data.episode,
        "vitals": log_data.vitals,
        "photo": log_data.photo,
        "socialization": _serialize_log_field(log_data.socialization),
        "log_type": log_data.log_type or "detailed",
    }

    existing = (
        db.query(models.DailyLog)
        .filter(
            models.DailyLog.patient_id == log_data.patient_id,
            models.DailyLog.date == log_data.date,
        )
        .first()
    )

    if existing:
        for key, val in fields.items():
            setattr(existing, key, val)
        db.commit()
        db.refresh(existing)
        return existing

    log = models.DailyLog(
        patient_id=log_data.patient_id,
        logged_by=current_user.id,
        date=log_data.date,
        **fields,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.get("/{patient_id}/today", response_model=Optional[schemas.DailyLogResponse])
def get_today_log(
    patient_id: int,
    date: Optional[str] = Query(default=None, description="Client local date YYYY-MM-DD"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _verify_patient(patient_id, current_user, db)

    if date:
        try:
            today = datetime.strptime(date, "%Y-%m-%d").date()
        except ValueError:
            today = datetime.now().date()
    else:
        today = datetime.now().date()
    return (
        db.query(models.DailyLog)
        .filter(
            models.DailyLog.patient_id == patient_id,
            models.DailyLog.date == today,
        )
        .first()
    )


@router.get("/{patient_id}/missed-days")
def get_missed_days(
    patient_id: int,
    days: int = Query(default=30),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _verify_patient(patient_id, current_user, db)

    today = datetime.now().date()
    yesterday = today - timedelta(days=1)

    first_log = (
        db.query(models.DailyLog)
        .filter(models.DailyLog.patient_id == patient_id)
        .order_by(models.DailyLog.date.asc())
        .first()
    )
    if not first_log:
        return {"missed_days": []}

    # Only look for missed days after the first log, up to 'days' days back
    start = max(first_log.date + timedelta(days=1), today - timedelta(days=days))

    logged_dates = {
        row.date
        for row in db.query(models.DailyLog.date).filter(
            models.DailyLog.patient_id == patient_id,
            models.DailyLog.date >= start,
            models.DailyLog.date <= yesterday,
        ).all()
    }

    missed = []
    current = start
    while current <= yesterday:
        if current not in logged_dates:
            missed.append(str(current))
        current += timedelta(days=1)

    return {"missed_days": missed}


@router.get("/{patient_id}/date/{date_str}", response_model=Optional[schemas.DailyLogResponse])
def get_log_by_date(
    patient_id: int,
    date_str: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _verify_patient(patient_id, current_user, db)

    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    return (
        db.query(models.DailyLog)
        .filter(
            models.DailyLog.patient_id == patient_id,
            models.DailyLog.date == target_date,
        )
        .first()
    )


@router.post("/{patient_id}/quick", response_model=schemas.DailyLogResponse)
def quick_log(
    patient_id: int,
    body: schemas.QuickLogRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _verify_patient(patient_id, current_user, db)

    if body.type == "nothing_notable":
        fields: dict = {"log_type": "nothing_notable"}

    elif body.type == "catch_up_note":
        fields = {"log_type": "catch_up_note", "notes": (body.note or "").strip() or None}

    elif body.type == "same_as_yesterday":
        # Prefer the immediately preceding calendar day; fall back to most recent log before the target date
        prev_date = body.date - timedelta(days=1)
        previous = (
            db.query(models.DailyLog)
            .filter(
                models.DailyLog.patient_id == patient_id,
                models.DailyLog.date == prev_date,
            )
            .first()
        )
        if not previous:
            previous = (
                db.query(models.DailyLog)
                .filter(
                    models.DailyLog.patient_id == patient_id,
                    models.DailyLog.date < body.date,
                )
                .order_by(models.DailyLog.date.desc())
                .first()
            )

        if previous:
            fields = {
                "medications_taken": previous.medications_taken,
                "symptoms": previous.symptoms,
                "medication_side_effects": previous.medication_side_effects,
                "sleep_hours": previous.sleep_hours,
                "mood_score": previous.mood_score,
                "water_intake_oz": previous.water_intake_oz,
                "activities": previous.activities,
                "lifestyle": previous.lifestyle,
                "notes": previous.notes,
                "episode": previous.episode,
                "vitals": previous.vitals,
                "photo": None,  # photos are not carried forward
                "socialization": previous.socialization,
                "log_type": "same_as_yesterday",
            }
        else:
            fields = {"log_type": "nothing_notable"}
    else:
        raise HTTPException(status_code=400, detail="type must be 'same_as_yesterday', 'nothing_notable', or 'catch_up_note'")

    existing = (
        db.query(models.DailyLog)
        .filter(
            models.DailyLog.patient_id == patient_id,
            models.DailyLog.date == body.date,
        )
        .first()
    )

    if existing:
        for key, val in fields.items():
            setattr(existing, key, val)
        db.commit()
        db.refresh(existing)
        return existing

    log = models.DailyLog(
        patient_id=patient_id,
        logged_by=current_user.id,
        date=body.date,
        **fields,
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.patch("/{patient_id}/date/{date_str}/medication-taken")
def correct_medication_taken(
    patient_id: int,
    date_str: str,
    body: schemas.MedicationTakenCorrection,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Marks a single medication as taken for one day, without touching any
    other field on that day's log. Used by the summary page's "Something look
    wrong?" review flow to correct a mis-logged missed dose."""
    _verify_patient(patient_id, current_user, db)

    try:
        target_date = datetime.strptime(date_str, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD.")

    log = (
        db.query(models.DailyLog)
        .filter(
            models.DailyLog.patient_id == patient_id,
            models.DailyLog.date == target_date,
        )
        .first()
    )
    if not log:
        raise HTTPException(status_code=404, detail="No log found for that date")

    entries = log.medications_taken or []
    updated_entries = []
    found = False
    for entry in entries:
        if entry.get("medication_id") == body.medication_id:
            updated_entries.append({**entry, "taken": True})
            found = True
        else:
            updated_entries.append(entry)

    if not found:
        raise HTTPException(status_code=404, detail="No matching medication entry for that date")

    log.medications_taken = updated_entries
    db.commit()
    return {"success": True}


@router.get("/{patient_id}", response_model=List[schemas.DailyLogResponse])
def get_logs(
    patient_id: int,
    days: Optional[int] = Query(default=None, description="Only return logs from the last N days"),
    include_photo: bool = Query(default=False, description="Include base64 photo data in the response"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _verify_patient(patient_id, current_user, db)

    query = db.query(models.DailyLog).filter(models.DailyLog.patient_id == patient_id)
    if not include_photo:
        query = query.options(defer(models.DailyLog.photo))
    if days is not None:
        query = query.filter(models.DailyLog.date >= date_type.today() - timedelta(days=days))

    logs = query.order_by(models.DailyLog.date.desc()).all()

    # `photo` is deferred at the SQL level above when not requested. Building the
    # response from an explicit field list (rather than from_attributes on the
    # whole object) avoids touching `.photo`, which would otherwise trigger a
    # lazy per-row fetch and defeat the deferral.
    result = []
    for log in logs:
        data = {f: getattr(log, f) for f in _LOG_RESPONSE_FIELDS}
        data["photo"] = log.photo if include_photo else None
        result.append(schemas.DailyLogResponse(**data))
    return result
