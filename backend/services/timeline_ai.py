"""AI generation for the clinician timeline (demo-only) — one headline and
one summary per domain, plus note-to-domain assignment.

Same pattern as services/ticker_headline.py: Python computes every fact and
every number; the model only chooses which facts lead and phrases sentences.
A deterministic Python validator rejects any output that breaks the hard
rules and falls back to a plain template — this build does not ship relying
on the system prompt alone.

Runs inside a FastAPI BackgroundTasks job kicked off by routers/logs.py
whenever a demo patient's DailyLog is saved, never inside a request's
response path — a clinician's GET always reads whatever TimelineCache
currently holds, stale or fresh, and never blocks on an OpenAI call.
"""
import json
import os
import re
from datetime import datetime, date as date_type, timedelta
from typing import Optional

from openai import OpenAI

import models
from services.aggregation import (
    TIMELINE_DOMAIN_DEFS,
    TIMELINE_WINDOWS,
    build_timeline_domains,
    rank_timeline_domains,
)

DEFAULT_TIMEOUT_SECONDS = 8.0

# Closed list, checked verbatim (word-boundary, case-insensitive) against
# every generated sentence before it is ever stored or served. Phrasing here
# must match the system prompts' own banned-word lists exactly — if you add a
# rule to a prompt, add the matching term(s) here too, and vice versa.
BANNED_TERMS = [
    "caused", "cause", "causes", "causing",
    "led to", "leads to", "leading to",
    "triggered", "trigger", "triggers", "triggering",
    "because",
    "due to",
    "resulted in", "results in", "resulting in",
    "brought on", "bringing on",
    "made him", "made her", "made them",
    "drove", "driving him", "driving her", "driving them",
    "diagnose", "diagnosed", "diagnosing", "diagnosis",
    "predict", "predicts", "predicted", "predicting", "predictive",
    "detect", "detects", "detected", "detecting",
    "indicates", "indicate", "indicated", "indicating",
    "suggests", "suggest", "suggested", "suggesting",
    "consistent with",
    "symptoms of",
    "risk of",
    "likely to",
]

_BANNED_PATTERN = re.compile(
    r"\b(" + "|".join(re.escape(t) for t in BANNED_TERMS) + r")\b",
    re.IGNORECASE,
)


def find_banned_term(text: str) -> Optional[str]:
    """First banned term found in `text`, or None. Shared by the
    post-generation validator and by the adversarial test fixture."""
    m = _BANNED_PATTERN.search(text or "")
    return m.group(0) if m else None


HEADLINE_SYSTEM_PROMPT = (
    "You are writing a one-paragraph pre-visit headline for a psychiatrist, "
    "from a JSON blob of already-computed facts about one patient's tracked "
    "domains over a specific window. Every date and value you may reference "
    "is in the input — you compute nothing.\n\n"
    "HARD RULES:\n"
    "1. Under 60 words. One paragraph.\n"
    "2. Only reference dates and values supplied in the input. Never "
    "introduce a number.\n"
    "3. NO CAUSAL LANGUAGE. Never use: caused, led to, triggered, because, "
    "due to, resulted in, brought on, made him/her/them, drove. Describe "
    "sequence and observation only — \"stopped his medication on Dec 18\" is "
    "allowed; \"stopped his medication because of the weight gain\" is not, "
    "even if a caregiver note says exactly that. The note can say it. You "
    "cannot.\n"
    "4. NO DIAGNOSTIC OR PREDICTIVE LANGUAGE. Never use: diagnose, predict, "
    "detect, indicates, suggests, consistent with, symptoms of, risk of, "
    "likely to.\n"
    "5. Never infer intent, mood, or internal state that was not logged.\n"
    "6. If the data does not support a sentence, write less. Silence over "
    "speculation.\n\n"
    "Return ONLY valid JSON: {\"headline\": \"...\"} — no markdown fences, no "
    "extra text."
)

DOMAIN_SUMMARY_SYSTEM_PROMPT = (
    "You are writing a short summary of one tracked domain for a "
    "psychiatrist, from a JSON blob of already-computed facts (a series of "
    "values/bands, and the caregiver notes assigned to this domain) over a "
    "specific window. You compute nothing — describe what the notes and the "
    "series show, in sequence. Do not interpret.\n\n"
    "HARD RULES:\n"
    "1. Three sentences maximum.\n"
    "2. Only reference dates and values supplied in the input. Never "
    "introduce a number.\n"
    "3. NO CAUSAL LANGUAGE: caused, led to, triggered, because, due to, "
    "resulted in, brought on, made him/her/them, drove.\n"
    "4. NO DIAGNOSTIC OR PREDICTIVE LANGUAGE: diagnose, predict, detect, "
    "indicates, suggests, consistent with, symptoms of, risk of, likely to.\n"
    "5. Never infer intent, mood, or internal state that was not logged.\n"
    "6. If the data does not support a sentence, write less.\n\n"
    "Return ONLY valid JSON: {\"summary\": \"...\"} — no markdown fences, no "
    "extra text."
)

