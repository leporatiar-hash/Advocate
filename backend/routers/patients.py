from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime, timedelta
import json
import os
import secrets
from dotenv import load_dotenv
from openai import OpenAI

from database import get_db
import models
import schemas
from auth import get_current_user

load_dotenv()

router = APIRouter()


@router.post("/", response_model=schemas.PatientResponse)
def create_patient(
    patient_data: schemas.PatientCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    patient = models.Patient(
        name=patient_data.name,
        date_of_birth=patient_data.date_of_birth,
        diagnosis=patient_data.diagnosis,
        notes=patient_data.notes,
        caregiver_id=current_user.id,
    )
    db.add(patient)
    db.flush()  # get patient.id without committing

    for med_data in (patient_data.medications or []):
        med = models.Medication(
            patient_id=patient.id,
            name=med_data.name,
            dose=med_data.dose,
            frequency=med_data.frequency,
            time_of_day=med_data.time_of_day,
        )
        db.add(med)

    db.commit()
    db.refresh(patient)
    return patient


@router.get("/", response_model=List[schemas.PatientResponse])
def get_patients(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    return (
        db.query(models.Patient)
        .filter(models.Patient.caregiver_id == current_user.id)
        .all()
    )


@router.get("/{patient_id}", response_model=schemas.PatientResponse)
def get_patient(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
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


@router.patch("/{patient_id}", response_model=schemas.PatientResponse)
def update_patient(
    patient_id: int,
    data: schemas.PatientUpdate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
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

    for field, value in data.model_dump(exclude_unset=True).items():
        setattr(patient, field, value)
    db.commit()
    db.refresh(patient)
    return patient


@router.post("/{patient_id}/medications", response_model=schemas.MedicationResponse)
def add_medication(
    patient_id: int,
    med_data: schemas.MedicationCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
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

    med = models.Medication(
        patient_id=patient_id,
        name=med_data.name,
        dose=med_data.dose,
        frequency=med_data.frequency,
        time_of_day=med_data.time_of_day,
    )
    db.add(med)
    db.commit()
    db.refresh(med)
    return med


def _get_owned_patient(patient_id: int, current_user: models.User, db: Session) -> models.Patient:
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


@router.get("/{patient_id}/treatment-plan", response_model=schemas.TreatmentPlanResponse)
def get_treatment_plan(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_owned_patient(patient_id, current_user, db)
    plan = db.query(models.TreatmentPlan).filter(models.TreatmentPlan.patient_id == patient_id).first()
    if not plan:
        raise HTTPException(status_code=404, detail="No treatment plan found")
    return plan


@router.post("/{patient_id}/treatment-plan", response_model=schemas.TreatmentPlanResponse)
@router.put("/{patient_id}/treatment-plan", response_model=schemas.TreatmentPlanResponse)
def upsert_treatment_plan(
    patient_id: int,
    data: schemas.TreatmentPlanCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _get_owned_patient(patient_id, current_user, db)
    plan = db.query(models.TreatmentPlan).filter(models.TreatmentPlan.patient_id == patient_id).first()
    if plan:
        for field, value in data.model_dump(exclude_unset=True).items():
            setattr(plan, field, value)
    else:
        plan = models.TreatmentPlan(patient_id=patient_id, **data.model_dump(exclude_unset=True))
        db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


_DEFAULT_CONFIG = {
    "symptoms": ["Anxiety", "Aggression", "Confusion", "Fatigue", "Pain", "Nausea", "Crying", "Mood Changes"],
    "activities": ["walking", "music", "drawing", "reading", "socializing", "other"],
    "modules": ["medications", "symptoms", "mood", "sleep", "water", "activities"],
    "symptom_label": "Symptoms",
    "episode_label": "Notable Episodes",
    "lifestyle_flags": ["smoked", "alcohol", "stressed", "ate_well"],
    "substance_fields": ["cigarettes", "alcohol"],
    "condition_context": "Patient is being monitored by a caregiver.",
    "summary_style": "adaptive",
}


@router.post("/{patient_id}/generate-config", response_model=schemas.PatientResponse)
def generate_config(
    patient_id: int,
    survey: schemas.IntakeSurveyRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
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

    system_prompt = (
        "You are a health tracking assistant. Generate a personalized caregiver dashboard config. "
        "This app is used by caregivers tracking ANY illness — dementia, MS, Parkinson's, anxiety disorders, "
        "addiction recovery, cancer, chronic pain, ALS, epilepsy, autism, PTSD, pediatric conditions, and more. "
        "Your config must be fully specific to the exact condition described. "
        "Return ONLY valid JSON — no markdown fences, no explanation."
    )

    user_prompt = f"""A caregiver is setting up tracking for {patient.name}, diagnosed with {patient.diagnosis}.
Relationship to patient: {survey.relationship}
Situation/conditions: {", ".join(survey.conditions)}
Wants to track: {", ".join(survey.track_modules)}
Other notes: {survey.other_notes or "None"}

Generate a config tailored EXACTLY to this condition. Consider:
- Which symptoms actually matter for this diagnosis (not generic ones)
- Which lifestyle factors are clinically relevant (e.g. stressed/ate_well for most; smoked/alcohol only if relevant)
- Whether substance tracking is appropriate (e.g. remove for pediatric patients, include for addiction recovery)
- What tone the AI summaries should have (compassionate for mental health/dementia, clinical for physical conditions)

Return exactly this JSON structure:
{{
  "symptoms": ["4-8 condition-specific symptom names for {patient.diagnosis}"],
  "activities": ["4-6 slugs from: walking, running, music, drawing, reading, cooking, socializing, physical_therapy, meditation, journaling, other"],
  "modules": ["ordered list from: medications, symptoms, mood, sleep, water, activities, vitals, episode, side_effects"],
  "symptom_label": "condition-appropriate label for the symptoms section",
  "episode_label": "condition-appropriate label for notable episodes",
  "lifestyle_flags": ["subset of: smoked, alcohol, stressed, ate_well — only clinically relevant ones"],
  "substance_fields": ["subset of: cigarettes, alcohol — only if tracking is appropriate for this condition"],
  "condition_context": "1-2 sentence description of {patient.name}'s condition for use in clinical summaries",
  "summary_style": "one of: compassionate, clinical, adaptive"
}}"""

    config = _DEFAULT_CONFIG.copy()
    try:
        api_key = os.getenv("OPENAI_API_KEY")
        if api_key:
            model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
            client = OpenAI(api_key=api_key)
            completion = client.chat.completions.create(
                model=model,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_prompt},
                ],
            )
            response_text = (completion.choices[0].message.content or "").strip()
            if response_text:
                parsed = json.loads(response_text)
                # Validate required keys are present before accepting
                if all(k in parsed for k in ("symptoms", "activities", "modules")):
                    config = parsed
                    config.setdefault("lifestyle_flags", ["smoked", "alcohol", "stressed", "ate_well"])
                    config.setdefault("substance_fields", ["cigarettes", "alcohol"])
                    config.setdefault("condition_context", f"Patient has {patient.diagnosis}.")
                    config.setdefault("summary_style", "adaptive")
    except Exception:
        pass  # Fall back to default config — onboarding must not break

    patient.dashboard_config = config
    db.commit()
    db.refresh(patient)
    return patient


# ── Sharing a patient with a clinician ────────────────────────────────────────
#
# The consent model: a caregiver generates a short code and gives it to their
# clinician however they like — read it out at an appointment, text it. The
# clinician redeems it once to gain read-only access to that one patient.
#
# Deliberately NOT built: any way for a clinician to search for, request, or
# discover a patient. Access only ever flows outward from the caregiver.

# Excludes I, L, O, 0 and 1 — codes get read aloud and written down, and those
# are the characters people get wrong.
_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"
_CODE_TTL_DAYS = 14


def _generate_code(db: Session) -> str:
    for _ in range(10):
        raw = "".join(secrets.choice(_CODE_ALPHABET) for _ in range(8))
        code = f"{raw[:4]}-{raw[4:]}"
        if not db.query(models.PatientShareCode).filter(models.PatientShareCode.code == code).first():
            return code
    raise HTTPException(status_code=500, detail="Could not allocate a share code. Try again.")


def _active_code(patient_id: int, db: Session):
    return (
        db.query(models.PatientShareCode)
        .filter(
            models.PatientShareCode.patient_id == patient_id,
            models.PatientShareCode.revoked == False,  # noqa: E712
            models.PatientShareCode.expires_at > datetime.utcnow(),
        )
        .order_by(models.PatientShareCode.created_at.desc())
        .first()
    )


@router.get("/{patient_id}/share-code", response_model=Optional[schemas.ShareCodeResponse])
def get_share_code(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """The current active code, or null. Never resurrects an expired one."""
    _get_owned_patient(patient_id, current_user, db)
    return _active_code(patient_id, db)


@router.post("/{patient_id}/share-code", response_model=schemas.ShareCodeResponse)
def create_share_code(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Issue a code, replacing any existing active one.

    One active code per patient: two live codes for the same patient is a state
    nobody can reason about, and 'regenerate' is the only thing a caregiver ever
    wants when a code has gone astray. Superseding immediately is also the fix
    for a code shared with the wrong person.
    """
    _get_owned_patient(patient_id, current_user, db)

    existing = _active_code(patient_id, db)
    if existing:
        existing.revoked = True

    share = models.PatientShareCode(
        code=_generate_code(db),
        patient_id=patient_id,
        created_by=current_user.id,
        expires_at=datetime.utcnow() + timedelta(days=_CODE_TTL_DAYS),
    )
    db.add(share)
    db.commit()
    db.refresh(share)
    return share


@router.delete("/{patient_id}/share-code", status_code=204)
def revoke_share_code(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Stop the code working. Does NOT remove clinicians who already redeemed —
    that's the /clinicians endpoints below, and the UI must not conflate them."""
    _get_owned_patient(patient_id, current_user, db)
    existing = _active_code(patient_id, db)
    if existing:
        existing.revoked = True
        db.commit()
    return None


@router.get("/{patient_id}/clinicians", response_model=List[schemas.LinkedClinician])
def list_linked_clinicians(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Who can currently see this patient. Consent is only meaningful if the
    caregiver can see what they've granted, so this is not optional UI."""
    _get_owned_patient(patient_id, current_user, db)
    rows = (
        db.query(models.ClinicianPatientLink, models.User)
        .join(models.User, models.User.id == models.ClinicianPatientLink.clinician_id)
        .filter(models.ClinicianPatientLink.patient_id == patient_id)
        .order_by(models.ClinicianPatientLink.created_at.asc())
        .all()
    )
    return [
        {
            "clinician_id": user.id,
            "name": user.name,
            "email": user.email,
            "linked_at": link.created_at,
        }
        for link, user in rows
    ]


@router.delete("/{patient_id}/clinicians/{clinician_id}", status_code=204)
def revoke_clinician_access(
    patient_id: int,
    clinician_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """Cut off a clinician who already has access. Takes effect on their next
    request — the portal re-checks the link on every call rather than trusting
    a token, so there is no window where a revoked clinician still reads data."""
    _get_owned_patient(patient_id, current_user, db)
    link = (
        db.query(models.ClinicianPatientLink)
        .filter(
            models.ClinicianPatientLink.patient_id == patient_id,
            models.ClinicianPatientLink.clinician_id == clinician_id,
        )
        .first()
    )
    if link:
        db.delete(link)
        db.commit()
    return None
