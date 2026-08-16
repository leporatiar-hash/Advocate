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
    episode_count = 0

    for log in logs:
        if log.sleep_hours is not None:
            sleep_vals.append(log.sleep_hours)
        if log.mood_score is not None:
            mood_vals.append(log.mood_score)
        if log.water_intake_oz is not None:
            water_vals.append(log.water_intake_oz)
        if (log.episode or {}).get("occurred"):
            episode_count += 1

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
        "episode_count": episode_count,
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


# Below this many logged days for a given symptom, a period-over-period comparison
# is noise, not a trend — see build_symptom_trend below.
TREND_LOW_N_DAYS = 3


# ── Temporal Data (adaptive multi-month trajectory) ─────────────────────────────
# Bin size is chosen from the span between the patient's first and last log inside
# the temporal window (up to 12 months) — not from the window length itself, so a
# patient with one cluster of history in an otherwise-empty year still gets a
# readable ribbon instead of hundreds of empty daily bins.
SPAN_DAY_MAX = 35      # days; span at or under this uses daily bins
SPAN_WEEK_MAX = 182    # days (~6 months); span at or under this uses weekly bins
                       # beyond SPAN_WEEK_MAX, bins are monthly

# 0-10 scale severity color thresholds — must match app/lib/clinicianSeverity.ts
# so a bin's color means the same thing on both sides of the API.
SEV_GREEN_MAX = 2.9
SEV_AMBER_MAX = 5.9
RED_FORCE = 6.0        # a bin with any episode is floored to at least this severity

# Below this many *scored* days in a bin, the scored average is noise and is
# excluded from the bin's severity — notes and episodes still count regardless.
SCORED_FLOOR_DAY = 1
SCORED_FLOOR_WEEK = 3
SCORED_FLOOR_MONTH = 10
SCORED_FLOOR_BY_BIN_SIZE = {
    "day": SCORED_FLOOR_DAY,
    "week": SCORED_FLOOR_WEEK,
    "month": SCORED_FLOOR_MONTH,
}

# Below this many total logged days in the temporal window, a trend read is
# noise — the strip still shows daily markers but with a quiet "not enough
# history" line instead of trend framing.
NOT_ENOUGH_HISTORY_DAYS = 14

# How far back the temporal window looks, regardless of the rest of the
# page's window toggle.
TEMPORAL_WINDOW_DAYS = 365


def compute_day_severity(log) -> Optional[float]:
    """Single per-day severity number: the mean of that day's logged symptom
    severities, or None if nothing was scored that day. This is the ONE
    per-day severity function — both the existing daily trajectory (build_trajectory)
    and the adaptive temporal bins reuse it rather than each computing their own."""
    severities = [s.get("severity") for s in (log.symptoms or []) if s.get("severity") is not None]
    return round(sum(severities) / len(severities), 1) if severities else None


def _bin_size_for_span(span_days: int) -> str:
    if span_days <= SPAN_DAY_MAX:
        return "day"
    if span_days <= SPAN_WEEK_MAX:
        return "week"
    return "month"


def _month_add(d: date_type, months: int) -> date_type:
    total = d.month - 1 + months
    year = d.year + total // 12
    month = total % 12 + 1
    return date_type(year, month, 1)


def _bin_label(start: date_type, bin_size: str, first_year: int) -> str:
    if bin_size == "day":
        return f"{start.strftime('%b')} {start.day}"
    if bin_size == "week":
        return f"{start.strftime('%b')} {start.day}"
    # month
    return start.strftime("%b") if start.year == first_year else f"{start.strftime('%b')} '{start.strftime('%y')}"


