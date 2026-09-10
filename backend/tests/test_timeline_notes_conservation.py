"""Phase 1 test criterion: "Total notes rendered across all sections equals
total notes in the window. Automated test."

A caregiver note must never disappear from the clinician timeline — every
note either lands under a domain it was assigned to (possibly more than
one, since a note may be duplicated across domains) or under "other notes"
if it matched none. This asserts the union of every domain's notes plus
"other notes", counted by DISTINCT note (date, author, text), equals the
distinct notes actually saved for the window — duplication across domains
is expected and correct; disappearance is not.
"""
import uuid
from datetime import date

import models
from services.timeline_ai import regenerate_timeline_cache


def _seed_patient_with_notes(db):
    caregiver = models.User(
        email=f"notes-test.caregiver.{uuid.uuid4().hex[:8]}@example.com",
        password_hash="x", name="Notes Test Caregiver", role=models.UserRole.caregiver,
    )
    db.add(caregiver)
    db.flush()
    patient = models.Patient(name="Notes Test Patient", caregiver_id=caregiver.id, is_demo=True, diagnosis="test")
    db.add(patient)
    db.flush()

    notes = [
        (date(2026, 1, 1), "He was up at 2am smoking on the back steps again."),  # plausibly both sleep + cigarettes
        (date(2026, 1, 3), "Slept through the night for the first time in a week."),
        (date(2026, 1, 5), "Didn't want to see anyone today, stayed in his room."),
        (date(2026, 1, 7), "Weighed himself and didn't say anything about the number."),
        (date(2026, 1, 9), "Something about the weather, not sure it means anything."),  # matches no domain
    ]
    for d, text in notes:
        db.add(models.DailyLog(
            patient_id=patient.id, logged_by=caregiver.id, date=d,
            symptoms=[{"name": "Anxiety", "severity": 5}],
            notes=text,
        ))
    db.commit()
    patient_id = patient.id
    total_notes = len(notes)
    db.close()
    return patient_id, total_notes


def test_note_count_conserved_with_no_assignment(db, client, clinician_token):
    """No OPENAI_API_KEY is set in tests (see conftest.pytest_configure), so
    assign_notes_to_domains never runs — every note must land in
    "other_notes" with none dropped and none duplicated."""
    patient_id, total_notes = _seed_patient_with_notes(db)
    regenerate_timeline_cache(patient_id)

    resp = client.get(
        f"/clinician/patient/{patient_id}/timeline",
        params={"window": "1m"},
        headers={"Authorization": f"Bearer {clinician_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()

    assert sum(len(d["notes"]) for d in data["domains"]) == 0
    assert len(data["other_notes"]) == total_notes


def test_note_count_conserved_with_assignment_including_duplicates(db, client, clinician_token, monkeypatch):
    """A note assigned to two domains renders under both (duplication is
    correct — see the note-assignment spec's "may be assigned to more than
    one domain" rule) and is still counted only once in the union of
    distinct notes actually saved."""
    patient_id, total_notes = _seed_patient_with_notes(db)

    monkeypatch.setenv("OPENAI_API_KEY", "sk-test-fake-key-not-a-real-call")

    def fake_assign(notes, domain_keys, api_key, timeout=8.0):
        assignments = {}
        for n in notes:
            if "smoking" in n["text"]:
                assignments[n["date"]] = ["sleep", "cigarettes"]  # deliberately duplicated
            elif "weighed" in n["text"].lower():
                assignments[n["date"]] = ["weight"]
            elif "room" in n["text"]:
                assignments[n["date"]] = ["socialization"]
            elif "invalid-domain-the-model-made-up" in n["text"]:
                assignments[n["date"]] = ["not_a_real_domain"]
            else:
                assignments[n["date"]] = []  # explicitly matches nothing
        return assignments

    monkeypatch.setattr("services.timeline_ai.assign_notes_to_domains", fake_assign)
    regenerate_timeline_cache(patient_id)

    resp = client.get(
        f"/clinician/patient/{patient_id}/timeline",
        params={"window": "1m"},
        headers={"Authorization": f"Bearer {clinician_token}"},
    )
    assert resp.status_code == 200
    data = resp.json()

    domain_notes_by_key = {d["key"]: d["notes"] for d in data["domains"]}
    assert len(domain_notes_by_key["sleep"]) == 1
    assert len(domain_notes_by_key["cigarettes"]) == 1
    assert domain_notes_by_key["sleep"][0]["date"] == domain_notes_by_key["cigarettes"][0]["date"]
    assert len(domain_notes_by_key["weight"]) == 1
    assert len(domain_notes_by_key["socialization"]) == 1

    # Distinct notes actually rendered somewhere (a duplicated note counts
    # once here — it's the same underlying note shown in two places, not two
    # notes) must equal the distinct notes actually saved.
    seen_dates = set()
    for d in data["domains"]:
        for n in d["notes"]:
            seen_dates.add(n["date"])
    for n in data["other_notes"]:
        seen_dates.add(n["date"])
    assert len(seen_dates) == total_notes

    # Nothing disappeared: the "weather" note matches no domain, and must
    # still surface under other_notes rather than being silently dropped.
    other_dates = {n["date"] for n in data["other_notes"]}
    assert "2026-01-09" in other_dates
