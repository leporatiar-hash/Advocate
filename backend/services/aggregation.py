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
    "catatoni",
)


def _is_safety_symptom(name: str) -> bool:
    lowered = name.lower()
    return any(kw in lowered for kw in SAFETY_SYMPTOM_KEYWORDS)


# ── Acuity tiers ─────────────────────────────────────────────────────────────
#
# There is no fixed symptom vocabulary: a patient's symptom list is generated
# per-patient by an LLM at onboarding (see generate_config in
# routers/patients.py) from free text like "Panic Attacks", "Meltdown", or
# "Cravings" depending on diagnosis. A tier can only ever be a best-effort
# substring match against whatever wording that patient's config landed on —
# it is not, and cannot be, authoritative. RED_TIER_KEYWORDS is the same list
# _is_safety_symptom uses above (aliased, not duplicated, so the two stay in
# sync); AMBER is a second tier one step down in acuity but still well above
# routine physical/functional symptoms.
RED_TIER_KEYWORDS = SAFETY_SYMPTOM_KEYWORDS
AMBER_TIER_KEYWORDS = (
    "aggress",
    "paranoi",
    "hallucinat",
    "intrusive thought",
    "manic",
    "mania",
    "anxiety",
    "anxious",
    "panic",
)


def symptom_tier(name: str) -> str:
    """Best-effort acuity tier for a free-form symptom name: 'red' > 'amber' >
    'routine'. Unmatched names default to 'routine' — never silently upgraded
    to a more urgent tier on a guess, but see build_tier_warnings for the
    failure mode this creates: a patient's config naming a red- or amber-tier
    symptom something these keywords don't catch (e.g. "Voices" instead of
    "hallucinations") silently lands in routine. That is the load-bearing risk
    of a keyword-matched tier — it is surfaced to server logs (see
    get_symptom_ticker), not rendered to the clinician, since it's a gap in
    our matcher, not information about their patient.
    """
    lowered = name.lower()
    if any(kw in lowered for kw in RED_TIER_KEYWORDS):
        return "red"
    if any(kw in lowered for kw in AMBER_TIER_KEYWORDS):
        return "amber"
    return "routine"


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
        # Inclusive of both endpoints, so a `window_days`-day request spans
        # exactly `window_days` calendar days. Previously this subtracted
        # `window_days` outright, producing a window_days+1 span — which let
        # `days_logged` exceed the window size and render as ">100% logged"
        # on the clinician portal.
        start_date = end_date - timedelta(days=window_days - 1)

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


# Most symptom series to plot on one shared-axis chart. The categorical palette
# is assigned in fixed slot order and capped rather than cycled — a 6th series
# would have to reuse a hue, and two symptoms sharing a color on a clinical
# chart is worse than not plotting the 6th. Remainder is disclosed in the UI.
MAX_CHARTED_SYMPTOMS = 5


def build_symptom_series(logs, start_date: date_type, end_date: date_type, limit: int = MAX_CHARTED_SYMPTOMS) -> dict:
    """Per-symptom daily severity across the window, for the portal's trend
    charts. One row per calendar day so every series shares one x-axis; a day
    with no log, or a day where that particular symptom wasn't scored, is None
    rather than 0 — absent data must render as a gap, never as a good day.

    Symptoms are ranked by how many days they were present (then by average
    severity) and capped at `limit`; the caller is told how many were omitted so
    it can say so rather than silently truncating.
    """
    by_symptom: dict = defaultdict(dict)
    for log in logs:
        for s in (log.symptoms or []):
            sev = s.get("severity")
            if sev is None:
                continue
            by_symptom[s["name"]][log.date] = sev

    ranked = sorted(
        by_symptom.items(),
        key=lambda kv: (len(kv[1]), sum(kv[1].values()) / len(kv[1]) if kv[1] else 0),
        reverse=True,
    )
    charted = ranked[:limit]

    dates = []
    d = start_date
    while d <= end_date:
        dates.append(d)
        d += timedelta(days=1)

    return {
        "dates": [d.isoformat() for d in dates],
        "series": [
            {"symptom": name, "values": [values.get(d) for d in dates]}
            for name, values in charted
        ],
        "omitted": max(0, len(ranked) - len(charted)),
    }


def build_adherence_series(logs, start_date: date_type, end_date: date_type) -> dict:
    """Daily medication adherence as a percentage of that day's logged doses.
    None on days with no medication entries at all — an unlogged day is not a
    0% day, and plotting it as one would invent a missed dose."""
    dates = []
    d = start_date
    while d <= end_date:
        dates.append(d)
        d += timedelta(days=1)

    by_date = {}
    for log in logs:
        entries = log.medications_taken or []
        if not entries:
            continue
        taken = sum(1 for e in entries if e.get("taken"))
        by_date[log.date] = round(taken / len(entries) * 100, 1)

    return {
        "dates": [d.isoformat() for d in dates],
        "values": [by_date.get(d) for d in dates],
    }


