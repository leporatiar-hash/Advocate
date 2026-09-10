from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from sqlalchemy.orm import Session, defer
from typing import List, Optional
from datetime import datetime, timedelta, date as date_type

from database import get_db
import models
import schemas
from auth import get_current_user, require_not_clinician

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


def _client_today(date_str: Optional[str]) -> date_type:
    """The caller's local calendar date, falling back to server time when the
    client didn't send one (or sent something unparseable)."""
    if date_str:
        try:
            return datetime.strptime(date_str, "%Y-%m-%d").date()
        except ValueError:
            pass
    return datetime.now().date()


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
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_not_clinician),
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
        log = existing
    else:
        log = models.DailyLog(
            patient_id=log_data.patient_id,
            logged_by=current_user.id,
            date=log_data.date,
            **fields,
        )
        db.add(log)
        db.commit()
        db.refresh(log)

    # Demo-only: the clinician timeline's headline and domain summaries are
    # generated on write and cached (see services/timeline_ai.py), never on
    # page load. Gated on is_demo so a real caregiver's log save never spends
    # an OpenAI call or a background task on this — it's dead weight for
    # every patient this feature doesn't apply to.
    #
    # Debounce: one regeneration is 4 windows x 7 calls = ~29 OpenAI calls
    # (see regenerate_timeline_cache's docstring). A caregiver saving several
    # fields in quick succession, or catching up on a run of backfilled days,
    # would otherwise fire one full regeneration per save. If a regeneration
    # is already in flight (`pending`), skip scheduling another — the
    # in-flight one will pick up this save's data on the NEXT save instead of
    # duplicating work for a save that landed a few seconds apart. This is a
    # concurrency cap, not a real delayed-coalescing debounce (FastAPI's
    # BackgroundTasks has no delay/cancel primitive to build one on); a
    # pilot with real traffic should replace this with an actual task queue
    # (e.g. a few seconds of coalescing per patient) rather than stretching
    # this further.
    if patient.is_demo:
        already_pending = (
            db.query(models.TimelineCache.id)
            .filter(models.TimelineCache.patient_id == patient.id, models.TimelineCache.pending == True)  # noqa: E712
            .first()
        )
        if not already_pending:
            from services.timeline_ai import regenerate_timeline_cache
            background_tasks.add_task(regenerate_timeline_cache, patient.id)

    return log


@router.get("/{patient_id}/today", response_model=Optional[schemas.DailyLogResponse])
def get_today_log(
    patient_id: int,
    date: Optional[str] = Query(default=None, description="Client local date YYYY-MM-DD"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _verify_patient(patient_id, current_user, db)

    today = _client_today(date)
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
    date: Optional[str] = Query(default=None, description="Client local date YYYY-MM-DD"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _verify_patient(patient_id, current_user, db)

    # Must be the caregiver's local date, not the server's. On a UTC server, a
    # caregiver east or west of UTC has already rolled into the next server day
    # while their own day is still open — computing "yesterday" from server time
    # would report their current, still-loggable day as missed.
    today = _client_today(date)
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
    current_user: models.User = Depends(require_not_clinician),
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
    current_user: models.User = Depends(require_not_clinician),
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
