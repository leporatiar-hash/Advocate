import zlib
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


def note_badges(period: dict) -> list:
    """Closed, small category list for "what's notable" about one logged day —
    episode / severe symptom / missed dose — reused both by the portal's
    recent_notes feed and the Quick View headline's notable-events slot, so
    the two describe "notable" the same way. `period` is any dict shaped like
    a DailyLog (episode/symptoms/medications_taken), not necessarily the ORM
    object itself.
    """
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


# Number of stable palette slots the frontend's SERIES_COLORS/DASH_PATTERNS
# arrays provide (app/lib/chartTheme.ts) — kept here, not imported, since the
# two sides of the API boundary can't share a literal; if that array's length
# ever changes, update this too.
SYMPTOM_COLOR_SLOTS = 5


def symptom_color_index(name: str) -> int:
    """Stable palette slot for a symptom, keyed by name alone — never by chart
    rank or array position. A symptom's color must not change when the
    clinician toggles the date range: rank position does change (a symptom's
    event/delta is recomputed per window), so deriving color from rank makes
    identity flicker exactly when the clinician is watching the chart most
    closely. CRC32 gives a deterministic, stateless slot with no new table to
    remember "this patient's Anxiety is slot 0" — collisions across more than
    SYMPTOM_COLOR_SLOTS distinct symptoms are accepted the same way a sixth
    charted series already accepts reusing a hue (see chartTheme.ts).
    """
    return zlib.crc32(name.strip().lower().encode()) % SYMPTOM_COLOR_SLOTS


def assign_color_indices(names) -> dict:
    """Stable color slot per name, collision-resolved across this call: a bare
    hash into only SYMPTOM_COLOR_SLOTS buckets collides often enough at small
    n (5 names into 5 slots collides more often than not) that two symptoms
    charted together could render with the same color AND the same dash —
    indistinguishable, the opposite of what a stable identity color is for.
    Resolution order is alphabetical, not call order or rank, so which name
    "wins" a contested slot doesn't depend on which window is selected —
    only on the set of names present, which callers should keep consistent
    (see build_symptom_deltas's chart_window_days, which is fixed regardless
    of the delta window the clinician has selected). Beyond
    SYMPTOM_COLOR_SLOTS distinct names, the excess do reuse a slot — the same
    accepted tradeoff as a 6th charted series reusing a hue.
    """
    assigned: dict = {}
    used: set = set()
    for name in sorted(names):
        slot = symptom_color_index(name)
        if slot in used and len(used) < SYMPTOM_COLOR_SLOTS:
            slot = next(s for s in range(SYMPTOM_COLOR_SLOTS) if s not in used)
        assigned[name] = slot
        used.add(slot)
    return assigned