def compute_delta(dates: list, values: list, window_start_iso: str) -> dict:
    """Baseline (first) and current (last) non-null value within
    [window_start, end] of an aligned (dates, values) series, and the delta
    between them. Below TREND_LOW_N_DAYS distinct scored days in that span,
    the comparison is noise — the same low_n gate symptom_trend already
    applies to period-over-period deltas elsewhere on this page.
    """
    in_window = [(d, v) for d, v in zip(dates, values) if d >= window_start_iso and v is not None]
    low_n = len(in_window) < TREND_LOW_N_DAYS
    if not in_window:
        return {
            "baseline_date": None, "baseline_value": None,
            "current_date": None, "current_value": None,
            "delta": None, "low_n": True,
        }
    baseline_date, baseline_value = in_window[0]
    current_date, current_value = in_window[-1]
    delta = None if low_n else round(current_value - baseline_value, 1)
    return {
        "baseline_date": baseline_date, "baseline_value": baseline_value,
        "current_date": current_date, "current_value": current_value,
        "delta": delta, "low_n": low_n,
    }


# A symptom "persists" rather than merely "holds steady" when its recent
# average sits above this floor — reuses the temporal strip's own amber
# boundary (SEV_AMBER_MAX, defined above) so "elevated" means the same
# severity level everywhere on the portal, not a second arbitrary number.
PERSISTING_SEVERITY_FLOOR = SEV_AMBER_MAX

# Event ranking for the deterministic (non-LLM) lead choice: lower sorts
# first. A newly-appearing or persisting-high symptom outranks one that's
# merely worsening by degree, which outranks anything getting better.
EVENT_RANK = {"emerged": 0, "persisting": 1, "worsening": 2, "resolved": 3, "improving": 4, "steady": 5}
TIER_RANK = {"red": 0, "amber": 1, "routine": 2}


def bin_days_for_window(window_days: int) -> int:
    """Same daily/weekly/biweekly/monthly aggregation the chart itself uses
    (see the frontend's RANGES table in SymptomTicker.tsx) — kept here as the
    one authoritative mapping so a delta always compares the same *kind* of
    number the chart is showing for that range: raw daily scores at 1W/1M,
    an average of averages at 3M and up."""
    if window_days <= 30:
        return 1
    if window_days <= 90:
        return 7
    if window_days <= 182:
        return 14
    return 30


def _edge_mean(pairs: list, from_start: bool, bin_days: int):
    """Mean of whichever bin_days-wide calendar slice of `pairs` (chronological,
    non-empty) sits at the start (from_start) or end of the range. bin_days<=1
    just returns the single edge point unchanged — the 1W/1M case, identical
    to the old single-point comparison."""
    edge_date, edge_value = pairs[0] if from_start else pairs[-1]
    if bin_days <= 1:
        return edge_date, edge_value
    if from_start:
        cutoff = (date_type.fromisoformat(edge_date) + timedelta(days=bin_days)).isoformat()
        bin_pairs = [(d, v) for d, v in pairs if d < cutoff] or [pairs[0]]
    else:
        cutoff = (date_type.fromisoformat(edge_date) - timedelta(days=bin_days)).isoformat()
        bin_pairs = [(d, v) for d, v in pairs if d > cutoff] or [pairs[-1]]
    mean_v = round(sum(v for _, v in bin_pairs) / len(bin_pairs), 1)
    return edge_date, mean_v


def find_onset_date(dates: list, values: list, window_start_iso: str, baseline_value, delta) -> Optional[str]:
    """Start of the current *sustained* run past the halfway point between
    baseline_value and its final value — the most recent onset, not the
    earliest. A simple, explainable proxy for "when did this actually start"
    — not a statistical changepoint detector — used only to order a
    symptom's onset against adherence's, per get_symptom_ticker's
    ordering-aware headline clause.

    Deliberately walks backward from the most recent scored day rather than
    forward from window_start: an isolated historical blip (a single missed
    dose weeks before any real, ongoing decline) crosses the same threshold
    in isolation, and scanning forward would misreport that blip as "the
    onset" of a change that hadn't actually started yet. Walking backward and
    stopping at the first day that does *not* cross finds where the present
    state actually began.

    Returns None (can't establish onset) when there's no delta to compare
    against, or the most recent scored day doesn't even cross the threshold.
    """
    if delta is None or baseline_value is None or delta == 0:
        return None
    threshold = baseline_value + delta / 2
    in_window = [(d, v) for d, v in zip(dates, values) if d >= window_start_iso and v is not None]

    onset = None
    for d, v in reversed(in_window):
        crossed = (delta > 0 and v >= threshold) or (delta < 0 and v <= threshold)
        if not crossed:
            break
        onset = d
    return onset


