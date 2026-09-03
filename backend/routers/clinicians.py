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
    build_adherence_series,
    build_flags,
    build_symptom_series,
    build_trajectory,
    build_temporal_bins,
    build_top_flag,
    combine_bin_severity,
    group_observation_periods,
    raw_trend,
    symptom_trend,
    NOT_ENOUGH_HISTORY_DAYS,
    SLEEP_DATA_FLOOR,
    TEMPORAL_WINDOW_DAYS,
    TREND_LOW_N_DAYS,
)

router = APIRouter()

# Window the roster summarises. Matches the portal's default so a patient's row
# and their dashboard describe the same period.
ROSTER_WINDOW_DAYS = 30


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
    window_days: int = Query(default=ROSTER_WINDOW_DAYS),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_clinician),
):
    """The clinician's roster. Returns every linked patient with enough signal to
    triage the panel at a glance — flag counts, adherence, a severity sparkline
    and the single loudest concern.

    Search and diagnosis filtering are deliberately NOT done here: a pilot-sized
    panel fits in one response, and filtering client-side keeps typing instant
    with no request per keystroke. Revisit if a panel ever outgrows one page.

    Every number comes from build_patient_aggregate and build_flags — the same
    functions the portal uses — so a patient's roster row can never disagree
    with their own dashboard.
    """
    patients = (
        db.query(models.Patient)
        .join(models.ClinicianPatientLink, models.ClinicianPatientLink.patient_id == models.Patient.id)
        .filter(models.ClinicianPatientLink.clinician_id == current_user.id)
        .order_by(models.Patient.name.asc())
        .all()
    )

    severity_rank = {"high": 0, "moderate": 1, "low": 2}
    roster = []
    for patient in patients:
        agg = build_patient_aggregate(patient.id, window_days=window_days, db=db)
        flags = build_flags(agg)

        counts = {"high": 0, "moderate": 0, "low": 0}
        for f in flags:
            counts[f["severity"]] += 1

        # flags is already severity-sorted by build_flags; the first entry is the
        # loudest thing about this patient.
        top_concern = flags[0]["text"] if flags else None

        total_sum = sum(s["severity_sum"] for s in agg["symptom_stats"].values())
        total_count = sum(s["severity_count"] for s in agg["symptom_stats"].values())
        avg_symptom_severity = round(total_sum / total_count, 1) if total_count else None

        trajectory = build_trajectory(agg["logs"], agg["window"]["start"], agg["window"]["end"])
        logged_dates = [log.date for log in agg["logs"]]

        roster.append({
            "id": patient.id,
            "name": patient.name,
            "age": _age_from_dob(patient.date_of_birth),
            "diagnosis": patient.diagnosis,
            "days_logged": agg["days_logged"],
            "days_in_window": agg["window"]["days"],
            "last_log_date": max(logged_dates) if logged_dates else None,
            "high_flags": counts["high"],
            "moderate_flags": counts["moderate"],
            "low_flags": counts["low"],
            "top_concern": top_concern,
            "adherence_pct": agg["adherence_totals"]["pct"] if agg["adherence_totals"]["expected"] else None,
            "avg_symptom_severity": avg_symptom_severity,
            "severity_series": [d["severity"] for d in trajectory],
        })

    # Most-urgent first so the panel self-triages, then by name for stability.
    roster.sort(key=lambda r: (-r["high_flags"], -r["moderate_flags"], r["name"].lower()))
    return roster


@router.get("/diagnoses", response_model=List[str])
def get_clinician_diagnoses(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_clinician),
):
    """Distinct diagnoses across this clinician's panel, for the roster's filter
    control. Derived from real data rather than a fixed list, since diagnosis is
    free text entered by the caregiver at onboarding."""
    rows = (
        db.query(models.Patient.diagnosis)
        .join(models.ClinicianPatientLink, models.ClinicianPatientLink.patient_id == models.Patient.id)
        .filter(models.ClinicianPatientLink.clinician_id == current_user.id)
        .distinct()
        .all()
    )
    return sorted({(r[0] or "").strip() for r in rows if (r[0] or "").strip()}, key=str.lower)