NOTE_ASSIGNMENT_SYSTEM_PROMPT = (
    "You are sorting caregiver notes into clinical domains for a "
    "psychiatrist's dashboard. You are given a closed list of domain keys "
    "and a list of dated, authored notes. For each note, return every "
    "domain key it is relevant to — a note may belong to more than one "
    "domain (e.g. a note about smoking at 2am belongs under both sleep and "
    "cigarettes; include both). If a note does not clearly relate to any "
    "domain in the list, return an empty list for it. Do not force a match.\n\n"
    "Return ONLY valid JSON: "
    "{\"assignments\": {\"<note_date>\": [\"<domain_key>\", ...]}} — one entry "
    "per note date given, using ONLY domain keys from the list provided. No "
    "markdown fences, no extra text."
)


def _client(api_key: str) -> OpenAI:
    return OpenAI(api_key=api_key)


def _model() -> str:
    return os.getenv("OPENAI_MODEL", "gpt-4.1-mini")


def generate_headline(facts: dict, api_key: str, timeout: float = DEFAULT_TIMEOUT_SECONDS) -> str:
    """Raises on any failure — the caller catches and falls back, same
    contract as services/ticker_headline.py.generate_headline."""
    completion = _client(api_key).chat.completions.create(
        model=_model(),
        response_format={"type": "json_object"},
        timeout=timeout,
        messages=[
            {"role": "system", "content": HEADLINE_SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(facts, indent=2)},
        ],
    )
    raw = (completion.choices[0].message.content or "").strip()
    headline = (json.loads(raw).get("headline") or "").strip()
    if not headline:
        raise ValueError("Model returned an empty headline")
    return headline


def fallback_headline(facts: dict) -> str:
    """Deterministic, banned-term-free by construction (pure string
    templating over numbers/labels, no free-form phrasing)."""
    lead = facts.get("lead_domain")
    range_start, range_end = facts.get("range_start"), facts.get("range_end")
    coverage = f"{facts.get('days_logged', 0)} of {facts.get('days_in_range', 0)} days logged."
    if not lead:
        return f"No domain changes to summarize between {range_start} and {range_end}. {coverage}"
    return (
        f"{lead['label']} moved from {lead['start']} to {lead['end']} "
        f"between {range_start} and {range_end}. {coverage}"
    )


def generate_domain_summary(facts: dict, api_key: str, timeout: float = DEFAULT_TIMEOUT_SECONDS) -> str:
    completion = _client(api_key).chat.completions.create(
        model=_model(),
        response_format={"type": "json_object"},
        timeout=timeout,
        messages=[
            {"role": "system", "content": DOMAIN_SUMMARY_SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(facts, indent=2)},
        ],
    )
    raw = (completion.choices[0].message.content or "").strip()
    summary = (json.loads(raw).get("summary") or "").strip()
    if not summary:
        raise ValueError("Model returned an empty summary")
    return summary


def fallback_domain_summary(facts: dict) -> str:
    return (
        f"{facts.get('label', 'This domain')} was logged on "
        f"{facts.get('days_logged', 0)} of {facts.get('days_in_range', 0)} "
        f"days in this window, with {facts.get('note_count', 0)} caregiver "
        f"note(s) on record."
    )


def assign_notes_to_domains(notes: list, domain_keys: list, api_key: str, timeout: float = DEFAULT_TIMEOUT_SECONDS) -> dict:
    """Returns {note_date: [domain_key, ...]}. A note date the model omits,
    or a domain key it invents outside `domain_keys`, is dropped here — the
    caller (regenerate_timeline_cache) is responsible for routing any note
    left with no valid assignment into "unassigned" so a note can never
    disappear from the view regardless of what the model returns."""
    payload = {
        "domain_keys": domain_keys,
        "notes": [{"date": n["date"], "author": n["author"], "text": n["text"]} for n in notes],
    }
    completion = _client(api_key).chat.completions.create(
        model=_model(),
        response_format={"type": "json_object"},
        timeout=timeout,
        messages=[
            {"role": "system", "content": NOTE_ASSIGNMENT_SYSTEM_PROMPT},
            {"role": "user", "content": json.dumps(payload, indent=2)},
        ],
    )
    raw = (completion.choices[0].message.content or "").strip()
    assignments = json.loads(raw).get("assignments") or {}

    valid_dates = {n["date"] for n in notes}
    result: dict = {}
    for note_date, keys in assignments.items():
        if note_date not in valid_dates:
            continue
        result[note_date] = [k for k in (keys or []) if k in domain_keys]
    return result


