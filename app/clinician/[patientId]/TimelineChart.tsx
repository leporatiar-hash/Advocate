"use client";

import type { TimelineAxis, TimelineEventItem, TimelineSeriesPoint } from "../../lib/types";

// Fixed internal coordinate space — every chart on the page uses the exact
// same viewBox and the exact same `dates` array, so the episode band and the
// med-change line land at the same horizontal position in every card. This
// alignment is the entire point of the view; nothing here is allowed to
// auto-scale its own x-axis independently.
const VB_W = 320;
const VB_H = 200;
// `left` reserves a dedicated label margin — the axis text lives entirely to
// the left of PAD.left, at LABEL_X, so it can never sit at the same x as the
// polyline's own leftmost point (a real, visible bug at the old left:10 —
// the first day's line and the "Medium" label were drawn on top of each
// other whenever that day happened to fall in the medium band).
const PAD = { top: 18, right: 10, bottom: 18, left: 34 };
const LABEL_X = 4;
const PLOT_W = VB_W - PAD.left - PAD.right;
const PLOT_H = VB_H - PAD.top - PAD.bottom;

// "none" (cigarettes only) shares the bottom row with "low" — every band
// domain still renders on the same fixed three-row layout, which is what
// keeps every card's vertical structure comparable at a glance.
const BAND_ROW: Record<string, number> = { none: 0, low: 0, medium: 1, high: 2 };

function xFor(index: number, count: number): number {
  if (count <= 1) return PAD.left + PLOT_W / 2;
  return PAD.left + (index / (count - 1)) * PLOT_W;
}

function bandY(band: string): number {
  const row = BAND_ROW[band] ?? 0;
  const rowH = PLOT_H / 3;
  // row 0 (low) at the bottom, row 2 (high) at the top.
  return PAD.top + (2 - row) * rowH + rowH / 2;
}

function numericY(value: number, min: number, max: number): number {
  if (max === min) return PAD.top + PLOT_H / 2;
  return PAD.top + PLOT_H - ((value - min) / (max - min)) * PLOT_H;
}

interface Run {
  points: { x: number; y: number }[];
}

/** Splits the series into runs of consecutive logged points — a null entry
 * (unlogged day) ends the current run and starts a new one on the next
 * logged point. Never interpolates across the gap; that would draw a
 * caregiver observation that doesn't exist. */
function buildRuns(series: TimelineSeriesPoint[], axis: TimelineAxis, min: number, max: number): Run[] {
  const runs: Run[] = [];
  let current: Run | null = null;
  series.forEach((p, i) => {
    const logged = axis === "numeric" ? p.value != null : p.band != null;
    if (!logged) {
      current = null;
      return;
    }
    const y = axis === "numeric" ? numericY(p.value as number, min, max) : bandY(p.band as string);
    const x = xFor(i, series.length);
    if (!current) {
      current = { points: [] };
      runs.push(current);
    }
    current.points.push({ x, y });
  });
  return runs;
}

/** Gap spans (contiguous stretches of unlogged days) as [startIndex, endIndex]
 * inclusive, for the expanded chart's gap shading. */
function buildGaps(series: TimelineSeriesPoint[], axis: TimelineAxis): [number, number][] {
  const gaps: [number, number][] = [];
  let start: number | null = null;
  series.forEach((p, i) => {
    const logged = axis === "numeric" ? p.value != null : p.band != null;
    if (!logged) {
      if (start === null) start = i;
    } else if (start !== null) {
      gaps.push([start, i - 1]);
      start = null;
    }
  });
  if (start !== null) gaps.push([start, series.length - 1]);
  return gaps;
}

