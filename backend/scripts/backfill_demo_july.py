"""Backfills generic, unremarkable logs for the demo patient (Marcus) before
his seeded Aug 2 start, so the clinician 3-month views have data to show.

Story-consistent with seed_demo_patient.py: Aug 2's note is "First night
home", so logs run Jul 8 to Jul 24 (at home, on olanzapine, anxiety and
sleep drifting slightly worse in the last week) and stop Jul 25 to Aug 1
for the hospital stay. Numbers only, no notes, so the AI summary and raw
notes are unaffected.

Idempotent: deletes Marcus's logs inside the backfill range, then inserts.
Re-run after seed_demo_patient.py, which clears all of his logs.

Run (dry run unless SEED_CONFIRM=1):
    cd backend && DATABASE_URL=<url> SEED_CONFIRM=1 python scripts/backfill_demo_july.py
"""
import os
import random
import sys
from datetime import date, timedelta
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
import models

MARCUS_PATIENT_ID = 999999
DEMO_CAREGIVER_EMAIL = "demo.caregiver@advocate.health"
START = date(2026, 7, 8)
END = date(2026, 7, 24)  # hospital stay Jul 25 - Aug 1: no logs


def main() -> None:
    parsed = urlparse(os.getenv("DATABASE_URL", ""))
    print(f"Target database: host={parsed.hostname!r} db={(parsed.path or '').lstrip('/')!r}")

    db = SessionLocal()
    try:
        patient = (
            db.query(models.Patient)
            .filter(models.Patient.id == MARCUS_PATIENT_ID, models.Patient.is_demo == True)  # noqa: E712
            .first()
        )
        mom = db.query(models.User).filter(models.User.email == DEMO_CAREGIVER_EMAIL).first()
        olanzapine = (
            db.query(models.Medication)
            .filter(models.Medication.patient_id == MARCUS_PATIENT_ID, models.Medication.name == "Olanzapine")
            .first()
        )
        if not patient or not mom or not olanzapine:
            print("Demo patient, caregiver, or olanzapine missing — run seed_demo_patient.py first. Aborting.")
            sys.exit(1)

        rng = random.Random(7)  # fixed seed: identical data on every run
        rows = []
        days = (END - START).days + 1
        for i in range(days):
            d = START + timedelta(days=i)
            late = i >= days - 7  # last week before admission: a little worse
            # A couple of skipped days so it reads like real logging.
            if d in (date(2026, 7, 13), date(2026, 7, 19)):
                continue
            anxiety = rng.choice([4, 5, 5, 6]) if late else rng.choice([2, 3, 3, 4])
            sleep = round((rng.uniform(5.0, 6.5) if late else rng.uniform(6.5, 8.0)) * 2) / 2
            taken = rng.random() > (0.3 if late else 0.08)
            vitals = {"cigarettes": str(rng.randint(6, 10) if late else rng.randint(3, 7))}
            if i % 5 == 0:
                vitals["weight_lb"] = 196.0 + rng.choice([0, 0.5, 1.0])
            rows.append(models.DailyLog(
                patient_id=patient.id,
                logged_by=mom.id,
                date=d,
                medications_taken=[{"medication_id": olanzapine.id, "taken": taken, "time_taken": "20:00" if taken else None}],
                symptoms=[{"name": "Anxiety", "severity": anxiety}],
                sleep_hours=sleep,
                vitals=vitals,
                socialization={
                    "quality": None, "left_house": rng.random() > (0.6 if late else 0.35),
                    "contact_ids": [], "had_contact": False, "initiated_by": None,
                },
                log_type="detailed",
            ))

        if os.getenv("SEED_CONFIRM") != "1":
            print(f"Dry run only — would write {len(rows)} logs {START} to {END}. SEED_CONFIRM=1 to write.")
            return

        deleted = (
            db.query(models.DailyLog)
            .filter(
                models.DailyLog.patient_id == patient.id,
                models.DailyLog.date >= START,
                models.DailyLog.date <= END,
            )
            .delete()
        )
        db.add_all(rows)
        db.commit()
        print(f"Replaced {deleted} prior logs with {len(rows)} backfilled logs, {START} to {END}.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
