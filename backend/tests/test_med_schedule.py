"""Medication schedules (services/med_schedule.py) and custom vital stats.

Stored logs keep their legacy shape — a `taken: false` entry for every
active med with no dose — and every reader filters at read time. These tests
pin that: off-day and as-needed "misses" disappear, given doses never do,
and the stored rows are left untouched.
"""
import copy
from datetime import date, timedelta
from types import SimpleNamespace

import models
from services.aggregation import build_custom_vital_stats, build_patient_aggregate
from services.med_schedule import (
    AS_NEEDED,
    DAILY,
    effective_schedule_type,
    filter_false_misses,
    filter_for_adherence,
    is_due,
)


def _med(id=1, frequency="daily", **schedule):
    return SimpleNamespace(id=id, name=f"Med {id}", frequency=frequency, **schedule)


def test_every_n_days_due_dates_including_before_anchor():
    med = _med(schedule_type="every_n_days", schedule_interval_days=2, schedule_start_date=date(2026, 10, 1))
    assert is_due(med, date(2026, 10, 1))
    assert not is_due(med, date(2026, 10, 2))
    assert is_due(med, date(2026, 10, 3))
    assert is_due(med, date(2026, 9, 29))
    assert not is_due(med, date(2026, 9, 30))
    assert is_due(med, "2026-10-05")

    every3 = _med(schedule_type="every_n_days", schedule_interval_days=3, schedule_start_date=date(2026, 10, 10))
    assert [is_due(every3, date(2026, 10, 10) - timedelta(days=i)) for i in range(4)] == [True, False, False, True]


def test_incomplete_schedules_fall_back_to_daily():
    assert is_due(_med(schedule_type="every_n_days", schedule_interval_days=2), date(2026, 10, 2))
    assert is_due(_med(schedule_type="every_n_days", schedule_start_date=date(2026, 10, 1)), date(2026, 10, 2))
    assert is_due(_med(schedule_type="weekdays", schedule_weekdays=[]), date(2026, 10, 2))


def test_weekday_schedule():
    med = _med(schedule_type="weekdays", schedule_weekdays=[0, 2, 4])  # Mon, Wed, Fri
    monday = date(2026, 10, 5)
    assert [is_due(med, monday + timedelta(days=i)) for i in range(7)] == [True, False, True, False, True, False, False]


def test_as_needed_detected_from_legacy_frequency_text():
    for text in ("As needed", "PRN", "prn for constipation", "when needed", "as-needed", "Take if needed"):
        assert effective_schedule_type(_med(frequency=text)) == AS_NEEDED, text
    for text in ("daily", "twice a day", "", None, "Every morning"):
        assert effective_schedule_type(_med(frequency=text)) == DAILY, text
    # An explicit schedule always wins over the text.
    assert effective_schedule_type(_med(frequency="PRN", schedule_type="daily")) == DAILY
    assert not is_due(_med(frequency="PRN"), date(2026, 10, 1))


def test_filters_drop_false_misses_but_keep_given_doses():
    daily = _med(1)
    eod = _med(2, schedule_type="every_n_days", schedule_interval_days=2, schedule_start_date=date(2026, 10, 1))
    prn = _med(3, frequency="as needed")
    meds = {m.id: m for m in (daily, eod, prn)}
    off_day = date(2026, 10, 2)

    entries = [
        {"medication_id": 1, "taken": False},
        {"medication_id": 2, "taken": False},
        {"medication_id": 3, "taken": False},
        {"medication_id": 99, "taken": False},  # unknown med: kept
    ]
    assert [e["medication_id"] for e in filter_false_misses(entries, meds, off_day)] == [1, 99]

    given = [
        {"medication_id": 2, "taken": True, "time_taken": "08:00"},
        {"medication_id": 3, "taken": True, "time_taken": "14:00"},
    ]
    assert filter_false_misses(given, meds, off_day) == given
    # Adherence additionally drops as-needed meds entirely, given or not.
    assert [e["medication_id"] for e in filter_for_adherence(given, meds, off_day)] == [2]


def test_week_of_legacy_logs(db):
    caregiver = models.User(email="sched.carina@example.com", password_hash="x", name="Carina",
                            role=models.UserRole.caregiver)
    db.add(caregiver)
    db.flush()
    patient = models.Patient(name="Leo", caregiver_id=caregiver.id, diagnosis="schizophrenia")
    db.add(patient)
    db.flush()

    end = date.today()
    start = end - timedelta(days=9)
    cloz = models.Medication(patient_id=patient.id, name="Clozapine", dose="200mg", frequency="daily",
                             time_of_day="night", schedule_type="daily")
    cari = models.Medication(patient_id=patient.id, name="Cariprazine", dose="3mg", frequency="Every other day",
                             time_of_day="morning", schedule_type="every_n_days",
                             schedule_interval_days=2, schedule_start_date=start)
    # Legacy: no schedule_type, PRN only in the free text.
    dulc = models.Medication(patient_id=patient.id, name="Dulcolax", dose="5mg", frequency="as needed",
                             time_of_day="morning")
    db.add_all([cloz, cari, dulc])
    db.flush()

    prn_days = {start + timedelta(days=2), start + timedelta(days=7)}
    for i in range(10):
        d = start + timedelta(days=i)
        cari_due = i % 2 == 0
        db.add(models.DailyLog(
            patient_id=patient.id, logged_by=caregiver.id, date=d, log_type="detailed",
            medications_taken=[
                {"medication_id": cloz.id, "taken": True, "time_taken": "21:00"},
                {"medication_id": cari.id, "taken": cari_due, "time_taken": "08:00" if cari_due else None},
                {"medication_id": dulc.id, "taken": d in prn_days, "time_taken": "12:00" if d in prn_days else None},
            ],
        ))
    db.commit()
    stored_before = [
        copy.deepcopy(log.medications_taken)
        for log in db.query(models.DailyLog).filter(models.DailyLog.patient_id == patient.id)
        .order_by(models.DailyLog.date).all()
    ]

    agg = build_patient_aggregate(patient.id, db=db, start_date=start, end_date=end)

    adherence = agg["adherence"]
    assert adherence[cloz.id]["percentage"] == 100.0
    assert adherence[cari.id]["percentage"] == 100.0
    assert adherence[cari.id]["days_logged"] == 5
    assert dulc.id not in adherence
    assert agg["adherence_totals"]["pct"] == 100.0

    usage = agg["as_needed_usage"][dulc.id]
    assert usage["times_given"] == 2
    assert usage["dates"] == sorted(d.isoformat() for d in prn_days)

    # No "Missed dose" badge leaks through to periods / prompt entries.
    for period in agg["observation_periods"]:
        assert all(m["taken"] for m in period["medications_taken"])

    stored_after = [
        log.medications_taken
        for log in db.query(models.DailyLog).filter(models.DailyLog.patient_id == patient.id)
        .order_by(models.DailyLog.date).all()
    ]
    assert stored_after == stored_before