def _bin_ranges(first_log: date_type, last_log: date_type, bin_size: str) -> list:
    """(start, end, label) for each bin, first-log-anchored, covering through
    the bin that contains last_log. Never produces a bin before first_log."""
    ranges = []
    first_year = first_log.year
    if bin_size == "day":
        d = first_log
        while d <= last_log:
            ranges.append((d, d, _bin_label(d, bin_size, first_year)))
            d += timedelta(days=1)
    elif bin_size == "week":
        start = first_log
        while start <= last_log:
            end = start + timedelta(days=6)
            ranges.append((start, end, _bin_label(start, bin_size, first_year)))
            start = end + timedelta(days=1)
    else:  # month
        start = date_type(first_log.year, first_log.month, 1)
        while start <= last_log:
            next_start = _month_add(start, 1)
            end = next_start - timedelta(days=1)
            ranges.append((start, end, _bin_label(start, bin_size, first_year)))
            start = next_start
    return ranges


def build_temporal_bins(logs: list) -> list:
    """Deterministic adaptive-bin breakdown of the given logs (already
    date-ascending, already scoped to the temporal window by the caller) — no
    LLM, no color. Bin size follows the span between the first and last logged
    day; no leading bins render before the first log, and gap bins with no
    logs at all inside that range still appear (neutral, filled in downstream).

    `notes` is deduplicated through the same same_as_yesterday collapsing as
    everything else (group_observation_periods), so a reaffirmed note doesn't
    get passed to the LLM step multiple times."""
    logged_dates = sorted({log.date for log in logs})
    if not logged_dates:
        return []
    first_log, last_log = logged_dates[0], logged_dates[-1]
    span_days = (last_log - first_log).days + 1
    bin_size = _bin_size_for_span(span_days)

    day_sev_by_date = {log.date: compute_day_severity(log) for log in logs}
    episode_by_date = {log.date: bool((log.episode or {}).get("occurred")) for log in logs}
    notes_by_date = {p["date"]: p["notes"] for p in group_observation_periods(logs) if p["notes"]}
    logged_date_set = set(logged_dates)

    bins = []
    for start, end, label in _bin_ranges(first_log, last_log, bin_size):
        bin_dates = [start + timedelta(days=i) for i in range((end - start).days + 1)]
        bin_logged_dates = [d for d in bin_dates if d in logged_date_set]
        scored_vals = [day_sev_by_date[d] for d in bin_logged_dates if day_sev_by_date.get(d) is not None]

        bins.append({
            "start": start,
            "end": end,
            "label": label,
            "bin_size": bin_size,
            "logged_days": len(bin_logged_dates),
            "scored_days": len(scored_vals),
            "scored_sev": round(sum(scored_vals) / len(scored_vals), 2) if scored_vals else None,
            "has_episode": any(episode_by_date.get(d, False) for d in bin_logged_dates),
            "notes": [notes_by_date[d] for d in bin_dates if d in notes_by_date],
        })
    return bins


def combine_bin_severity(bin_data: dict, note_severity: Optional[float]) -> tuple:
    """Deterministic combine step: scored severity only counts once the bin has
    enough scored days for its bin size; a note's severity always counts; any
    episode in the bin floors the bin to at least RED_FORCE. Returns
    (bin_sev, color). The LLM never sets color directly — it only ever produces
    note_severity and the readout text that this function's caller attaches."""
    components = []

    floor = SCORED_FLOOR_BY_BIN_SIZE[bin_data["bin_size"]]
    if bin_data["scored_days"] >= floor and bin_data["scored_sev"] is not None:
        components.append(bin_data["scored_sev"])
    if note_severity is not None:
        components.append(note_severity)

    bin_sev = max(components) if components else None

    if bin_data["has_episode"]:
        bin_sev = max(bin_sev or 0, RED_FORCE)

    if bin_sev is None:
        color = "neutral"
    elif bin_sev <= SEV_GREEN_MAX:
        color = "green"
    elif bin_sev <= SEV_AMBER_MAX:
        color = "amber"
    else:
        color = "red"

    return bin_sev, color


