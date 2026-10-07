"""Clinician-side tracking configuration — DEMO PATIENTS ONLY (Radial pilot).

The clinician role is read-only everywhere else (auth.require_not_clinician,
enforced by tests/test_clinician_write_guard.py). This router is the one
deliberate exception, and it is fenced exactly like the timeline: every
query filters on Patient.is_demo == True in the query itself, so a clinician
can never write a real caregiver's data, even by guessing an ID. A non-demo
patient and a nonexistent ID return the same 404.

Lets the clinician change everything the caregiver's Customize page can
(medications, symptoms, tracking modules, custom vitals, activities,
substances, dose timing, symptom scale, socialization, social contacts).
Config writes land on the demo patient's caregiver account, because that's
where the caregiver app reads them from — so a change here shows up in the
caregiver's daily log on the next load.
"""
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from database import get_db
import models
import schemas
from auth import get_current_clinician
from routers.social_contacts import MAX_CONTACTS, delete_contact_and_scrub_logs

router = APIRouter()

# The user_config keys the caregiver Customize page writes. Anything else
# (onboarding answers, dashboard layout, …) stays caregiver-only.
EDITABLE_CONFIG_KEYS = {
    "symptoms",
    "activities",
    "tracking_modules",
    "custom_vitals",
    "substance_fields",
    "dose_timing_mode",
    "symptom_scale",
    "show_socialization",
}


class DemoConfigResponse(BaseModel):
    patient_id: int
    patient_name: str
    user_config: Dict[str, Any]
    medications: List[schemas.MedicationResponse]
    contacts: List[schemas.SocialContactResponse]


def _get_demo_patient(patient_id: int, db: Session) -> models.Patient:
    # Single filtered query, never "find then check is_demo" — see the
    # matching note in routers/clinician_timeline.py.
    patient = (
        db.query(models.Patient)
        .filter(models.Patient.id == patient_id, models.Patient.is_demo == True)  # noqa: E712
        .first()
    )
    if not patient or patient.caregiver is None:
        raise HTTPException(status_code=404, detail="Not found")
    return patient


def _config_response(patient: models.Patient, db: Session) -> DemoConfigResponse:
    caregiver = patient.caregiver
    meds = [m for m in patient.medications if m.active]
    contacts = (
        db.query(models.SocialContact)
        .filter(models.SocialContact.user_id == caregiver.id)
        .order_by(models.SocialContact.name)
        .all()
    )
    return DemoConfigResponse(
        patient_id=patient.id,
        patient_name=patient.name,
        user_config=dict(caregiver.user_config or {}),
        medications=meds,
        contacts=contacts,
    )


@router.get("/patient/{patient_id}/config", response_model=DemoConfigResponse)
def get_demo_config(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_clinician),
):
    return _config_response(_get_demo_patient(patient_id, db), db)


@router.patch("/patient/{patient_id}/config", response_model=DemoConfigResponse)
def update_demo_config(
    patient_id: int,
    patch: schemas.UserConfigPatch,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_clinician),
):
    patient = _get_demo_patient(patient_id, db)
    disallowed = set(patch.updates) - EDITABLE_CONFIG_KEYS
    if disallowed:
        raise HTTPException(status_code=400, detail=f"Not editable: {sorted(disallowed)}")

    caregiver = patient.caregiver
    existing = dict(caregiver.user_config or {})
    existing.update(patch.updates)
    caregiver.user_config = existing
    flag_modified(caregiver, "user_config")
    db.commit()
    db.refresh(patient)
    return _config_response(patient, db)


@router.post("/patient/{patient_id}/medications", response_model=schemas.MedicationResponse)
def add_demo_medication(
    patient_id: int,
    med_data: schemas.MedicationCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_clinician),
):
    patient = _get_demo_patient(patient_id, db)
    if not med_data.name.strip():
        raise HTTPException(status_code=400, detail="Medication name is required")
    med = models.Medication(
        patient_id=patient.id,
        name=med_data.name.strip(),
        dose=med_data.dose,
        frequency=med_data.frequency,
        time_of_day=med_data.time_of_day,
    )
    db.add(med)
    db.commit()
    db.refresh(med)
    return med


@router.delete("/patient/{patient_id}/medications/{medication_id}", status_code=204)
def remove_demo_medication(
    patient_id: int,
    medication_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_clinician),
):
    patient = _get_demo_patient(patient_id, db)
    med = (
        db.query(models.Medication)
        .filter(models.Medication.id == medication_id, models.Medication.patient_id == patient.id)
        .first()
    )
    if not med:
        raise HTTPException(status_code=404, detail="Medication not found")
    # Soft delete, same as the caregiver route — past logs still reference it.
    med.active = False
    db.commit()


@router.post("/patient/{patient_id}/contacts", response_model=schemas.SocialContactResponse, status_code=201)
def add_demo_contact(
    patient_id: int,
    data: schemas.SocialContactCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_clinician),
):
    patient = _get_demo_patient(patient_id, db)
    caregiver_id = patient.caregiver_id
    count = db.query(models.SocialContact).filter(models.SocialContact.user_id == caregiver_id).count()
    if count >= MAX_CONTACTS:
        raise HTTPException(status_code=400, detail="Contact limit reached")
    name = data.name.strip()
    if not name or len(name) > 100:
        raise HTTPException(status_code=400, detail="Name must be between 1 and 100 characters")
    contact = models.SocialContact(user_id=caregiver_id, name=name)
    db.add(contact)
    db.commit()
    db.refresh(contact)
    return contact


@router.delete("/patient/{patient_id}/contacts/{contact_id}", status_code=204)
def remove_demo_contact(
    patient_id: int,
    contact_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_clinician),
):
    patient = _get_demo_patient(patient_id, db)
    contact = (
        db.query(models.SocialContact)
        .filter(
            models.SocialContact.id == contact_id,
            models.SocialContact.user_id == patient.caregiver_id,
        )
        .first()
    )
    if not contact:
        raise HTTPException(status_code=404, detail="Contact not found")
    delete_contact_and_scrub_logs(contact, patient.caregiver_id, db)
