"""LLM-phrased headline for the clinician dashboard's Quick View symptom
ticker — the one sentence a psychiatrist reads before walking in.

Unlike services/synthesis.py, this call never reads a caregiver's raw notes
or logs: it sees only the already-computed facts (symptom name, acuity tier,
event classification, from->to values, adherence ordering) that
services/aggregation.py produces. The model's only two jobs are choosing
which fact leads and phrasing it — it must never compute a delta, invent a
number, or infer a cause from data it was never shown.

Called live, on every /symptom-ticker request, recomputed fresh whenever the
clinician changes the range — unlike synthesis.py's batched-and-cached
precedent. That precedent exists because synthesis.py reads slow,
unpredictable free text; this prompt's payload is a small structured JSON
blob, and the whole point of "what's changed since I last saw them" is that
it has to describe whatever window is currently on screen, not a stale
30-day number under a 6-month chart. An explicit timeout plus a
deterministic, tier-and-event-aware fallback (fallback_headline below) mean a
slow or failed OpenAI call degrades to a plain sentence, never a blank page.
"""
import json
import os
from datetime import date

from openai import OpenAI

from services.aggregation import EVENT_RANK, TIER_RANK

DEFAULT_TIMEOUT_SECONDS = 5.0

SYSTEM_PROMPT = (
    "You are writing a single pre-visit headline for a psychiatrist about to see "
    "a patient, from a small JSON blob of already-computed facts about symptom "
    "changes over a specific window (their last visit, or a fixed lookback if "
    "no visit date is on record). Every fact — the symptom name, its severity "
    "tier, its event type, its from/to values, and any adherence ordering — has "
    "already been computed by the system. You do not compute anything. Your "
    "only two jobs: choose which fact(s) lead the sentence, and phrase it.\n\n"
    "HARD RULES, no exceptions:\n"
    "1. PRESENT, NEVER DIAGNOSE. State what the data shows, never a clinical "
    "conclusion or cause. \"Suicidal thoughts have started appearing\" is fine. "
    "\"Patient is decompensating\" or anything implying a diagnosis or cause is "
    "not.\n"
    "2. LEAD WITH WHAT MATTERS MOST, NOT THE BIGGEST NUMBER. A red-tier fact "
    "(tier='red') always leads over amber, which always leads over routine, "
    "regardless of how large any routine symptom's numeric change is. Within "
    "the same tier, 'emerged' and 'persisting' outrank 'worsening', which "
    "outranks 'improving' or 'resolved'. Never open by counting how many "
    "symptoms got better if anything red or amber moved, emerged, or "
    "persisted — that reads as reassurance when it is not.\n"
    "3. NUMBERS ARE THE POINT. State the actual from->to values and deltas "
    "you were given — do not omit them, and never invent or adjust a number. "
    "If `granularity` is not \"daily scores\", these numbers are averages (e.g. "
    "a weekly or monthly mean), not any single observed score — phrase the "
    "change as a change in that average (\"the weekly average is up...\"), "
    "never imply one day's score moved by that amount.\n"
    "4. ADHERENCE — ONLY IF ORDERING IS GIVEN. Mention medication adherence "
    "only when `adherence_ordering` is present, and state the ordering exactly "
    "as given: which one's onset date came first (or that both changed in the "
    "same week). That ordering — cause-before or consequence-after — is the "
    "entire reason to mention adherence at all. If `adherence_ordering` is "
    "null, do not mention adherence, even if its own numbers look like a "
    "decline — the system already decided the ordering can't be established "
    "honestly.\n"
    "5. ONLY USE THE FACTS PROVIDED. Never reference a symptom, value, or "
    "date that isn't in the input. Never speculate about why something "
    "changed.\n"
    "6. ONE TO TWO PLAIN SENTENCES. No bullet points, no markdown, no em "
    "dashes.\n\n"
    "Return ONLY valid JSON: {\"headline\": \"...\"} — no markdown fences, no "
    "extra text."
)


def _window_label(days: int) -> str:
    if days <= 7:
        return "the last week"
    if days <= 30:
        return f"the last {days} days"
    if days <= 90:
        return "the last 3 months"
    if days <= 182:
        return "the last 6 months"
    return "the last year"


def _granularity_label(bin_days: int) -> str:
    if bin_days <= 1:
        return "daily scores"
    if bin_days <= 7:
        return "weekly averages"
    if bin_days <= 14:
        return "biweekly averages"
    return "monthly averages"


def _fmt_date(iso: str) -> str:
    d = date.fromisoformat(iso)
    return f"{d.strftime('%b')} {d.day}"


def _symptom_fact(s: dict) -> dict:
    """The subset of a SymptomDelta the LLM is allowed to see — never the
    full day-by-day series, only the already-computed summary of it."""
    return {
        "symptom": s["symptom"],
        "tier": s["tier"],
        "event": s["event"],
        "from": s.get("baseline_value"),
        "to": s.get("current_value"),
        "delta": s.get("delta"),
    }


def _adherence_fact(a: dict) -> dict:
    return {
        "event": (
            "worsening" if (a.get("delta") is not None and a["delta"] < 0)
            else "improving" if (a.get("delta") is not None and a["delta"] > 0)
            else "steady"
        ),
        "from": a.get("baseline_value"),
        "to": a.get("current_value"),
        "delta": a.get("delta"),
    }


