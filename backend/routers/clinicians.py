from datetime import date as date_type, datetime, timedelta
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, defer

from database import get_db
import models
import schemas
from auth import get_current_clinician
from services.aggregation import (
    build_patient_aggregate,
    build_flags,
    build_trajectory,
    build_top_flag,
    group_observation_periods,
    raw_trend,
    symptom_trend,
    SLEEP_DATA_FLOOR,
    TREND_LOW_N_DAYS,
)

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


def _note_badges(period: dict) -> List[str]:
    badges = []
    episode = period.get("episode") or {}
    if episode.get("occurred"):
        badges.append("Episode")
    for s in (period.get("symptoms") or []):
        if (s.get("severity") or 0) >= 8:
            badges.append(f"{s['name']} severe")
    meds = period.get("medications_taken") or []
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

    # Immediately-preceding window of the same length, purely for period-over-period
    # deltas. Never surfaced to the client directly, only diffed against.
    prior_end = agg["window"]["start"] - timedelta(days=1)
    prior_start = prior_end - timedelta(days=window_days)
    prior_agg = build_patient_aggregate(patient_id, db=db, start_date=prior_start, end_date=prior_end)

    def _avg_symptom_severity(a: dict) -> Optional[float]:
        total_sum = sum(s["severity_sum"] for s in a["symptom_stats"].values())
        total_count = sum(s["severity_count"] for s in a["symptom_stats"].values())
        return round(total_sum / total_count, 1) if total_count else None

    avg_symptom_severity = _avg_symptom_severity(agg)
    prior_avg_symptom_severity = _avg_symptom_severity(prior_agg)

    days_in_window = agg["window"]["days"]
    log_frequency_pct = round(agg["days_logged"] / days_in_window * 100, 1) if days_in_window else 0

    symptom_frequency = []
    for name, stat in sorted(
        agg["symptom_stats"].items(),
        key=lambda kv: (kv[1]["days_present"], kv[1]["avg_severity"] or 0),
        reverse=True,
    ):
        low_n = stat["days_present"] < TREND_LOW_N_DAYS
        prev_stat = prior_agg["symptom_stats"].get(name)
        prev_avg = prev_stat["avg_severity"] if prev_stat else None
        symptom_frequency.append({
            "symptom": name,
            "days_present": stat["days_present"],
            "avg_severity": stat["avg_severity"],
            "prev_avg_severity": prev_avg,
            "direction": symptom_trend(stat["avg_severity"], prev_avg, low_n=low_n),
            "low_n": low_n,
        })

    prior_adherence_pct = prior_agg["adherence_totals"]["pct"] if prior_agg["adherence_totals"]["expected"] else None
    glance_stats = {
        "adherence": {
            "value": agg["adherence_totals"]["pct"],
            "prev": prior_adherence_pct,
            "direction": raw_trend(agg["adherence_totals"]["pct"], prior_adherence_pct, steady_threshold=5),
        },
        "flagged_episodes": {
            "value": agg["episode_count"],
            "prev": prior_agg["episode_count"],
            "direction": raw_trend(agg["episode_count"], prior_agg["episode_count"], steady_threshold=0.5),
        },
        "symptom_load": {
            "value": avg_symptom_severity,
            "prev": prior_avg_symptom_severity,
            "direction": raw_trend(avg_symptom_severity, prior_avg_symptom_severity, steady_threshold=0.5),
        },
        "days_logged": {"value": agg["days_logged"], "total": days_in_window},
    }

    trajectory_days = build_trajectory(agg["logs"], agg["window"]["start"], agg["window"]["end"])
    top_flag = build_top_flag(agg["observation_periods"])

    med_adherence = [
        {
            "medication": d["name"],
            "taken": d["days_taken"],
            "expected": d["days_logged"],
            "pct": d["percentage"],
        }
        for d in agg["adherence"].values()
    ]

    # Not window-bound by design (the latest caregiver voice should always show),
    # so this is a separate, full-history query — then deduplicated through the
    # same same_as_yesterday collapsing as everything else, so a note reaffirmed
    # verbatim on the following days doesn't show up as 3 identical entries.
    all_logs = (
        db.query(models.DailyLog)
        .options(defer(models.DailyLog.photo))
        .filter(models.DailyLog.patient_id == patient_id)
        .order_by(models.DailyLog.date.asc())
        .all()
    )
    notable_periods = [p for p in reversed(group_observation_periods(all_logs)) if p["notes"]]
    recent_notes = [
        {
            "date": p["date"],
            "text": p["notes"],
            "badges": _note_badges(p),
            "reaffirmed_dates": p["repeated_dates"],
        }
        for p in notable_periods[:5]
    ]

    active_medications = [f"{m.name} {m.dose}".strip() for m in agg["medications"]]

    sleep_days_logged = len(agg["sleep_vals"])
    sleep_hours = agg["avg_sleep"] if sleep_days_logged >= SLEEP_DATA_FLOOR else None

    # Read-only cache lookup — never generates. The synthesis is produced exclusively
    # by scripts/generate_synthesis.py so a portal page load never calls OpenAI.
    synthesis_row = (
        db.query(models.ClinicianNoteSynthesis)
        .filter(models.ClinicianNoteSynthesis.patient_id == patient_id)
        .first()
    )
    clinical_summary = None
    if synthesis_row:
        clinical_summary = {
            **synthesis_row.content,
            "generated_at": synthesis_row.generated_at,
            "window_days": synthesis_row.window_days,
        }

    return {
        "window": agg["window"],
        "patient": {
            "name": patient.name,
            "age": _age_from_dob(patient.date_of_birth),
            "active_medications": active_medications,
        },
        "clinical_summary": clinical_summary,
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
            "avg_sleep": {"hours": sleep_hours, "days_logged": sleep_days_logged},
            "med_adherence": {"pct": agg["adherence_totals"]["pct"]},
        },
        "flags": flags,
        "glance_stats": glance_stats,
        "trajectory": {"days": trajectory_days},
        "top_flag": top_flag,
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
