"""Links the demo clinician to Marcus (the is_demo patient) through the normal
ClinicianPatientLink table, so Marcus also appears on that clinician's roster
and dashboard (Quick View), not only on the is_demo-gated timeline.
Idempotent: re-running is a no-op once the link exists.

Run (dry run unless SEED_CONFIRM=1):
    cd backend && DATABASE_URL=<url> SEED_CONFIRM=1 python scripts/link_demo_clinician.py
"""
import os
import sys
from urllib.parse import urlparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
import models

DEMO_CLINICIAN_EMAIL = "demo.clinician@advocate.health"
MARCUS_PATIENT_ID = 999999


def main() -> None:
    parsed = urlparse(os.getenv("DATABASE_URL", ""))
    print(f"Target database: host={parsed.hostname!r} db={(parsed.path or '').lstrip('/')!r}")

    db = SessionLocal()
    try:
        clinician = db.query(models.User).filter(models.User.email == DEMO_CLINICIAN_EMAIL).first()
        patient = (
            db.query(models.Patient)
            .filter(models.Patient.id == MARCUS_PATIENT_ID, models.Patient.is_demo == True)  # noqa: E712
            .first()
        )
        if not clinician or not patient:
            print("Demo clinician or demo patient missing — run scripts/seed_demo_patient.py first. Aborting.")
            sys.exit(1)

        existing = (
            db.query(models.ClinicianPatientLink)
            .filter_by(clinician_id=clinician.id, patient_id=patient.id)
            .first()
        )
        if existing:
            print("Link already exists. Nothing to do.")
            return
        if os.getenv("SEED_CONFIRM") != "1":
            print("Dry run only — SEED_CONFIRM=1 is not set. Nothing was written.")
            return

        db.add(models.ClinicianPatientLink(clinician_id=clinician.id, patient_id=patient.id))
        db.commit()
        print(f"Linked {DEMO_CLINICIAN_EMAIL} to {patient.name} (id={patient.id}).")
    finally:
        db.close()


if __name__ == "__main__":
    main()
