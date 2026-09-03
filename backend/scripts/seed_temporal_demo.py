"""LOCAL-ONLY synthetic patients for testing the Temporal Data adaptive strip
(TrajectoryStrip.tsx + /clinicians/patient/{id}/temporal).

Creates two patients:
  - "Jack (Temporal Demo)": ~150 days of history -> weekly bins, with a
    deliberately engineered week for each acceptance case: high-severity
    scores, an episode, notes-with-no-scores, and a fully-empty gap week.
  - "Dana (Temporal Demo)": ~18 days of history -> daily bins, no trend
    framing case.

Real OpenAI calls for the per-bin readouts are skipped (no key needed to run
this locally) — instead this script fabricates a plausible cached
`temporal_readouts` blob directly, using the real build_temporal_bins output
to find the correct bin keys, so the /temporal endpoint's combine step has
real note_severity values to exercise the "notes-only bin colors from the
notes" and "episode forces red" paths end to end.

Usage:
    cd backend
    SEED_CONFIRM=1 python scripts/seed_temporal_demo.py

Login after seeding: clinician.temporaldemo@example.com / temporaldemo123
"""
import os
import sys
from datetime import date, datetime, timedelta
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")


def _guard_local_only() -> None:
    if not DATABASE_URL:
        print("DATABASE_URL is not set. Aborting.")
        sys.exit(1)
    parsed = urlparse(DATABASE_URL)
    host = parsed.hostname or ""
    dbname = (parsed.path or "").lstrip("/")
    print(f"Target database: host={host!r} db={dbname!r}")
    # SQLite is a local file by definition and has no hostname to check, so
    # accept it outright — otherwise the localhost test below rejects every
    # sqlite:/// URL and there is no zero-setup way to seed a demo database.
    if DATABASE_URL.startswith("sqlite"):
        pass
    elif host not in ("localhost", "127.0.0.1"):
        print(f"REFUSING TO SEED: host {host!r} is not localhost/127.0.0.1. Aborting.")
        sys.exit(1)
    if os.getenv("SEED_CONFIRM") != "1":
        print(f"Dry run only — SEED_CONFIRM=1 is not set. Nothing written to {host}/{dbname}.")
        sys.exit(0)


_guard_local_only()

from database import SessionLocal  # noqa: E402
import models  # noqa: E402
from auth import get_password_hash  # noqa: E402
from services.aggregation import build_temporal_bins  # noqa: E402

CAREGIVER_EMAIL = "caregiver.temporaldemo@example.com"
CLINICIAN_EMAIL = "clinician.temporaldemo@example.com"
CLINICIAN_PASSWORD = "temporaldemo123"

TODAY = date.today()


def _get_or_create_user(db, email, name, role, password=None):
    user = db.query(models.User).filter(models.User.email == email).first()
    if user:
        return user
    user = models.User(
        email=email,
        password_hash=get_password_hash(password or os.urandom(16).hex()),
        name=name,
        role=role,
    )
    db.add(user)
    db.flush()
    return user


def _get_or_create_patient(db, name, caregiver_id, dob, diagnosis):
    patient = db.query(models.Patient).filter(models.Patient.name == name).first()
    if patient:
        deleted = db.query(models.DailyLog).filter(models.DailyLog.patient_id == patient.id).delete()
        print(f"Reusing patient {name!r} (id={patient.id}); cleared {deleted} prior logs.")
        return patient
    patient = models.Patient(name=name, date_of_birth=dob, diagnosis=diagnosis, caregiver_id=caregiver_id)
    db.add(patient)
    db.flush()
    print(f"Created patient {name!r} (id={patient.id}).")
    return patient


def _link(db, clinician_id, patient_id):
    existing = (
        db.query(models.ClinicianPatientLink)
        .filter(
            models.ClinicianPatientLink.clinician_id == clinician_id,
            models.ClinicianPatientLink.patient_id == patient_id,
        )
        .first()
    )
    if not existing:
        db.add(models.ClinicianPatientLink(clinician_id=clinician_id, patient_id=patient_id))