def classify_symptom_event(dates: list, values: list, chart_start_iso: str, delta_start_iso: str, bin_days: int = 1) -> dict:
    """Classifies one symptom's trajectory into an event a clinician would
    actually ask about, not just a number:

    - emerged: no occurrence anywhere in [chart_start, delta_start) — the
      whole lookback before the delta window — but at least one in the delta
      window itself. The most important signal this product can surface, and
      previously invisible: a symptom with too little data to trust a delta
      rendered as flat "not enough data" regardless of whether that data was
      "nothing before, something new" or "always this sparse."
    - resolved: occurred in the lookback, absent for the whole delta window.
    - persisting: occurred throughout the delta window at a sustained
      elevated average (>= PERSISTING_SEVERITY_FLOOR) with no real delta —
      previously rendered as "no change", which reads as fine. It is not.
    - worsening / improving: a real delta. At bin_days<=1 (1W/1M) this is a
      raw first-vs-last daily score, same as before. At bin_days>1 (3M and
      up, matching the chart's own weekly/biweekly/monthly aggregation) it's
      the mean of the window's first bin vs. its last bin — a change in
      averages, not in any single observed score, and the caller is
      responsible for phrasing that difference (see ticker_headline.py).
    - steady: occurred in both halves but there isn't enough data in the
      delta window (< TREND_LOW_N_DAYS distinct SCORED days, regardless of
      bin_days — binning changes which number the delta compares, never how
      much raw evidence is required to trust one at all) to trust a
      direction, or the change is negligible.

    NOTE ON HONESTY: "emerged" only means "not logged in [chart_start,
    delta_start)" — i.e. not logged in however far back the caller actually
    queried (see chart_window_days in get_symptom_ticker), never "first time
    ever." The caller is responsible for phrasing that limit truthfully
    rather than as "first occurrence."
    """
    prior = [(d, v) for d, v in zip(dates, values) if chart_start_iso <= d < delta_start_iso and v is not None]
    recent = [(d, v) for d, v in zip(dates, values) if d >= delta_start_iso and v is not None]

    has_prior = len(prior) > 0
    has_recent = len(recent) > 0

    if has_recent and not has_prior:
        current_date, current_value = _edge_mean(recent, from_start=False, bin_days=bin_days)
        return {
            "event": "emerged",
            "baseline_date": None, "baseline_value": None,
            "current_date": current_date, "current_value": current_value,
            "delta": None, "low_n": False,
        }

    if has_prior and not has_recent:
        baseline_date, baseline_value = _edge_mean(prior, from_start=False, bin_days=bin_days)
        return {
            "event": "resolved",
            "baseline_date": baseline_date, "baseline_value": baseline_value,
            "current_date": None, "current_value": None,
            "delta": None, "low_n": False,
        }

    if not has_prior and not has_recent:
        # Can't occur in practice — by_symptom only ever contains symptoms
        # with at least one occurrence somewhere in the queried range — but
        # handled rather than assumed away.
        return {
            "event": "steady",
            "baseline_date": None, "baseline_value": None,
            "current_date": None, "current_value": None,
            "delta": None, "low_n": True,
        }

    low_n = len(recent) < TREND_LOW_N_DAYS
    if low_n:
        return {
            "event": "steady",
            "baseline_date": None, "baseline_value": None,
            "current_date": None, "current_value": None,
            "delta": None, "low_n": True,
        }

    baseline_date, baseline_value = _edge_mean(recent, from_start=True, bin_days=bin_days)
    current_date, current_value = _edge_mean(recent, from_start=False, bin_days=bin_days)
    avg_recent = sum(v for _, v in recent) / len(recent)
    delta = round(current_value - baseline_value, 1)
    if abs(delta) < 0.5:
        event = "persisting" if avg_recent >= PERSISTING_SEVERITY_FLOOR else "steady"
    else:
        event = "worsening" if delta > 0 else "improving"

    return {
        "event": event,
        "baseline_date": baseline_date, "baseline_value": baseline_value,
        "current_date": current_date, "current_value": current_value,
        "delta": delta, "low_n": low_n,
    }


