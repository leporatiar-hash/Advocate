"""LOCAL-ONLY synthetic patient for testing the clinician glance layer.

One patient whose data is built to hit every state the glance layer can
render — meaning-colored deltas in both directions, a steady symptom, the
low-n "too few to trend" guard (including at n=1 and n=2), a rising flagged-
episode count, a deterministic top flag, and null gaps in the trajectory
strip. This is a regression fixture, not a demo of a healthy patient.

Usage:
    cd backend
    SEED_CONFIRM=1 python scripts/seed_glance_demo.py

Login after seeding: clinician.glancetest@example.com / glancedemo123

Note: uses .com, not .test — .test is an RFC 2606 reserved TLD and the
backend's EmailStr validator rejects it on /auth/login, even though a direct
ORM insert (like this script does) doesn't enforce that.

Safe to re-run — idempotent on the demo patient's daily logs (deletes and
re-inserts only that patient's logs, never touches anything else).
"""
import os
import sys
from datetime import date, timedelta
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv  # noqa: E402

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")


def _guard_local_only() -> None:
    """Refuses to run against anything but a local database, and refuses to
    write at all unless explicitly confirmed. Runs before any other project
    import, so nothing that could open a connection happens before this passes.
    """
    if not DATABASE_URL:
        print("DATABASE_URL is not set. Aborting.")
        sys.exit(1)

    parsed = urlparse(DATABASE_URL)
    host = parsed.hostname or ""
    dbname = (parsed.path or "").lstrip("/")
    print(f"Target database: host={host!r} db={dbname!r}")

    if host not in ("localhost", "127.0.0.1"):
        print(
            f"REFUSING TO SEED: host {host!r} is not localhost/127.0.0.1. "
            "This script only ever writes to a local database. Aborting."
        )
        sys.exit(1)

    if os.getenv("SEED_CONFIRM") != "1":
        print(
            f"Dry run only — SEED_CONFIRM=1 is not set. Nothing was written to "
            f"{host}/{dbname}. Re-run with SEED_CONFIRM=1 to actually seed."
        )
        sys.exit(0)


_guard_local_only()

# Only past the guard do we touch anything that could open a DB connection.
from database import SessionLocal  # noqa: E402
import models  # noqa: E402
from auth import get_password_hash  # noqa: E402

CAREGIVER_EMAIL = "caregiver.glancetest@example.com"
CLINICIAN_EMAIL = "clinician.glancetest@example.com"
CLINICIAN_PASSWORD = "glancedemo123"
PATIENT_NAME = "Demo Patient (glance-test)"

TODAY = date.today()

# window_days=30 passed to build_patient_aggregate resolves to
# start_date = end_date - timedelta(days=30), an inclusive 31-day span (see
# aggregation.py's own comment on this). The "current window" and "prior
# window" below are seeded against that true 31-day span, not a naive 30.
CURRENT_OFFSETS = range(0, 31)   # today .. today-30
PRIOR_OFFSETS = range(31, 62)    # today-31 .. today-61

CURRENT_GAPS = {12, 19, 30}      # offset 30 left unlogged so days_logged lands on exactly 28
MED_MISS = {3, 8, 15, 22}
EPISODE_DAYS = {18, 7, 6}
FALSE_SMOKE = {0, 3, 8, 15, 22, 25, 28, 29}  # the rest of the 28 logged days read smoked=true (~20)

ANXIETY = {0: 1, 4: 2, 10: 2, 14: 3, 17: 2, 21: 3, 24: 2, 27: 3, 29: 3}       # 9 days, sum 21, avg 2.33
NAUSEA = {2: 3, 5: 4, 11: 4, 16: 5, 23: 5}                                     # 5 days, sum 21, avg 4.2
MOOD = {1: 3, 4: 3, 9: 3, 13: 4, 17: 3, 26: 4}                                 # 6 days, sum 20, avg 3.33

NOTE_DAY7 = (
    "Symptoms went from 5 to 10. He was trying hard not to punch something "
    "and wanted to scream. I called the therapist and we de-escalated."
)
NOTE_DAY6 = (
    "Two episodes during surfing with heart rate around 180. Later found he "
    "had snuck a few beers and a shot."
)

