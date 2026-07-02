# ── FLAG FOR HUMAN REVIEW ────────────────────────────────────────────────────
# Question and response-option text below is drafted from memory of the
# published instruments (Lawton & Brody 1969 IADL Scale; Kroenke/Spitzer/
# Williams PHQ-9; Robinson 1983 CSI as modified by Thornton & Travis 2003).
# Scoring validity depends on exact wording. Verify every question and option
# string against a primary/published source before this ships. Do not deploy
# unreviewed.
# ──────────────────────────────────────────────────────────────────────────

PHQ9_OPTIONS = [
    {"value": 0, "label": "Not at all"},
    {"value": 1, "label": "Several days"},
    {"value": 2, "label": "More than half the days"},
    {"value": 3, "label": "Nearly every day"},
]

CSI_OPTIONS = [
    {"value": 0, "label": "No"},
    {"value": 1, "label": "Yes, sometimes"},
    {"value": 2, "label": "Yes, on a regular basis"},
]

INSTRUMENTS = {
    "lawton_iadl": {
        "name": "Lawton IADL Scale",
        "subject": "patient_observed",
        "description": "How independently your loved one manages daily activities",
        "cadence_days": 30,
        "first_due_day": 7,
        "in_export": True,
        "max_score": 8,
        "scoring": {"type": "sum"},
        "questions": [
            {
                "id": "telephone",
                "text": "Ability to use telephone",
                "options": [
                    {"value": 1, "label": "Operates telephone on own initiative — looks up and dials numbers"},
                    {"value": 1, "label": "Dials a few well-known numbers"},
                    {"value": 1, "label": "Answers telephone but does not dial"},
                    {"value": 0, "label": "Does not use telephone at all"},
                ],
            },
            {
                "id": "shopping",
                "text": "Shopping",
                "options": [
                    {"value": 1, "label": "Takes care of all shopping needs independently"},
                    {"value": 0, "label": "Shops independently for small purchases"},
                    {"value": 0, "label": "Needs to be accompanied on any shopping trip"},
                    {"value": 0, "label": "Completely unable to shop"},
                ],
            },
            {
                "id": "food_preparation",
                "text": "Food preparation",
                "options": [
                    {"value": 1, "label": "Plans, prepares, and serves adequate meals independently"},
                    {"value": 0, "label": "Prepares adequate meals if supplied with ingredients"},
                    {"value": 0, "label": "Heats and serves prepared meals, or prepares meals but does not maintain adequate diet"},
                    {"value": 0, "label": "Needs meals prepared and served"},
                ],
            },
            {
                "id": "housekeeping",
                "text": "Housekeeping",
                "options": [
                    {"value": 1, "label": "Maintains house alone or with occasional assistance (e.g. heavy work)"},
                    {"value": 1, "label": "Performs light daily tasks such as dishwashing, bed making"},
                    {"value": 1, "label": "Performs light daily tasks but cannot maintain acceptable level of cleanliness"},
                    {"value": 1, "label": "Needs help with all home maintenance tasks"},
                    {"value": 0, "label": "Does not participate in any housekeeping tasks"},
                ],
            },
            {
                "id": "laundry",
                "text": "Laundry",
                "options": [
                    {"value": 1, "label": "Does personal laundry completely"},
                    {"value": 1, "label": "Launders small items — rinses stockings, etc."},
                    {"value": 0, "label": "All laundry must be done by others"},
                ],
            },
            {
                "id": "transportation",
                "text": "Mode of transportation",
                "options": [
                    {"value": 1, "label": "Travels independently on public transportation or drives own car"},
                    {"value": 1, "label": "Arranges own travel via taxi, but does not otherwise use public transportation"},
                    {"value": 1, "label": "Travels on public transportation when accompanied by another"},
                    {"value": 0, "label": "Travel limited to taxi or automobile with assistance of another"},
                    {"value": 0, "label": "Does not travel at all"},
                ],
            },
            {
                "id": "medication_management",
                "text": "Responsibility for own medications",
                "options": [
                    {"value": 1, "label": "Is responsible for taking medication in correct dosages at correct time"},
                    {"value": 0, "label": "Takes responsibility if medication is prepared in advance in separate dosages"},
                    {"value": 0, "label": "Is not capable of dispensing own medication"},
                ],
            },
            {
                "id": "finances",
                "text": "Ability to handle finances",
                "options": [
                    {"value": 1, "label": "Manages financial matters independently — budgets, writes checks, pays bills, tracks income"},
                    {"value": 1, "label": "Manages day-to-day purchases but needs help with banking, major purchases, etc."},
                    {"value": 0, "label": "Incapable of handling money"},
                ],
            },
        ],
    },
    "phq9": {
        "name": "PHQ-9",
        "subject": "patient_self",
        "description": "How your loved one has been feeling, in their own words",
        "cadence_days": 30,
        "first_due_day": 21,
        "in_export": True,
        "max_score": 27,
        "scoring": {"type": "sum"},
        "stem": "Over the last 2 weeks, how often have you been bothered by any of the following problems?",
        "questions": [
            {"id": "q1", "text": "Little interest or pleasure in doing things", "options": PHQ9_OPTIONS},
            {"id": "q2", "text": "Feeling down, depressed, or hopeless", "options": PHQ9_OPTIONS},
            {"id": "q3", "text": "Trouble falling or staying asleep, or sleeping too much", "options": PHQ9_OPTIONS},
            {"id": "q4", "text": "Feeling tired or having little energy", "options": PHQ9_OPTIONS},
            {"id": "q5", "text": "Poor appetite or overeating", "options": PHQ9_OPTIONS},
            {
                "id": "q6",
                "text": "Feeling bad about yourself — or that you are a failure or have let yourself or your family down",
                "options": PHQ9_OPTIONS,
            },
            {
                "id": "q7",
                "text": "Trouble concentrating on things, such as reading the newspaper or watching television",
                "options": PHQ9_OPTIONS,
            },
            {
                "id": "q8",
                "text": "Moving or speaking so slowly that other people could have noticed? Or the opposite — being so fidgety or restless that you have been moving around a lot more than usual",
                "options": PHQ9_OPTIONS,
            },
            {
                "id": "q9",
                "text": "Thoughts that you would be better off dead, or of hurting yourself in some way",
                "options": PHQ9_OPTIONS,
            },
        ],
    },
    "csi": {
        "name": "Modified Caregiver Strain Index",
        "subject": "caregiver_self",
        "description": "A private check-in on how caregiving is affecting you",
        "cadence_days": 30,
        "first_due_day": 14,
        "in_export": False,
        "max_score": 26,
        "scoring": {"type": "sum"},
        "questions": [
            {"id": "q1", "text": "Sleep is disturbed (e.g., because patient is in and out of bed or wanders around at night)", "options": CSI_OPTIONS},
            {"id": "q2", "text": "It is inconvenient (e.g., because helping takes so much time or it's a long drive over to help)", "options": CSI_OPTIONS},
            {"id": "q3", "text": "It is a physical strain (e.g., lifting in and out of a chair; effort or concentration is required)", "options": CSI_OPTIONS},
            {"id": "q4", "text": "It is confining (e.g., helping restricts free time or cannot go visiting)", "options": CSI_OPTIONS},
            {"id": "q5", "text": "There have been family adjustments (e.g., because helping has disrupted routine; there has been no privacy)", "options": CSI_OPTIONS},
            {"id": "q6", "text": "There have been changes in personal plans (e.g., had to turn down a job; could not go on vacation)", "options": CSI_OPTIONS},
            {"id": "q7", "text": "There have been other demands on my time (e.g., from other family members)", "options": CSI_OPTIONS},
            {"id": "q8", "text": "There have been emotional adjustments (e.g., because of severe arguments)", "options": CSI_OPTIONS},
            {
                "id": "q9",
                "text": "Some behavior is upsetting (e.g., because of incontinence; because patient has trouble remembering things; or because patient accuses people of taking things)",
                "options": CSI_OPTIONS,
            },
            {
                "id": "q10",
                "text": "It is upsetting to find the patient has changed so much from his/her former self (e.g., is a different person than he/she used to be)",
                "options": CSI_OPTIONS,
            },
            {"id": "q11", "text": "There have been work adjustments (e.g., because of having to take time off)", "options": CSI_OPTIONS},
            {"id": "q12", "text": "It is a financial strain", "options": CSI_OPTIONS},
            {
                "id": "q13",
                "text": "Feeling completely overwhelmed (e.g., because of worry about the patient; concerns about how you will manage)",
                "options": CSI_OPTIONS,
            },
        ],
    },
}


def compute_score(instrument_key: str, responses: dict) -> float:
    instrument = INSTRUMENTS[instrument_key]
    return float(sum(responses[q["id"]] for q in instrument["questions"]))


def validate_responses(instrument_key: str, responses: dict) -> None:
    instrument = INSTRUMENTS.get(instrument_key)
    if instrument is None:
        raise ValueError(f"Unknown instrument_key: {instrument_key}")

    question_ids = {q["id"] for q in instrument["questions"]}
    response_ids = set(responses.keys())

    missing = question_ids - response_ids
    if missing:
        raise ValueError(f"Missing responses for: {sorted(missing)}")

    extra = response_ids - question_ids
    if extra:
        raise ValueError(f"Unknown question ids in responses: {sorted(extra)}")

    for q in instrument["questions"]:
        allowed_values = {opt["value"] for opt in q["options"]}
        val = responses[q["id"]]
        if val not in allowed_values:
            raise ValueError(f"Invalid value for '{q['id']}': {val!r}. Allowed: {sorted(allowed_values)}")
