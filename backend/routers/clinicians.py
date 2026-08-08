from datetime import date as date_type, datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, defer

from database import get_db
import models
import schemas
from auth import get_current_clinician
from services.aggregation import build_patient_aggregate, build_flags

router = APIRouter()


def _get_linked_patient(patient_id: int, current_user: models.User, db: Session) -> models.Patient:
    link = (
        db.query(models.ClinicianPatientLink)
        .filter(
            models.ClinicianPatientLink.clinician_id == current_user.id,
            models.ClinicianPatientLink.patient_id == patient_id,
        )
        .first()
    )
    if not link:
        raise HTTPException(status_code=404, detail="Patient not found")
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")
    return patient


def _age_from_dob(dob: Optional[date_type]) -> Optional[int]:
    if not dob:
        return None
    today = datetime.now().date()
    years = today.year - dob.year
    if (today.month, today.day) < (dob.month, dob.day):
        years -= 1
    return years


def _note_badges(log: models.DailyLog) -> List[str]:
    badges = []
    episode = log.episode or {}
    if episode.get("occurred"):
        badges.append("Episode")
    for s in (log.symptoms or []):
        if (s.get("severity") or 0) >= 8:
            badges.append(f"{s['name']} severe")
    meds = log.medications_taken or []
    if any(not m.get("taken") for m in meds):
        badges.append("Missed dose")
    return badges[:3]


@router.get("/patients", response_model=List[schemas.ClinicianPatientSummary])
def get_clinician_patients(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_clinician),
):
    patients = (
        db.query(models.Patient)
        .join(models.ClinicianPatientLink, models.ClinicianPatientLink.patient_id == models.Patient.id)
        .filter(models.ClinicianPatientLink.clinician_id == current_user.id)
        .all()
    )
    return patients


@router.get("/patient/{patient_id}/portal", response_model=schemas.ClinicianPortalResponse)
def get_clinician_portal(
    patient_id: int,
    window_days: int = Query(default=30),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_clinician),
):
    patient = _get_linked_patient(patient_id, current_user, db)

    agg = build_patient_aggregate(patient_id, window_days=window_days, db=db)
    # `agg["window"]["days"]` is the literal inclusive-date-math span (31 for a
    # "trailing 30 days" request — the same convention app/summary/page.tsx's own
    # 30-day button already uses). The portal labels this "Last N days", so it
    # should echo the requested window size exactly rather than the raw count.
    agg["window"]["days"] = window_days
    flags = build_flags(agg)

    total_symptom_severity_sum = sum(s["severity_sum"] for s in agg["symptom_stats"].values())
    total_symptom_severity_count = sum(s["severity_count"] for s in agg["symptom_stats"].values())
    avg_symptom_severity = (
        round(total_symptom_severity_sum / total_symptom_severity_count, 1)
        if total_symptom_severity_count
        else None
    )

    days_in_window = agg["window"]["days"]
    log_frequency_pct = round(agg["days_logged"] / days_in_window * 100, 1) if days_in_window else 0

    symptom_frequency = sorted(
        (
            {"symptom": name, "days_present": stat["days_present"], "avg_severity": stat["avg_severity"]}
            for name, stat in agg["symptom_stats"].items()
        ),
        key=lambda s: (s["days_present"], s["avg_severity"] or 0),
        reverse=True,
    )

    med_adherence = [
        {
            "medication": d["name"],
            "taken": d["days_taken"],
            "expected": d["days_logged"],
            "pct": d["percentage"],
        }
        for d in agg["adherence"].values()
    ]

    recent_note_logs = (
        db.query(models.DailyLog)
        .options(defer(models.DailyLog.photo))
        .filter(
            models.DailyLog.patient_id == patient_id,
            models.DailyLog.notes.isnot(None),
            models.DailyLog.notes != "",
        )
        .order_by(models.DailyLog.date.desc())
        .limit(5)
        .all()
    )
    recent_notes = [
        {"date": log.date, "text": log.notes, "badges": _note_badges(log)}
        for log in recent_note_logs
    ]

    active_medications = [f"{m.name} {m.dose}".strip() for m in agg["medications"]]

    return {
        "window": agg["window"],
        "patient": {
            "name": patient.name,
            "age": _age_from_dob(patient.date_of_birth),
            "active_medications": active_medications,
        },
        "stats": {
            "log_frequency": {
                "days_logged": agg["days_logged"],
                "days_in_window": days_in_window,
                "pct": log_frequency_pct,
            },
            "symptom_load": {
                "avg_severity": avg_symptom_severity,
                "distinct_symptoms": len(agg["symptom_stats"]),
            },
            "avg_sleep": {"hours": agg["avg_sleep"]},
            "med_adherence": {"pct": agg["adherence_totals"]["pct"]},
        },
        "flags": flags,
        "symptom_frequency": symptom_frequency,
        "med_adherence": med_adherence,
        "recent_notes": recent_notes,
    }


@router.get("/patient/{patient_id}/log/{date_str}", response_model=Optional[schemas.DailyLogResponse])
def get_clinician_log(
    patient_id: int,
    date_str: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_clinician),
):
    _get_linked_patient(patient_id, current_user, db)

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
        return None

    # Resolve medication names inline so the read-only drill-down doesn't need a
    # second request — includes inactive/deleted meds since a historical log may
    # reference one no longer on the active list.
    med_names = {
        m.id: m.name
        for m in db.query(models.Medication).filter(models.Medication.patient_id == patient_id).all()
    }
    medications_taken = [
        {**entry, "medication_name": med_names.get(entry.get("medication_id"), "Medication")}
        for entry in (log.medications_taken or [])
    ]

    data = {f: getattr(log, f) for f in schemas.DailyLogResponse.model_fields}
    data["medications_taken"] = medications_taken
    return schemas.DailyLogResponse(**data)