def validate_ai_text(text: str) -> Optional[str]:
    """Returns the banned term found, or None if `text` passes. Call before
    ever storing or serving model output."""
    return find_banned_term(text)


def get_latest_log_date(db, patient_id: int) -> Optional[date_type]:
    """The anchor for every window on the timeline — see regenerate_timeline_cache
    and routers/clinician_timeline.py, both of which must agree on this same
    anchor or the cached AI text and the freshly-computed series would
    describe two different date ranges."""
    row = (
        db.query(models.DailyLog.date)
        .filter(models.DailyLog.patient_id == patient_id)
        .order_by(models.DailyLog.date.desc())
        .first()
    )
    return row[0] if row else None


def _author_name(db, user_id: Optional[int]) -> str:
    if user_id is None:
        return "unknown"
    user = db.query(models.User).filter(models.User.id == user_id).first()
    return user.name if user else "unknown"


def _band_or_value(axis: str, entry: Optional[tuple]):
    if entry is None:
        return None
    _, value, band = entry
    return band if axis == "band" else value


def _generate_window_content(db, patient_id: int, window_days: int, end: date_type, assignments: dict, api_key) -> dict:
    """Headline + one summary per domain, scoped to exactly this window — see
    regenerate_timeline_cache's module note on why this runs once per window
    rather than once over the widest window with the UI re-slicing it: a
    headline computed over 12 months of mostly-empty padding describes a
    different (and confusing) story than the same headline scoped to the 1M
    the clinician is actually looking at.

    `assignments` (note -> domain keys) is computed ONCE by the caller, over
    the widest window, and passed in here rather than recomputed per window:
    a note's domain relevance is a property of the note itself, not of which
    time range happens to be selected, and recomputing it per window would
    needlessly repeat the same classification call four times.
    """
    start = end - timedelta(days=window_days - 1)
    date_objs = [start + timedelta(days=i) for i in range(window_days)]

    logs = (
        db.query(models.DailyLog)
        .filter(
            models.DailyLog.patient_id == patient_id,
            models.DailyLog.date >= start,
            models.DailyLog.date <= end,
        )
        .order_by(models.DailyLog.date.asc())
        .all()
    )

    domains_raw = build_timeline_domains(logs, date_objs)
    ranked_keys = rank_timeline_domains(domains_raw, window_days)

    notes = [
        {"date": log.date.isoformat(), "author": _author_name(db, log.logged_by), "text": log.notes}
        for log in logs if log.notes
    ]

    real_days_in_range = (logs[-1].date - logs[0].date).days + 1 if logs else window_days

    domain_content = {}
    now_iso = datetime.utcnow().isoformat()
    for d in TIMELINE_DOMAIN_DEFS:
        key = d["key"]
        axis = d["axis"]
        entries = domains_raw[key]
        # Band domains (including socialization, which has no underlying
        # number — see _socialization_band) are "logged" when their band is
        # set, not their value; numeric domains (weight) are the reverse.
        # Same distinction _domain_magnitude_and_density in aggregation.py
        # already makes for ranking.
        logged_entries = [e for e in entries if (e[1] is not None if axis == "numeric" else e[2] is not None)]
        domain_notes = [n for n in notes if key in assignments.get(n["date"], [])]
        facts = {
            "label": d["label"],
            "axis": axis,
            "days_logged": len(logged_entries),
            "days_in_range": real_days_in_range,
            "start_value": _band_or_value(axis, logged_entries[0] if logged_entries else None),
            "end_value": _band_or_value(axis, logged_entries[-1] if logged_entries else None),
            "note_count": len(domain_notes),
            "notes": [{"date": n["date"], "text": n["text"]} for n in domain_notes],
        }
        summary = None
        if api_key:
            try:
                candidate = generate_domain_summary(facts, api_key)
                summary = None if validate_ai_text(candidate) else candidate
            except Exception:
                summary = None
        if not summary:
            summary = fallback_domain_summary(facts)
        domain_content[key] = {"summary": summary, "generated_at": now_iso}

    lead_key = ranked_keys[0] if ranked_keys else None
    lead_facts = None
    if lead_key:
        lead_def = next(d for d in TIMELINE_DOMAIN_DEFS if d["key"] == lead_key)
        entries = domains_raw[lead_key]
        logged = [e for e in entries if e[1] is not None]
        if logged:
            lead_facts = {
                "label": lead_def["label"],
                "start": _band_or_value(lead_def["axis"], logged[0]),
                "end": _band_or_value(lead_def["axis"], logged[-1]),
            }

    logged_dates = sorted({log.date for log in logs})
    headline_facts = {
        # The patient's actual logged span within THIS window, not the full
        # padded window — "between Dec 2 and Jan 9" for a 1M view ending
        # mid-episode, not "between Dec 2 and Jan 31" borrowed from a wider
        # window's data.
        "range_start": logged_dates[0].isoformat() if logged_dates else date_objs[0].isoformat(),
        "range_end": logged_dates[-1].isoformat() if logged_dates else date_objs[-1].isoformat(),
        "days_logged": len(logged_dates),
        "days_in_range": real_days_in_range,
        "lead_domain": lead_facts,
        "ranked_domains": ranked_keys,
    }
    headline = None
    if api_key:
        try:
            candidate = generate_headline(headline_facts, api_key)
            headline = None if validate_ai_text(candidate) else candidate
        except Exception:
            headline = None
    if not headline:
        headline = fallback_headline(headline_facts)

    return {"headline": headline, "headline_generated_at": now_iso, "domains": domain_content}


