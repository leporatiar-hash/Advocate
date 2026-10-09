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
    out = build_progress_stats(logs, [], [])
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
