import json
import os
import re
from datetime import date as date_type

from openai import OpenAI
from sqlalchemy.orm import Session

import models

# Soft check only — see the module docstring below for why this can't be a hard
# block. Flags "3 times" / "twice" / "5 episodes" style frequency claims for human
# review; deliberately does not touch legitimate numbers like doses ("400mg") or
# times of day ("3pm"), which would make this useless if blocked outright.
_COUNT_CLAIM_PATTERN = re.compile(
    r"\b\d+\s*(times?|occasions?|episodes?|separate\s+days?|days?\s+in\s+a\s+row)\b",
    re.IGNORECASE,
)

SYSTEM_PROMPT = (
    "You are a clinical documentation assistant. You read a caregiver's free-text "
    "daily observations about a patient and synthesize them into a structured "
    "clinical summary for a psychiatrist reviewing the case.\n\n"
    "HARD RULES, no exceptions:\n"
    "1. ATTRIBUTE, NEVER DIAGNOSE. Write what the caregiver observed or reported, "
    "never a clinical conclusion. Say \"caregiver reports the patient described "
    "voices instructing self-harm\", never \"patient has command hallucinations\" "
    "or any diagnostic label. The caregiver observes; the clinician concludes. "
    "Violating this discredits the entire tool with a real psychiatrist.\n"
    "2. WRITE PROSE ONLY. Never state a count, frequency, or number of occurrences "
    "(no \"3 episodes\", no \"twice this week\", no severity numbers). All counts "
    "are computed separately by the system, not by you. If frequency matters, use "
    "qualitative language sparingly (\"recurring\", \"a single instance\") — never "
    "a digit tied to an occurrence count. Numbers that are not occurrence counts "
    "(e.g. a medication dose mentioned by the caregiver) are fine.\n"
    "3. QUOTE SPARINGLY. Use the caregiver's exact words only for the one or two "
    "clinically sharpest lines, typically a safety statement. Every quote must be "
    "copied verbatim from the notes provided — never paraphrase and present it as "
    "a quote.\n"
    "4. Every date you cite must be exactly one of the dates provided in the input. "
    "Never invent, estimate, or shift a date.\n"
    "5. Do not speculate beyond what the notes actually say.\n"
    "Return ONLY valid JSON matching the schema described in the user prompt — no "
    "markdown fences, no extra text."
)


def _format_medications_taken(entries: list, med_names: dict) -> str:
    parts = []
    for m in entries or []:
        name = med_names.get(m.get("medication_id"), f"medication #{m.get('medication_id')}")
        parts.append(f"{name} {'taken' if m.get('taken') else 'NOT taken'}")
    return ", ".join(parts)


def _format_observation_periods(periods: list, med_names: dict) -> str:
    blocks = []
    for p in periods:
        header = p["date"].isoformat()
        if p["repeated_dates"]:
            reaffirmed = ", ".join(d.isoformat() for d in p["repeated_dates"])
            header += (
                f" (caregiver reaffirmed with no new detail on {reaffirmed} — "
                f"this is ONE observation; cite only {p['date'].isoformat()} if "
                "referencing it)"
            )
        lines = [header]
        if p["notes"]:
            lines.append(f"  Notes: {p['notes']}")
        episode = p.get("episode") or {}
        if episode.get("occurred"):
            desc = episode.get("description") or ""
            time = episode.get("time") or ""
            suffix = f" at {time}" if time else ""
            lines.append(f"  Episode logged: {desc}{suffix}".rstrip())
        symptoms = [s for s in (p.get("symptoms") or []) if s.get("severity") is not None]
        if symptoms:
            sym_str = ", ".join(f"{s['name']} ({s['severity']}/10)" for s in symptoms)
            lines.append(f"  Symptoms logged: {sym_str}")
        meds_str = _format_medications_taken(p.get("medications_taken"), med_names)
        if meds_str:
            lines.append(f"  Medications: {meds_str}")
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)


