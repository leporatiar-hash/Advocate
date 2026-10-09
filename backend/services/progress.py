"""Progress / improvement tracking — the positive counterpart to symptoms.

The caregiver defines improvement areas in Settings (user_config
"progress_areas": [{name, scale: "numeric"|"compare", medication_id?}]) and
rates them in the daily log, stored on DailyLog.progress:

    {"ratings": {name: {"scale": "numeric", "value": 0-10}
                     | {"scale": "compare", "value": "worse"|"same"|"better"}},
     "wins": "free text" | null}

Higher / "better" is good — the opposite direction of symptom severity.
Everything here is deterministic; the summary model only writes prose
around these numbers.
"""
from typing import Optional

COMPARE_VALUES = ("worse", "same", "better")

# Below this many numeric ratings, a first-half vs second-half comparison is
# noise — say nothing rather than call a trend.
TREND_MIN_READINGS = 4
# Average change (0–10 points) between halves that counts as movement.
TREND_THRESHOLD = 1.0


def progress_areas_config(user_config: Optional[dict]) -> list:
    out = []
    for a in ((user_config or {}).get("progress_areas") or []):
        if isinstance(a, dict) and str(a.get("name") or "").strip():
            out.append({
                "name": str(a["name"]).strip(),
                "scale": "compare" if a.get("scale") == "compare" else "numeric",
                "medication_id": a.get("medication_id"),
            })
    return out


def _ratings(log) -> dict:
    """Valid ratings from one log, skipping blanks and malformed values."""
    raw = ((log.progress or {}).get("ratings") or {}) if isinstance(log.progress, dict) else {}
    out = {}
    for name, r in raw.items():
        if not isinstance(r, dict):
            continue
        value = r.get("value")
        if r.get("scale") == "compare":
            if value in COMPARE_VALUES:
                out[name] = ("compare", value)
        else:
            try:
                v = float(value)
            except (TypeError, ValueError):
                continue
            if 0 <= v <= 10:
                out[name] = ("numeric", v)
    return out


def build_progress_stats(logs, areas: list, medications: list) -> dict:
    """{"areas": {name: stats}, "wins": [{date, text}]} over date-ascending
    `logs`. Only areas currently set up in Settings are reported — an area
    the caregiver removed or reworded must not linger beside its
    replacement; configured areas never rated are omitted."""
    med_names = {m.id: m.name for m in medications}
    config = {a["name"]: a for a in areas}
    readings: dict = {}
    wins = []
    for log in logs:
        for name, (scale, value) in _ratings(log).items():
            if name not in config:
                continue
            readings.setdefault(name, {"scale": scale, "points": []})["points"].append(
                {"date": log.date.isoformat(), "value": value}
            )
        text = ((log.progress or {}).get("wins") or "").strip() if isinstance(log.progress, dict) else ""
        # "Same as yesterday" copies the whole entry — a repeated win is not a new one.
        if text and getattr(log, "log_type", None) != "same_as_yesterday":
            wins.append({"date": log.date.isoformat(), "text": text})

    stats = {}
    for name, r in readings.items():
        pts = r["points"]
        cfg = config.get(name, {})
        entry = {
            "scale": r["scale"],
            "count": len(pts),
            "readings": pts,
            "latest": pts[-1],
            "linked_medication": med_names.get(cfg.get("medication_id")),
        }
        if r["scale"] == "numeric":
            vals = [p["value"] for p in pts]
            entry["avg"] = round(sum(vals) / len(vals), 1)
            entry["trend"] = None
            if len(vals) >= TREND_MIN_READINGS:
                half = len(vals) // 2
                first = sum(vals[:half]) / half
                last = sum(vals[-half:]) / half
                delta = round(last - first, 1)
                entry["first_half_avg"] = round(first, 1)
                entry["last_half_avg"] = round(last, 1)
                entry["trend"] = (
                    "improving" if delta >= TREND_THRESHOLD
                    else "declining" if delta <= -TREND_THRESHOLD
                    else "steady"
                )
        else:
            counts = {v: 0 for v in COMPARE_VALUES}
            for p in pts:
                counts[p["value"]] += 1
            entry["counts"] = counts
        stats[name] = entry
    return {"areas": stats, "wins": wins}


def progress_for_prompt(progress) -> Optional[dict]:
    """One day's progress in plain terms for the summary prompt's raw log data."""
    if not isinstance(progress, dict):
        return None
    out = {}
    for name, r in (progress.get("ratings") or {}).items():
        if isinstance(r, dict) and r.get("value") not in (None, ""):
            out[name] = f"{r['value']}/10" if r.get("scale") != "compare" else f"{r['value']} than usual"
    if (progress.get("wins") or "").strip():
        out["wins"] = progress["wins"].strip()
    return out or None
