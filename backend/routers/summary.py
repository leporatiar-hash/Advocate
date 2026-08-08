from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from datetime import datetime, date as date_type
from typing import Optional
from collections import defaultdict
import json
import os
from dotenv import load_dotenv
from openai import OpenAI

from database import get_db
import models
from auth import get_current_user
from routers.medications import lookup_known_side_effects
from instruments import INSTRUMENTS
from services.aggregation import build_patient_aggregate

load_dotenv()

router = APIRouter()


def _build_assessment_data(patient_id: int, start_date, end_date, db: Session) -> dict:
    """Assessment scores for the clinician export. CSI is excluded because
    instruments.INSTRUMENTS["csi"]["in_export"] is False — filtering happens
    on that config flag, never on a hardcoded instrument name, so CSI never
    leaks into any summary payload."""
    export_keys = [key for key, inst in INSTRUMENTS.items() if inst["in_export"]]

    assessment_data = {}
    for key in export_keys:
        in_range = (
            db.query(models.Assessment)
            .filter(
                models.Assessment.patient_id == patient_id,
                models.Assessment.instrument_key == key,
                models.Assessment.created_at >= datetime.combine(start_date, datetime.min.time()),
                models.Assessment.created_at <= datetime.combine(end_date, datetime.max.time()),
            )
            .order_by(models.Assessment.created_at.asc())
            .all()
        )
        if not in_range:
            continue

        baseline = (
            db.query(models.Assessment)
            .filter(
                models.Assessment.patient_id == patient_id,
                models.Assessment.instrument_key == key,
                models.Assessment.created_at < datetime.combine(start_date, datetime.min.time()),
            )
            .order_by(models.Assessment.created_at.desc())
            .first()
        )

        scores = []
        for a in in_range:
            entry = {"date": a.created_at.date().isoformat(), "score": a.computed_score}
            if key == "phq9":
                entry["mode"] = a.completion_mode
            scores.append(entry)

        latest = scores[-1]["score"]
        previous = baseline.computed_score if baseline else (scores[-2]["score"] if len(scores) > 1 else None)
        delta = round(latest - previous, 1) if previous is not None else None

        assessment_data[key] = {
            "name": INSTRUMENTS[key]["name"],
            "max_score": INSTRUMENTS[key]["max_score"],
            "scores": scores,
            "latest": latest,
            "delta": delta,
        }

    return assessment_data


def _build_reviewable_facts(patient_name: str, adherence: dict) -> list:
    """Correctable facts for the "Something look wrong?" review list. v1 only
    covers medication adherence misses, derived from the same adherence
    aggregation above so there is a single source of truth for miss dates."""
    facts = []
    for mid, data in adherence.items():
        for d in data["missed_dates"]:
            date_label = date_type.fromisoformat(d).strftime("%B %-d")
            facts.append({
                "type": "medication_adherence",
                "medication_id": mid,
                "medication_name": data["name"],
                "date": d,
                "label": f"{patient_name} missed a dose of {data['name']} on {date_label}",
            })
    facts.sort(key=lambda f: (f["date"], f["medication_name"]))
    return facts


