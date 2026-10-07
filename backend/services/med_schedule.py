"""Medication schedules: when is a dose actually due?

The daily log has always written a `taken: false` entry for every active med
with no dose logged, regardless of whether that med was due that day. An
every-other-day or as-needed med therefore showed up as a "missed dose" on
every day it wasn't supposed to be taken.

Stored logs are never rewritten. Every reader of `medications_taken` goes
through the filters here instead, so the correction is reversible and past
false misses disappear as soon as a caregiver sets a schedule.

Mirrored on the frontend by app/lib/medSchedule.ts — keep the two in sync.
"""
import re
from collections import defaultdict
from datetime import date as date_type
from typing import Iterable, Optional

DAILY = "daily"
EVERY_N_DAYS = "every_n_days"
WEEKDAYS = "weekdays"
AS_NEEDED = "as_needed"
SCHEDULE_TYPES = (DAILY, EVERY_N_DAYS, WEEKDAYS, AS_NEEDED)

# Legacy meds only have free-text `frequency`. Anything that reads like PRN is
# treated as as-needed; everything else stays daily (the pre-schedule behavior).
_AS_NEEDED_RE = re.compile(r"\b(as[\s-]*needed|prn|when[\s-]*needed|if[\s-]*needed|as[\s-]*required)\b", re.I)


def effective_schedule_type(med) -> str:
    stype = getattr(med, "schedule_type", None)
    if stype in SCHEDULE_TYPES:
        return stype
    if _AS_NEEDED_RE.search(getattr(med, "frequency", None) or ""):
        return AS_NEEDED
    return DAILY


def is_as_needed(med) -> bool:
    return effective_schedule_type(med) == AS_NEEDED


def _as_date(d) -> date_type:
    return d if isinstance(d, date_type) else date_type.fromisoformat(str(d)[:10])


def is_due(med, d) -> bool:
    """Whether a scheduled dose of `med` was expected on date `d`. As-needed
    meds are never due. An incomplete schedule (no interval/anchor, no
    weekdays) falls back to daily rather than hiding the med."""
    stype = effective_schedule_type(med)
    if stype == AS_NEEDED:
        return False
    d = _as_date(d)
    if stype == EVERY_N_DAYS:
        interval = getattr(med, "schedule_interval_days", None)
        anchor = getattr(med, "schedule_start_date", None)
        if not interval or interval < 1 or anchor is None:
            return True
        # Python's % is non-negative for a positive divisor, so dates before
        # the anchor land on the same cadence.
        return (d - _as_date(anchor)).days % interval == 0
    if stype == WEEKDAYS:
        days = getattr(med, "schedule_weekdays", None) or []
        if not days:
            return True
        return d.weekday() in days
    return True


def meds_for_log(log) -> dict:
    """medication_id -> Medication for the log's patient, inactive meds
    included (a past log can reference a med that has since been removed)."""
    patient = getattr(log, "patient", None)
    if patient is None:
        return {}
    return {m.id: m for m in (patient.medications or [])}


def filter_false_misses(entries: Optional[list], meds_by_id: dict, d) -> list:
    """Drop `taken: false` entries that were never real misses: as-needed meds,
    and scheduled meds on a day they weren't due. Given doses always stay, as
    do entries for meds we can't look up."""
    out = []
    for e in entries or []:
        if not e.get("taken"):
            med = meds_by_id.get(e.get("medication_id"))
            if med is not None and not is_due(med, d):
                continue
        out.append(e)
    return out


def filter_for_adherence(entries: Optional[list], meds_by_id: dict, d) -> list:
    """Stricter than filter_false_misses: as-needed meds are removed entirely,
    taken or not — a PRN dose is usage, not adherence."""
    return [
        e for e in filter_false_misses(entries, meds_by_id, d)
        if not (meds_by_id.get(e.get("medication_id")) is not None
                and is_as_needed(meds_by_id[e.get("medication_id")]))
    ]


def log_doses(log) -> list:
    """The log's medications_taken with false misses removed."""
    return filter_false_misses(log.medications_taken, meds_for_log(log), log.date)


def log_adherence_doses(log) -> list:
    """The log's medications_taken as adherence should count them."""
    return filter_for_adherence(log.medications_taken, meds_for_log(log), log.date)


def as_needed_usage(logs: Iterable, medications: Iterable) -> dict:
    """medication_id -> {name, times_given, days_given, dates} for every
    as-needed med in `medications`, counting only doses actually given."""
    prn = {m.id: m for m in medications if is_as_needed(m)}
    counts: dict = defaultdict(int)
    dates: dict = defaultdict(set)
    for log in logs:
        for e in log.medications_taken or []:
            mid = e.get("medication_id")
            if mid in prn and e.get("taken"):
                counts[mid] += 1
                dates[mid].add(log.date.isoformat())
    return {
        mid: {
            "name": med.name,
            "times_given": counts[mid],
            "days_given": len(dates[mid]),
            "dates": sorted(dates[mid]),
        }
        for mid, med in prn.items()
    }
