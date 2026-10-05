"use client";

import { useId } from "react";
import type { TimelineEventItem } from "../../lib/types";

// Daily trend chart for the clinician timeline. Every row on the page (and
// the shared date axis above them) uses the same viewBox width and the same
// horizontal padding, so a given day lands at the same x in every row — the
// whole point of the stacked layout is reading straight down a column
// ("sleep fell the same week anxiety spiked").

export type TrendSize = "row" | "tile" | "large";

export interface TrendSpec {
  min: number;
  max: number;
  /** Value range drawn as the shaded "watch" zone; the line turns red inside it. */
  concern?: { from: number; to: number };
  /** Formats a value for the large chart's y-axis labels. */
  fmt: (v: number) => string;
}

interface Cfg {
  vbW: number;
  vbH: number;
  pad: { top: number; right: number; bottom: number; left: number };
  stroke: number;
  dot: number;
}

export const TREND_CFG: Record<TrendSize, Cfg> = {
  row: { vbW: 1000, vbH: 96, pad: { top: 8, right: 8, bottom: 8, left: 8 }, stroke: 2.75, dot: 2.2 },
  // Dashboard Quick View tiles (three across) — no labels, like a row.
  tile: { vbW: 600, vbH: 200, pad: { top: 8, right: 8, bottom: 8, left: 8 }, stroke: 3, dot: 3 },
  large: { vbW: 1180, vbH: 460, pad: { top: 44, right: 28, bottom: 72, left: 76 }, stroke: 3.5, dot: 3.6 },
};

const ALERT = "#C2410C";
const ALERT_TINT = "#FDEBE3";

export function xAt(i: number, count: number, cfg: Cfg): number {
  const plotW = cfg.vbW - cfg.pad.left - cfg.pad.right;
  return cfg.pad.left + ((i + 0.5) / Math.max(count, 1)) * plotW;
}