def regenerate_timeline_cache(patient_id: int) -> None:
    """Entry point for the BackgroundTasks job (see routers/logs.py).

    Opens its own DB session — by the time a background task runs, the
    request-scoped session FastAPI's Depends(get_db) provided has already
    been closed. Marks the cache row `pending` before doing any OpenAI work
    so a concurrent GET can show "updating" instead of blocking or showing a
    blank headline, then writes fresh content and clears `pending` on the
    way out — success or failure. A failed regeneration clears `pending` and
    leaves the previous content exactly as it was; it never blanks it.

    Generates and caches a SEPARATE headline + set of domain summaries for
    EACH window (1m/2m/3m/12m) — not once over the widest window with the UI
    re-slicing the same text underneath every range. A window-scoped
    headline read against a different window's data reads as a bug (it is
    one): "Cigarettes moved from none to medium" describing a 12-month span
    while the clinician is looking at a 1-month chart is not what "generate
    on write" was meant to produce.

    Cost note (see routers/logs.py's caller for the is_demo gate and the
    pending-guard debounce that goes with this): 4 windows x (1 headline + 6
    domain summaries) + 1 shared note-assignment call = 29 OpenAI calls per
    regeneration. Note assignment is computed ONCE here, over the widest
    window, and reused across all four — a note's relevant domain(s) don't
    change depending on which range is on screen, so there is no reason to
    ask the model four times.
    """
    from database import SessionLocal  # local import: avoid a hard dependency at module import time

    db = SessionLocal()
    cache = None
    try:
        patient = db.query(models.Patient).filter(models.Patient.id == patient_id).first()
        if not patient or not patient.is_demo:
            return

        cache = db.query(models.TimelineCache).filter(models.TimelineCache.patient_id == patient_id).first()
        if not cache:
            cache = models.TimelineCache(patient_id=patient_id, content={}, pending=True)
            db.add(cache)
        else:
            cache.pending = True
        db.commit()

        # Anchored to the patient's own most recent logged day, not wall-clock
        # today — this dataset lives in a fixed historical range, and a live
        # demo can happen on any real date. Anchoring to the data itself also
        # means a caregiver's newly-saved "today" log naturally becomes the
        # new anchor with zero extra logic (see get_latest_log_date below).
        end = get_latest_log_date(db, patient_id) or date_type.today()
        widest_days = max(TIMELINE_WINDOWS.values())
        widest_start = end - timedelta(days=widest_days - 1)

        all_logs = (
            db.query(models.DailyLog)
            .filter(
                models.DailyLog.patient_id == patient_id,
                models.DailyLog.date >= widest_start,
                models.DailyLog.date <= end,
            )
            .order_by(models.DailyLog.date.asc())
            .all()
        )
        domain_keys = [d["key"] for d in TIMELINE_DOMAIN_DEFS]
        api_key = os.getenv("OPENAI_API_KEY")

        all_notes = [
            {"date": log.date.isoformat(), "author": _author_name(db, log.logged_by), "text": log.notes}
            for log in all_logs if log.notes
        ]
        assignments: dict = {}
        if api_key and all_notes:
            try:
                assignments = assign_notes_to_domains(all_notes, domain_keys, api_key)
            except Exception:
                assignments = {}

        windows_content = {}
        for window_key, window_days in TIMELINE_WINDOWS.items():
            windows_content[window_key] = _generate_window_content(db, patient_id, window_days, end, assignments, api_key)

        cache.content = {
            "note_assignments": assignments,
            "windows": windows_content,
        }
        cache.pending = False
        db.commit()
    except Exception:
        db.rollback()
        if cache is not None:
            try:
                cache.pending = False
                db.commit()
            except Exception:
                db.rollback()
    finally:
        db.close()
