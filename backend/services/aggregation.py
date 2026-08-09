from collections import defaultdict
from datetime import date as date_type, datetime, timedelta
from typing import Optional

from sqlalchemy.orm import Session

import models

# Exact-match preset buttons the log UI writes (80/48/24oz), not a continuous scale.
HYDRATION_LABELS = {80: "Good", 48: "Fair", 24: "Poor"}

# Below this many logged nights, an average-sleep number is a coin flip, not a
# clinical signal — the UI must say so instead of presenting it with false confidence.
SLEEP_DATA_FLOOR = 5

# An ordinary symptom needs to show up more than once to be a pattern rather than a
# single bad day. Safety-relevant symptoms are exempt — see _is_safety_symptom.
SYMPTOM_FLAG_MIN_DAYS = 3

# Symptom names that must surface on a single occurrence, severity and frequency
# gates notwithstanding. A lone mention of self-harm or command hallucinations is
# never "infrequent" — presence alone is the signal. Matched as a substring,
# case-insensitively, against whatever symptom name the caregiver's config uses.
SAFETY_SYMPTOM_KEYWORDS = (
    "suicid",
    "self-harm",
    "self harm",
    "homicid",
    "command hallucination",
    "harm to others",
)


def _is_safety_symptom(name: str) -> bool:
    lowered = name.lower()
    return any(kw in lowered for kw in SAFETY_SYMPTOM_KEYWORDS)


def _calculate_adherence(logs, medications) -> dict:
    med_stats = {
        med.id: {"name": med.name, "taken": 0, "total": 0, "missed_dates": []}
        for med in medications
    }
    for log in logs:
        if not log.medications_taken:
            continue
        for entry in log.medications_taken:
            mid = entry.get("medication_id")
            if mid in med_stats:
                med_stats[mid]["total"] += 1
                if entry.get("taken"):
                    med_stats[mid]["taken"] += 1
                else:
                    med_stats[mid]["missed_dates"].append(log.date.isoformat())
    return {
        mid: {
            "name": data["name"],
            "percentage": round(data["taken"] / data["total"] * 100, 1) if data["total"] else 0,
            "days_taken": data["taken"],
            "days_logged": data["total"],
            "missed_dates": data["missed_dates"],
        }
        for mid, data in med_stats.items()
    }


def group_observation_periods(logs) -> list:
    """Collapse consecutive `same_as_yesterday` entries into the single real
    observation they represent. The caregiver's "same as yesterday" quick-log
    copies the prior day's entire entry verbatim, notes included — it is a
    reaffirmation, not a new observation. Anything downstream that reasons about
    how many times something was actually reported (note counts, the clinical
    synthesis) must treat a repeated run as ONE data point, not one per day, or it
    will triple-weight a single account. `logs` must be date-ascending, matching
    what build_patient_aggregate queries.
    """
    groups: list = []
    for log in logs:
        if log.log_type == "same_as_yesterday" and groups:
            groups[-1]["repeated_dates"].append(log.date)
            continue
        groups.append({
            "date": log.date,
            "notes": log.notes,
            "episode": log.episode,
            "symptoms": log.symptoms,
            "medications_taken": log.medications_taken,
            "log_type": log.log_type,
            "repeated_dates": [],
        })
    return groups