@router.post("/{patient_id}")
def generate_summary(
    patient_id: int,
    start_date: Optional[date_type] = Query(None),
    end_date: Optional[date_type] = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    patient = (
        db.query(models.Patient)
        .filter(
            models.Patient.id == patient_id,
            models.Patient.caregiver_id == current_user.id,
        )
        .first()
    )
    if not patient:
        raise HTTPException(status_code=404, detail="Patient not found")

    agg = build_patient_aggregate(patient_id, db=db, start_date=start_date, end_date=end_date)
    start_date = agg["window"]["start"]
    end_date = agg["window"]["end"]
    date_range_days = agg["window"]["days"]
    logs = agg["logs"]

    if not logs:
        no_log_summary = {
            "executive_summary": f"No health data has been logged in the selected date range ({start_date} to {end_date}).",
            "adherence": [],
            "patterns": [],
            "lifestyle_notes": [],
            "discussion_items": [],
            "adherence_data": {},
            "reviewable_facts": [],
        }
        assessment_data = _build_assessment_data(patient_id, start_date, end_date, db)
        if assessment_data:
            no_log_summary["assessment_data"] = assessment_data
        return no_log_summary

    medications = agg["medications"]
    adherence = agg["adherence"]

    # Read condition context and summary style from user config
    user_config = current_user.user_config or {}
    condition_context = user_config.get(
        "condition_context",
        f"{patient.name} has {patient.diagnosis} and is being monitored by a caregiver."
    )
    summary_style = user_config.get("summary_style", "adaptive")

    # Fetch treatment plan if one exists
    treatment_plan = (
        db.query(models.TreatmentPlan)
        .filter(models.TreatmentPlan.patient_id == patient_id)
        .first()
    )

    # Aggregate statistics (computed once in build_patient_aggregate above)
    avg_sleep = agg["avg_sleep"]
    avg_mood = agg["avg_mood"]
    hydration_counts = agg["hydration_counts"]
    side_effects_serializable = agg["side_effect_counts"]
    log_entries = agg["log_entries"]
    total_logs = agg["total_logs"]

    # Build symptom tracking text
    symptom_lines = []
    for name, counts in agg["symptom_stats"].items():
        logged_days = counts["days_present"]
        not_logged = total_logs - logged_days
        symptom_lines.append(
            f"  - {name}: {counts['severe']} Severe days, {counts['moderate']} Moderate days, "
            f"{not_logged} days not logged"
        )
    symptom_tracking_text = "\n".join(symptom_lines) if symptom_lines else "  No symptoms logged."

    med_list_text = "\n".join(
        f"  - {d['name']}: {d['percentage']}% adherence ({d['days_taken']}/{d['days_logged']} days)"
        for d in adherence.values()
    ) or "  No medications tracked."

    # Build known vs observed side effects context per medication
    known_se_context_lines = []
    med_known_effects: dict = {}
    for med in medications:
        known = lookup_known_side_effects(med.name)
        med_known_effects[med.id] = {e["name"]: e for e in known}
        known_strs = [f"{e['name']} ({e['frequency']})" for e in known] or ["none on record"]
        # Gather observed side effects for this med across all logs
        observed_counts: dict = defaultdict(lambda: {"count": 0, "severity_sum": 0})
        for log in logs:
            for mse in (log.medication_side_effects or []):
                if mse.get("medication_id") == med.id:
                    for se in mse.get("side_effects", []):
                        observed_counts[se["name"]]["count"] += 1
                        observed_counts[se["name"]]["severity_sum"] += se.get("severity", 5)
        observed_strs = []
        for se_name, data in observed_counts.items():
            avg_sev = round(data["severity_sum"] / data["count"], 1)
            is_known = se_name in med_known_effects[med.id]
            observed_strs.append(f"{se_name} on {data['count']} day(s) (avg severity {avg_sev}/10){' [known side effect]' if is_known else ' [unexpected]'}")
        observed_text = ", ".join(observed_strs) if observed_strs else "none reported"
        known_se_context_lines.append(
            f"  {med.name}:\n    Known: {', '.join(known_strs)}\n    Observed: {observed_text}"
        )
    known_se_context = "\n".join(known_se_context_lines) or "  No medications tracked."

    # Style guidance for the AI
    if summary_style == "compassionate":
        style_instruction = (
            f"Use {patient.name}'s name throughout. Write warmly and personally — this is a caregiver reading about "
            f"someone they love. Acknowledge difficult periods empathetically while still being factual. "
            f"Frame improvements positively. Avoid cold clinical language."
        )
    elif summary_style == "clinical":
        style_instruction = (
            f"Write in precise clinical language. Use {patient.name} by name. Be concise and data-driven. "
            f"Prioritize measurable findings and clinically significant patterns."
        )
    else:  # adaptive
        style_instruction = (
            f"Use {patient.name}'s name throughout. Balance clinical precision with accessible language "
            f"that a caregiver can understand and discuss with a doctor."
        )

    # Build treatment plan context block
    tp = treatment_plan
    if tp:
        tp_lines = []
        for t in (tp.therapies or []):
            modality = str(t.get("modality", "")).capitalize() if isinstance(t, dict) else str(getattr(t, "modality", "")).capitalize()
            name = t.get("name", "") if isinstance(t, dict) else getattr(t, "name", "")
            tp_lines.append(f"  Therapy ({modality}): {name}")
        for c in (tp.clinicians or []):
            role = c.get("role", "Clinician") if isinstance(c, dict) else getattr(c, "role", "Clinician")
            name = c.get("name", "") if isinstance(c, dict) else getattr(c, "name", "")
            spec = c.get("specialty") if isinstance(c, dict) else getattr(c, "specialty", None)
            spec_str = f" ({spec})" if spec else ""
            tp_lines.append(f"  {role}: {name}{spec_str}")
        if tp.bedtime or tp.wake_time:
            tp_lines.append(f"  Sleep Plan: Bedtime {tp.bedtime or 'unset'} → Wake {tp.wake_time or 'unset'}")
        if tp.sleep_notes:
            tp_lines.append(f"  Sleep Notes: {tp.sleep_notes}")
        if tp.substances_to_avoid:
            tp_lines.append(f"  Substances to Avoid: {tp.substances_to_avoid}")
        if tp.care_goals:
            tp_lines.append(f"  Care Goals: {tp.care_goals}")
        if tp.next_appointment_date:
            appt_with = f" with {tp.next_appointment_with}" if tp.next_appointment_with else ""
            tp_lines.append(f"  Next Appointment: {tp.next_appointment_date}{appt_with}")
        treatment_plan_text = "\n".join(tp_lines) if tp_lines else "  No treatment plan details on file."
    else:
        treatment_plan_text = "  No treatment plan on file."

    user_prompt = f"""Here is {date_range_days} days of health data for {patient.name} ({start_date} to {end_date}), diagnosed with {patient.diagnosis}.

PATIENT CONTEXT: {condition_context}

TREATMENT PLAN (what was planned — compare against what actually happened in the logs):
{treatment_plan_text}

MEDICATIONS AND KNOWN SIDE EFFECTS (Known = documented for this drug; Observed = what caregiver logged; [known side effect] = aligns with drug profile; [unexpected] = not in drug profile):
{known_se_context}

MEDICATION ADHERENCE:
{med_list_text}

AGGREGATED STATISTICS:
- Total log entries: {total_logs}
- Average sleep: {avg_sleep} hours/night
- Average mood score: {avg_mood}/10
- Hydration days logged: Good={hydration_counts.get("Good", 0)}, Fair={hydration_counts.get("Fair", 0)}, Poor={hydration_counts.get("Poor", 0)}

SYMPTOM TRACKING (Severity on a 1–10 scale — out of {total_logs} logged days):
{symptom_tracking_text}

ACTIVITY FREQUENCY (number of days each activity was logged):
{json.dumps(agg["activity_counts"], indent=2)}

LIFESTYLE FACTOR TOTALS (out of {total_logs} logged days):
{json.dumps(agg["lifestyle_totals"], indent=2)}

MEDICATION SIDE EFFECT OCCURRENCES (medication → side effect → count):
{json.dumps(side_effects_serializable, indent=2)}

KEY PATTERNS TO ANALYZE:
- Identify days where symptoms were Severe and what preceded them (missed meds, lifestyle factors, activities)
- Note correlations between Severe symptom days and lifestyle factors (alcohol, stress, poor sleep)
- Note activity types that appear to correlate with fewer Severe symptom days
- Flag any persistent or severe medication side effects
- Note missed-dose patterns
- Highlight week-over-week changes if visible in the raw data

RAW LOG DATA (chronological):
{json.dumps(log_entries, indent=2)}

Please generate a summary as JSON with exactly these fields:
{{
  "executive_summary": "2-3 sentence summary of the period",
  "adherence": [
    {{"medication": "name", "percentage": 85.0, "days_taken": 25, "days_logged": 30, "notes": "brief observation"}}
  ],
  "medication_side_effects": {{
    "Med Name (e.g. Sertraline 50mg)": {{
      "known": ["nausea (common)", "headache (common)"],
      "observed": ["nausea on 1 day (avg severity 7.0/10)"],
      "clinical_note": "1-2 sentence note: does observed align with known? Any management suggestions or flags?"
    }}
  }},
  "patterns": [
    {{"finding": "specific pattern description with data", "significance": "clinical or caregiver relevance"}}
  ],
  "lifestyle_notes": [
    "observation string"
  ],
  "discussion_items": [
    "specific item to discuss with doctor"
  ]
}}"""

    system_prompt = (
        f"You are a clinical documentation assistant helping caregivers communicate patient health data to doctors. "
        f"Patient context: {condition_context} "
        f"{style_instruction} "
        f"You receive structured daily health logs and produce a clear, doctor-ready summary. "
        f"Be specific with numbers and patterns. Symptoms are logged on a 1–10 severity scale. "
        f"Report average severity and flag days where severity ≥ 8. "
        f"When a treatment plan is provided, compare planned care against what actually happened — "
        f"note gaps (e.g. therapy planned 3x/week but adherence data shows missed sessions), "
        f"substance avoidance violations, and progress toward care goals. "
        f"Include treatment plan comparisons in the patterns and discussion_items fields where relevant. "
        f"Highlight correlations between medication adherence, activities, and symptom severity. "
        f"For the medication_side_effects field: for each medication, compare known drug side effects against what was actually observed. "
        f"Flag observed side effects that align with the known profile as expected. "
        f"Flag any observed side effects marked [unexpected] as requiring clinical attention. "
        f"If no side effects were observed, state that clearly and note it as reassuring. "
        f"Flag anything that warrants the doctor's attention. "
        f"Do not speculate beyond what the data shows. "
        f"Return ONLY valid JSON — no markdown fences, no extra text."
    )

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured")

    model = os.getenv("OPENAI_MODEL", "gpt-4.1-mini")
    try:
        client = OpenAI(api_key=api_key)
        completion = client.chat.completions.create(
            model=model,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
        )
        response_text = (completion.choices[0].message.content or "").strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI service error: {str(e)}")

    if not response_text:
        raise HTTPException(status_code=500, detail="AI returned an empty response")

    # Strip code fences if the model adds them despite instructions
    if response_text.startswith("```"):
        response_text = response_text.split("\n", 1)[-1]
        if response_text.endswith("```"):
            response_text = response_text.rsplit("```", 1)[0].strip()

    try:
        summary_data = json.loads(response_text)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse AI response as JSON")

    # Attach our server-calculated adherence data alongside AI data
    summary_data["adherence_data"] = {
        str(mid): d for mid, d in adherence.items()
    }
    summary_data["reviewable_facts"] = _build_reviewable_facts(patient.name, adherence)

    assessment_data = _build_assessment_data(patient_id, start_date, end_date, db)
    if assessment_data:
        summary_data["assessment_data"] = assessment_data

    return summary_data
