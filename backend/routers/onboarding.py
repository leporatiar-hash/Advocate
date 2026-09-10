from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
import json
import os
from dotenv import load_dotenv
import anthropic

from database import get_db
import models
import schemas
from auth import get_current_user, require_not_clinician

load_dotenv()

router = APIRouter()

# Universal fallback — works for all caregiving situations, not just mental health
_DEFAULT_USER_CONFIG = {
    "symptoms": ["Pain", "Fatigue", "Sleep Issues", "Appetite Changes", "Mood", "Anxiety", "Nausea", "Confusion"],
    "activities": ["walking", "reading", "socializing", "music", "other"],
    "modules": ["medications", "symptoms", "mood", "sleep", "water", "activities"],
    "symptom_label": "Symptoms",
    "episode_label": "Notable Episodes",
    "greeting": "Tracking your loved one's journey",
    "lifestyle_flags": ["smoked", "alcohol", "stressed", "ate_well"],
    "substance_fields": ["cigarettes", "alcohol"],
    "condition_context": "Patient is being monitored by a caregiver.",
    "summary_style": "adaptive",
}


@router.post("/config", response_model=schemas.UserResponse)
def complete_onboarding_survey(
    survey: schemas.OnboardingSurveyRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_not_clinician),
):
    config = _DEFAULT_USER_CONFIG.copy()

    try:
        api_key = os.getenv("ANTHROPIC_API_KEY")
        if api_key:
            client = anthropic.Anthropic(api_key=api_key)

            system_prompt = (
                "You are a health tracking assistant. Generate a personalized caregiver dashboard config. "
                "This app is used by caregivers tracking ANY illness — dementia, MS, Parkinson's, anxiety disorders, "
                "addiction recovery, cancer, chronic pain, ALS, epilepsy, autism, PTSD, pediatric conditions, and more. "
                "Your config must be fully specific to the exact condition described. "
                "Return ONLY valid JSON — no markdown fences, no explanation."
            )

            user_prompt = f"""A caregiver is setting up health tracking:
Relationship to patient: {survey.relationship}
Primary condition: {survey.condition}
Wants to track: {", ".join(survey.track_modules)}
Medications a daily concern: {"Yes" if survey.medications_daily else "No"}
What a good day looks like: {survey.good_day or "Not specified"}

Generate a config tailored EXACTLY to this condition. For example:
- Dementia/Alzheimer's: symptoms like Agitation, Wandering, Sundowning, Memory Confusion, Aggression; lifestyle: stressed, ate_well; no substance tracking if elderly
- MS/neurological: symptoms like Spasticity, Fatigue, Vision Issues, Numbness, Balance Problems; physical therapy activities
- Anxiety/mental health: symptoms like Panic Attacks, Racing Thoughts, Avoidance, Mood Swings; compassionate summary style
- Addiction recovery: all substance fields important; symptoms like Cravings, Irritability, Sleep Issues
- Chronic pain: symptoms like Pain Level, Stiffness, Mobility, Fatigue; vitals important
- Pediatric/autism: symptoms like Meltdown, Stimming, Focus, Communication; remove substance fields

Return exactly this JSON structure:
{{
  "symptoms": ["4-8 condition-specific symptom names that matter for THIS condition"],
  "activities": ["4-6 slugs from: walking, running, music, drawing, reading, cooking, socializing, physical_therapy, meditation, journaling, other"],
  "modules": ["ordered list from: medications, symptoms, mood, sleep, water, activities, vitals, episode, side_effects"],
  "symptom_label": "condition-appropriate label (e.g. 'Behavioral Symptoms', 'Pain & Function', 'Mental Health', 'Symptoms')",
  "episode_label": "condition-appropriate label (e.g. 'Seizures', 'Behavioral Episodes', 'Panic Attacks', 'Notable Episodes')",
  "greeting": "one warm dashboard greeting sentence using the condition and relationship (10-15 words)",
  "lifestyle_flags": ["subset of: smoked, alcohol, stressed, ate_well — only the ones relevant to this condition"],
  "substance_fields": ["subset of: cigarettes, alcohol — only include if tracking substances is clinically relevant"],
  "condition_context": "1-2 sentence description of this patient's condition for use in clinical summaries",
  "summary_style": "one of: compassionate (mental health/dementia/pediatric), clinical (physical/neurological conditions), adaptive (general)"
}}"""

            message = client.messages.create(
                model="claude-sonnet-4-20250514",
                max_tokens=1024,
                system=system_prompt,
                messages=[{"role": "user", "content": user_prompt}],
            )

            response_text = (message.content[0].text or "").strip()

            # Strip code fences if model adds them despite instructions
            if response_text.startswith("```"):
                response_text = response_text.split("\n", 1)[-1].rsplit("```", 1)[0].strip()

            if response_text:
                parsed = json.loads(response_text)
                if all(k in parsed for k in ("symptoms", "activities", "modules")):
                    config = parsed
                    # Fill in any missing fields with sensible defaults
                    config.setdefault("greeting", "Tracking your loved one's journey")
                    config.setdefault("lifestyle_flags", ["smoked", "alcohol", "stressed", "ate_well"])
                    config.setdefault("substance_fields", ["cigarettes", "alcohol"])
                    config.setdefault("condition_context", "Patient is being monitored by a caregiver.")
                    config.setdefault("summary_style", "adaptive")

    except Exception:
        pass  # Never let onboarding break — fall back to universal defaults

    current_user.user_config = config
    db.commit()
    db.refresh(current_user)
    return current_user
