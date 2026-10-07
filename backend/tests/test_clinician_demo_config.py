"""The demo gate for clinician config writes (routers/clinician_demo_config.py).

These are the only routes where a clinician token can write, so the gate has
to hold for every one of them: a non-demo patient must be unreachable (same
404 as a nonexistent ID), and a caregiver token must not be able to use them.
"""
import models


def _make_patient(db, *, is_demo: bool, email_suffix: str):
    caregiver = models.User(
        email=f"cfg-test.{email_suffix}@example.com", password_hash="x",
        name="Config Test Caregiver", role=models.UserRole.caregiver,
        user_config={"symptoms": ["Anxiety"], "onboarding_answer": "keep me"},
    )
    db.add(caregiver)
    db.flush()
    patient = models.Patient(name="Config Test Patient", caregiver_id=caregiver.id, is_demo=is_demo, diagnosis="test")
    db.add(patient)
    db.flush()
    med = models.Medication(patient_id=patient.id, name="Med A", dose="5mg", frequency="daily", time_of_day="morning")
    contact = models.SocialContact(user_id=caregiver.id, name="Mom")
    db.add_all([med, contact])
    db.commit()
    ids = (patient.id, caregiver.id, med.id, contact.id)
    db.close()
    return ids


def _auth(token):
    return {"Authorization": f"Bearer {token}"}


def _write_requests(patient_id, med_id, contact_id):
    return [
        ("PATCH", f"/clinician/patient/{patient_id}/config", {"updates": {"symptoms": ["Pain"]}}),
        ("POST", f"/clinician/patient/{patient_id}/medications",
         {"name": "Med B", "dose": "1mg", "frequency": "daily", "time_of_day": "morning"}),
        ("DELETE", f"/clinician/patient/{patient_id}/medications/{med_id}", None),
        ("POST", f"/clinician/patient/{patient_id}/contacts", {"name": "Dad"}),
        ("DELETE", f"/clinician/patient/{patient_id}/contacts/{contact_id}", None),
    ]


def test_non_demo_patient_is_unreachable(db, client, clinician_token):
    patient_id, caregiver_id, med_id, contact_id = _make_patient(db, is_demo=False, email_suffix="nondemo")
    resp = client.get(f"/clinician/patient/{patient_id}/config", headers=_auth(clinician_token))
    assert resp.status_code == 404
    for method, url, body in _write_requests(patient_id, med_id, contact_id):
        resp = client.request(method, url, headers=_auth(clinician_token), json=body)
        assert resp.status_code == 404, (method, url, resp.status_code)

    # And nothing changed underneath.
    from database import SessionLocal
    s = SessionLocal()
    caregiver = s.get(models.User, caregiver_id)
    assert caregiver.user_config["symptoms"] == ["Anxiety"]
    assert s.get(models.Medication, med_id).active is True
    assert s.get(models.SocialContact, contact_id) is not None
    s.close()


def test_nonexistent_id_matches_non_demo_404(db, client, clinician_token):
    patient_id, *_ = _make_patient(db, is_demo=False, email_suffix="probe")
    a = client.get(f"/clinician/patient/{patient_id}/config", headers=_auth(clinician_token))
    b = client.get(f"/clinician/patient/{patient_id + 999_000}/config", headers=_auth(clinician_token))
    assert a.status_code == b.status_code == 404
    assert a.json() == b.json()


def test_clinician_can_configure_demo_patient(db, client, clinician_token):
    patient_id, caregiver_id, med_id, contact_id = _make_patient(db, is_demo=True, email_suffix="demo")
    h = _auth(clinician_token)

    resp = client.patch(f"/clinician/patient/{patient_id}/config", headers=h,
                        json={"updates": {"symptoms": ["Pain"], "symptom_scale": "words"}})
    assert resp.status_code == 200, resp.text
    cfg = resp.json()["user_config"]
    assert cfg["symptoms"] == ["Pain"]
    assert cfg["symptom_scale"] == "words"
    assert cfg["onboarding_answer"] == "keep me"  # merge, not replace

    resp = client.post(f"/clinician/patient/{patient_id}/medications", headers=h,
                       json={"name": "Med B", "dose": "1mg", "frequency": "daily", "time_of_day": "morning"})
    assert resp.status_code == 200, resp.text
    assert client.delete(f"/clinician/patient/{patient_id}/medications/{med_id}", headers=h).status_code == 204

    resp = client.post(f"/clinician/patient/{patient_id}/contacts", headers=h, json={"name": "Dad"})
    assert resp.status_code == 201, resp.text
    assert client.delete(f"/clinician/patient/{patient_id}/contacts/{contact_id}", headers=h).status_code == 204

    data = client.get(f"/clinician/patient/{patient_id}/config", headers=h).json()
    assert [m["name"] for m in data["medications"]] == ["Med B"]
    assert [c["name"] for c in data["contacts"]] == ["Dad"]


def test_only_customize_keys_are_editable(db, client, clinician_token):
    patient_id, *_ = _make_patient(db, is_demo=True, email_suffix="keys")
    resp = client.patch(f"/clinician/patient/{patient_id}/config", headers=_auth(clinician_token),
                        json={"updates": {"onboarding_answer": "overwritten"}})
    assert resp.status_code == 400


def test_caregiver_token_cannot_use_clinician_config_routes(db, client):
    patient_id, _, med_id, contact_id = _make_patient(db, is_demo=True, email_suffix="cg")
    resp = client.post("/auth/register", json={
        "email": "cfg-test.caregiver-caller@example.com", "password": "testpass123",
        "name": "Caller", "role": "caregiver",
    })
    token = resp.json()["access_token"]
    assert client.get(f"/clinician/patient/{patient_id}/config", headers=_auth(token)).status_code == 403
    for method, url, body in _write_requests(patient_id, med_id, contact_id):
        resp = client.request(method, url, headers=_auth(token), json=body)
        assert resp.status_code == 403, (method, url, resp.status_code)
