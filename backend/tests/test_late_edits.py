"""Logs saved on a later day than their own date are marked: "added" when
the day was first logged after the fact, "edited" when an on-time entry was
changed later. Same-day saves are never marked."""
from datetime import date, timedelta


def _auth(client):
    email = "late.edits@example.com"
    resp = client.post("/auth/register", json={
        "email": email, "password": "testpass123", "name": "Late Edits", "role": "caregiver",
    })
    if resp.status_code != 200:
        resp = client.post("/auth/login", json={"email": email, "password": "testpass123"})
    headers = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    patient = client.post("/patients/", headers=headers, json={"name": "Leo", "diagnosis": "x"}).json()
    return headers, patient["id"]


def _save(client, headers, pid, day, today, notes="n"):
    resp = client.post("/logs/", headers=headers, json={
        "patient_id": pid, "date": day.isoformat(), "notes": notes, "client_today": today.isoformat(),
    })
    assert resp.status_code == 200, resp.text
    return resp.json()


def test_same_day_saves_are_not_marked(client):
    headers, pid = _auth(client)
    today = date(2026, 10, 8)
    log = _save(client, headers, pid, today, today)
    assert log["late_kind"] is None
    assert _save(client, headers, pid, today, today, notes="again")["late_kind"] is None


def test_edit_and_backfill_marked(client):
    headers, pid = _auth(client)
    d1, d2 = date(2026, 9, 1), date(2026, 9, 2)
    # On-time entry, then edited a week later
    assert _save(client, headers, pid, d1, d1)["late_kind"] is None
    edited = _save(client, headers, pid, d1, d1 + timedelta(days=7), notes="fixed")
    assert edited["late_kind"] == "edited" and edited["late_saved_at"]
    # A day first logged after the fact stays "added" through later edits
    assert _save(client, headers, pid, d2, d2 + timedelta(days=3))["late_kind"] == "added"
    assert _save(client, headers, pid, d2, d2 + timedelta(days=5), notes="more")["late_kind"] == "added"
    # Quick "nothing notable" backfill is marked too
    resp = client.post(f"/logs/{pid}/quick", headers=headers, json={
        "date": "2026-09-03", "type": "nothing_notable", "client_today": "2026-09-10",
    })
    assert resp.json()["late_kind"] == "added"
    # And the history list returns the marker
    logs = client.get(f"/logs/{pid}", headers=headers).json()
    assert {l["date"]: l["late_kind"] for l in logs}["2026-09-01"] == "edited"
