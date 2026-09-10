from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from typing import Optional
from datetime import datetime, timedelta

from database import get_db
import models
import schemas
from auth import get_current_user, require_not_clinician
from instruments import INSTRUMENTS, compute_score, validate_responses

router = APIRouter()


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


@router.get("/instruments")
def get_instrument_definitions():
    return {
        key: {
            "name": inst["name"],
            "subject": inst["subject"],
            "description": inst["description"],
            "max_score": inst["max_score"],
            "stem": inst.get("stem"),
            "questions": inst["questions"],
        }
        for key, inst in INSTRUMENTS.items()
    }


@router.post("/", response_model=schemas.AssessmentResponse)
def create_assessment(
    body: schemas.AssessmentCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_not_clinician),
):
    _verify_patient(body.patient_id, current_user, db)

    if body.instrument_key not in INSTRUMENTS:
        raise HTTPException(status_code=422, detail=f"Unknown instrument_key: {body.instrument_key}")

    if body.completion_mode is not None:
        if body.instrument_key != "phq9":
            raise HTTPException(status_code=422, detail="completion_mode is only valid for phq9")
        if body.completion_mode not in ("self", "assisted"):
            raise HTTPException(status_code=422, detail="completion_mode must be 'self' or 'assisted'")

    try:
        validate_responses(body.instrument_key, body.responses)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    score = compute_score(body.instrument_key, body.responses)
    instrument = INSTRUMENTS[body.instrument_key]

    assessment = models.Assessment(
        patient_id=body.patient_id,
        caregiver_id=current_user.id,
        instrument_key=body.instrument_key,
        responses=body.responses,
        computed_score=score,
        max_score=instrument["max_score"],
        completion_mode=body.completion_mode if body.instrument_key == "phq9" else None,
    )
    db.add(assessment)
    db.commit()
    db.refresh(assessment)
    return assessment


@router.get("/{patient_id}", response_model=list[schemas.AssessmentResponse])
def get_assessments(
    patient_id: int,
    instrument_key: Optional[str] = Query(default=None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _verify_patient(patient_id, current_user, db)

    query = db.query(models.Assessment).filter(models.Assessment.patient_id == patient_id)
    if instrument_key:
        query = query.filter(models.Assessment.instrument_key == instrument_key)
    return query.order_by(models.Assessment.created_at.asc()).all()


@router.get("/{patient_id}/status")
def get_assessment_status(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _verify_patient(patient_id, current_user, db)

    # "Account age" is measured from the caregiver's account creation, since
    # Patient has no created_at column.
    account_age_days = (datetime.utcnow() - current_user.created_at).days

    results = []
    for key, inst in INSTRUMENTS.items():
        last = (
            db.query(models.Assessment)
            .filter(
                models.Assessment.patient_id == patient_id,
                models.Assessment.instrument_key == key,
            )
            .order_by(models.Assessment.created_at.desc())
            .first()
        )
        last_taken_at = last.created_at if last else None

        if last_taken_at is None:
            due = account_age_days >= inst["first_due_day"]
        else:
            due = (datetime.utcnow() - last_taken_at) > timedelta(days=inst["cadence_days"])

        results.append({
            "instrument_key": key,
            "name": inst["name"],
            "description": inst["description"],
            "last_taken_at": last_taken_at,
            "due": due,
        })

    return results
