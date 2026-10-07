"use client";

import { useState } from "react";
import { formatShortDate } from "../lib/medSchedule";

// One small line chart for a single numeric custom vital. Lab values are
// sparse (a clozapine level every few weeks), so points sit at their real
// dates on a fixed window rather than evenly spaced.

export interface VitalPoint { date: string; value: number }

const GREEN = "#4a7c59";
const W = 320, H = 120;
const PAD = { top: 12, right: 12, bottom: 22, left: 12 };
const DAY_MS = 86_400_000;

function utc(dateStr: string): number {
  const [y, m, d] = dateStr.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fmtNum(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

export function VitalTrendChart({
  name, unit, points, startDate, endDate,
}: {
  name: string;
  unit?: string | null;
  points: VitalPoint[]; // date-ascending
  startDate: string;
  endDate: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  if (points.length === 0) return null;

  const u = unit ? ` ${unit}` : "";
  const values = points.map(p => p.value);
  const min = Math.min(...values), max = Math.max(...values);
  const span = max - min || Math.abs(max) || 1;
  const yMin = min - span * 0.15, yMax = max + span * 0.15;
  const t0 = utc(startDate), t1 = Math.max(utc(endDate), t0 + DAY_MS);
  const x = (d: string) => PAD.left + ((utc(d) - t0) / (t1 - t0)) * (W - PAD.left - PAD.right);
  const y = (v: number) => PAD.top + (1 - (v - yMin) / (yMax - yMin)) * (H - PAD.top - PAD.bottom);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ");
  const latest = points[points.length - 1];
  const shown = active !== null ? points[active] : null;
  const label = `${name}${unit ? ` in ${unit}` : ""}, ${points.length} reading${points.length === 1 ? "" : "s"}: `
    + points.map(p => `${formatShortDate(p.date)} ${fmtNum(p.value)}`).join("; ");

  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <p className="text-sm font-semibold text-navy">{name}</p>
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-navy">{fmtNum(latest.value)}{u}</span> · {formatShortDate(latest.date)}
        </p>
      </div>
      <div className="relative">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" role="img" aria-label={label}
          onPointerLeave={() => setActive(null)}>
          <line x1={PAD.left} x2={W - PAD.right} y1={H - PAD.bottom} y2={H - PAD.bottom} stroke="#E2E8F0" strokeWidth={1} />
          <text x={PAD.left} y={H - 6} fontSize={10} fill="#94A3B8">{formatShortDate(startDate)}</text>
          <text x={W - PAD.right} y={H - 6} fontSize={10} fill="#94A3B8" textAnchor="end">{formatShortDate(endDate)}</text>
          {points.length > 1 && (
            <path d={path} fill="none" stroke={GREEN} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          )}
          {points.map((p, i) => (
            <g key={p.date}>
              <circle cx={x(p.date)} cy={y(p.value)} r={i === active ? 5.5 : 4} fill={GREEN} stroke="white" strokeWidth={2} />
              {/* Hit target larger than the dot, for touch */}
              <circle cx={x(p.date)} cy={y(p.value)} r={14} fill="transparent" tabIndex={0}
                aria-label={`${formatShortDate(p.date)}: ${fmtNum(p.value)}${u}`}
                onPointerEnter={() => setActive(i)} onClick={() => setActive(i)}
                onFocus={() => setActive(i)} onBlur={() => setActive(null)}
                style={{ cursor: "pointer", outline: "none" }} />
            </g>
          ))}
        </svg>
        {shown && (
          <div className="absolute pointer-events-none px-2 py-1 rounded-lg text-xs bg-white shadow border border-slate-200 whitespace-nowrap"
            style={{
              left: `${(x(shown.date) / W) * 100}%`, top: `${(y(shown.value) / H) * 100}%`,
              transform: `translate(${x(shown.date) > W * 0.7 ? "-100%" : x(shown.date) < W * 0.3 ? "0" : "-50%"}, -130%)`,
            }}>
            <span className="font-semibold text-navy">{fmtNum(shown.value)}{u}</span>
            <span className="text-slate-500"> · {formatShortDate(shown.date)}</span>
          </div>
        )}
      </div>
      <p className="text-xs text-slate-500">
        {points.length} reading{points.length === 1 ? "" : "s"}
        {points.length > 1 && ` · range ${fmtNum(min)}–${fmtNum(max)}${u}`}
      </p>
    </div>
  );
}
