from sqlalchemy import Column, Integer, String, Float, Boolean, Date, DateTime, Text, JSON, ForeignKey, Enum, UniqueConstraint
from sqlalchemy.orm import relationship
from datetime import datetime
import enum

from database import Base


class UserRole(str, enum.Enum):
    caregiver = "caregiver"
    patient = "patient"
    clinician = "clinician"


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password_hash = Column(String)
    name = Column(String)
    role = Column(Enum(UserRole), default=UserRole.caregiver)
    created_at = Column(DateTime, default=datetime.utcnow)
    user_config = Column(JSON, nullable=True)

    patients = relationship("Patient", back_populates="caregiver")


class Patient(Base):
    __tablename__ = "patients"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    date_of_birth = Column(Date, nullable=True)
    diagnosis = Column(String)
    notes = Column(Text, nullable=True)
    caregiver_id = Column(Integer, ForeignKey("users.id"))
    dashboard_config = Column(JSON, nullable=True)

    caregiver = relationship("User", back_populates="patients")
    medications = relationship("Medication", back_populates="patient")
    daily_logs = relationship("DailyLog", back_populates="patient")
    treatment_plan = relationship("TreatmentPlan", back_populates="patient", uselist=False)


class Medication(Base):
    __tablename__ = "medications"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"))
    name = Column(String)
    dose = Column(String)
    frequency = Column(String)
    time_of_day = Column(String)
    active = Column(Boolean, default=True)

    patient = relationship("Patient", back_populates="medications")


class DailyLog(Base):
    __tablename__ = "daily_logs"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"))
    logged_by = Column(Integer, ForeignKey("users.id"))
    date = Column(Date)

    # [{medication_id, taken: bool, time_taken: "HH:MM" | null}]
    medications_taken = Column(JSON, nullable=True)

    # [{name: str, severity: 1-10}]
    symptoms = Column(JSON, nullable=True)

    # [{medication_id, medication_name, side_effects: [{name, severity}]}]
    medication_side_effects = Column(JSON, nullable=True)

    sleep_hours = Column(Float, nullable=True)
    mood_score = Column(Integer, nullable=True)
    water_intake_oz = Column(Float, nullable=True)

    # [{type: "music"|"art"|"journaling"|"brain_stimulating"|"exercise"|"outside"|"other", duration_minutes: int|null}]
    activities = Column(JSON, nullable=True)

    # {smoked: bool, alcohol: bool, stressed: bool, ate_well: bool}
    lifestyle = Column(JSON, nullable=True)

    notes = Column(Text, nullable=True)

    # {occurred: bool, time: str|null, description: str|null}
    episode = Column(JSON, nullable=True)

    # {heart_rate: str|null, blood_pressure: str|null}
    vitals = Column(JSON, nullable=True)

    # base64 JPEG data URL, compressed to ~50-100 KB before storing
    photo = Column(Text, nullable=True)

    # {left_house: bool|null, had_contact: bool|null, contact_ids: [int], quality: str|null, initiated_by: str|null}
    socialization = Column(JSON, nullable=True)

    # "detailed" | "same_as_yesterday" | "nothing_notable"
    log_type = Column(String, nullable=True, default="detailed")

    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", back_populates="daily_logs")
    logger = relationship("User", foreign_keys=[logged_by])


