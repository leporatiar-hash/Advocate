"""Read-only clinician timeline — demo build for the Radial pilot conversation.

NOT the production clinician portal. Every patient this endpoint can ever
return has is_demo == True, enforced as a database filter in the query
itself, not a UI filter: a clinician account physically cannot retrieve a
real caregiver's logs through this endpoint. See models.Patient.is_demo.

Out of scope here (see the spec this was built from): patient-to-clinician
linking, invitations, onboarding, access scoping beyond the is_demo filter,
audit logging, printing, export, mobile layout. The demo patient's clinician
association is hardcoded at the call site (Phase 2), not by this router.
"""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
import models
from auth import get_current_clinician
from services.aggregation import (
    TIMELINE_DOMAIN_DEFS,
    TIMELINE_WINDOWS,
    build_timeline_domains,
    build_timeline_events,
    rank_timeline_domains,
)
from services.timeline_ai import get_latest_log_date

router = APIRouter()


def _band_caption(entries: list) -> str:
    """Deterministic (no LLM) short caption: the current band and how many
    trailing consecutive days it's held, e.g. "Low 13 days". Walks backward
    from the end of the window; an unlogged day breaks the streak the same
    way it breaks the chart's polyline — silence isn't evidence the band held."""
    logged = [(d, b) for (d, _, b) in entries if b is not None]
    if not logged:
        return "No data this window"
    current_band = logged[-1][1]
    streak = 0
    for _, b in reversed(logged):
        if b != current_band:
            break
        streak += 1
    label = current_band.capitalize()
    return f"{label} {streak} day{'s' if streak != 1 else ''}"


def _numeric_caption(entries: list) -> str:
    values = [v for (_, v, _) in entries if v is not None]
    if not values:
        return "No data this window"
    return f"{min(values):g}–{max(values):g} lb"


@router.get("/patient/{patient_id}/timeline")
def get_clinician_timeline(
    patient_id: int,
    window: str = Query(default="1m"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_clinician),
):
    if window not in TIMELINE_WINDOWS:
        raise HTTPException(status_code=400, detail=f"window must be one of {sorted(TIMELINE_WINDOWS)}")

    # Not confirm-then-403: a non-demo (or nonexistent) patient ID returns the
    # exact same 404 either way, so this can't be used to probe which patient
    # IDs exist. Never split this into "find patient" then "check is_demo."
    patient = (
        db.query(models.Patient)
        .filter(models.Patient.id == patient_id, models.Patient.is_demo == True)  # noqa: E712
        .first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Not found")

    anchor = get_latest_log_date(db, patient_id)
    if anchor is None:
        raise HTTPException(status_code=404, detail="No data for this patient")

    earliest_row = (
        db.query(models.DailyLog.date)
        .filter(models.DailyLog.patient_id == patient_id)
        .order_by(models.DailyLog.date.asc())
        .first()
    )
    total_span_days = (anchor - earliest_row[0]).days + 1 if earliest_row else 1
    available_windows = [k for k, d in TIMELINE_WINDOWS.items() if d <= total_span_days]

    window_days = TIMELINE_WINDOWS[window]
    range_start = anchor - timedelta(days=window_days - 1)
    date_objs = [range_start + timedelta(days=i) for i in range(window_days)]

    logs = (
        db.query(models.DailyLog)
        .filter(
            models.DailyLog.patient_id == patient_id,
            models.DailyLog.date >= range_start,
            models.DailyLog.date <= anchor,
        )
        .order_by(models.DailyLog.date.asc())
        .all()
    )
    timeline_events = (
        db.query(models.TimelineEvent)
        .filter(
            models.TimelineEvent.patient_id == patient_id,
            models.TimelineEvent.date >= range_start,
            models.TimelineEvent.date <= anchor,
        )
        .all()
    )

    domains_raw = build_timeline_domains(logs, date_objs)
    ranked_keys = rank_timeline_domains(domains_raw, window_days)

    # Each of the 4 windows is generated and cached separately (see
    # regenerate_timeline_cache) — a window-scoped headline read against a
    # different window's data would describe a span the clinician isn't
    # looking at. note_assignments is shared across windows: a note's domain
    # relevance doesn't depend on which range happens to be selected.
    cache = db.query(models.TimelineCache).filter(models.TimelineCache.patient_id == patient_id).first()
    cached_content = (cache.content if cache else None) or {}
    cached_window = (cached_content.get("windows") or {}).get(window) or {}
    cached_domains = cached_window.get("domains") or {}
    note_assignments = cached_content.get("note_assignments") or {}

    author_by_id = {u.id: u.name for u in db.query(models.User).all()}
    all_notes = [
        {"date": log.date.isoformat(), "author": author_by_id.get(log.logged_by, "unknown"), "text": log.notes}
        for log in logs
        if log.notes
    ]
    assigned_dates: set = set()

    domain_label = {d["key"]: d["label"] for d in TIMELINE_DOMAIN_DEFS}
    domain_axis = {d["key"]: d["axis"] for d in TIMELINE_DOMAIN_DEFS}

    domains_out = []
    for key in ranked_keys:
        axis = domain_axis[key]
        entries = domains_raw[key]
        # `value` is always the raw underlying value, even for band domains
        # (e.g. anxiety's 0-10 severity alongside its "medium" band) — the
        # band is a display bucketing on top of the value, not a replacement
        # for it.
        series = [{"date": d.isoformat(), "band": b, "value": v} for (d, v, b) in entries]
        domain_notes = []
        for n in all_notes:
            if key in note_assignments.get(n["date"], []):
                domain_notes.append(n)
                assigned_dates.add(n["date"])

        cached = cached_domains.get(key) or {}
        domains_out.append({
            "key": key,
            "label": domain_label[key],
            "axis": axis,
            "caption": _numeric_caption(entries) if axis == "numeric" else _band_caption(entries),
            "series": series,
            "summary": cached.get("summary"),
            "summary_generated_at": cached.get("generated_at"),
            "notes": domain_notes,
        })

    other_notes = [n for n in all_notes if n["date"] not in assigned_dates]

    days_logged = len({log.date for log in logs})
    authors = sorted({n["author"] for n in all_notes} | {author_by_id.get(l.logged_by, "unknown") for l in logs})

    return {
        "patient": {
            "name": patient.name,
            "range_start": date_objs[0].isoformat(),
            "range_end": date_objs[-1].isoformat(),
            "days_in_range": window_days,
            "days_logged": days_logged,
            "authors": authors,
        },
        "headline": cached_window.get("headline") or "Generating…",
        "headline_generated_at": cached_window.get("headline_generated_at"),
        "pending": bool(cache.pending) if cache else True,
        "available_windows": available_windows,
        "events": build_timeline_events(logs, timeline_events),
        "domains": domains_out,
        "other_notes": other_notes,
    }