def _get_or_create_med(db, patient_id, name="Lithium", dose="600mg"):
    med = db.query(models.Medication).filter(models.Medication.patient_id == patient_id, models.Medication.name == name).first()
    if med:
        return med
    med = models.Medication(patient_id=patient_id, name=name, dose=dose, frequency="daily", time_of_day="morning", active=True)
    db.add(med)
    db.flush()
    return med


def _seed_jack(db, caregiver_id, med_id) -> models.Patient:
    patient = _get_or_create_patient(db, "Jack (Temporal Demo)", caregiver_id, date(1990, 6, 20), "Bipolar I disorder")

    SPAN_DAYS = 150  # -> weekly bins (35 < 150 <= 182)
    start = TODAY - timedelta(days=SPAN_DAYS - 1)

    # Week indices counted from `start` (week 0 = start..start+6).
    RED_SCORES_WEEK = 2         # high symptom severity, enough scored days
    EPISODE_WEEK = 5            # mild scores, but an episode forces red
    NOTES_ONLY_WEEK = 8         # notes, zero symptom scores that week
    EMPTY_GAP_WEEK = 11         # no logs at all

    def week_of(offset_days: int) -> int:
        return offset_days // 7

    logs = []
    for offset in range(SPAN_DAYS):
        d = start + timedelta(days=offset)
        wk = week_of(offset)

        if wk == EMPTY_GAP_WEEK:
            continue  # deliberately no log this whole week

        symptoms = []
        notes = None
        episode = {"occurred": False, "time": None, "description": None}

        if wk == RED_SCORES_WEEK:
            symptoms.append({"name": "Mood elevation", "severity": 8})
        elif wk == EPISODE_WEEK:
            symptoms.append({"name": "Irritability", "severity": 3})
            if offset % 7 == 3:
                episode = {"occurred": True, "time": "22:00", "description": "Manic episode, minimal sleep"}
                notes = "Up all night reorganizing the garage, talking very fast. Called his psychiatrist in the morning."
        elif wk == NOTES_ONLY_WEEK:
            if offset % 7 == 2:
                notes = "Seemed withdrawn and quiet most of the week, skipped his usual walk. No symptoms formally logged."
        else:
            # Gentle green baseline elsewhere, skip a day here and there.
            if offset % 5 != 0:
                symptoms.append({"name": "Mood elevation", "severity": 2})

        if offset % 6 == 0 and wk not in (RED_SCORES_WEEK, EPISODE_WEEK, NOTES_ONLY_WEEK):
            continue  # sparse natural gaps in the baseline weeks

        logs.append(models.DailyLog(
            patient_id=patient.id,
            logged_by=caregiver_id,
            date=d,
            medications_taken=[{"medication_id": med_id, "taken": True, "time_taken": "08:00"}],
            symptoms=symptoms or None,
            episode=episode,
            lifestyle={"smoked": False, "alcohol": False, "stressed": episode["occurred"], "ate_well": True},
            notes=notes,
            log_type="detailed",
        ))

    db.add_all(logs)
    db.flush()

    # Fabricate the cached LLM readouts a real generate_synthesis.py run would
    # produce, using the real bin boundaries so the keys line up exactly.
    all_logs = (
        db.query(models.DailyLog)
        .filter(models.DailyLog.patient_id == patient.id)
        .order_by(models.DailyLog.date.asc())
        .all()
    )
    bins = build_temporal_bins(all_logs)

    temporal_readouts = {}
    for b in bins:
        wk = week_of((b["start"] - start).days)
        if wk == EPISODE_WEEK and b["notes"]:
            temporal_readouts[b["start"].isoformat()] = {
                "note_severity": 6.0,
                "readout": "Caregiver described a manic episode with minimal sleep during this period.",
            }
        elif wk == NOTES_ONLY_WEEK and b["notes"]:
            temporal_readouts[b["start"].isoformat()] = {
                "note_severity": 7.0,
                "readout": "Caregiver reported withdrawal and reduced activity, though no symptoms were formally scored.",
            }

    existing_synth = db.query(models.ClinicianNoteSynthesis).filter(models.ClinicianNoteSynthesis.patient_id == patient.id).first()
    content = {
        "insights": [],
        "validation_warnings": [],
        "what_went_well": [],
        "temporal_readouts": temporal_readouts,
    }
    if existing_synth:
        existing_synth.content = content
        existing_synth.generated_at = datetime.utcnow()
        existing_synth.window_days = 30
        existing_synth.start_date = TODAY - timedelta(days=30)
        existing_synth.end_date = TODAY
    else:
        db.add(models.ClinicianNoteSynthesis(
            patient_id=patient.id,
            window_days=30,
            start_date=TODAY - timedelta(days=30),
            end_date=TODAY,
            content=content,
        ))

    print(f"Jack: {len(logs)} logs over {SPAN_DAYS} days -> {len(bins)} bins ({bins[0]['bin_size'] if bins else 'n/a'}), "
          f"{len(temporal_readouts)} cached readouts.")
    return patient


