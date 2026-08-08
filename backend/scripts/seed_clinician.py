"""One-off seed for the pilot clinician account and its patient link.

This is intentionally a hand-run script, not an API endpoint — there is no
self-serve clinician signup by design. Fill in CLINICIAN_EMAIL / CLINICIAN_PASSWORD
/ CLINICIAN_NAME / PATIENT_ID below (or pass them as env vars) and run:

    cd backend && python scripts/seed_clinician.py

Point DATABASE_URL (in backend/.env, or exported in your shell) at whichever
database you want to seed — local for testing, Railway for the actual pilot —
before running this. Safe to re-run: it's idempotent on email and on the
clinician/patient pair.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
import models
from auth import get_password_hash

CLINICIAN_EMAIL = os.getenv("SEED_CLINICIAN_EMAIL", "clinician@example.com")
CLINICIAN_PASSWORD = os.getenv("SEED_CLINICIAN_PASSWORD", "changeme")
CLINICIAN_NAME = os.getenv("SEED_CLINICIAN_NAME", "Pilot Clinician")
PATIENT_ID = int(os.getenv("SEED_PATIENT_ID", "0"))


def main():
    if not PATIENT_ID:
        print("Set SEED_PATIENT_ID to the patient this clinician should see. Aborting.")
        sys.exit(1)

    db = SessionLocal()
    try:
        patient = db.query(models.Patient).filter(models.Patient.id == PATIENT_ID).first()
        if not patient:
            print(f"No patient with id={PATIENT_ID}. Aborting.")
            sys.exit(1)

        clinician = (
            db.query(models.User)
            .filter(models.User.email == CLINICIAN_EMAIL.strip().lower())
            .first()
        )
        if clinician:
            print(f"Clinician {CLINICIAN_EMAIL} already exists (id={clinician.id}); reusing it.")
        else:
            clinician = models.User(
                email=CLINICIAN_EMAIL.strip().lower(),
                password_hash=get_password_hash(CLINICIAN_PASSWORD),
                name=CLINICIAN_NAME,
                role=models.UserRole.clinician,
            )
            db.add(clinician)
            db.flush()
            print(f"Created clinician {CLINICIAN_EMAIL} (id={clinician.id}).")

        existing_link = (
            db.query(models.ClinicianPatientLink)
            .filter(
                models.ClinicianPatientLink.clinician_id == clinician.id,
                models.ClinicianPatientLink.patient_id == PATIENT_ID,
            )
            .first()
        )
        if existing_link:
            print(f"Link clinician={clinician.id} <-> patient={PATIENT_ID} already exists.")
        else:
            db.add(models.ClinicianPatientLink(clinician_id=clinician.id, patient_id=PATIENT_ID))
            print(f"Linked clinician={clinician.id} <-> patient={PATIENT_ID} ({patient.name}).")

        db.commit()
        print("Done.")
    finally:
        db.close()


if __name__ == "__main__":
    main()
