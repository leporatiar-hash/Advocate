"""services/progress.py — improvement areas: numeric trends need enough
readings, compare-scale areas are counted, wins skip copied days, and the
whole thing flows through the API and the patient aggregate."""
from datetime import date, timedelta
from types import SimpleNamespace

from services.progress import build_progress_stats, progress_areas_config

D0 = date(2026, 10, 1)


def _log(i, ratings=None, wins=None, log_type="detailed"):
    return SimpleNamespace(date=D0 + timedelta(days=i), log_type=log_type,
                           progress={"ratings": ratings or {}, "wins": wins})


def test_numeric_trend_and_low_n():
    meds = [SimpleNamespace(id=7, name="Cariprazine")]
    areas = progress_areas_config({"progress_areas": [
        {"name": "Motivation", "scale": "numeric", "medication_id": 7}, {"name": "  "},
    ]})
    assert [a["name"] for a in areas] == ["Motivation"]
    logs = [_log(i, {"Motivation": {"scale": "numeric", "value": v}}) for i, v in enumerate([2, 3, 6, 7])]
    st = build_progress_stats(logs, areas, meds)["areas"]["Motivation"]
    assert (st["trend"], st["first_half_avg"], st["last_half_avg"]) == ("improving", 2.5, 6.5)
    assert st["linked_medication"] == "Cariprazine"
    few = build_progress_stats(logs[:3], areas, meds)["areas"]["Motivation"]
    assert few["trend"] is None  # too few readings to call a trend


def test_compare_counts_wins_and_bad_values():
    logs = [
        _log(0, {"Salivation": {"scale": "compare", "value": "better"}}, wins="Made plans to see a friend"),
        _log(1, {"Salivation": {"scale": "compare", "value": "same"},
                 "Insight": {"scale": "numeric", "value": "abc"}}),
        _log(2, {"Salivation": {"scale": "compare", "value": "better"}}, wins="Made plans to see a friend",
             log_type="same_as_yesterday"),
        _log(3, {"Salivation": {"scale": "compare", "value": "nonsense"}}),
    ]
    areas = progress_areas_config({"progress_areas": [
        {"name": "Salivation", "scale": "compare"}, {"name": "Insight", "scale": "numeric"},
    ]})
    out = build_progress_stats(logs, areas, [])
    assert out["areas"]["Salivation"]["counts"] == {"worse": 0, "same": 1, "better": 2}
    assert "Insight" not in out["areas"]
    assert out["wins"] == [{"date": "2026-10-01", "text": "Made plans to see a friend"}]


def test_progress_round_trips_through_api(client):
    email = "progress@example.com"
    resp = client.post("/auth/register", json={"email": email, "password": "testpass123", "name": "P", "role": "caregiver"})
    if resp.status_code != 200:
        resp = client.post("/auth/login", json={"email": email, "password": "testpass123"})
    h = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    pid = client.post("/patients/", headers=h, json={"name": "Leo", "diagnosis": "x"}).json()["id"]
    client.patch("/auth/config", headers=h, json={"updates": {"progress_areas": [{"name": "Motivation", "scale": "numeric"}]}})
    progress = {"ratings": {"Motivation": {"scale": "numeric", "value": 6}}, "wins": "Went for a walk"}
    saved = client.post("/logs/", headers=h, json={"patient_id": pid, "date": "2026-10-01", "progress": progress}).json()
    assert saved["progress"] == progress

    from database import SessionLocal
    from services.aggregation import build_patient_aggregate
    db = SessionLocal()
    try:
        agg = build_patient_aggregate(pid, db=db, start_date=date(2026, 9, 25), end_date=date(2026, 10, 2))
    finally:
        db.close()
    assert agg["progress_stats"]["areas"]["Motivation"]["avg"] == 6.0
    assert agg["progress_stats"]["wins"][0]["text"] == "Went for a walk"


def test_removed_area_hidden():
    logs = [_log(0, {"Old wording": {"scale": "numeric", "value": 4}, "New wording": {"scale": "numeric", "value": 6}})]
    areas = progress_areas_config({"progress_areas": [{"name": "New wording", "scale": "numeric"}]})
    assert list(build_progress_stats(logs, areas, [])["areas"]) == ["New wording"]


def test_rename_carries_history(client):
    email = "rename@example.com"
    resp = client.post("/auth/register", json={"email": email, "password": "testpass123", "name": "R", "role": "caregiver"})
    if resp.status_code != 200:
        resp = client.post("/auth/login", json={"email": email, "password": "testpass123"})
    h = {"Authorization": f"Bearer {resp.json()['access_token']}"}
    pid = client.post("/patients/", headers=h, json={"name": "Leo", "diagnosis": "x"}).json()["id"]
    for day, v in (("2026-10-01", 3), ("2026-10-02", 5)):
        client.post("/logs/", headers=h, json={"patient_id": pid, "date": day, "notes": "keep",
                    "progress": {"ratings": {"Salivation": {"scale": "compare", "value": "better"},
                                             "Motivation": {"scale": "numeric", "value": v}}, "wins": "w"}})
    r = client.post(f"/logs/{pid}/progress-area/rename", headers=h,
                    json={"old_name": "Salivation", "new_name": "Less nighttime salivation"})
    assert r.json() == {"updated": 2}
    logs = client.get(f"/logs/{pid}", headers=h).json()
    for log in logs:
        assert set(log["progress"]["ratings"]) == {"Less nighttime salivation", "Motivation"}
        assert log["progress"]["wins"] == "w" and log["notes"] == "keep"
