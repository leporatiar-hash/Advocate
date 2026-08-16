from pydantic import BaseModel, EmailStr
from typing import Optional, List, Any, Dict
from datetime import date, datetime
from enum import Enum


class UserRole(str, Enum):
    caregiver = "caregiver"
    patient = "patient"
    clinician = "clinician"


# ── Auth ─────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str
    role: UserRole = UserRole.caregiver


class UserLogin(BaseModel):
    email: EmailStr
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    role: UserRole
    created_at: datetime
    user_config: Optional[Any] = None

    model_config = {"from_attributes": True}


class Token(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse


class AuthResponse(BaseModel):
    user: UserResponse
    access_token: str
    token_type: str = "bearer"


class UserConfigPatch(BaseModel):
    updates: Dict[str, Any]


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str


# ── Medications ───────────────────────────────────────────────────────────────

class MedicationCreate(BaseModel):
    name: str
    dose: str
    frequency: str
    time_of_day: str


class MedicationUpdate(BaseModel):
    name: Optional[str] = None
    dose: Optional[str] = None
    frequency: Optional[str] = None
    time_of_day: Optional[str] = None
    active: Optional[bool] = None


class MedicationResponse(BaseModel):
    id: int
    patient_id: int
    name: str
    dose: str
    frequency: str
    time_of_day: str
    active: bool

    model_config = {"from_attributes": True}


# ── Patients ──────────────────────────────────────────────────────────────────

class PatientCreate(BaseModel):
    name: str
    date_of_birth: Optional[date] = None
    diagnosis: str
    notes: Optional[str] = None
    medications: Optional[List[MedicationCreate]] = []


class PatientUpdate(BaseModel):
    name: Optional[str] = None
    date_of_birth: Optional[date] = None
    diagnosis: Optional[str] = None
    notes: Optional[str] = None


class PatientResponse(BaseModel):
    id: int
    name: str
    date_of_birth: Optional[date] = None
    diagnosis: str
    notes: Optional[str] = None
    caregiver_id: int
    medications: List[MedicationResponse] = []
    dashboard_config: Optional[Any] = None
    treatment_plan: Optional["TreatmentPlanResponse"] = None

    model_config = {"from_attributes": True}


class IntakeSurveyRequest(BaseModel):
    relationship: str
    conditions: List[str]
    track_modules: List[str]
    reminder_frequency: Optional[str] = None
    other_notes: Optional[str] = None


class OnboardingSurveyRequest(BaseModel):
    relationship: str
    condition: str
    track_modules: List[str]
    medications_daily: bool
    good_day: Optional[str] = None


# ── Daily Logs ────────────────────────────────────────────────────────────────

class LogType(str, Enum):
    detailed = "detailed"
    same_as_yesterday = "same_as_yesterday"
    nothing_notable = "nothing_notable"


class QuickLogRequest(BaseModel):
    date: date
    type: str  # "same_as_yesterday" | "nothing_notable" | "catch_up_note"
    note: Optional[str] = None  # used when type == "catch_up_note"


class MedicationTakenCorrection(BaseModel):
    medication_id: int


class MedicationTaken(BaseModel):
    medication_id: int
    taken: bool
    time_taken: Optional[str] = None  # "HH:MM" 24-hour format


class Symptom(BaseModel):
    name: str
    severity: Optional[int] = None  # 1–10; None for legacy entries logged before severity was added
    worse_than_usual: Optional[bool] = None


class SideEffect(BaseModel):
    name: str
    severity: int  # 1–10


class MedicationSideEffect(BaseModel):
    medication_id: int
    medication_name: str
    side_effects: List[SideEffect]


class Activity(BaseModel):
    type: str  # music | art | journaling | brain_stimulating | exercise | outside | other
    duration_minutes: Optional[int] = None


class Lifestyle(BaseModel):
    smoked: bool = False
    alcohol: bool = False
    stressed: bool = False
    ate_well: bool = False


class Socialization(BaseModel):
    left_house: Optional[bool] = None
    had_contact: Optional[bool] = None
    contact_ids: List[int] = []
    quality: Optional[str] = None   # "good" | "neutral" | "difficult"
    initiated_by: Optional[str] = None  # "self" | "other"


class DailyLogCreate(BaseModel):
    patient_id: int
    date: date
    medications_taken: List[MedicationTaken] = []
    symptoms: List[Symptom] = []
    medication_side_effects: List[MedicationSideEffect] = []
    sleep_hours: Optional[float] = None
    mood_score: Optional[int] = None
    water_intake_oz: Optional[float] = None
    activities: List[Activity] = []
    lifestyle: Optional[Lifestyle] = None
    notes: Optional[str] = None
    episode: Optional[Any] = None
    vitals: Optional[Any] = None
    photo: Optional[str] = None
    socialization: Optional[Socialization] = None
    log_type: str = "detailed"


class DailyLogResponse(BaseModel):
    id: int
    patient_id: int
    logged_by: int
    date: date
    medications_taken: Optional[Any] = None
    symptoms: Optional[Any] = None
    medication_side_effects: Optional[Any] = None
    sleep_hours: Optional[float] = None
    mood_score: Optional[int] = None
    water_intake_oz: Optional[float] = None
    activities: Optional[Any] = None
    lifestyle: Optional[Any] = None
    notes: Optional[str] = None
    episode: Optional[Any] = None
    vitals: Optional[Any] = None
    photo: Optional[str] = None
    socialization: Optional[Any] = None
    log_type: Optional[str] = "detailed"
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Treatment Plan ────────────────────────────────────────────────────────────

class TherapyEntry(BaseModel):
    modality: str  # "individual" | "group"
    name: str      # e.g. "CBT with Dr. Smith", "IOP at Memorial Clinic"


class ClinicianEntry(BaseModel):
    role: str              # e.g. "Therapist", "Psychiatrist", "Primary Doctor"
    name: str
    specialty: Optional[str] = None
    contact: Optional[str] = None


class TreatmentPlanCreate(BaseModel):
    therapies: Optional[List[TherapyEntry]] = None
    clinicians: Optional[List[ClinicianEntry]] = None

    bedtime: Optional[str] = None
    wake_time: Optional[str] = None
    sleep_notes: Optional[str] = None

    substances_to_avoid: Optional[str] = None
    care_goals: Optional[str] = None

    next_appointment_date: Optional[date] = None
    next_appointment_with: Optional[str] = None


class TreatmentPlanResponse(TreatmentPlanCreate):
    id: int
    patient_id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


PatientResponse.model_rebuild()


# ── Known Side Effects ────────────────────────────────────────────────────────

class KnownSideEffectResponse(BaseModel):
    name: str
    frequency: str  # 'common', 'uncommon', 'rare'
    category: str


# ── Social Contacts ───────────────────────────────────────────────────────────

class SocialContactCreate(BaseModel):
    name: str


class SocialContactResponse(BaseModel):
    id: int
    user_id: int
    name: str
    created_at: Optional[datetime] = None

    model_config = {"from_attributes": True}


# ── Assessments ───────────────────────────────────────────────────────────────

class AssessmentCreate(BaseModel):
    patient_id: int
    instrument_key: str
    responses: Dict[str, int]
    completion_mode: Optional[str] = None  # phq9 only: "self" | "assisted"


class AssessmentResponse(BaseModel):
    id: int
    patient_id: int
    caregiver_id: int
    instrument_key: str
    responses: Dict[str, int]
    computed_score: float
    max_score: float
    completion_mode: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


# ── Clinician Portal ──────────────────────────────────────────────────────────

class ClinicianPatientSummary(BaseModel):
    id: int
    name: str


class PortalWindow(BaseModel):
    days: int
    start: date
    end: date


class PortalPatient(BaseModel):
    name: str
    age: Optional[int] = None
    active_medications: List[str]


class LogFrequencyStat(BaseModel):
    days_logged: int
    days_in_window: int
    pct: float


class SymptomLoadStat(BaseModel):
    avg_severity: Optional[float] = None
    distinct_symptoms: int


class AvgSleepStat(BaseModel):
    hours: Optional[float] = None
    days_logged: int


class MedAdherenceStat(BaseModel):
    pct: float


class PortalStats(BaseModel):
    log_frequency: LogFrequencyStat
    symptom_load: SymptomLoadStat
    avg_sleep: AvgSleepStat
    med_adherence: MedAdherenceStat


class PortalFlag(BaseModel):
    severity: str  # "high" | "moderate" | "low"
    metric: str
    text: str


class SymptomFrequencyEntry(BaseModel):
    symptom: str
    days_present: int
    avg_severity: Optional[float] = None
    prev_avg_severity: Optional[float] = None
    direction: str = "steady"  # "better" | "worse" | "steady"
    low_n: bool = False


class MedAdherenceEntry(BaseModel):
    medication: str
    taken: int
    expected: int
    pct: float


class RecentNote(BaseModel):
    date: date
    text: str
    badges: List[str]
    reaffirmed_dates: List[date] = []


class InsightUnit(BaseModel):
    category: str  # one of services.synthesis.CATEGORIES, fixed display order
    observation: str
    takeaway: str
    chip: str  # "watch" | "steady" | "low_data"
    source_note_ids: List[str] = []  # dates (YYYY-MM-DD) — same addressing recent notes already use


class WhatWentWellItem(BaseModel):
    observation: str
    date: str  # YYYY-MM-DD, the log date this was drawn from


class ClinicalSummary(BaseModel):
    insights: List[InsightUnit]
    what_went_well: List[WhatWentWellItem] = []
    generated_at: datetime
    window_days: int
    validation_warnings: List[str] = []


class TrendStat(BaseModel):
    value: Optional[float] = None
    prev: Optional[float] = None
    direction: str  # "up" | "down" | "steady" — raw, no clinical meaning attached


class DaysLoggedStat(BaseModel):
    value: int
    total: int


class GlanceStats(BaseModel):
    adherence: TrendStat
    flagged_episodes: TrendStat
    symptom_load: TrendStat
    days_logged: DaysLoggedStat


class TrajectoryDay(BaseModel):
    date: date
    severity: Optional[float] = None
    episode: bool
    smoked: bool
    logged: bool


class PortalTrajectory(BaseModel):
    days: List[TrajectoryDay]


# ── Temporal Data (adaptive multi-month trajectory) ──────────────────────────

class TemporalBin(BaseModel):
    start: date
    end: date
    label: str
    bin_size: str  # "day" | "week" | "month"
    color: str      # "green" | "amber" | "red" | "neutral"
    bin_sev: Optional[float] = None
    has_episode: bool
    readout: Optional[str] = None
    logged_days: int
    scored_days: int
    notes: List[str] = []  # raw note texts in this bin, for drill-in


class TemporalResponse(BaseModel):
    bins: List[TemporalBin]
    bin_size: str  # "day" | "week" | "month" — the whole series' bin size
    total_logged_days: int
    not_enough_history: bool


class TopFlag(BaseModel):
    date: date
    text: str
    quote: Optional[str] = None
    note_id: Optional[str] = None


class ClinicianPortalResponse(BaseModel):
    window: PortalWindow
    patient: PortalPatient
    clinical_summary: Optional[ClinicalSummary] = None
    stats: PortalStats
    flags: List[PortalFlag]
    glance_stats: GlanceStats
    trajectory: PortalTrajectory
    top_flag: Optional[TopFlag] = None
    symptom_frequency: List[SymptomFrequencyEntry]
    med_adherence: List[MedAdherenceEntry]
    recent_notes: List[RecentNote]


# ── Saved Summaries ───────────────────────────────────────────────────────────

class SavedSummaryCreate(BaseModel):
    patient_id: int
    title: str
    content: str
    date_range_start: date
    date_range_end: date


class SavedSummaryResponse(BaseModel):
    id: int
    user_id: int
    patient_id: int
    title: str
    content: str
    date_range_start: date
    date_range_end: date
    created_at: datetime

    model_config = {"from_attributes": True}