def build_synthesis_prompt(patient, periods: list, med_names: dict) -> tuple:
    obs_text = _format_observation_periods(periods, med_names)
    valid_dates = ", ".join(p["date"].isoformat() for p in periods)

    user_prompt = f"""Caregiver observations for {patient.name} ({patient.diagnosis}) — {len(periods)} distinct observations in the review window:

{obs_text}

Valid dates you may cite (do not use any date outside this list): {valid_dates}

Produce a JSON object with exactly this shape:
{{
  "summary": "3-4 sentence prose synthesis of the interval as a whole",
  "safety": {{
    "has_events": true or false,
    "events": [
      {{"date": "YYYY-MM-DD", "text": "attributed prose description of the safety-relevant observation", "quote": "verbatim quote from that day's notes, or null if none used"}}
    ]
  }},
  "medication_response": {{
    "text": "prose synthesis of medication adherence struggles, side effects, perceived efficacy, and substance use affecting medication (e.g. smoking and clozapine levels) drawn from the notes"
  }},
  "trajectory": {{
    "text": "prose synthesis of good/bad day patterns, time-of-day patterns, triggers, and what helps, across the interval"
  }}
}}

Safety events are: suicidal ideation, self-harm, command hallucinations, or acute dangerous episodes. If none appear anywhere in the notes, set has_events to false and events to an empty list — do not invent one to fill the section."""

    return SYSTEM_PROMPT, user_prompt


def generate_synthesis(patient, agg: dict, db: Session, api_key: str, model: str = None) -> dict:
    """Calls OpenAI once and returns the validated, cacheable content dict. This is
    the ONLY place in the codebase that should call OpenAI for the clinician
    portal — invoked exclusively by scripts/generate_synthesis.py, never by the
    portal's GET path, so a page load is always a cache read.
    """
    periods = [
        p for p in agg["observation_periods"]
        if p["notes"] or (p.get("episode") or {}).get("occurred") or p["symptoms"] or p["medications_taken"]
    ]

    med_names = {
        m.id: m.name
        for m in db.query(models.Medication).filter(models.Medication.patient_id == patient.id).all()
    }

    if not periods:
        return {
            "summary": "No caregiver notes, episodes, or symptoms were logged in this interval.",
            "safety": {"has_events": False, "events": [], "no_events_text": "No safety events noted this interval."},
            "medication_response": {"text": "No medication-related observations were logged in this interval."},
            "trajectory": {"text": "Not enough logged detail this interval to describe a trajectory."},
            "validation_warnings": [],
        }

    system_prompt, user_prompt = build_synthesis_prompt(patient, periods, med_names)

    client = OpenAI(api_key=api_key)
    completion = client.chat.completions.create(
        model=model or os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
        response_format={"type": "json_object"},
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    raw = (completion.choices[0].message.content or "").strip()
    data = json.loads(raw)

    valid_dates = {p["date"].isoformat() for p in periods}
    notes_by_date = {p["date"].isoformat(): (p["notes"] or "") for p in periods}

    warnings: list = []

    # --- Validate safety events: date must be real, quote must be verbatim ---
    safety_in = data.get("safety") or {}
    events = []
    for ev in (safety_in.get("events") or []):
        text = (ev.get("text") or "").strip()
        if not text:
            continue
        date_str = ev.get("date")
        confirmed_date = date_str if date_str in valid_dates else None
        if date_str and not confirmed_date:
            warnings.append(
                f"Safety event cited an unverifiable date ({date_str!r}); the date "
                "was suppressed but the content was kept, since safety content is "
                "never dropped for a formatting mismatch."
            )
        quote = ev.get("quote")
        if quote:
            source_text = notes_by_date.get(confirmed_date or date_str, "")
            if quote.strip().lower() not in source_text.lower():
                warnings.append(
                    f"A quote attributed to {date_str!r} was not found verbatim in "
                    "that day's notes — quote dropped, event text kept."
                )
                quote = None
        events.append({"event_date": confirmed_date, "text": text, "quote": quote})

    has_events = bool(events)  # ignore the model's own has_events if it contradicts its events list

    # --- Soft check for count/frequency claims slipping into prose ---
    prose_fields = {
        "summary": data.get("summary", ""),
        "medication_response": (data.get("medication_response") or {}).get("text", ""),
        "trajectory": (data.get("trajectory") or {}).get("text", ""),
    }
    for ev in events:
        prose_fields[f"safety_event[{ev['event_date']}]"] = ev["text"]
    for field_name, text in prose_fields.items():
        if _COUNT_CLAIM_PATTERN.search(text):
            warnings.append(
                f"Field {field_name!r} may contain a frequency/count claim the AI "
                f"wrote itself — review before trusting: {text!r}"
            )

    return {
        "summary": (data.get("summary") or "").strip(),
        "safety": {
            "has_events": has_events,
            "events": events,
            "no_events_text": "No safety events noted this interval.",
        },
        "medication_response": {"text": (data.get("medication_response") or {}).get("text", "").strip()},
        "trajectory": {"text": (data.get("trajectory") or {}).get("text", "").strip()},
        "validation_warnings": warnings,
    }