function fmtShort(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Mondays in the window (plus day one if it isn't a Monday) — the tick marks
 * shared by every row and the axis. */
export function weekTicks(dates: string[]): number[] {
  return dates
    .map((d, i) => ({ i, dow: new Date(`${d}T00:00:00`).getDay() }))
    .filter(({ dow }) => dow === 1)
    .map(({ i }) => i);
}

type Pt = [number, number];

function segments(vals: (number | null)[], x: (i: number) => number, y: (v: number) => number): Pt[][] {
  const segs: Pt[][] = [];
  let cur: Pt[] | null = null;
  vals.forEach((v, i) => {
    if (v == null) {
      cur = null;
      return;
    }
    if (!cur) {
      cur = [];
      segs.push(cur);
    }
    cur.push([x(i), y(v)]);
  });
  return segs;
}

/** Catmull-Rom through the points, with control points clamped to the plot so
 * the curve never overshoots past the axis. */
function curve(pts: Pt[], yLo: number, yHi: number): string {
  if (pts.length === 0) return "";
  const clampY = (v: number) => Math.max(yLo, Math.min(yHi, v));
  let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, clampY(p1[1] + (p2[1] - p0[1]) / 6)];
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, clampY(p2[1] - (p3[1] - p1[1]) / 6)];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export function TrendChart({
  dates,
  raw,
  line,
  spec,
  events,
  size,
  plain = false,
}: {
  dates: string[];
  /** Each day's logged value — drawn as faint dots. */
  raw: (number | null)[];
  /** The trend line (lightly smoothed, or interpolated for sparse domains). */
  line: (number | null)[];
  spec: TrendSpec;
  events: TimelineEventItem[];
  size: TrendSize;
  /** Accent-only rendering (dashboard Quick View): no watch zone, no red
   * in-zone line, and episodes as a neutral gray band. */
  plain?: boolean;
}) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const cfg = TREND_CFG[size];
  const large = size === "large";
  const count = dates.length;
  const top = cfg.pad.top;
  const bottom = cfg.vbH - cfg.pad.bottom;
  const plotH = bottom - top;
  const left = cfg.pad.left;
  const right = cfg.vbW - cfg.pad.right;
  const step = (right - left) / Math.max(count, 1);

  const x = (i: number) => xAt(i, count, cfg);
  const y = (v: number) => {
    const t = (Math.max(spec.min, Math.min(spec.max, v)) - spec.min) / (spec.max - spec.min || 1);
    return bottom - t * plotH;
  };

  const segs = segments(line, x, y);
  const ticks = weekTicks(dates);

  const zone = spec.concern && !plain
    ? { y1: y(Math.min(spec.max, spec.concern.to)), y2: y(Math.max(spec.min, spec.concern.from)) }
    : null;

  const idxOf = (d: string) => dates.indexOf(d);
  const episodes = events.flatMap((e) => {
    if (e.type !== "episode" || count === 0) return [];
    if (e.end < dates[0] || e.start > dates[count - 1]) return [];
    const s = e.start < dates[0] ? 0 : idxOf(e.start);
    const en = e.end > dates[count - 1] ? count - 1 : idxOf(e.end);
    if (s < 0 || en < 0) return [];
    return [{ x1: x(s) - step / 2, x2: x(en) + step / 2, label: `Episode ${fmtShort(e.start)}–${fmtShort(e.end)}` }];
  });
  const medChanges = events.flatMap((e) => {
    if (e.type !== "med_change") return [];
    const i = idxOf(e.date);
    return i < 0 ? [] : [{ x: x(i) - step / 2, label: `Med change ${fmtShort(e.date)}` }];
  });

  let lastPt: Pt | null = null;
  for (let i = line.length - 1; i >= 0; i--) {
    const v = line[i];
    if (v != null) {
      lastPt = [x(i), y(v)];
      break;
    }
  }
  const lastInZone = lastPt && zone ? lastPt[1] >= zone.y1 && lastPt[1] <= zone.y2 : false;

  const yLabels: number[] = [];
  if (large) {
    yLabels.push(spec.min, spec.max);
    if (spec.concern) {
      const b = spec.concern.from > spec.min ? spec.concern.from : spec.concern.to;
      if (b > spec.min && b < spec.max) yLabels.push(b);
    }
  }

  return (
    <svg viewBox={`0 0 ${cfg.vbW} ${cfg.vbH}`} className="w-full h-full block" role="img" aria-label="Trend chart">
      <defs>
        <linearGradient id={`area-${uid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--accent)" stopOpacity={0.22} />
          <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.02} />
        </linearGradient>
        {zone && (
          <clipPath id={`zone-${uid}`}>
            <rect x={0} y={zone.y1} width={cfg.vbW} height={zone.y2 - zone.y1} />
          </clipPath>
        )}
      </defs>

      {/* Watch zone */}
      {zone && <rect x={left} y={zone.y1} width={right - left} height={zone.y2 - zone.y1} fill={ALERT_TINT} />}

      {/* Week gridlines — the same x positions as the shared axis above */}
      {ticks.map((i) => (
        <line key={`t-${i}`} x1={x(i) - step / 2} x2={x(i) - step / 2} y1={top} y2={bottom} stroke="var(--border)" strokeWidth={1} />
      ))}

      {/* Episode band(s) */}
      {episodes.map((ep, i) => (
        <g key={`ep-${i}`}>
          <rect x={ep.x1} y={top} width={ep.x2 - ep.x1} height={plotH} fill={plain ? "#E5E7EB" : "var(--episode-band)"} opacity={plain ? 0.6 : 0.75} />
          {large && (
            <text x={(ep.x1 + ep.x2) / 2} y={top - 14} fontSize={14} fontWeight={600} textAnchor="middle" fill={plain ? "var(--text-secondary)" : "#B42318"}>
              {ep.label}
            </text>
          )}
        </g>
      ))}

      {/* Med changes */}
      {medChanges.map((mc, i) => (
        <g key={`mc-${i}`}>
          <line x1={mc.x} x2={mc.x} y1={top} y2={bottom} stroke="var(--text-primary)" strokeOpacity={0.55} strokeWidth={large ? 2 : 1.5} strokeDasharray="5,4" />
          {large && (
            <text x={mc.x} y={bottom + 22} fontSize={13} fontWeight={600} textAnchor="middle" fill="var(--text-primary)">
              {mc.label}
            </text>
          )}
        </g>
      ))}

      {/* Area under the trend line */}
      {segs.map((s, i) =>
        s.length > 1 ? (
          <path
            key={`a-${i}`}
            d={`${curve(s, top, bottom)} L${s[s.length - 1][0].toFixed(1)},${bottom} L${s[0][0].toFixed(1)},${bottom} Z`}
            fill={`url(#area-${uid})`}
          />
        ) : null
      )}

      {/* Raw daily readings */}
      {raw.map((v, i) =>
        v == null ? null : <circle key={`r-${i}`} cx={x(i)} cy={y(v)} r={cfg.dot} fill="var(--text-primary)" opacity={0.22} />
      )}

      {/* Trend line, then the same line again in red clipped to the watch zone */}
      {segs.map((s, i) =>
        s.length > 1 ? (
          <path key={`l-${i}`} d={curve(s, top, bottom)} fill="none" stroke="var(--accent)" strokeWidth={cfg.stroke} strokeLinecap="round" strokeLinejoin="round" />
        ) : (
          <circle key={`l-${i}`} cx={s[0][0]} cy={s[0][1]} r={cfg.dot + 1.5} fill="var(--accent)" />
        )
      )}
      {zone &&
        segs.map((s, i) =>
          s.length > 1 ? (
            <path
              key={`z-${i}`}
              d={curve(s, top, bottom)}
              fill="none"
              stroke={ALERT}
              strokeWidth={cfg.stroke}
              strokeLinecap="round"
              strokeLinejoin="round"
              clipPath={`url(#zone-${uid})`}
            />
          ) : null
        )}

      {/* Latest reading */}
      {lastPt && (
        <circle cx={lastPt[0]} cy={lastPt[1]} r={large ? 6 : 4.5} fill={lastInZone ? ALERT : "var(--accent)"} stroke="var(--surface-1)" strokeWidth={2} />
      )}

      {/* Large chart only: y labels and week dates */}
      {large && (
        <>
          {yLabels.map((v) => (
            <g key={`y-${v}`}>
              <text x={left - 12} y={y(v) + 5} fontSize={14} textAnchor="end" fill="var(--text-secondary)">
                {spec.fmt(v)}
              </text>
            </g>
          ))}
          {ticks.map((i) => (
            <text key={`xl-${i}`} x={x(i) - step / 2 + 4} y={bottom + 56} fontSize={13} fill="var(--text-secondary)">
              {fmtShort(dates[i])}
            </text>
          ))}
        </>
      )}
    </svg>
  );
}