def raw_trend(current: Optional[float], prev: Optional[float], *, steady_threshold: float) -> str:
    """Numeric up/down/steady with no clinical meaning attached — for header
    stats where the frontend, not this function, decides what "up" means for a
    given metric (e.g. adherence up is good, symptom load up is bad)."""
    if current is None or prev is None:
        return "steady"
    diff = current - prev
    if abs(diff) < steady_threshold:
        return "steady"
    return "up" if diff > 0 else "down"


def symptom_trend(current: Optional[float], prev: Optional[float], *, low_n: bool, steady_threshold: float = 0.5) -> str:
    """Clinical-meaning trend for a single symptom's average severity: higher
    severity is always worse, regardless of which symptom it is. Forced steady
    when there isn't enough data to trust a delta."""
    if low_n or current is None or prev is None:
        return "steady"
    diff = current - prev
    if abs(diff) < steady_threshold:
        return "steady"
    return "worse" if diff > 0 else "better"


def build_trajectory(logs, start_date: date_type, end_date: date_type) -> list:
    """One row per calendar day in the window: average symptom severity that day
    (None if nothing was logged), whether an episode occurred, and whether the
    caregiver flagged smoking that day. Gaps (no log that day) render as nulls
    rather than being skipped, so the strip's day spacing stays uniform.

    `logged` distinguishes "logged, not smoked" from "no log at all that day" —
    without it, a day with no log defaults smoked=False the same as a real
    logged non-smoking day, which would corrupt a true/false variation check on
    the smoking series (see TrajectoryStrip's smoking-row gating)."""
    by_date = {}
    for log in logs:
        by_date[log.date] = {
            "severity": compute_day_severity(log),
            "episode": bool((log.episode or {}).get("occurred")),
            "smoked": bool((log.lifestyle or {}).get("smoked")),
            "logged": True,
        }

    days = []
    d = start_date
    while d <= end_date:
        entry = by_date.get(d, {"severity": None, "episode": False, "smoked": False, "logged": False})
        days.append({"date": d, **entry})
        d += timedelta(days=1)
    return days


def build_top_flag(observation_periods: list, symptom_stats: dict) -> Optional[dict]:
    """The single flag a clinician should read first, deterministically picked
    (no LLM, no synthesized description). A note only qualifies if it carries
    real weight: either an episode was logged, or it has a symptom at severity
    >= 8 that is NOT a single-occurrence low-n spike (see TREND_LOW_N_DAYS) — a
    symptom logged once or twice must never win the loudest slot on the page,
    the same rule the symptom bars already enforce. The body is always the
    caregiver's own note text, never a templated string, and a candidate with no
    note text to show is excluded rather than backfilled with one. Returns None
    if nothing in the window qualifies — a low-n spike is never manufactured
    into a flag just to fill the slot."""
    candidates = []
    for period in observation_periods:
        notes_text = period.get("notes")
        if not notes_text:
            continue

        episode_occurred = bool((period.get("episode") or {}).get("occurred"))
        symptoms = [s for s in (period.get("symptoms") or []) if s.get("severity") is not None]
        qualifying = [
            s for s in symptoms
            if s["severity"] >= 8
            and symptom_stats.get(s["name"], {}).get("days_present", 0) >= TREND_LOW_N_DAYS
        ]
        if not episode_occurred and not qualifying:
            continue

        top_severity = max((s["severity"] for s in qualifying), default=0)
        candidates.append({"period": period, "is_episode": episode_occurred, "top_severity": top_severity})

    if not candidates:
        return None

    # Episode notes first, then highest qualifying severity, then most recent —
    # a period's own ascending `date` breaks the final tie correctly since
    # observation_periods is already date-ascending.
    best = max(candidates, key=lambda c: (c["is_episode"], c["top_severity"], c["period"]["date"]))

    period = best["period"]
    date_str = period["date"].isoformat()
    notes_text = period.get("notes")
    return {
        "date": date_str,
        "text": notes_text,
        "quote": notes_text,
        "note_id": date_str,
    }