class TreatmentPlan(Base):
    __tablename__ = "treatment_plans"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), unique=True)

    # Therapies — [{modality: "individual"|"group", name: str}]
    therapies = Column(JSON, nullable=True)

    # Clinicians — [{role: str, name: str, specialty: str, contact: str}]
    clinicians = Column(JSON, nullable=True)

    # Sleep
    bedtime = Column(String, nullable=True)    # "10:00 PM"
    wake_time = Column(String, nullable=True)  # "8:00 AM"
    sleep_notes = Column(Text, nullable=True)

    # Substance avoidance
    substances_to_avoid = Column(Text, nullable=True)

    # Care goals
    care_goals = Column(Text, nullable=True)

    # Next appointment
    next_appointment_date = Column(Date, nullable=True)
    next_appointment_with = Column(String, nullable=True)

    # Last appointment — the visit anchor for "since your last visit" framing
    # on the Quick View headline and its chart marker. Unlike next_appointment_date
    # this is never overwritten by editing the upcoming one; it's set once a
    # visit has actually happened. Null until someone records one.
    last_appointment_date = Column(Date, nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    patient = relationship("Patient", back_populates="treatment_plan")


class SocialContact(Base):
    __tablename__ = "social_contacts"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String(100), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String, unique=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    expires_at = Column(DateTime)
    used = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User")


class Assessment(Base):
    __tablename__ = "assessments"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    caregiver_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    instrument_key = Column(String, nullable=False, index=True)  # "lawton_iadl" | "phq9" | "csi"
    responses = Column(JSON, nullable=False)          # {question_id: value}
    computed_score = Column(Float, nullable=False)
    max_score = Column(Float, nullable=False)
    completion_mode = Column(String, nullable=True)   # phq9 only: "self" | "assisted"
    created_at = Column(DateTime, default=datetime.utcnow)

    patient = relationship("Patient", foreign_keys=[patient_id])
    caregiver = relationship("User", foreign_keys=[caregiver_id])


class ClinicianPatientLink(Base):
    __tablename__ = "clinician_patient_links"
    __table_args__ = (UniqueConstraint("clinician_id", "patient_id", name="uq_clinician_patient_link"),)

    id = Column(Integer, primary_key=True, index=True)
    clinician_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    clinician = relationship("User", foreign_keys=[clinician_id])
    patient = relationship("Patient", foreign_keys=[patient_id])


class PatientShareCode(Base):
    """A caregiver-issued grant of read-only access to ONE patient.

    Consent sits with the caregiver: they generate a code, hand it to their
    clinician out of band (read it out at an appointment, text it), and can
    revoke it at any time. There is deliberately no clinician-initiated path to
    a patient — a clinician can never request access, only receive it.

    Redeeming a code creates a ClinicianPatientLink. Revoking the CODE only
    stops future redemptions; it does not retract access already granted. To cut
    off a clinician who already redeemed, delete the link (see the
    /patients/{id}/clinicians endpoints) — those are two different actions and
    the UI says so.

    Codes stay usable until they expire or are revoked, so one code can be given
    to a psychiatrist and a therapist without regenerating.
    """
    __tablename__ = "patient_share_codes"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(16), unique=True, index=True, nullable=False)
    patient_id = Column(Integer, ForeignKey("patients.id"), nullable=False, index=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    expires_at = Column(DateTime, nullable=False)
    revoked = Column(Boolean, default=False)
    redemption_count = Column(Integer, default=0)
    last_redeemed_at = Column(DateTime, nullable=True)

    patient = relationship("Patient", foreign_keys=[patient_id])
    creator = relationship("User", foreign_keys=[created_by])


class ClinicianNoteSynthesis(Base):
    """Cached AI synthesis of a patient's caregiver notes for the clinician portal's
    Clinical Summary. Generated only by the explicit scripts/generate_synthesis.py
    script, never by the portal's GET path — one row per patient, overwritten on
    each regeneration, so the page render is always a cache read, never an OpenAI
    call."""
    __tablename__ = "clinician_note_synthesis"

    id = Column(Integer, primary_key=True, index=True)
    patient_id = Column(Integer, ForeignKey("patients.id"), unique=True, nullable=False)
    window_days = Column(Integer, nullable=False)
    start_date = Column(Date, nullable=False)
    end_date = Column(Date, nullable=False)
    generated_at = Column(DateTime, default=datetime.utcnow)
    content = Column(JSON, nullable=False)

    patient = relationship("Patient", foreign_keys=[patient_id])


class SavedSummary(Base):
    __tablename__ = "saved_summaries"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    patient_id = Column(Integer, ForeignKey("patients.id"))
    title = Column(String)
    content = Column(Text)
    date_range_start = Column(Date)
    date_range_end = Column(Date)
    created_at = Column(DateTime, default=datetime.utcnow)

    user = relationship("User", foreign_keys=[user_id])
