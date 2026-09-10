from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from typing import List

from database import get_db
from models import SavedSummary, Patient
from schemas import SavedSummaryCreate, SavedSummaryResponse
from auth import get_current_user, require_not_clinician
from models import User

router = APIRouter()


@router.post("/save", response_model=SavedSummaryResponse, status_code=201)
def save_summary(
    data: SavedSummaryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_not_clinician),
):
    patient = db.query(Patient).filter(
        Patient.id == data.patient_id,
        Patient.caregiver_id == current_user.id,
    ).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    record = SavedSummary(
        user_id=current_user.id,
        patient_id=data.patient_id,
        title=data.title,
        content=data.content,
        date_range_start=data.date_range_start,
        date_range_end=data.date_range_end,
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return record


@router.get("/", response_model=List[SavedSummaryResponse])
def get_saved_summaries(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return (
        db.query(SavedSummary)
        .filter(SavedSummary.user_id == current_user.id)
        .order_by(SavedSummary.created_at.desc())
        .all()
    )


@router.delete("/{summary_id}", status_code=204)
def delete_saved_summary(
    summary_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_not_clinician),
):
    record = db.query(SavedSummary).filter(
        SavedSummary.id == summary_id,
        SavedSummary.user_id == current_user.id,
    ).first()
    if not record:
        raise HTTPException(status_code=404, detail="Summary not found")
    db.delete(record)
    db.commit()
