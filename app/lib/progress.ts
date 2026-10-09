// Progress / improvement areas (Settings → Customize). Mirrors
// backend/services/progress.py. Higher / "better" is good — the opposite
// direction of symptom severity — so anything that renders these must not
// reuse symptom wording ("Severe", red for high).

import type { CompareValue, LogProgress, Medication, ProgressArea, ProgressRating } from "./types";

export const COMPARE_OPTIONS: { value: CompareValue; label: string }[] = [
  { value: "worse", label: "Worse" },
  { value: "same", label: "Same" },
  { value: "better", label: "Better" },
];

export function normalizeProgressAreas(raw: ProgressArea[] | null | undefined): ProgressArea[] {
  const seen = new Set<string>();
  const out: ProgressArea[] = [];
  for (const a of raw ?? []) {
    const name = (a?.name ?? "").trim();
    const key = name.toLowerCase();
    if (!name || seen.has(key)) continue;
    seen.add(key);
    out.push({ name, scale: a.scale === "compare" ? "compare" : "numeric", medication_id: a.medication_id ?? null });
  }
  return out;
}

export function emptyProgress(): LogProgress {
  return { ratings: {}, wins: null };
}

/** Valid ratings + wins from a stored log, or an empty progress object. */
export function readProgress(raw: unknown): LogProgress {
  const p = raw as Partial<LogProgress> | null | undefined;
  const ratings: Record<string, ProgressRating> = {};
  for (const [name, r] of Object.entries(p?.ratings ?? {})) {
    if (r?.scale === "compare" && ["worse", "same", "better"].includes(r.value as string)) ratings[name] = r;
    else if (r?.scale === "numeric" && typeof r.value === "number") ratings[name] = r;
  }
  const wins = typeof p?.wins === "string" && p.wins.trim() ? p.wins : null;
  return { ratings, wins };
}

export function hasProgress(p: LogProgress | null | undefined): boolean {
  return !!p && (Object.keys(p.ratings).length > 0 || !!p.wins?.trim());
}

/** "7/10" or "Better than usual". */
export function ratingText(r: ProgressRating): string {
  if (r.scale === "numeric") return `${r.value}/10`;
  return r.value === "same" ? "Same as usual" : `${r.value === "better" ? "Better" : "Worse"} than usual`;
}

export function linkedMedName(area: ProgressArea, meds: Medication[]): string | null {
  if (area.medication_id == null) return null;
  return meds.find(m => m.id === area.medication_id)?.name ?? null;
}

// Compare-scale ratings as numbers for charts: worse -1, same 0, better +1.
export const COMPARE_TO_NUMBER: Record<CompareValue, number> = { worse: -1, same: 0, better: 1 };

export function progressKey(name: string): string {
  return "progress-" + name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

// Client-side twin of services/progress.build_progress_stats, for pages
// that work from raw logs (print report). Same trend rule: at least 4
// numeric ratings, first-half vs second-half average, ±1 point = movement.
export function computeProgressStats(
  logs: { date: string; progress?: unknown; log_type?: string | null }[],
  areas: ProgressArea[],
  meds: Medication[],
): import("./types").ProgressStats {
  const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
  const byName = new Map<string, { scale: "numeric" | "compare"; points: { date: string; value: number | CompareValue }[] }>();
  const wins: { date: string; text: string }[] = [];
  for (const log of sorted) {
    const p = readProgress(log.progress);
    for (const [name, r] of Object.entries(p.ratings)) {
      const entry = byName.get(name) ?? { scale: r.scale, points: [] };
      entry.points.push({ date: log.date, value: r.value });
      byName.set(name, entry);
    }
    if (p.wins?.trim() && log.log_type !== "same_as_yesterday") wins.push({ date: log.date, text: p.wins.trim() });
  }
  const config = new Map(areas.map(a => [a.name, a]));
  const out: import("./types").ProgressStats = { areas: {}, wins };
  for (const [name, { scale, points }] of byName) {
    const area = config.get(name);
    const stat: import("./types").ProgressAreaStat = {
      scale, count: points.length, readings: points, latest: points[points.length - 1],
      linked_medication: area ? linkedMedName(area, meds) : null,
    };
    if (scale === "numeric") {
      const vals = points.map(p => p.value as number);
      const avg = (xs: number[]) => Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10;
      stat.avg = avg(vals);
      stat.trend = null;
      if (vals.length >= 4) {
        const half = Math.floor(vals.length / 2);
        stat.first_half_avg = avg(vals.slice(0, half));
        stat.last_half_avg = avg(vals.slice(-half));
        const delta = stat.last_half_avg - stat.first_half_avg;
        stat.trend = delta >= 1 ? "improving" : delta <= -1 ? "declining" : "steady";
      }
    } else {
      const counts: Record<CompareValue, number> = { worse: 0, same: 0, better: 0 };
      for (const p of points) counts[p.value as CompareValue]++;
      stat.counts = counts;
    }
    out.areas[name] = stat;
  }
  return out;
}