def build_symptom_deltas(logs, chart_start: date_type, chart_end: date_type, delta_window_days: int) -> list:
    """Every symptom scored anywhere in [chart_start, chart_end], each with a
    full daily series (for charting), an acuity tier, and an event
    classification computed over the trailing `delta_window_days` (bin size
    for that classification derived from the window itself — see
    bin_days_for_window). Uncapped and unranked by design — unlike
    build_symptom_series (capped at MAX_CHARTED_SYMPTOMS, ranked by logging
    frequency), the symptom ticker ranks by tier and event, which requires
    seeing every symptom before any of them can be discarded.
    """
    by_symptom: dict = defaultdict(dict)
    for log in logs:
        for s in (log.symptoms or []):
            sev = s.get("severity")
            if sev is None:
                continue
            by_symptom[s["name"]][log.date] = sev

    dates = []
    d = chart_start
    while d <= chart_end:
        dates.append(d)
        d += timedelta(days=1)
    date_strs = [d.isoformat() for d in dates]
    chart_start_iso = chart_start.isoformat()
    # Inclusive of both endpoints, matching build_patient_aggregate's own
    # "a window_days-day request spans exactly window_days calendar days"
    # convention (see its comment) — so an N-day delta window is the same N
    # calendar days [today-(N-1), today] the frontend's range buttons slice
    # the chart to, and the two describe the same span exactly.
    delta_start_iso = (chart_end - timedelta(days=delta_window_days - 1)).isoformat()
    bin_days = bin_days_for_window(delta_window_days)

    result = []
    for name, values in by_symptom.items():
        series_values = [values.get(d) for d in dates]
        result.append({
            "symptom": name,
            "tier": symptom_tier(name),
            "dates": date_strs,
            "values": series_values,
            **classify_symptom_event(date_strs, series_values, chart_start_iso, delta_start_iso, bin_days),
        })
    return result


def build_tier_warnings(symptom_deltas: list, delta_start_iso: str, window_days: int) -> list:
    """Surfaces the load-bearing risk of a keyword-matched tier: a symptom
    whose free-form name matched neither RED_TIER_KEYWORDS nor
    AMBER_TIER_KEYWORDS (so defaulted to 'routine') but that scored at a
    level that would matter clinically if it really were unrecognized-red or
    unrecognized-amber. This is a developer diagnostic about our own keyword
    matcher, not information about the patient — the caller logs it
    server-side (see get_symptom_ticker), it must never render in the
    clinician-facing portal.
    """
    warnings = []
    for s in symptom_deltas:
        if s["tier"] != "routine":
            continue
        recent_values = [v for d, v in zip(s["dates"], s["values"]) if d >= delta_start_iso and v is not None]
        if recent_values and max(recent_values) >= 8:
            warnings.append(
                f"“{s['symptom']}” scored {max(recent_values):.1f}/10 in the last {window_days} days but "
                "didn't match a known severity tier, so it's being treated as routine."
            )
    return warnings


def compute_adherence_ordering(lead: Optional[dict], adherence: dict, delta_start_iso: str) -> Optional[dict]:
    """When the leading symptom is getting worse (emerged/persisting/
    worsening) and adherence has meaningfully declined in the same window,
    works out which one actually started first — that ordering is the entire
    clinical value of mentioning adherence at all (a decline that started
    after a symptom rose reads as a possible consequence; before, a possible
    cause). Returns None whenever ordering can't honestly be established —
    no lead, lead isn't in a worsening family, adherence isn't really
    declining, or either onset date can't be found — the caller is expected
    to drop the adherence clause entirely rather than hedge (see
    services/ticker_headline.py), never falling back to vague "over the same
    period" phrasing.
    """
    if not lead or lead["event"] not in ("emerged", "persisting", "worsening"):
        return None
    if adherence.get("delta") is None or adherence["delta"] > -15:
        return None

    lead_onset = find_onset_date(lead["dates"], lead["values"], delta_start_iso, lead.get("baseline_value"), lead.get("delta"))
    adherence_onset = find_onset_date(
        adherence["dates"], adherence["values"], delta_start_iso, adherence.get("baseline_value"), adherence.get("delta")
    )
    if not lead_onset or not adherence_onset:
        return None

    diff_days = abs((date_type.fromisoformat(adherence_onset) - date_type.fromisoformat(lead_onset)).days)
    if diff_days <= 6:
        ordering = "same_week"
    elif adherence_onset < lead_onset:
        ordering = "adherence_first"
    else:
        ordering = "symptom_first"

    return {
        "ordering": ordering,
        "lead_symptom": lead["symptom"],
        "lead_onset": lead_onset,
        "adherence_onset": adherence_onset,
    }


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