PRIOR_GAPS = {34, 41, 48, 55, 61}
PRIOR_ANXIETY = {32: 3, 36: 4, 39: 4, 43: 4, 46: 5}   # 5 days, sum 20, avg 4.0
PRIOR_NAUSEA = {33: 2, 37: 3, 40: 3, 44: 2, 47: 3}    # 5 days, sum 13, avg 2.6
PRIOR_MOOD = {35: 3, 49: 3, 51: 3, 53: 4, 56: 3}      # 5 days, sum 16, avg 3.2
PRIOR_EPISODE_DAY = 45


def _get_or_create_user(db, email, name, role, password=None):
    user = db.query(models.User).filter(models.User.email == email).first()
    if user:
        print(f"Reusing existing user {email} (id={user.id}).")
        return user
    user = models.User(
        email=email,
        password_hash=get_password_hash(password or os.urandom(16).hex()),
        name=name,
        role=role,
    )
    db.add(user)
    db.flush()
    print(f"Created user {email} (id={user.id}).")
    return user


def _seed_daily_logs(db, patient_id, caregiver_id, med_id) -> None:
    for offset in CURRENT_OFFSETS:
        if offset in CURRENT_GAPS:
            continue
        log_date = TODAY - timedelta(days=offset)

        symptoms = []
        if offset in ANXIETY:
            symptoms.append({"name": "Anxiety", "severity": ANXIETY[offset]})
        if offset in NAUSEA:
            symptoms.append({"name": "Nausea", "severity": NAUSEA[offset]})
        if offset in MOOD:
            symptoms.append({"name": "Mood changes", "severity": MOOD[offset]})
        if offset == 7:
            # Agitation listed first so it — not the tied Sleep issues entry —
            # is what a same-severity max() pick surfaces for this day.
            symptoms.insert(0, {"name": "Agitation", "severity": 10})
            symptoms.append({"name": "Sleep issues", "severity": 10})
        if offset == 20:
            symptoms.append({"name": "Sleep issues", "severity": 10})

        notes = NOTE_DAY7 if offset == 7 else NOTE_DAY6 if offset == 6 else None
        missed = offset in MED_MISS
        occurred = offset in EPISODE_DAYS

        db.add(models.DailyLog(
            patient_id=patient_id,
            logged_by=caregiver_id,
            date=log_date,
            medications_taken=[{
                "medication_id": med_id,
                "taken": not missed,
                "time_taken": None if missed else "20:00",
            }],
            symptoms=symptoms or None,
            episode={"occurred": occurred, "time": "16:30" if occurred else None,
                     "description": "Flagged episode" if occurred else None},
            lifestyle={
                "smoked": offset not in FALSE_SMOKE,
                "alcohol": offset == 6,
                "stressed": occurred,
                "ate_well": not occurred,
            },
            notes=notes,
            log_type="detailed",
        ))

    for offset in PRIOR_OFFSETS:
        if offset in PRIOR_GAPS:
            continue
        log_date = TODAY - timedelta(days=offset)

        symptoms = []
        if offset in PRIOR_ANXIETY:
            symptoms.append({"name": "Anxiety", "severity": PRIOR_ANXIETY[offset]})
        if offset in PRIOR_NAUSEA:
            symptoms.append({"name": "Nausea", "severity": PRIOR_NAUSEA[offset]})
        if offset in PRIOR_MOOD:
            symptoms.append({"name": "Mood changes", "severity": PRIOR_MOOD[offset]})

        occurred = offset == PRIOR_EPISODE_DAY

        db.add(models.DailyLog(
            patient_id=patient_id,
            logged_by=caregiver_id,
            date=log_date,
            medications_taken=[{"medication_id": med_id, "taken": True, "time_taken": "20:00"}],
            symptoms=symptoms or None,
            episode={"occurred": occurred, "time": "14:00" if occurred else None,
                     "description": "Flagged episode" if occurred else None},
            lifestyle={"smoked": offset % 3 != 0, "alcohol": False, "stressed": False, "ate_well": True},
            notes=None,
            log_type="detailed",
        ))