# A routine-tier symptom (unmatched by the keyword lists below) whose recent
# severity reaches this level is escalated to rank and badge as amber — a
# keyword miss must not let a 9/10 symptom sort under a 1/10 amber-tier one.
# Same threshold build_tier_warnings already uses to flag the keyword gap.
TIER_ESCALATION_SEVERITY = 8


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
    color_by_name = assign_color_indices(by_symptom.keys())

    dates = []
    d = start_date
    while d <= end_date:
        dates.append(d)
        d += timedelta(days=1)

    return {
        "dates": [d.isoformat() for d in dates],
        "series": [
            {"symptom": name, "values": [values.get(d) for d in dates], "color_index": color_by_name[name]}
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


def classify_symptom_event(
    dates: list,
    values: list,
    chart_start_iso: str,
    delta_start_iso: str,
    bin_days: int = 1,
    prior_days_logged: int = TREND_LOW_N_DAYS,
) -> dict:
    """Classifies one symptom's trajectory into an event a clinician would
    actually ask about, not just a number:

    - emerged: no occurrence anywhere in [chart_start, delta_start) — the
      whole lookback before the delta window — but at least one in the delta
      window itself. The most important signal this product can surface, and
      previously invisible: a symptom with too little data to trust a delta
      rendered as flat "not enough data" regardless of whether that data was
      "nothing before, something new" or "always this sparse."

      Gated on `prior_days_logged` (any log at all in the prior span, not just
      this symptom): a prior window with too few *logged days* to have said
      anything is not evidence the symptom is new, only evidence nobody was
      watching yet. Without this gate, a young account (or a wide range on a
      young account) reads every symptom as "emerged," because an unobserved
      prior period is indistinguishable from a genuinely quiet one — see the
      caller, build_symptom_deltas, for where this is computed.
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
    prior_observed = prior_days_logged >= TREND_LOW_N_DAYS

    if has_recent and not has_prior:
        if not prior_observed:
            # Nobody was logging yet in the prior span — can't tell "new" from
            # "unobserved." Falls through to the low_n "steady" branch below,
            # same honest non-answer as too little recent data.
            return {
                "event": "steady",
                "baseline_date": None, "baseline_value": None,
                "current_date": None, "current_value": None,
                "delta": None, "low_n": True,
            }
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

    # Any log at all (any symptom) in the prior span — see classify_symptom_event's
    # prior_observed gate. Computed once here, over every log, rather than per
    # symptom: whether the prior window was observed at all doesn't depend on
    # which symptom is asking.
    prior_days_logged = len({
        log.date for log in logs
        if chart_start_iso <= log.date.isoformat() < delta_start_iso
    })

    color_by_name = assign_color_indices(by_symptom.keys())

    result = []
    for name, values in by_symptom.items():
        series_values = [values.get(d) for d in dates]
        event = classify_symptom_event(
            date_strs, series_values, chart_start_iso, delta_start_iso, bin_days,
            prior_days_logged=prior_days_logged,
        )

        raw_tier = symptom_tier(name)
        tier = raw_tier
        if tier == "routine":
            recent_scored = [
                v for d, v in zip(date_strs, series_values)
                if d >= delta_start_iso and v is not None
            ]
            if recent_scored and max(recent_scored) >= TIER_ESCALATION_SEVERITY:
                tier = "amber"

        result.append({
            "symptom": name,
            "tier": tier,
            # Not part of SymptomDelta's schema — dropped on the way out by
            # response_model filtering. Kept only so build_tier_warnings can
            # still see the un-escalated keyword tier (see its docstring: it
            # diagnoses the keyword matcher itself, which severity escalation
            # would otherwise silence for exactly the cases it exists to catch).
            "raw_tier": raw_tier,
            "color_index": color_by_name[name],
            "dates": date_strs,
            "values": series_values,
            **event,
        })
    return result


def count_logged_days(logs, start_iso: str, end_iso: str) -> int:
    """Distinct calendar days with at least one log in [start_iso, end_iso] —
    the "X of Y days logged" denominator for whatever window is actually being
    displayed, not a stale fixed-window count. See get_symptom_ticker."""
    return len({
        log.date for log in logs
        if start_iso <= log.date.isoformat() <= end_iso
    })


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
        if s.get("raw_tier", s["tier"]) != "routine":
            continue
        recent_values = [v for d, v in zip(s["dates"], s["values"]) if d >= delta_start_iso and v is not None]
        if recent_values and max(recent_values) >= TIER_ESCALATION_SEVERITY:
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


# ── Clinician Timeline (demo) ────────────────────────────────────────────────
#
# Backs GET /clinician/patient/{id}/timeline (routers/clinician_timeline.py).
# Demo-only feature, gated by models.Patient.is_demo — see that column's
# comment. Six tracked domains, each either a "band" (low/medium/high, a
# display-layer bucketing of an underlying value — DailyLog itself is never
# changed) or "numeric" (weight, its own pounds axis, never banded).

# Anxiety's band thresholds — the existing 0-10 DailyLog.symptoms severity
# scale, unchanged. Named constants so every cut point lives in one place.
BAND_THRESHOLDS = {"low": (0, 3), "medium": (4, 6), "high": (7, 10)}

# Sleep hours has its own scale — under 5h is short, over 9h is long.
SLEEP_BAND_THRESHOLDS = {"low": (0, 4.999), "medium": (5, 9), "high": (9.001, 999)}

# Medication adherence is a rolling 7-day percentage, not a single day's value.
MEDICATION_BAND_THRESHOLDS = {"low": (0, 49.999), "medium": (50, 89.999), "high": (90, 100)}

# Cigarettes: DailyLog.vitals.cigarettes is a real existing caregiver-facing
# field (a same-day count, entered via the "Cigarettes today" stepper in
# app/log/page.tsx — schemas.py types `vitals` as a loose Any, so no schema
# change was needed). No thresholds were specified for it, so these were
# chosen to line up with the counts actually named in caregiver notes in this
# domain's seed data ("two or three" -> low, "six or seven" -> medium,
# "fifteen" / "most of a pack" -> high).
CIGARETTE_THRESHOLDS = {"none": (0, 0), "low": (1, 5), "medium": (6, 10), "high": (11, 999)}

TIMELINE_WINDOWS = {"1m": 31, "2m": 61, "3m": 91, "12m": 366}

TIMELINE_DOMAIN_DEFS = [
    {"key": "anxiety", "label": "Anxiety", "axis": "band"},
    {"key": "sleep", "label": "Sleep", "axis": "band"},
    {"key": "socialization", "label": "Socialization", "axis": "band"},
    {"key": "cigarettes", "label": "Cigarettes", "axis": "band"},
    {"key": "medication", "label": "Medication", "axis": "band"},
    {"key": "weight", "label": "Weight", "axis": "numeric"},
]

# Domain-specific wording for what would otherwise be a bare "High/Medium/Low"
# axis label — requested so a clinician reads "Full adherence" rather than a
# value judgement-free "High" that says nothing about what's high. Anxiety and
# Socialization keep the generic severity words; there's no more specific
# vocabulary that reads better than plain High/Medium/Low for either yet.
# Sleep is intentionally NOT labeled "Consistent/Irregular" despite that being
# floated — the band is bucketed on hours slept (SLEEP_BAND_THRESHOLDS), not
# on schedule regularity, and a "Consistent" label on a duration metric would
# be a fabricated claim the underlying data doesn't support.
BAND_LABELS = {
    "anxiety": {"high": "High", "medium": "Medium", "low": "Low"},
    "sleep": {"high": "Long sleep", "medium": "Typical sleep", "low": "Short sleep"},
    "socialization": {"high": "High", "medium": "Medium", "low": "Low"},
    "cigarettes": {"high": "Heavy usage", "medium": "Moderate usage", "low": "Light usage", "none": "No cigarettes"},
    "medication": {"high": "Full adherence", "medium": "Partial adherence", "low": "Missed doses"},
}

# Which threshold table re-buckets a domain's WEEKLY-averaged raw value back
# into a band. Socialization is deliberately absent — it has no raw number
# (see _socialization_band), so its weekly band comes from the most common
# daily band instead (see build_weekly_series).
THRESHOLDS_BY_KEY = {
    "anxiety": BAND_THRESHOLDS,
    "sleep": SLEEP_BAND_THRESHOLDS,
    "cigarettes": CIGARETTE_THRESHOLDS,
    "medication": MEDICATION_BAND_THRESHOLDS,
}


def _threshold_band(value: Optional[float], thresholds: dict) -> Optional[str]:
    if value is None:
        return None
    for band, (lo, hi) in thresholds.items():
        if lo <= value <= hi:
            return band
    return None


def build_weekly_series(entries: list, axis: str, thresholds: Optional[dict]) -> list:
    """Collapse daily (date, raw_value, band) entries into one point per ISO
    calendar week (Monday-Sunday) — a single noisy day isn't a trend, and a
    week is the smallest unit clinicians asked to read a trend line from.

    A week's raw value is the mean of that week's LOGGED raw values, then
    re-bucketed through the same thresholds used daily — never averaging
    already-bucketed bands, and never letting one outlier day's band stand in
    for the week. Socialization has no raw value to average (thresholds is
    None), so its weekly band is the most common daily band that week,
    alphabetical tie-break for determinism. A week with zero logged days is a
    genuine gap (value and band both None), same convention as daily data.
    """
    weeks: dict = {}
    order = []
    for row in entries:
        d = row[0]
        key = d.isocalendar()[:2]
        if key not in weeks:
            weeks[key] = []
            order.append(key)
        weeks[key].append(row)

    result = []
    for key in order:
        rows = weeks[key]
        week_start = min(r[0] for r in rows).isoformat()
        week_end = max(r[0] for r in rows).isoformat()
        days_in_week = len(rows)

        if axis == "numeric" or thresholds is not None:
            values = [r[1] for r in rows if r[1] is not None]
            avg = round(sum(values) / len(values), 2) if values else None
            band = _threshold_band(avg, thresholds) if (thresholds is not None and avg is not None) else None
            result.append({
                "week_start": week_start, "week_end": week_end,
                "value": avg, "band": band,
                "days_logged": len(values), "days_in_week": days_in_week,
            })
        else:
            bands = [r[2] for r in rows if r[2] is not None]
            band = None
            if bands:
                counts: dict = {}
                for b in bands:
                    counts[b] = counts.get(b, 0) + 1
                top = max(counts.values())
                band = sorted(b for b, c in counts.items() if c == top)[0]
            result.append({
                "week_start": week_start, "week_end": week_end,
                "value": None, "band": band,
                "days_logged": len(bands), "days_in_week": days_in_week,
            })
    return result


_BAND_RANK = {"none": 0, "low": 1, "medium": 2, "high": 3}


def build_monthly_extremes(entries: list, axis: str) -> list:
    """Per calendar month touched by the window: the actual highest and
    lowest LOGGED daily reading — the real day, never a smoothed average, so
    "highest this month" always names a date a clinician could ask about.
    Socialization has no raw number, so its extremes rank by band ordinal
    instead (value stays null on those points) so every domain still gets a
    comparable row. A month with nothing logged for this domain is omitted,
    never a fabricated hi/lo.
    """
    months: dict = {}
    order = []
    for row in entries:
        d = row[0]
        key = (d.year, d.month)
        if key not in months:
            months[key] = []
            order.append(key)
        months[key].append(row)

    def to_point(row):
        d, value, band = row
        return {"date": d.isoformat(), "value": value, "band": band}

    result = []
    for key in order:
        rows = months[key]
        label = date_type(key[0], key[1], 1).strftime("%b %Y")
        by_value = axis == "numeric" or any(r[1] is not None for r in rows)
        if by_value:
            logged = [r for r in rows if r[1] is not None]
            if not logged:
                continue
            hi = max(logged, key=lambda r: r[1])
            lo = min(logged, key=lambda r: r[1])
        else:
            logged = [r for r in rows if r[2] is not None]
            if not logged:
                continue
            hi = max(logged, key=lambda r: _BAND_RANK.get(r[2], -1))
            lo = min(logged, key=lambda r: _BAND_RANK.get(r[2], -1))
        result.append({"month": label, "high": to_point(hi), "low": to_point(lo)})
    return result


def _anxiety_value(log) -> Optional[float]:
    for s in (log.symptoms or []):
        if (s.get("name") or "").strip().lower() == "anxiety":
            return s.get("severity")
    return None


def _cigarette_value(log) -> Optional[float]:
    raw = (log.vitals or {}).get("cigarettes")
    if raw in (None, ""):
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


def _socialization_band(log) -> Optional[str]:
    """No single existing field is a direct low/medium/high band. `quality`
    (schemas.Socialization) is only ever set when had_contact is True — a
    caregiver-rated quality of a specific social contact, not "how social was
    today" — so a no-contact day would otherwise read as unlogged rather than
    "low." Falls back to left_house when quality is absent: stayed home ->
    low, left the house with no rated contact -> medium. Both real existing
    fields; nothing new added to reach a 3-level band."""
    soc = log.socialization or {}
    quality = soc.get("quality")
    if quality == "good":
        return "high"
    if quality == "neutral":
        return "medium"
    if quality == "difficult":
        return "low"
    if soc.get("left_house") is False:
        return "low"
    if soc.get("left_house") is True:
        return "medium"
    return None


def _weight_value(log) -> Optional[float]:
    return (log.vitals or {}).get("weight_lb")


def _medication_adherence_series(logs_by_date: dict, dates: list) -> dict:
    """Rolling 7-day adherence % ending on each date, over days that actually
    logged a medication entry — an unlogged day is excluded from both the
    numerator and denominator, never counted as a missed dose. Same "a gap is
    a gap" convention used everywhere else in this file."""
    result = {}
    for i, d in enumerate(dates):
        window_dates = dates[max(0, i - 6): i + 1]
        taken = 0
        total = 0
        for wd in window_dates:
            log = logs_by_date.get(wd)
            if not log or not log.medications_taken:
                continue
            for m in log.medications_taken:
                total += 1
                if m.get("taken"):
                    taken += 1
        result[d] = (taken / total * 100) if total else None
    return result


def build_timeline_domains(logs: list, dates: list) -> dict:
    """One entry per TIMELINE_DOMAIN_DEFS key: a list of (date, raw_value,
    band) tuples, one per date in `dates` (every calendar day in the window,
    ascending). `band` is always None for the numeric (weight) domain. A date
    with no DailyLog row, or a row that didn't populate that particular
    field, produces (date, None, None) — explicit, never omitted, never
    filled — matching the response contract's "unlogged days are explicit"
    rule.
    """
    logs_by_date = {log.date: log for log in logs}
    adherence_by_date = _medication_adherence_series(logs_by_date, dates)

    domains: dict = {d["key"]: [] for d in TIMELINE_DOMAIN_DEFS}
    for d in dates:
        log = logs_by_date.get(d)
        anxiety_val = _anxiety_value(log) if log else None
        sleep_val = log.sleep_hours if log else None
        weight_val = _weight_value(log) if log else None
        cig_val = _cigarette_value(log) if log else None
        soc_band = _socialization_band(log) if log else None
        adherence_val = adherence_by_date.get(d)

        domains["anxiety"].append((d, anxiety_val, _threshold_band(anxiety_val, BAND_THRESHOLDS)))
        domains["sleep"].append((d, sleep_val, _threshold_band(sleep_val, SLEEP_BAND_THRESHOLDS)))
        # No underlying number backs socialization's band (see
        # _socialization_band) — value is null, not a fabricated number.
        domains["socialization"].append((d, None, soc_band))
        domains["cigarettes"].append((d, cig_val, _threshold_band(cig_val, CIGARETTE_THRESHOLDS)))
        domains["medication"].append((d, adherence_val, _threshold_band(adherence_val, MEDICATION_BAND_THRESHOLDS)))
        domains["weight"].append((d, weight_val, None))

    return domains


def _domain_magnitude_and_density(entries: list, axis: str, window_days: int) -> tuple:
    """magnitude_of_change: number of transitions between consecutive LOGGED
    (non-null) values, plus 1 if the first logged value differs from the
    last. An unlogged day is silence, not a data point, so it can never
    itself be part of a transition. Band domains transition on band; the
    numeric (weight) domain transitions on the raw value, since it has no
    band. logging_density: days logged for this domain / days in window."""
    if axis == "numeric":
        logged = [v for (_, v, _) in entries if v is not None]
    else:
        logged = [b for (_, _, b) in entries if b is not None]

    magnitude = sum(1 for a, b in zip(logged, logged[1:]) if a != b)
    if logged and logged[0] != logged[-1]:
        magnitude += 1
    density = (len(logged) / window_days) if window_days else 0
    return magnitude, density


def rank_timeline_domains(domains: dict, window_days: int) -> list:
    """Deterministic, server-side, no LLM: score = magnitude_of_change *
    logging_density, descending; ties break alphabetically by key so the
    order is stable across reloads. Weight is always included regardless of
    score — with exactly six domains defined today that's automatic, but the
    guarantee is enforced explicitly here so adding a seventh domain later
    can't silently bump weight out of the top six.
    """
    axis_by_key = {d["key"]: d["axis"] for d in TIMELINE_DOMAIN_DEFS}
    scored = []
    for key, entries in domains.items():
        magnitude, density = _domain_magnitude_and_density(entries, axis_by_key[key], window_days)
        scored.append((key, magnitude * density))

    scored.sort(key=lambda kv: (-kv[1], kv[0]))
    ranked_keys = [k for k, _ in scored]

    top = ranked_keys[:6]
    if "weight" not in top and "weight" in ranked_keys:
        top = top[:5] + ["weight"]
    return top


def _next_day_iso(iso_date: str) -> str:
    return (date_type.fromisoformat(iso_date) + timedelta(days=1)).isoformat()


def build_timeline_events(logs: list, timeline_events: list) -> list:
    """Episode spans (adjacent/overlapping DailyLog.episode entries collapsed
    into one event each — see classify note on TimelineEvent for why med
    changes live in their own table instead of here) plus patient-level
    TimelineEvent rows, sorted by date ascending.

    A caregiver's single backfilled entry already carries an explicit
    start/end wider than its own `date` (see routers/logs.py's episode
    handling) — this only needs to *merge*, not invent, spans: multiple
    occurred=True rows on physically adjacent dates (the plain day-by-day
    case, no backfill) still collapse into one bar the same way.
    """
    spans = []
    for log in logs:
        ep = log.episode or {}
        if not ep.get("occurred"):
            continue
        start = ep.get("start") or log.date.isoformat()
        end = ep.get("end") or log.date.isoformat()
        logged_at = ep.get("logged_at") or log.created_at.date().isoformat()
        spans.append({"start": start, "end": end, "outcome": ep.get("outcome"), "logged_at": logged_at})

    spans.sort(key=lambda s: s["start"])
    merged: list = []
    for s in spans:
        if merged and s["start"] <= _next_day_iso(merged[-1]["end"]):
            merged[-1]["end"] = max(merged[-1]["end"], s["end"])
            merged[-1]["logged_at"] = max(merged[-1]["logged_at"], s["logged_at"])
            merged[-1]["outcome"] = merged[-1]["outcome"] or s["outcome"]
        else:
            merged.append(dict(s))

    events = [
        {"type": "episode", "start": m["start"], "end": m["end"], "outcome": m["outcome"], "logged_at": m["logged_at"]}
        for m in merged
    ]
    for te in timeline_events:
        events.append({"type": te.type, "date": te.date.isoformat(), "label": te.label})

    events.sort(key=lambda e: e.get("start") or e.get("date"))
    return events