export function TimelineChart({
  dates,
  series,
  axis,
  events,
  expanded,
  numericMin,
  numericMax,
}: {
  dates: string[];
  series: TimelineSeriesPoint[];
  axis: TimelineAxis;
  events: TimelineEventItem[];
  expanded: boolean;
  numericMin?: number;
  numericMax?: number;
}) {
  const values = series.map((p) => p.value).filter((v): v is number => v != null);
  const min = numericMin ?? (values.length ? Math.min(...values) : 0);
  const max = numericMax ?? (values.length ? Math.max(...values) : 1);

  const runs = buildRuns(series, axis, min, max);
  const gaps = buildGaps(series, axis);
  const count = series.length;

  const dateIndex = new Map(dates.map((d, i) => [d, i]));

  return (
    <svg viewBox={`0 0 ${VB_W} ${VB_H}`} className="w-full h-full" role="img" aria-label="Timeline chart">
      {/* Gaps — expanded only: shade the hole in the record rather than
          hiding it, so a clinician can see where logging stopped. */}
      {expanded &&
        gaps.map(([s, e], i) => {
          // A gap only reads as "a hole" when it sits between two runs (or
          // at an edge with real data elsewhere) — a fully-null series has
          // no runs to contrast against, so nothing to shade specially.
          if (runs.length === 0) return null;
          const x1 = xFor(s, count);
          const x2 = xFor(e, count);
          const w = Math.max(x2 - x1, count > 1 ? PLOT_W / (count - 1) : PLOT_W);
          return (
            <rect
              key={`gap-${i}`}
              x={x1 - w / (2 * (e - s + 1))}
              y={PAD.top}
              width={w + w / (e - s + 1)}
              height={PLOT_H}
              fill="var(--surface-0)"
            />
          );
        })}

      {/* Gridlines at the band boundaries (band axis only) */}
      {axis === "band" &&
        [1, 2, 3].map((i) => (
          <line
            key={i}
            x1={PAD.left}
            x2={VB_W - PAD.right}
            y1={PAD.top + (PLOT_H / 3) * i}
            y2={PAD.top + (PLOT_H / 3) * i}
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}

      {/* Episode band(s) — filled vertical band behind the line */}
      {events
        .filter((e): e is Extract<TimelineEventItem, { type: "episode" }> => e.type === "episode")
        .map((ep, i) => {
          const startIdx = dateIndex.get(ep.start) ?? (ep.start < dates[0] ? 0 : null);
          const endIdx = dateIndex.get(ep.end) ?? (ep.end > dates[dates.length - 1] ? dates.length - 1 : null);
          if (startIdx == null || endIdx == null) return null;
          const x1 = xFor(startIdx, count);
          const x2 = xFor(endIdx, count);
          const halfStep = count > 1 ? PLOT_W / (count - 1) / 2 : PLOT_W / 2;
          return (
            <rect
              key={`ep-${i}`}
              x={x1 - halfStep}
              y={PAD.top}
              width={x2 - x1 + halfStep * 2}
              height={PLOT_H}
              fill="var(--episode-band)"
              opacity={0.7}
            />
          );
        })}

      {/* Med-change marker(s) — dashed vertical line */}
      {events
        .filter((e): e is Extract<TimelineEventItem, { type: "med_change" }> => e.type === "med_change")
        .map((ev, i) => {
          const idx = dateIndex.get(ev.date);
          if (idx == null) return null;
          const x = xFor(idx, count);
          return (
            <line
              key={`mc-${i}`}
              x1={x} x2={x} y1={PAD.top} y2={VB_H - PAD.bottom}
              stroke="var(--med-change-line)" strokeWidth={1.5} strokeDasharray="4,3"
            />
          );
        })}

      {/* The series itself — one path per run, gaps never interpolated */}
      {runs.map((run, i) => (
        <polyline
          key={i}
          points={run.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="var(--text-primary)"
          strokeWidth={2.5}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {/* Band labels */}
      {axis === "band" && (
        <>
          <text x={LABEL_X} y={PAD.top - 4} fontSize={9} fill="var(--text-secondary)">High</text>
          <text x={LABEL_X} y={VB_H - PAD.bottom + 12} fontSize={9} fill="var(--text-secondary)">Low</text>
          {expanded && (
            <text x={LABEL_X} y={PAD.top + PLOT_H / 2 + 3} fontSize={9} fill="var(--text-secondary)">Medium</text>
          )}
        </>
      )}
      {axis === "numeric" && (
        <>
          <text x={LABEL_X} y={PAD.top - 4} fontSize={9} fill="var(--text-secondary)">{Math.round(max)}</text>
          <text x={LABEL_X} y={VB_H - PAD.bottom + 12} fontSize={9} fill="var(--text-secondary)">{Math.round(min)}</text>
        </>
      )}
    </svg>
  );
}
