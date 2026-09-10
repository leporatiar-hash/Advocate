"""The demo gate: GET /clinician/patient/{id}/timeline must 404 for any
patient where is_demo is not True — enforced as a filter in the query
itself (routers/clinician_timeline.py), not a post-hoc check, so a clinician
account cannot retrieve a real caregiver's logs through this endpoint even
by guessing an ID. A non-demo patient and a nonexistent ID must be
indistinguishable (same 404), so this can't be used to probe which patient
IDs exist.
"""
from datetime import date

import models


def _make_patient(db, *, is_demo: bool, email_suffix: str):
    caregiver = models.User(
        email=f"gate-test.{email_suffix}@example.com", password_hash="x",
        name="Gate Test Caregiver", role=models.UserRole.caregiver,
    )
    db.add(caregiver)
    db.flush()
    patient = models.Patient(name="Gate Test Patient", caregiver_id=caregiver.id, is_demo=is_demo, diagnosis="test")
    db.add(patient)
    db.flush()
    db.add(models.DailyLog(
        patient_id=patient.id, logged_by=caregiver.id, date=date(2026, 1, 1),
        symptoms=[{"name": "Anxiety", "severity": 5}],
    ))
    db.commit()
    patient_id = patient.id
    db.close()
    return patient_id


def test_non_demo_patient_returns_404(db, client, clinician_token):
    patient_id = _make_patient(db, is_demo=False, email_suffix="nondemo")
    resp = client.get(
        f"/clinician/patient/{patient_id}/timeline",
        params={"window": "1m"},
        headers={"Authorization": f"Bearer {clinician_token}"},
    )
    assert resp.status_code == 404


def test_demo_patient_returns_200(db, client, clinician_token):
    patient_id = _make_patient(db, is_demo=True, email_suffix="demo")
    resp = client.get(
        f"/clinician/patient/{patient_id}/timeline",
        params={"window": "1m"},
        headers={"Authorization": f"Bearer {clinician_token}"},
    )
    assert resp.status_code == 200


def test_nonexistent_patient_id_returns_same_404_as_non_demo(db, client, clinician_token):
    """A non-demo patient and an ID that doesn't exist at all must be
    indistinguishable from the response alone."""
    non_demo_id = _make_patient(db, is_demo=False, email_suffix="probe")
    nonexistent_id = non_demo_id + 999_000

    resp_non_demo = client.get(
        f"/clinician/patient/{non_demo_id}/timeline", params={"window": "1m"},
        headers={"Authorization": f"Bearer {clinician_token}"},
    )
    resp_nonexistent = client.get(
        f"/clinician/patient/{nonexistent_id}/timeline", params={"window": "1m"},
        headers={"Authorization": f"Bearer {clinician_token}"},
    )
    assert resp_non_demo.status_code == resp_nonexistent.status_code == 404
    assert resp_non_demo.json() == resp_nonexistent.json()


def test_is_demo_defaults_false(db):
    """A Patient created without specifying is_demo must default to False —
    the gate fails closed, not open."""
    caregiver = models.User(email="gate-test.default@example.com", password_hash="x", name="X", role=models.UserRole.caregiver)
    db.add(caregiver)
    db.flush()
    patient = models.Patient(name="Default Gate Test", caregiver_id=caregiver.id, diagnosis="test")
    db.add(patient)
    db.commit()
    db.refresh(patient)
    assert patient.is_demo is False