def rank_symptoms(symptoms: list) -> list:
    """Same tier-then-event-then-magnitude priority the LLM is instructed to
    follow (EVENT_RANK/TIER_RANK in aggregation.py) — used both to pick the
    fallback headline's lead and, by the caller, to identify "the leading
    symptom" for the adherence-ordering computation. 'steady' (no real
    signal) is excluded; there is nothing to lead with."""
    return sorted(
        (s for s in symptoms if s["event"] != "steady"),
        key=lambda s: (TIER_RANK.get(s["tier"], 2), EVENT_RANK.get(s["event"], 5), -abs(s.get("delta") or 0)),
    )


def build_headline_prompt(symptoms: list, adherence: dict, window_days: int, bin_days: int, ordering: dict = None) -> tuple:
    payload = {
        "window_label": _window_label(window_days),
        "granularity": _granularity_label(bin_days),
        "symptoms": [_symptom_fact(s) for s in symptoms],
        "adherence": _adherence_fact(adherence),
        "adherence_ordering": ordering,
    }
    user_prompt = f"Facts for {payload['window_label']} ({payload['granularity']}):\n{json.dumps(payload, indent=2)}"
    return SYSTEM_PROMPT, user_prompt


def generate_headline(
    symptoms: list, adherence: dict, window_days: int, bin_days: int, api_key: str,
    ordering: dict = None, model: str = None, timeout: float = DEFAULT_TIMEOUT_SECONDS,
) -> str:
    """Single OpenAI call, no retry. Raises on any failure — timeout, network,
    malformed JSON, empty string — the caller (get_symptom_ticker) is
    responsible for catching that and using fallback_headline instead. This
    function never swallows an error itself, so failure mode stays visible to
    whoever's debugging it rather than silently downgraded twice.
    """
    system_prompt, user_prompt = build_headline_prompt(symptoms, adherence, window_days, bin_days, ordering)
    client = OpenAI(api_key=api_key)
    completion = client.chat.completions.create(
        model=model or os.getenv("OPENAI_MODEL", "gpt-4.1-mini"),
        response_format={"type": "json_object"},
        timeout=timeout,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    )
    raw = (completion.choices[0].message.content or "").strip()
    data = json.loads(raw)
    headline = (data.get("headline") or "").strip()
    if not headline:
        raise ValueError("Model returned an empty headline")
    return headline


def _onset_verb(event: str) -> str:
    if event == "emerged":
        return "appeared"
    if event == "persisting":
        return "remained elevated"
    return "began rising"  # worsening


def _describe_event(f: dict, bin_days: int) -> str:
    name = f["symptom"]
    event = f["event"]
    avg_note = "" if bin_days <= 1 else f"'s {_granularity_label(bin_days).rstrip('s')}"
    if event == "emerged":
        return f"{name} has started appearing, not logged at all before this."
    if event == "resolved":
        return f"{name} is no longer being logged, after occurring regularly before."
    if event == "persisting":
        return f"{name} remains elevated at {f['current_value']:.1f}/10 with no real change."
    if event in ("worsening", "improving"):
        verb = "up" if event == "worsening" else "down"
        return f"{name}{avg_note} is {verb} {abs(f['delta']):.1f} points, from {f['baseline_value']:.1f} to {f['current_value']:.1f}."
    return f"{name} is unchanged."


def _describe_ordering(o: dict, lead_event: str) -> str:
    lead = o["lead_symptom"]
    lead_lower = lead[0].lower() + lead[1:] if lead else lead
    lead_date = _fmt_date(o["lead_onset"])
    adh_date = _fmt_date(o["adherence_onset"])
    if o["ordering"] == "adherence_first":
        return f"Doses were missed starting {adh_date}; {lead_lower} {_onset_verb(lead_event)} {lead_date}."
    if o["ordering"] == "symptom_first":
        return f"{lead} {_onset_verb(lead_event)} {lead_date}; doses were missed starting {adh_date}."
    earlier = min(o["lead_onset"], o["adherence_onset"])
    return f"Both changed in the week of {_fmt_date(earlier)}."


def fallback_headline(symptoms: list, adherence: dict, window_days: int, bin_days: int, ordering: dict = None) -> str:
    """Deterministic headline used when the LLM call fails, times out, or
    OPENAI_API_KEY isn't configured. Ranked by the exact same tier-then-event
    priority the LLM is instructed to follow, so a fallback headline is wrong
    in register but never wrong in priority — it will never lead with
    "better than before" while a red-tier symptom is rising, and it will
    never hedge on adherence timing with vague "over the same period"
    phrasing — that clause is included only when `ordering` is given, exactly
    as computed, or omitted entirely otherwise.
    """
    if not symptoms:
        return f"Not enough data yet to compare {_window_label(window_days)}."

    ranked = rank_symptoms(symptoms)
    if not ranked:
        return f"No symptoms have changed in {_window_label(window_days)}."

    lead_sentence = _describe_event(ranked[0], bin_days)
    tail = f" {_describe_ordering(ordering, ranked[0]['event'])}" if ordering else ""

    return f"{lead_sentence}{tail}"