/** Shared date axis for the stacked rows: week labels plus the episode / med
 * change callouts, labelled once here instead of in every row. */
export function TrendAxis({ dates, events }: { dates: string[]; events: TimelineEventItem[] }) {
  const cfg = { ...TREND_CFG.row, vbH: 44 };
  const count = dates.length;
  const step = (cfg.vbW - cfg.pad.left - cfg.pad.right) / Math.max(count, 1);
  const x = (i: number) => xAt(i, count, cfg);
  const ticks = weekTicks(dates);
  const idxOf = (d: string) => dates.indexOf(d);

  const callouts: { x: number; label: string; color: string }[] = [];
  for (const e of events) {
    if (e.type === "episode") {
      if (count === 0 || e.end < dates[0] || e.start > dates[count - 1]) continue;
      const s = e.start < dates[0] ? 0 : idxOf(e.start);
      const en = e.end > dates[count - 1] ? count - 1 : idxOf(e.end);
      if (s < 0 || en < 0) continue;
      callouts.push({ x: (x(s) + x(en)) / 2, label: "Episode", color: "#B42318" });
    } else if (e.type === "med_change") {
      const i = idxOf(e.date);
      if (i >= 0) callouts.push({ x: x(i) - step / 2, label: `Med change ${fmtShort(e.date)}`, color: "var(--text-primary)" });
    }
  }

  return (
    <svg viewBox={`0 0 ${cfg.vbW} ${cfg.vbH}`} className="w-full h-full block" aria-hidden="true">
      {ticks.map((i) => (
        <text key={i} x={x(i) - step / 2 + 3} y={40} fontSize={12} fill="var(--text-secondary)">
          {fmtShort(dates[i])}
        </text>
      ))}
      {callouts.map((c, i) => (
        <g key={i}>
          <rect x={c.x - 1} y={4} width={2} height={14} fill={c.color} opacity={0.6} />
          <text x={c.x + 6} y={15} fontSize={12} fontWeight={600} fill={c.color}>
            {c.label}
          </text>
        </g>
      ))}
    </svg>
  );
}
