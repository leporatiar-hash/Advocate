"use client";

import type { TimelineAxis, TimelineEventItem, TimelineSeriesPoint } from "../../lib/types";

// Two fixed size configs — every SMALL chart on the page (the grid tiles)
// shares one viewBox, and every LARGE chart (the full-screen overlay) shares
// another, so the episode band and the med-change line land at the same
// horizontal position across every tile, and again across every overlay.
// Nothing here is allowed to auto-scale its own x-axis independently.
export type ChartSize = "small" | "large";

interface SizeConfig {
  vbW: number;
  vbH: number;
  pad: { top: number; right: number; bottom: number; left: number };
  labelX: number;
  strokeWidth: number;
  labelFontSize: number;
  gridStrokeWidth: number;
}

const SIZE_CONFIG: Record<ChartSize, SizeConfig> = {
  // viewBox 0 0 300 140, plot area y 10-134, x 6-294.
  small: {
    vbW: 300,
    vbH: 140,
    pad: { top: 10, right: 6, bottom: 6, left: 40 },
    labelX: 4,
    strokeWidth: 2.5,
    labelFontSize: 9,
    gridStrokeWidth: 1,
  },
  // viewBox 0 0 1180 400, plot area y 30-330, x 70-1130, stroke width 3.
  large: {
    vbW: 1180,
    vbH: 400,
    pad: { top: 30, right: 50, bottom: 70, left: 110 },
    labelX: 16,
    strokeWidth: 3,
    labelFontSize: 15,
    gridStrokeWidth: 1.5,
  },
};

// "none" (cigarettes only) shares the bottom row with "low" — every band
// domain still renders on the same fixed three-row layout, which is what
// keeps every card's vertical structure comparable at a glance.
const BAND_ROW: Record<string, number> = { none: 0, low: 0, medium: 1, high: 2 };

function xFor(index: number, count: number, cfg: SizeConfig, plotW: number): number {
  if (count <= 1) return cfg.pad.left + plotW / 2;
  return cfg.pad.left + (index / (count - 1)) * plotW;
}

function bandY(band: string, cfg: SizeConfig, plotH: number): number {
  const row = BAND_ROW[band] ?? 0;
  const rowH = plotH / 3;
  // row 0 (low) at the bottom, row 2 (high) at the top.
  return cfg.pad.top + (2 - row) * rowH + rowH / 2;
}

function numericY(value: number, min: number, max: number, cfg: SizeConfig, plotH: number): number {
  if (max === min) return cfg.pad.top + plotH / 2;
  return cfg.pad.top + plotH - ((value - min) / (max - min)) * plotH;
}

interface Run {
  points: { x: number; y: number }[];
}

/** Splits the series into runs of consecutive logged points — a null entry
 * (unlogged day) ends the current run and starts a new one on the next
 * logged point. Never interpolates across the gap; that would draw a
 * caregiver observation that doesn't exist. */
function buildRuns(
  series: TimelineSeriesPoint[], axis: TimelineAxis, min: number, max: number, cfg: SizeConfig, plotW: number, plotH: number
): Run[] {
  const runs: Run[] = [];
  let current: Run | null = null;
  series.forEach((p, i) => {
    const logged = axis === "numeric" ? p.value != null : p.band != null;
    if (!logged) {
      current = null;
      return;
    }
    const y = axis === "numeric" ? numericY(p.value as number, min, max, cfg, plotH) : bandY(p.band as string, cfg, plotH);
    const x = xFor(i, series.length, cfg, plotW);
    if (!current) {
      current = { points: [] };
      runs.push(current);
    }
    current.points.push({ x, y });
  });
  return runs;
}

/** Gap spans (contiguous stretches of unlogged days) as [startIndex, endIndex]
 * inclusive, for the large chart's gap shading. */
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

function fmtShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function TimelineChart({
  dates,
  series,
  axis,
  events,
  size,
  numericMin,
  numericMax,
}: {
  dates: string[];
  series: TimelineSeriesPoint[];
  axis: TimelineAxis;
  events: TimelineEventItem[];
  size: ChartSize;
  numericMin?: number;
  numericMax?: number;
}) {
  const cfg = SIZE_CONFIG[size];
  const large = size === "large";
  const plotW = cfg.vbW - cfg.pad.left - cfg.pad.right;
  const plotH = cfg.vbH - cfg.pad.top - cfg.pad.bottom;

  const values = series.map((p) => p.value).filter((v): v is number => v != null);
  const min = numericMin ?? (values.length ? Math.min(...values) : 0);
  const max = numericMax ?? (values.length ? Math.max(...values) : 1);

  const runs = buildRuns(series, axis, min, max, cfg, plotW, plotH);
  const gaps = buildGaps(series, axis);
  const count = series.length;

  const dateIndex = new Map(dates.map((d, i) => [d, i]));
  const episodes = events.filter((e): e is Extract<TimelineEventItem, { type: "episode" }> => e.type === "episode");
  const medChanges = events.filter((e): e is Extract<TimelineEventItem, { type: "med_change" }> => e.type === "med_change");

  return (
    <svg viewBox={`0 0 ${cfg.vbW} ${cfg.vbH}`} className="w-full h-full" role="img" aria-label="Timeline chart">
      {/* Gaps — large chart only: shade the hole in the record rather than
          hiding it, so a clinician can see where logging stopped. */}
      {large &&
        gaps.map(([s, e], i) => {
          // A gap only reads as "a hole" when it sits between two runs (or
          // at an edge with real data elsewhere) — a fully-null series has
          // no runs to contrast against, so nothing to shade specially.
          if (runs.length === 0) return null;
          const x1 = xFor(s, count, cfg, plotW);
          const x2 = xFor(e, count, cfg, plotW);
          const w = Math.max(x2 - x1, count > 1 ? plotW / (count - 1) : plotW);
          return (
            <rect
              key={`gap-${i}`}
              x={x1 - w / (2 * (e - s + 1))}
              y={cfg.pad.top}
              width={w + w / (e - s + 1)}
              height={plotH}
              fill="var(--surface-0)"
            />
          );
        })}

      {/* Gridlines at the band boundaries (band axis only) */}
      {axis === "band" &&
        [1, 2, 3].map((i) => (
          <line
            key={i}
            x1={cfg.pad.left}
            x2={cfg.vbW - cfg.pad.right}
            y1={cfg.pad.top + (plotH / 3) * i}
            y2={cfg.pad.top + (plotH / 3) * i}
            stroke="var(--border)"
            strokeWidth={cfg.gridStrokeWidth}
          />
        ))}

      {/* Episode band(s) — filled vertical band behind the line, with an
          inline dated label above it on the large chart. */}
      {episodes.map((ep, i) => {
        const startIdx = dateIndex.get(ep.start) ?? (ep.start < dates[0] ? 0 : null);
        const endIdx = dateIndex.get(ep.end) ?? (ep.end > dates[dates.length - 1] ? dates.length - 1 : null);
        if (startIdx == null || endIdx == null) return null;
        const x1 = xFor(startIdx, count, cfg, plotW);
        const x2 = xFor(endIdx, count, cfg, plotW);
        const halfStep = count > 1 ? plotW / (count - 1) / 2 : plotW / 2;
        return (
          <g key={`ep-${i}`}>
            <rect
              x={x1 - halfStep}
              y={cfg.pad.top}
              width={x2 - x1 + halfStep * 2}
              height={plotH}
              fill="var(--episode-band)"
              opacity={0.7}
            />
            {large && (
              <text
                x={(x1 + x2) / 2}
                y={cfg.pad.top - 10}
                fontSize={13}
                textAnchor="middle"
                fill="var(--text-secondary)"
              >
                {`Episode ${fmtShort(ep.start)} – ${fmtShort(ep.end)}`}
              </text>
            )}
          </g>
        );
      })}

      {/* Med-change marker(s) — dashed vertical line, with a dated label
          below the chart on the large chart. */}
      {medChanges.map((ev, i) => {
        const idx = dateIndex.get(ev.date);
        if (idx == null) return null;
        const x = xFor(idx, count, cfg, plotW);
        return (
          <g key={`mc-${i}`}>
            <line
              x1={x} x2={x} y1={cfg.pad.top} y2={cfg.vbH - cfg.pad.bottom}
              stroke="var(--med-change-line)" strokeWidth={large ? 2 : 1.5} strokeDasharray="4,3"
            />
            {large && (
              <text
                x={x}
                y={cfg.vbH - cfg.pad.bottom + 24}
                fontSize={13}
                textAnchor="middle"
                fill="var(--text-secondary)"
              >
                {`Med change ${fmtShort(ev.date)}`}
              </text>
            )}
          </g>
        );
      })}

      {/* The series itself — one path per run, gaps never interpolated */}
      {runs.map((run, i) => (
        <polyline
          key={i}
          points={run.points.map((p) => `${p.x},${p.y}`).join(" ")}
          fill="none"
          stroke="var(--text-primary)"
          strokeWidth={cfg.strokeWidth}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}

      {/* Dot markers on every logged point — a run of a single reading (e.g.
          a domain that's only logged weekly, like Weight) has no line to draw,
          so without a dot an isolated reading is otherwise invisible. */}
      {runs.map((run, ri) =>
        run.points.length === 1 ? (
          <circle
            key={`dot-${ri}`}
            cx={run.points[0].x}
            cy={run.points[0].y}
            r={large ? 5 : 3}
            fill="var(--text-primary)"
          />
        ) : null
      )}

      {/* Band labels — three on the large chart, two (High/Low) on the small tile */}
      {axis === "band" && (
        <>
          <text x={cfg.labelX} y={cfg.pad.top - 4} fontSize={cfg.labelFontSize} fill="var(--text-secondary)">High</text>
          <text x={cfg.labelX} y={cfg.vbH - cfg.pad.bottom + 12} fontSize={cfg.labelFontSize} fill="var(--text-secondary)">Low</text>
          {large && (
            <text x={cfg.labelX} y={cfg.pad.top + plotH / 2 + 4} fontSize={cfg.labelFontSize} fill="var(--text-secondary)">Medium</text>
          )}
        </>
      )}
      {axis === "numeric" && (
        <>
          <text x={cfg.labelX} y={cfg.pad.top - 4} fontSize={cfg.labelFontSize} fill="var(--text-secondary)">{Math.round(max)}</text>
          <text x={cfg.labelX} y={cfg.vbH - cfg.pad.bottom + 12} fontSize={cfg.labelFontSize} fill="var(--text-secondary)">{Math.round(min)}</text>
        </>
      )}

      {/* Date bounds at the bottom corners — large chart only */}
      {large && dates.length > 0 && (
        <>
          <text x={cfg.pad.left} y={cfg.vbH - 16} fontSize={13} fill="var(--text-secondary)">{fmtShort(dates[0])}</text>
          <text x={cfg.vbW - cfg.pad.right} y={cfg.vbH - 16} fontSize={13} textAnchor="end" fill="var(--text-secondary)">
            {fmtShort(dates[dates.length - 1])}
          </text>
        </>
      )}
    </svg>
  );
}