@router.get("/patient/{patient_id}/portal", response_model=schemas.ClinicianPortalResponse)
def get_clinician_portal(
    patient_id: int,
    window_days: int = Query(default=30),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_clinician),
):
    patient = _get_linked_patient(patient_id, current_user, db)

    # `agg["window"]["days"]` is now exactly `window_days` (build_patient_aggregate
    # anchors an inclusive window), so the portal's "Last N days" label, the
    # percentage denominators, and the actual queried span all agree. Do not
    # overwrite it here — that was what let days_logged exceed days_in_window.
    agg = build_patient_aggregate(patient_id, window_days=window_days, db=db)
    flags = build_flags(agg)

    # Immediately-preceding window of the same length, purely for period-over-period
    # deltas. Never surfaced to the client directly, only diffed against.
    prior_end = agg["window"]["start"] - timedelta(days=1)
    prior_start = prior_end - timedelta(days=window_days - 1)
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
    top_flag = build_top_flag(agg["observation_periods"], agg["symptom_stats"])

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

    # Every insight's "N notes" affordance has to actually reveal its source, so
    # any date an insight cites must appear in recent_notes even if it falls
    # outside the usual top-5-most-recent — otherwise source-linking would
    # silently break the moment there are more than 5 note-bearing days in a
    # patient's history, which defeats the entire trust mechanism.
    cited_dates = {
        note_id
        for insight in (clinical_summary or {}).get("insights", [])
        for note_id in insight.get("source_note_ids", [])
    }
    recent_periods = notable_periods[:5]
    recent_dates = {p["date"].isoformat() for p in recent_periods}
    cited_periods = [
        p for p in notable_periods
        if p["date"].isoformat() in cited_dates and p["date"].isoformat() not in recent_dates
    ]
    recent_notes = [
        {
            "date": p["date"],
            "text": p["notes"],
            "badges": _note_badges(p),
            "reaffirmed_dates": p["repeated_dates"],
        }
        for p in recent_periods + cited_periods
    ]

    active_medications = [f"{m.name} {m.dose}".strip() for m in agg["medications"]]

    sleep_days_logged = len(agg["sleep_vals"])
    sleep_hours = agg["avg_sleep"] if sleep_days_logged >= SLEEP_DATA_FLOOR else None

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
        "symptom_series": build_symptom_series(
            agg["logs"], agg["window"]["start"], agg["window"]["end"]
        ),
        "adherence_series": build_adherence_series(
            agg["logs"], agg["window"]["start"], agg["window"]["end"]
        ),
        "med_adherence": med_adherence,
        "recent_notes": recent_notes,
    }


@router.get("/patient/{patient_id}/temporal", response_model=schemas.TemporalResponse)
def get_clinician_temporal(
    patient_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_clinician),
):
    """Temporal Data section — the adaptive multi-month trajectory. Deliberately
    a separate endpoint from /portal: it always looks back TEMPORAL_WINDOW_DAYS
    (12 months), ignoring whatever window the rest of the page is showing, so
    the two never fight over one `window_days` param."""
    _get_linked_patient(patient_id, current_user, db)

    today = datetime.now().date()
    window_start = today - timedelta(days=TEMPORAL_WINDOW_DAYS)

    logs = (
        db.query(models.DailyLog)
        .filter(
            models.DailyLog.patient_id == patient_id,
            models.DailyLog.date >= window_start,
            models.DailyLog.date <= today,
        )
        .order_by(models.DailyLog.date.asc())
        .all()
    )

    bins = build_temporal_bins(logs)

    # Read-only cache lookup — same cached row the Clinical Summary reads, same
    # rule: generated only by scripts/generate_synthesis.py, never on this GET path.
    synthesis_row = (
        db.query(models.ClinicianNoteSynthesis)
        .filter(models.ClinicianNoteSynthesis.patient_id == patient_id)
        .first()
    )
    cached_readouts = ((synthesis_row.content if synthesis_row else {}) or {}).get("temporal_readouts") or {}

    result_bins = []
    for b in bins:
        cached = cached_readouts.get(b["start"].isoformat(), {})
        bin_sev, color = combine_bin_severity(b, cached.get("note_severity"))
        result_bins.append({
            **b,
            "color": color,
            "bin_sev": bin_sev,
            "readout": cached.get("readout"),
        })

    total_logged_days = len({log.date for log in logs})

    return {
        "bins": result_bins,
        "bin_size": bins[0]["bin_size"] if bins else "day",
        "total_logged_days": total_logged_days,
        "not_enough_history": total_logged_days < NOT_ENOUGH_HISTORY_DAYS,
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


@router.post("/redeem", response_model=schemas.RedeemCodeResponse)
def redeem_share_code(
    body: schemas.RedeemCodeRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_clinician),
):
    """Exchange a caregiver-issued code for read-only access to one patient.

    Normalises input before matching — codes get read aloud and retyped, so
    case and the hyphen are not something to fail a clinician over. Everything
    else is strict: an unknown, expired or revoked code returns the same
    message, so this can't be used to probe which codes exist.
    """
    raw = (body.code or "").strip().upper().replace(" ", "")
    if "-" not in raw and len(raw) == 8:
        raw = f"{raw[:4]}-{raw[4:]}"

    share = (
        db.query(models.PatientShareCode)
        .filter(models.PatientShareCode.code == raw)
        .first()
    )
    if (
        not share
        or share.revoked
        or share.expires_at <= datetime.utcnow()
    ):
        raise HTTPException(status_code=404, detail="That code isn't valid. Ask for a new one.")

    patient = db.query(models.Patient).filter(models.Patient.id == share.patient_id).first()
    if not patient:
        raise HTTPException(status_code=404, detail="That code isn't valid. Ask for a new one.")

    existing = (
        db.query(models.ClinicianPatientLink)
        .filter(
            models.ClinicianPatientLink.clinician_id == current_user.id,
            models.ClinicianPatientLink.patient_id == patient.id,
        )
        .first()
    )
    # Idempotent: redeeming twice is a no-op, not an error. A clinician who
    # isn't sure whether it worked will try again, and that must be safe.
    if not existing:
        db.add(models.ClinicianPatientLink(clinician_id=current_user.id, patient_id=patient.id))
        share.redemption_count = (share.redemption_count or 0) + 1
        share.last_redeemed_at = datetime.utcnow()
        db.commit()

    return {"patient_id": patient.id, "patient_name": patient.name}
