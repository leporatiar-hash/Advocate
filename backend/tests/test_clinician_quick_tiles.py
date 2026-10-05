"""GET /clinicians/patient/{id}/quick-tiles — the dashboard Quick View tiles.
Unlike the demo timeline this serves real (non-demo) patients, so the only
gate is the clinician-patient link: a linked clinician gets the series, an
unlinked one gets the same 404 as a nonexistent ID.
"""
from datetime import datetime, timedelta

import models


def _make_patient(db, *, email_suffix: str, link_to_email: str = None):
    caregiver = models.User(
        email=f"tiles-test.{email_suffix}@example.com", password_hash="x",
        name="Tiles Test Caregiver", role=models.UserRole.caregiver,
    )
    db.add(caregiver)
    db.flush()
    patient = models.Patient(name="Tiles Test Patient", caregiver_id=caregiver.id, diagnosis="test")
    db.add(patient)
    db.flush()
    today = datetime.now().date()
    db.add(models.DailyLog(
        patient_id=patient.id, logged_by=caregiver.id, date=today - timedelta(days=1),
        symptoms=[{"name": "Anxiety", "severity": 6}], sleep_hours=4.5,
        medications_taken=[{"name": "A", "taken": True}, {"name": "B", "taken": False}],
    ))
    db.add(models.DailyLog(
        patient_id=patient.id, logged_by=caregiver.id, date=today,
        symptoms=[{"name": "anxiety", "severity": 3}], sleep_hours=7,
        medications_taken=[{"name": "A", "taken": True}, {"name": "B", "taken": True}],
    ))
    if link_to_email:
        clinician = db.query(models.User).filter(models.User.email == link_to_email).first()
        db.add(models.ClinicianPatientLink(clinician_id=clinician.id, patient_id=patient.id))
    db.commit()
    patient_id = patient.id
    db.close()
    return patient_id


def test_linked_patient_gets_three_tiles(db, client, clinician_token):
    patient_id = _make_patient(db, email_suffix="linked", link_to_email="test.clinician@example.com")
    resp = client.get(
        f"/clinicians/patient/{patient_id}/quick-tiles",
        params={"window_days": 30},
        headers={"Authorization": f"Bearer {clinician_token}"},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert [d["key"] for d in body["domains"]] == ["sleep", "anxiety", "medication"]
    assert len(body["dates"]) == 30
    assert body["days_logged"] == 2
    assert body["doses_expected"] == 4
    assert body["doses_missed"] == 1

    by_key = {d["key"]: d["series"] for d in body["domains"]}
    assert [p["value"] for p in by_key["sleep"][-2:]] == [4.5, 7]
    assert [p["value"] for p in by_key["anxiety"][-2:]] == [6, 3]
    # Unlogged days are explicit nulls, never filled.
    assert by_key["sleep"][0]["value"] is None


def test_unlinked_patient_returns_404(db, client, clinician_token):
    patient_id = _make_patient(db, email_suffix="unlinked")
    resp = client.get(
        f"/clinicians/patient/{patient_id}/quick-tiles",
        headers={"Authorization": f"Bearer {clinician_token}"},
    )
    assert resp.status_code == 404
