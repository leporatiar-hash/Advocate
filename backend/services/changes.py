"""'What changed' panel for the clinician dashboard — deterministic, no LLM.

Compares two equal-length spans (since the last visit vs the same length
before it, or the last N days vs the N before) metric by metric. A change is
only reported once it crosses that metric's CUTOFF; everything below is
'steady'. Nothing is ever invented to fill the panel: with no change past a
cutoff, `changes` is empty and the panel says so.

Wording is better/worse framed (requested for the pilot) but never states a
number — caregiver-entered values aren't on a clinical scale.
"""
from datetime import date, timedelta
from typing import Optional

# Minimum change worth reporting, per metric, in that metric's own units.
CUTOFFS = {
    "sleep": 1.0,          # hours per night
    "symptom": 2.0,        # severity points (0-10), applies to every symptom
    "missed_doses": 20.0,  # percentage points of logged doses
    "left_house": 25.0,    # percentage points of logged days
    "cigarettes": 3.0,     # per day
    "weight": 5.0,         # lb
    "episodes": 1.0,       # days with an episode
}

# Metric keys a clinician can include/exclude in Configure. "symptoms"
# covers every symptom the family tracks.
METRIC_KEYS = ["sleep", "symptoms", "medication", "episodes", "socialization", "cigarettes", "weight"]

# A symptom needs at least this many scored days in BOTH spans to compare.
MIN_SYMPTOM_DAYS = 3
MIN_VISIT_AGE_DAYS = 7
SLEEP_TARGET_HOURS = 8.0


def resolve_spans(today: date, compare: str, last_visit: Optional[date]) -> dict:
    """compare is "visit" (since the last appointment, falling back to 30 days
    when there is none or it was under MIN_VISIT_AGE_DAYS ago) or a number of
    days. Returns the two inclusive spans plus a label for the panel title."""
    if compare == "visit" and last_visit and (today - last_visit).days >= MIN_VISIT_AGE_DAYS:
        length = (today - last_visit).days + 1
        after_start = last_visit
        kind = "visit"
    else:
        length = int(compare) if compare.isdigit() else 30
        after_start = today - timedelta(days=length - 1)
        kind = "window"
    before_end = after_start - timedelta(days=1)
    before_start = before_end - timedelta(days=length - 1)
    return {
        "kind": kind,
        "days": length,
        "last_visit": last_visit.isoformat() if last_visit else None,
        "before": (before_start, before_end),
        "after": (after_start, today),
    }


def _avg(values: list) -> Optional[float]:
    vals = [v for v in values if v is not None]
    return sum(vals) / len(vals) if vals else None


def _span_stats(logs: list) -> dict:
    doses = [m for log in logs for m in (log.medications_taken or [])]
    left = [(log.socialization or {}).get("left_house") for log in logs]
    left = [v for v in left if v is not None]
    cigs = []
    weights = []
    for log in logs:
        vitals = log.vitals or {}
        try:
            if vitals.get("cigarettes") not in (None, ""):
                cigs.append(float(vitals["cigarettes"]))
        except (TypeError, ValueError):
            pass
        try:
            if vitals.get("weight_lb") not in (None, ""):
                weights.append(float(vitals["weight_lb"]))
        except (TypeError, ValueError):
            pass
    symptoms: dict = {}
    for log in logs:
        for s in log.symptoms or []:
            if s.get("severity") is None or not s.get("name"):
                continue
            symptoms.setdefault(s["name"].strip(), []).append(s["severity"])
    return {
        "sleep": _avg([log.sleep_hours for log in logs]),
        "missed_doses": (100.0 * sum(1 for m in doses if not m.get("taken")) / len(doses)) if doses else None,
        "left_house": (100.0 * sum(1 for v in left if v) / len(left)) if left else None,
        "cigarettes": _avg(cigs),
        "weight": _avg(weights),
        "episodes": sum(1 for log in logs if (log.episode or {}).get("occurred")) if logs else None,
        "symptoms": symptoms,
    }


def _change(metric: str, label: str, before: float, after: float, cutoff: float, text: str, direction: str) -> dict:
    return {
        "metric": metric,
        "label": label,
        "text": text,
        "direction": direction,  # "better" | "worse" | "neutral"
        "score": abs(after - before) / cutoff,
    }


