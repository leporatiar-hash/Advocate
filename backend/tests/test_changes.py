"""services/changes.py — the Detailed view's 'What changed' panel. Only
changes past a metric's cutoff are reported, nothing is invented when
nothing moved, and the visit anchor falls back to 30 days when absent or
too recent."""
from datetime import date, timedelta
from types import SimpleNamespace

from services.changes import build_changes, resolve_spans

TODAY = date(2026, 10, 5)


def _log(d, sleep=7.0, anxiety=3, taken=True, left=True, cigs="5", episode=False):
    return SimpleNamespace(
        date=d, sleep_hours=sleep, symptoms=[{"name": "Anxiety", "severity": anxiety}],
        medications_taken=[{"medication_id": 1, "taken": taken}],
        socialization={"left_house": left}, vitals={"cigarettes": cigs},
        episode={"occurred": True} if episode else None,
    )


def _span_logs(start, days, **kw):
    return [_log(start + timedelta(days=i), **kw) for i in range(days)]


def test_visit_anchor_and_fallbacks():
    assert resolve_spans(TODAY, "visit", date(2026, 9, 5))["kind"] == "visit"
    assert resolve_spans(TODAY, "visit", date(2026, 10, 1))["kind"] == "window"  # under a week ago
    no_visit = resolve_spans(TODAY, "visit", None)
    assert no_visit["kind"] == "window" and no_visit["days"] == 30
    assert resolve_spans(TODAY, "14", None)["after"] == (TODAY - timedelta(days=13), TODAY)


def test_reports_only_changes_past_cutoff_ranked():
    spans = resolve_spans(TODAY, "30", None)
    before = _span_logs(spans["before"][0], 30, sleep=5.0, anxiety=7, taken=False)
    after = _span_logs(spans["after"][0], 30, sleep=7.5, anxiety=6, taken=True)
    result = build_changes(before + after, spans, [], 5)
    texts = [c["text"] for c in result["changes"]]
    assert texts[0] == "Missed doses stopped"
    assert "Sleep improved, sleeping more" in texts
    assert all("Anxiety" not in t for t in texts)  # 1-point move is under the cutoff
    assert "Anxiety" in result["steady"]


def test_nothing_invented_when_nothing_moved():
    spans = resolve_spans(TODAY, "30", None)
    logs = _span_logs(spans["before"][0], 60)
    result = build_changes(logs, spans, [], 3)
    assert result["changes"] == []


def test_metric_filter_and_limit():
    spans = resolve_spans(TODAY, "30", None)
    before = _span_logs(spans["before"][0], 30, sleep=5.0, taken=False, cigs="12")
    after = _span_logs(spans["after"][0], 30, sleep=7.5, taken=True, cigs="4")
    only_sleep = build_changes(before + after, spans, ["sleep"], 3)
    assert [c["metric"] for c in only_sleep["changes"]] == ["sleep"]
    assert len(build_changes(before + after, spans, [], 1)["changes"]) == 1