def build_patient_aggregate(
    patient_id: int,
    window_days: int = 30,
    *,
    db: Session,
    start_date: Optional[date_type] = None,
    end_date: Optional[date_type] = None,
) -> dict:
    """Single source of truth for deterministic patient stats over a date range.
    Used by both the caregiver AI-summary endpoint and the read-only clinician
    portal — numbers must never be computed in two places.

    Defaults to a trailing `window_days`-day window anchored on today. Explicit
    `start_date`/`end_date` (used by the caregiver summary page's custom date-range
    picker) override that default.
    """
    patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()

    today = datetime.now().date()
    if end_date is None:
        end_date = today
    if start_date is None:
        start_date = end_date - timedelta(days=window_days)

    logs = (
        db.query(models.DailyLog)
        .filter(
            models.DailyLog.patient_id == patient_id,
            models.DailyLog.date >= start_date,
            models.DailyLog.date <= end_date,
        )
        .order_by(models.DailyLog.date.asc())
        .all()
    )

    medications = (
        db.query(models.Medication)
        .filter(models.Medication.patient_id == patient_id, models.Medication.active == True)  # noqa: E712
        .all()
    )

    adherence = _calculate_adherence(logs, medications)
    adherence_taken = sum(d["days_taken"] for d in adherence.values())
    adherence_expected = sum(d["days_logged"] for d in adherence.values())
    adherence_totals = {
        "taken": adherence_taken,
        "expected": adherence_expected,
        "pct": round(adherence_taken / adherence_expected * 100, 1) if adherence_expected else 0,
    }

    sleep_vals, mood_vals, water_vals = [], [], []
    symptom_stats: dict = defaultdict(
        lambda: {"severe": 0, "moderate": 0, "none": 0, "severity_sum": 0, "severity_count": 0}
    )
    activity_counts: dict = defaultdict(int)
    side_effect_counts: dict = defaultdict(lambda: defaultdict(int))
    lifestyle_totals: dict = defaultdict(int)
    log_entries = []

    for log in logs:
        if log.sleep_hours is not None:
            sleep_vals.append(log.sleep_hours)
        if log.mood_score is not None:
            mood_vals.append(log.mood_score)
        if log.water_intake_oz is not None:
            water_vals.append(log.water_intake_oz)

        for s in (log.symptoms or []):
            name = s["name"]
            sev = s.get("severity")
            if sev is None:
                continue
            stat = symptom_stats[name]
            stat["severity_sum"] += sev
            stat["severity_count"] += 1
            if sev >= 8:
                stat["severe"] += 1
            elif sev >= 5:
                stat["moderate"] += 1
            else:
                stat["none"] += 1

        for a in (log.activities or []):
            activity_counts[a["type"]] += 1

        for med_se in (log.medication_side_effects or []):
            for se in med_se.get("side_effects", []):
                side_effect_counts[med_se["medication_name"]][se["name"]] += 1

        if log.lifestyle:
            for k, v in log.lifestyle.items():
                if v:
                    lifestyle_totals[k] += 1

        water_label = HYDRATION_LABELS.get(log.water_intake_oz) if log.water_intake_oz is not None else None
        log_entries.append({
            "date": log.date.isoformat(),
            "mood": log.mood_score,
            "sleep_hours": log.sleep_hours,
            "hydration": water_label or (f"{log.water_intake_oz}oz" if log.water_intake_oz is not None else None),
            "symptoms": log.symptoms,
            "activities": log.activities,
            "lifestyle": log.lifestyle,
            "medications_taken": log.medications_taken,
            "medication_side_effects": log.medication_side_effects,
            "notes": log.notes,
        })

    avg_sleep = round(sum(sleep_vals) / len(sleep_vals), 1) if sleep_vals else None
    avg_mood = round(sum(mood_vals) / len(mood_vals), 1) if mood_vals else None

    hydration_counts: dict = defaultdict(int)
    for v in water_vals:
        hydration_counts[HYDRATION_LABELS.get(v, "other")] += 1

    for stat in symptom_stats.values():
        stat["avg_severity"] = (
            round(stat["severity_sum"] / stat["severity_count"], 1) if stat["severity_count"] else None
        )
        stat["days_present"] = stat["severe"] + stat["moderate"] + stat["none"]

    days_logged = len({log.date for log in logs})

    return {
        "patient": patient,
        "window": {"days": (end_date - start_date).days + 1, "start": start_date, "end": end_date},
        "logs": logs,
        "medications": medications,
        "days_logged": days_logged,
        "total_logs": len(logs),
        "adherence": adherence,
        "adherence_totals": adherence_totals,
        "symptom_stats": dict(symptom_stats),
        "sleep_vals": sleep_vals,
        "avg_sleep": avg_sleep,
        "mood_vals": mood_vals,
        "avg_mood": avg_mood,
        "water_vals": water_vals,
        "hydration_counts": dict(hydration_counts),
        "activity_counts": dict(activity_counts),
        "side_effect_counts": {k: dict(v) for k, v in side_effect_counts.items()},
        "lifestyle_totals": dict(lifestyle_totals),
        "log_entries": log_entries,
        "observation_periods": group_observation_periods(logs),
    }


def build_flags(agg: dict) -> list:
    """Deterministic, rule-based flags for the clinician portal — filled from the
    same severity thresholds that bucket the data above. No LLM call, so this
    loads instantly and reads identically on every run."""
    window_days = agg["window"]["days"]
    flags = []

    for name, stat in agg["symptom_stats"].items():
        avg = stat["avg_severity"]
        if avg is None:
            continue
        is_safety = _is_safety_symptom(name)
        if is_safety:
            # Presence alone is the signal — never gated on frequency or severity.
            severity = "high"
        else:
            if stat["days_present"] < SYMPTOM_FLAG_MIN_DAYS:
                continue
            if avg >= 8:
                severity = "high"
            elif avg >= 5:
                severity = "moderate"
            else:
                continue
        flags.append({
            "severity": severity,
            "metric": "symptom",
            "text": (
                f"{name} has averaged {avg}/10 severity over "
                f"{stat['days_present']} of the last {window_days} days."
            ),
        })

    pct = agg["adherence_totals"]["pct"]
    if agg["adherence_totals"]["expected"] > 0:
        if pct < 60:
            flags.append({
                "severity": "high",
                "metric": "med_adherence",
                "text": f"Medication adherence is at {pct}% over the last {window_days} days.",
            })
        elif pct < 80:
            flags.append({
                "severity": "moderate",
                "metric": "med_adherence",
                "text": f"Medication adherence is at {pct}% over the last {window_days} days.",
            })

    avg_sleep = agg["avg_sleep"]
    if avg_sleep is not None and len(agg["sleep_vals"]) >= SLEEP_DATA_FLOOR:
        if avg_sleep < 5:
            flags.append({
                "severity": "high",
                "metric": "sleep",
                "text": f"Average sleep is {avg_sleep} hours/night, well below typical recommendations.",
            })
        elif avg_sleep < 6.5:
            flags.append({
                "severity": "moderate",
                "metric": "sleep",
                "text": f"Average sleep is {avg_sleep} hours/night, below typical recommendations.",
            })

    log_pct = agg["days_logged"] / window_days if window_days else 0
    if log_pct < 0.25:
        flags.append({
            "severity": "moderate",
            "metric": "log_frequency",
            "text": (
                f"Only {agg['days_logged']} of the last {window_days} days have a log — "
                "recent trends may be incomplete."
            ),
        })
    elif log_pct < 0.5:
        flags.append({
            "severity": "low",
            "metric": "log_frequency",
            "text": (
                f"Only {agg['days_logged']} of the last {window_days} days have a log — "
                "recent trends may be incomplete."
            ),
        })

    order = {"high": 0, "moderate": 1, "low": 2}
    flags.sort(key=lambda f: order[f["severity"]])
    return flags