def build_changes(logs: list, spans: dict, metrics: list, limit: int) -> dict:
    b0, b1 = spans["before"]
    a0, a1 = spans["after"]
    B = _span_stats([log for log in logs if b0 <= log.date <= b1])
    A = _span_stats([log for log in logs if a0 <= log.date <= a1])
    enabled = set(metrics) & set(METRIC_KEYS) if metrics else set(METRIC_KEYS)

    changes: list = []
    steady: list = []

    def compared(key):
        return B[key] is not None and A[key] is not None

    if "medication" in enabled and compared("missed_doses"):
        b, a = B["missed_doses"], A["missed_doses"]
        if abs(a - b) >= CUTOFFS["missed_doses"]:
            if a == 0:
                text = "Missed doses stopped"
            elif b == 0:
                text = "Started missing doses"
            else:
                text = "Fewer missed doses" if a < b else "More missed doses"
            changes.append(_change("medication", "Medication", b, a, CUTOFFS["missed_doses"], text, "better" if a < b else "worse"))
        else:
            steady.append("Medication")

    if "sleep" in enabled and compared("sleep"):
        b, a = B["sleep"], A["sleep"]
        if abs(a - b) >= CUTOFFS["sleep"]:
            better = abs(a - SLEEP_TARGET_HOURS) < abs(b - SLEEP_TARGET_HOURS)
            text = ("Sleep improved, sleeping more" if a > b else "Sleep improved, sleeping less") if better else \
                   ("Sleep worsened, sleeping less" if a < b else "Sleep worsened, sleeping more")
            changes.append(_change("sleep", "Sleep", b, a, CUTOFFS["sleep"], text, "better" if better else "worse"))
        else:
            steady.append("Sleep")

    if "symptoms" in enabled:
        for name in sorted(set(B["symptoms"]) & set(A["symptoms"])):
            bs, as_ = B["symptoms"][name], A["symptoms"][name]
            if len(bs) < MIN_SYMPTOM_DAYS or len(as_) < MIN_SYMPTOM_DAYS:
                continue
            b, a = sum(bs) / len(bs), sum(as_) / len(as_)
            if abs(a - b) >= CUTOFFS["symptom"]:
                text = f"{name} eased" if a < b else f"{name} worsened"
                changes.append(_change("symptoms", name, b, a, CUTOFFS["symptom"], text, "better" if a < b else "worse"))
            else:
                steady.append(name)

    if "episodes" in enabled and compared("episodes"):
        b, a = B["episodes"], A["episodes"]
        if abs(a - b) >= CUTOFFS["episodes"]:
            if a == 0:
                text = "No episodes this period"
            elif b == 0:
                text = "New episode logged"
            else:
                text = "Fewer episodes" if a < b else "More episodes"
            changes.append(_change("episodes", "Episodes", b, a, CUTOFFS["episodes"], text, "better" if a < b else "worse"))
        else:
            steady.append("Episodes")

    if "socialization" in enabled and compared("left_house"):
        b, a = B["left_house"], A["left_house"]
        if abs(a - b) >= CUTOFFS["left_house"]:
            text = "Leaving the house more often" if a > b else "Leaving the house less often"
            changes.append(_change("socialization", "Socialization", b, a, CUTOFFS["left_house"], text, "better" if a > b else "worse"))
        else:
            steady.append("Socialization")

    if "cigarettes" in enabled and compared("cigarettes"):
        b, a = B["cigarettes"], A["cigarettes"]
        if abs(a - b) >= CUTOFFS["cigarettes"]:
            text = "Smoking less" if a < b else "Smoking more"
            changes.append(_change("cigarettes", "Cigarettes", b, a, CUTOFFS["cigarettes"], text, "better" if a < b else "worse"))
        else:
            steady.append("Cigarettes")

    if "weight" in enabled and compared("weight"):
        b, a = B["weight"], A["weight"]
        if abs(a - b) >= CUTOFFS["weight"]:
            # Weight direction isn't good or bad on its own (it's often a
            # medication side effect the clinician is weighing), so neutral.
            changes.append(_change("weight", "Weight", b, a, CUTOFFS["weight"], "Gained weight" if a > b else "Lost weight", "neutral"))
        else:
            steady.append("Weight")

    changes.sort(key=lambda c: -c["score"])
    for c in changes:
        c.pop("score")
    return {"changes": changes[:limit], "steady": steady}
