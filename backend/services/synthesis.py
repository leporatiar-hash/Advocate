import json
import os
import re

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

# Soft check only, same reasoning as _COUNT_CLAIM_PATTERN above — flags a
# what_went_well observation that reads as a clinical improvement/recovery
# claim rather than a plain attributed observation, for human review.
_IMPROVEMENT_CLAIM_PATTERN = re.compile(
    r"\b(improv\w*|recover\w*|getting better|progress(?:ing|ed)?|on the mend)\b",
    re.IGNORECASE,
)

# Fixed display order — insights render in this order regardless of what order
# the model returns them in, and any category the model invents outside this
# list is dropped.
CATEGORIES = ["Medication", "Mood and behavior", "Substance", "Isolation and socialization", "Sleep"]

VALID_CHIPS = {"watch", "steady", "low_data"}

SYSTEM_PROMPT = (
    "You are a clinical documentation assistant. You read a caregiver's free-text "
    "daily observations about a patient and produce short, structured insight units "
    "for a psychiatrist reviewing the case before a visit.\n\n"
    "HARD RULES, no exceptions:\n"
    "1. ATTRIBUTE, NEVER DIAGNOSE. Write what the caregiver observed or reported, "
    "never a clinical conclusion. Say \"caregiver reports the patient described "
    "voices instructing self-harm\", never \"patient has command hallucinations\" "
    "or any diagnostic label. The caregiver observes; the clinician concludes. "
    "Violating this discredits the entire tool with a real psychiatrist.\n"
    "2. NO COUNTS OR NUMBERS. Never state a count, frequency, severity number, or "
    "occurrence tally (no \"3 episodes\", no \"twice this week\", no \"8/10\"). All "
    "counts and flags are computed separately by the system, not by you. Use "
    "qualitative language sparingly (\"recurring\", \"a single instance\") if "
    "frequency matters — never a digit tied to an occurrence count.\n"
    "3. PLAIN LANGUAGE, UNDER 20 WORDS PER OBSERVATION. Each observation is one "
    "short sentence a clinician can scan in a few seconds.\n"
    "4. NO EM DASHES. Use a period or comma instead.\n"
    "5. Never use the words \"app\", \"diagnose\", \"recommend\", or \"Witness\".\n"
    "6. Every date you cite in source_note_ids must be exactly one of the dates "
    "provided in the input. Never invent, estimate, or shift a date.\n"
    "7. Do not speculate beyond what the notes actually say.\n"
    "8. For what_went_well: surface positive caregiver-logged engagement — an "
    "activity, outing, social contact, or coping strategy the patient took part "
    "in (for example, asked to join a day program, went surfing, a walk, a "
    "coping strategy that helped, a steady stretch of days). Surface the "
    "engagement itself even if the same note also describes a difficult moment "
    "or an episode elsewhere in the account — being out and engaged is worth "
    "noting on its own, do not withhold it just because something else in the "
    "note was hard. Attribute each to the exact date it was logged on. Never "
    "assert clinical improvement, recovery, or a positive trend, and never claim "
    "the engagement caused or prevented anything — state only that it happened. "
    "Present the observation only, do not diagnose or recommend. If nothing "
    "qualifies, return an empty array. Same no-counts, no-em-dash, "
    "under-20-words rules apply.\n"
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
    categories_list = ", ".join(CATEGORIES)

    user_prompt = f"""Caregiver observations for {patient.name} ({patient.diagnosis}) — {len(periods)} distinct observations in the review window:

{obs_text}

Valid dates you may cite (do not use any date outside this list): {valid_dates}

Produce a JSON object with exactly this shape:
{{
  "insights": [
    {{
      "category": "one of: {categories_list}",
      "observation": "one short attributed sentence, under 20 words, plain language, non-diagnostic",
      "takeaway": "the phrase within the observation to bold for fast scanning, copied verbatim from the observation text",
      "chip": "one of: watch, steady, low_data",
      "source_note_ids": ["YYYY-MM-DD", "..."]
    }}
  ],
  "what_went_well": [
    {{
      "observation": "one short attributed positive observation, under 20 words, plain language, non-diagnostic",
      "date": "YYYY-MM-DD, the exact date this was logged, from the valid list above"
    }}
  ]
}}

Rules for insights:
- Categories, in this fixed order when present: {categories_list}.
- Include a category only if the notes actually contain a relevant observation for it. Omit categories with nothing to say. Do not force an entry.
- At most one insight per category.
- "takeaway" must be an exact substring of "observation" so it can be bolded within it.
- "chip" is "watch" if the observation describes something concerning or worth monitoring, "steady" if it describes a stable or unremarkable pattern, "low_data" if there is only sparse or single-instance evidence for it.
- "source_note_ids" lists the specific date(s), from the valid list above, that this observation is actually drawn from.

Rules for what_went_well:
- Surface positive caregiver-logged engagement: an activity, outing, social contact, or coping strategy the patient took part in (asked to join a day program, went surfing, a walk, a coping strategy that helped, a steady stretch of days, and similar). Surface the engagement itself even if the same note also describes a difficult moment or an episode elsewhere in the account — do not withhold it just because something else in the note was hard.
- Never assert improvement, recovery, or a positive trend, and never claim the engagement caused or prevented anything — state only that it happened.
- "date" must be exactly one of the valid dates above.
- If nothing in the notes qualifies as a positive observation, return an empty array. Do not invent one."""

    return SYSTEM_PROMPT, user_prompt


def generate_synthesis(patient, agg: dict, db: Session, api_key: str, model: str = None) -> dict:
    """Calls OpenAI once and returns the validated, cacheable content dict. This is
    the ONLY place in the codebase that should call OpenAI for the clinician
    portal — invoked exclusively by scripts/generate_synthesis.py, never by the
    portal's GET path, so a page load is always a cache read.

    The model writes observation/takeaway prose only. Every number, flag, and the
    top flag itself are computed deterministically elsewhere (services/aggregation.py)
    and never touched here.
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
        return {"insights": [], "what_went_well": [], "validation_warnings": []}

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
    warnings: list = []
    insights: list = []
    seen_categories: set = set()

    for item in (data.get("insights") or []):
        category = (item.get("category") or "").strip()
        if category not in CATEGORIES:
            warnings.append(f"Dropped an insight with an unrecognized category {category!r}.")
            continue
        if category in seen_categories:
            warnings.append(f"Dropped a second insight for category {category!r} — at most one per category.")
            continue

        observation = (item.get("observation") or "").strip()
        if not observation:
            continue

        takeaway = (item.get("takeaway") or "").strip()
        if takeaway and takeaway not in observation:
            warnings.append(f"Takeaway for {category!r} was not a substring of its observation — takeaway dropped.")
            takeaway = ""

        chip = (item.get("chip") or "").strip()
        if chip not in VALID_CHIPS:
            warnings.append(f"Insight for {category!r} had an invalid chip {chip!r} — defaulted to 'watch'.")
            chip = "watch"

        source_note_ids = []
        for note_id in (item.get("source_note_ids") or []):
            if note_id in valid_dates:
                source_note_ids.append(note_id)
            else:
                warnings.append(
                    f"Insight for {category!r} cited an unverifiable date {note_id!r} — dropped from source_note_ids."
                )
        if not source_note_ids:
            warnings.append(f"Dropped insight for {category!r} — no verifiable source dates.")
            continue

        if _COUNT_CLAIM_PATTERN.search(observation):
            warnings.append(
                f"Insight for {category!r} may contain a frequency/count claim the AI wrote itself — "
                f"review before trusting: {observation!r}"
            )

        insights.append({
            "category": category,
            "observation": observation,
            "takeaway": takeaway,
            "chip": chip,
            "source_note_ids": source_note_ids,
        })
        seen_categories.add(category)

    insights.sort(key=lambda i: CATEGORIES.index(i["category"]))

    what_went_well: list = []
    for item in (data.get("what_went_well") or []):
        observation = (item.get("observation") or "").strip()
        if not observation:
            continue

        date_str = (item.get("date") or "").strip()
        if date_str not in valid_dates:
            warnings.append(
                f"Dropped a what_went_well observation with an unverifiable date {date_str!r}: {observation!r}"
            )
            continue

        if _COUNT_CLAIM_PATTERN.search(observation):
            warnings.append(
                f"what_went_well observation may contain a frequency/count claim the AI wrote itself — "
                f"review before trusting: {observation!r}"
            )
        if _IMPROVEMENT_CLAIM_PATTERN.search(observation):
            warnings.append(
                f"what_went_well observation may assert improvement/recovery rather than a plain observation — "
                f"review before trusting: {observation!r}"
            )

        what_went_well.append({"observation": observation, "date": date_str})

    return {"insights": insights, "what_went_well": what_went_well, "validation_warnings": warnings}


# ── Temporal Data bin readouts ───────────────────────────────────────────────
# One call per bin-with-notes, made only by scripts/generate_synthesis.py —
# never on the portal's GET path. note_severity rates the notes only; the
# numeric metrics (scored_sev, has_episode) are never sent to the model and
# never influence its rating — see services/aggregation.combine_bin_severity
# for where those actually combine with note_severity server-side.
TEMPORAL_SYSTEM_PROMPT = (
    "You are a clinical documentation assistant. You read a caregiver's free-text "
    "notes covering one time period (a day, week, or month) of a patient's care "
    "log. You rate how concerning that period's notes sound and write one "
    "plain-language line describing them, for a psychiatrist reviewing the case.\n\n"
    "HARD RULES, no exceptions:\n"
    "1. ATTRIBUTE, NEVER DIAGNOSE. Describe what the caregiver reported, never a "
    "clinical conclusion. The caregiver observes; the clinician concludes.\n"
    "2. Base note_severity ONLY on what the notes say. Do not infer beyond the "
    "text.\n"
    "3. readout is ONE short sentence, under 20 words, plain language, describing "
    "this period from the notes. Attributed observation only, no diagnosis, no "
    "recommendation, no claim of improvement or worsening trend.\n"
    "4. NO EM DASHES. Use a period or comma instead.\n"
    "5. Never use the words \"app\", \"diagnose\", \"recommend\", \"improving\", or "
    "\"Witness\".\n"
    "6. note_severity is a number from 0 to 10 (0 = notes show no concern, 10 = "
    "notes show the highest concern), on the same scale the rest of this system "
    "uses for symptom severity.\n"
    "7. Do not speculate beyond what the notes actually say.\n"
    "Return ONLY valid JSON matching the schema described in the user prompt — no "
    "markdown fences, no extra text."
)


def build_temporal_bin_prompt(patient, bin_label: str, notes: list) -> tuple:
    notes_text = "\n\n".join(f"- {n}" for n in notes)
    user_prompt = f"""Caregiver notes for {patient.name} ({patient.diagnosis}) logged during this period ({bin_label}):

{notes_text}

Produce a JSON object with exactly this shape:
{{
  "note_severity": <number 0-10>,
  "readout": "one short attributed sentence, under 20 words, plain language, non-diagnostic"
}}"""
    return TEMPORAL_SYSTEM_PROMPT, user_prompt


def generate_bin_readout(patient, bin_label: str, notes: list, api_key: str, model: str = None) -> dict:
    """One OpenAI call for one bin's notes. Returns the validated
    {note_severity, readout, warnings} for that bin — never called for a bin
    with no notes (see generate_temporal_readouts)."""
    system_prompt, user_prompt = build_temporal_bin_prompt(patient, bin_label, notes)

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

    warnings: list = []

    note_severity = data.get("note_severity")
    try:
        note_severity = float(note_severity)
    except (TypeError, ValueError):
        warnings.append(f"Bin {bin_label!r} returned a non-numeric note_severity {note_severity!r} — dropped.")
        note_severity = None
    if note_severity is not None and not (0 <= note_severity <= 10):
        warnings.append(f"Bin {bin_label!r} returned out-of-range note_severity {note_severity!r} — clamped.")
        note_severity = max(0.0, min(10.0, note_severity))

    readout = (data.get("readout") or "").strip()
    if _COUNT_CLAIM_PATTERN.search(readout):
        warnings.append(
            f"Readout for bin {bin_label!r} may contain a frequency/count claim the AI wrote itself — "
            f"review before trusting: {readout!r}"
        )

    return {"note_severity": note_severity, "readout": readout or None, "warnings": warnings}


def generate_temporal_readouts(patient, bins: list, api_key: str, model: str = None) -> dict:
    """Calls generate_bin_readout once per bin that has notes. Returns a dict
    keyed by each bin's start-date isoformat -> {note_severity, readout},
    plus the pooled validation_warnings — the shape scripts/generate_synthesis.py
    caches under content["temporal_readouts"]. Bins with no notes are skipped
    entirely (no call, note_severity null, no readout), per spec."""
    readouts: dict = {}
    warnings: list = []
    for b in bins:
        if not b["notes"]:
            continue
        result = generate_bin_readout(patient, b["label"], b["notes"], api_key, model)
        warnings.extend(result["warnings"])
        readouts[b["start"].isoformat()] = {
            "note_severity": result["note_severity"],
            "readout": result["readout"],
        }
    return {"temporal_readouts": readouts, "validation_warnings": warnings}