def _print_summary(db, patient_id) -> None:
    from services.aggregation import build_patient_aggregate, build_top_flag

    window_days = 30
    agg = build_patient_aggregate(patient_id, window_days=window_days, db=db)
    prior_end = agg["window"]["start"] - timedelta(days=1)
    prior_start = prior_end - timedelta(days=window_days)
    prior_agg = build_patient_aggregate(patient_id, db=db, start_date=prior_start, end_date=prior_end)

    print("\n--- Sanity check (recomputed via services.aggregation, same code the endpoint uses) ---")
    print(f"days_logged: {agg['days_logged']}  (want 28)")
    print(f"episode_count current/prior: {agg['episode_count']}/{prior_agg['episode_count']}  (want 3/1)")
    print(
        f"adherence current/prior: {agg['adherence_totals']['pct']}%/"
        f"{prior_agg['adherence_totals']['pct']}%  (want ~85.7/100)"
    )
    for name in ["Anxiety", "Nausea", "Mood changes", "Sleep issues", "Agitation"]:
        cur = agg["symptom_stats"].get(name)
        prev = prior_agg["symptom_stats"].get(name)
        print(
            f"{name}: days={cur['days_present'] if cur else 0} "
            f"avg={cur['avg_severity'] if cur else None} "
            f"prev_avg={prev['avg_severity'] if prev else None}"
        )
    top_flag = build_top_flag(agg["observation_periods"])
    print(f"top_flag: {top_flag}")


def main() -> None:
    db = SessionLocal()
    try:
        caregiver = _get_or_create_user(
            db, CAREGIVER_EMAIL, "Glance Demo Caregiver", models.UserRole.caregiver
        )

        patient = db.query(models.Patient).filter(models.Patient.name == PATIENT_NAME).first()
        if patient:
            deleted = (
                db.query(models.DailyLog)
                .filter(models.DailyLog.patient_id == patient.id)
                .delete()
            )
            print(f"Reusing existing demo patient id={patient.id}; cleared {deleted} prior daily logs.")
        else:
            patient = models.Patient(
                name=PATIENT_NAME,
                date_of_birth=date(1998, 3, 12),
                diagnosis="Schizoaffective disorder",
                caregiver_id=caregiver.id,
            )
            db.add(patient)
            db.flush()
            print(f"Created demo patient id={patient.id}.")

        clinician = _get_or_create_user(
            db, CLINICIAN_EMAIL, "Glance Demo Clinician", models.UserRole.clinician,
            password=CLINICIAN_PASSWORD,
        )

        link = (
            db.query(models.ClinicianPatientLink)
            .filter(
                models.ClinicianPatientLink.clinician_id == clinician.id,
                models.ClinicianPatientLink.patient_id == patient.id,
            )
            .first()
        )
        if not link:
            db.add(models.ClinicianPatientLink(clinician_id=clinician.id, patient_id=patient.id))
            print("Linked demo clinician to demo patient.")
        else:
            print("Clinician-patient link already exists.")

        med = (
            db.query(models.Medication)
            .filter(models.Medication.patient_id == patient.id, models.Medication.name == "Clozapine")
            .first()
        )
        if not med:
            med = models.Medication(
                patient_id=patient.id, name="Clozapine", dose="300mg",
                frequency="daily", time_of_day="evening", active=True,
            )
            db.add(med)
            db.flush()
            print(f"Created medication id={med.id}.")
        else:
            print(f"Reusing existing medication id={med.id}.")

        _seed_daily_logs(db, patient.id, caregiver.id, med.id)

        db.commit()
        print("\nDone. Log in as clinician:")
        print(f"  email:    {CLINICIAN_EMAIL}")
        print(f"  password: {CLINICIAN_PASSWORD}")
        print(f"  patient:  {PATIENT_NAME} (id={patient.id})")

        _print_summary(db, patient.id)
    finally:
        db.close()


if __name__ == "__main__":
    main()