def test_custom_vital_stats_skip_blanks_and_never_average_text():
    logs = [
        SimpleNamespace(date=date(2026, 10, 1), vitals={"custom": {
            "Clozapine plasma": {"value": "350", "unit": "ng/mL"},
            "Mood note": {"value": "calm", "unit": None},
            "Troponin": {"value": "  ", "unit": "ng/L"},
        }}),
        SimpleNamespace(date=date(2026, 10, 8), vitals={"custom": {
            "Clozapine plasma": {"value": "410.5", "unit": "ng/mL"},
            "Mood note": {"value": "agitated", "unit": None},
        }}),
        SimpleNamespace(date=date(2026, 10, 9), vitals={"heart_rate": "72"}),
        SimpleNamespace(date=date(2026, 10, 10), vitals=None),
    ]
    stats = build_custom_vital_stats(logs)

    assert "Troponin" not in stats
    cloz = stats["Clozapine plasma"]
    assert cloz["count"] == 2
    assert cloz["latest"] == {"date": "2026-10-08", "value": "410.5", "unit": "ng/mL"}
    assert (cloz["min"], cloz["max"], cloz["avg"]) == (350.0, 410.5, 380.25)

    mood = stats["Mood note"]
    assert mood["count"] == 2
    assert mood["avg"] is None and mood["min"] is None


def test_same_as_yesterday_skips_off_day_and_as_needed_doses(client):
    resp = client.post("/auth/register", json={
        "email": "sched.quick@example.com", "password": "testpass123", "name": "Carina", "role": "caregiver",
    })
    h = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    yesterday = date(2026, 10, 1)
    today = yesterday + timedelta(days=1)
    resp = client.post("/patients/", headers=h, json={"name": "Leo", "diagnosis": "schizophrenia", "medications": [
        {"name": "Clozapine", "dose": "200mg", "frequency": "Every day", "time_of_day": "night",
         "schedule_type": "daily"},
        {"name": "Cariprazine", "dose": "3mg", "frequency": "Every other day", "time_of_day": "morning",
         "schedule_type": "every_n_days", "schedule_interval_days": 2, "schedule_start_date": yesterday.isoformat()},
        {"name": "Dulcolax", "dose": "5mg", "frequency": "As needed", "time_of_day": "morning",
         "schedule_type": "as_needed"},
    ]})
    assert resp.status_code == 200, resp.text
    patient = resp.json()
    ids = {m["name"]: m["id"] for m in patient["medications"]}
    assert next(m for m in patient["medications"] if m["name"] == "Cariprazine")["schedule_interval_days"] == 2

    resp = client.post("/logs/", headers=h, json={
        "patient_id": patient["id"], "date": yesterday.isoformat(),
        "medications_taken": [{"medication_id": mid, "taken": True, "time_taken": "08:00"} for mid in ids.values()],
    })
    assert resp.status_code == 200, resp.text

    resp = client.post(f"/logs/{patient['id']}/quick", headers=h,
                       json={"date": today.isoformat(), "type": "same_as_yesterday"})
    assert resp.status_code == 200, resp.text
    assert [e["medication_id"] for e in resp.json()["medications_taken"]] == [ids["Clozapine"]]


def test_schedule_validation(client):
    resp = client.post("/auth/register", json={
        "email": "sched.validate@example.com", "password": "testpass123", "name": "C", "role": "caregiver",
    })
    h = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    pid = client.post("/patients/", headers=h, json={"name": "P", "diagnosis": "x"}).json()["id"]
    base = {"name": "M", "dose": "1mg", "frequency": "x", "time_of_day": "morning"}
    assert client.post(f"/patients/{pid}/medications", headers=h,
                       json={**base, "schedule_type": "every_n_days", "schedule_interval_days": 0}).status_code == 422
    assert client.post(f"/patients/{pid}/medications", headers=h,
                       json={**base, "schedule_type": "weekdays", "schedule_weekdays": [7]}).status_code == 422
    resp = client.post(f"/patients/{pid}/medications", headers=h, json={**base, "schedule_type": "weekdays",
                                                                         "schedule_weekdays": [4, 0, 2, 0]})
    assert resp.json()["schedule_weekdays"] == [0, 2, 4]
    resp = client.put(f"/medications/{resp.json()['id']}", headers=h, json={"schedule_type": "as_needed"})
    assert resp.status_code == 200 and resp.json()["schedule_type"] == "as_needed"
