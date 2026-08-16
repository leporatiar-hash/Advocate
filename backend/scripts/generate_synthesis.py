"""One-off script to (re)generate and cache the AI Clinical Summary synthesis for a
patient's clinician portal.

This is deliberately a hand-run script, not an API endpoint the portal calls itself
— the portal's GET path only ever reads the cached row, so a page load is instant,
identical every time, and never depends on OpenAI being reachable. Re-run this
whenever you want the summary refreshed with newer notes; it overwrites the one
cached row for that patient (idempotent by design, not append-only history).

Run:
    cd backend && SEED_PATIENT_ID=<id> OPENAI_API_KEY=<key> python scripts/generate_synthesis.py

Point DATABASE_URL (env var or backend/.env) at whichever database you want to
write the cached synthesis into — local for testing, prod for the real thing.
"""
import json
import os
import sys
from datetime import datetime, timedelta

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database import SessionLocal
import models
from services.aggregation import build_patient_aggregate, build_temporal_bins, TEMPORAL_WINDOW_DAYS
from services.synthesis import generate_synthesis, generate_temporal_readouts

PATIENT_ID = int(os.getenv("SEED_PATIENT_ID", "0"))
WINDOW_DAYS = int(os.getenv("SYNTHESIS_WINDOW_DAYS", "30"))


def main():
    if not PATIENT_ID:
        print("Set SEED_PATIENT_ID to the patient to generate a synthesis for. Aborting.")
        sys.exit(1)

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        print("Set OPENAI_API_KEY. Aborting.")
        sys.exit(1)

    db = SessionLocal()
    try:
        patient = db.query(models.Patient).filter(models.Patient.id == PATIENT_ID).first()
        if not patient:
            print(f"No patient with id={PATIENT_ID}. Aborting.")
            sys.exit(1)

        agg = build_patient_aggregate(PATIENT_ID, window_days=WINDOW_DAYS, db=db)
        content = generate_synthesis(patient, agg, db, api_key)

        # Temporal Data bin readouts — same 12-month window the /temporal
        # endpoint queries, computed here (not on the GET path) since it's an
        # OpenAI call per bin-with-notes.
        today = datetime.now().date()
        temporal_logs = (
            db.query(models.DailyLog)
            .filter(
                models.DailyLog.patient_id == PATIENT_ID,
                models.DailyLog.date >= today - timedelta(days=TEMPORAL_WINDOW_DAYS),
                models.DailyLog.date <= today,
            )
            .order_by(models.DailyLog.date.asc())
            .all()
        )
        temporal_bins = build_temporal_bins(temporal_logs)
        temporal_result = generate_temporal_readouts(patient, temporal_bins, api_key)
        content["temporal_readouts"] = temporal_result["temporal_readouts"]
        content["validation_warnings"] = content["validation_warnings"] + temporal_result["validation_warnings"]

        if content["validation_warnings"]:
            print("VALIDATION WARNINGS — review before trusting this synthesis:")
            for w in content["validation_warnings"]:
                print(f"  - {w}")
            print()

        existing = (
            db.query(models.ClinicianNoteSynthesis)
            .filter(models.ClinicianNoteSynthesis.patient_id == PATIENT_ID)
            .first()
        )
        if existing:
            existing.window_days = WINDOW_DAYS
            existing.start_date = agg["window"]["start"]
            existing.end_date = agg["window"]["end"]
            existing.generated_at = datetime.utcnow()
            existing.content = content
            print(f"Updated cached synthesis for patient_id={PATIENT_ID} (row id={existing.id}).")
        else:
            row = models.ClinicianNoteSynthesis(
                patient_id=PATIENT_ID,
                window_days=WINDOW_DAYS,
                start_date=agg["window"]["start"],
                end_date=agg["window"]["end"],
                content=content,
            )
            db.add(row)
            db.flush()
            print(f"Created cached synthesis for patient_id={PATIENT_ID} (row id={row.id}).")

        db.commit()
        print("\n--- Cached content ---")
        print(json.dumps(content, indent=2, default=str))
    finally:
        db.close()


if __name__ == "__main__":
    main()