def _seed_dana(db, caregiver_id, med_id) -> models.Patient:
    patient = _get_or_create_patient(db, "Dana (Temporal Demo)", caregiver_id, date(2001, 2, 14), "Generalized anxiety disorder")

    SPAN_DAYS = 18  # -> daily bins, comfortably past the not-enough-history floor
    start = TODAY - timedelta(days=SPAN_DAYS - 1)

    logs = []
    for offset in range(SPAN_DAYS):
        d = start + timedelta(days=offset)
        sev = 2 if offset % 4 else 5
        logs.append(models.DailyLog(
            patient_id=patient.id,
            logged_by=caregiver_id,
            date=d,
            medications_taken=[{"medication_id": med_id, "taken": True, "time_taken": "08:00"}],
            symptoms=[{"name": "Anxiety", "severity": sev}],
            episode={"occurred": False, "time": None, "description": None},
            lifestyle={"smoked": False, "alcohol": False, "stressed": False, "ate_well": True},
            notes=None,
            log_type="detailed",
        ))
    db.add_all(logs)
    db.flush()
    print(f"Dana: {len(logs)} logs over {SPAN_DAYS} days -> daily bins.")
    return patient


def main() -> None:
    db = SessionLocal()
    try:
        caregiver = _get_or_create_user(db, CAREGIVER_EMAIL, "Temporal Demo Caregiver", models.UserRole.caregiver)
        clinician = _get_or_create_user(
            db, CLINICIAN_EMAIL, "Temporal Demo Clinician", models.UserRole.clinician, password=CLINICIAN_PASSWORD
        )

        # Meds need a patient id first, so create patients, then meds, then logs.
        jack_patient = _get_or_create_patient(db, "Jack (Temporal Demo)", caregiver.id, date(1990, 6, 20), "Bipolar I disorder")
        dana_patient = _get_or_create_patient(db, "Dana (Temporal Demo)", caregiver.id, date(2001, 2, 14), "Generalized anxiety disorder")
        db.flush()

        jack_med = _get_or_create_med(db, jack_patient.id, "Lithium", "600mg")
        dana_med = _get_or_create_med(db, dana_patient.id, "Sertraline", "50mg")

        _seed_jack(db, caregiver.id, jack_med.id)
        _seed_dana(db, caregiver.id, dana_med.id)

        _link(db, clinician.id, jack_patient.id)
        _link(db, clinician.id, dana_patient.id)

        db.commit()
        print("\nDone. Log in as clinician:")
        print(f"  email:    {CLINICIAN_EMAIL}")
        print(f"  password: {CLINICIAN_PASSWORD}")
        print(f"  Jack id:  {jack_patient.id}")
        print(f"  Dana id:  {dana_patient.id}")
    finally:
        db.close()


if __name__ == "__main__":
    main()
