"use client";

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../lib/api";
import { withAdherenceDoses } from "../../lib/medSchedule";
import { useAuth } from "../../components/AuthProvider";
import { NavBar } from "../../components/NavBar";
import {
  getMetricConfig, filterByTimeframe, aggregateWeekly, extractEvents,
  computeObservations, formatValue, formatChange, compute7dChange,
  EVENT_COLORS, EVENT_LABELS,
  type MetricPoint, type EventMarker, type Timeframe,
} from "../../lib/insights";
import { localDateStr } from "../../lib/api";
import type { Patient, DailyLog } from "../../lib/types";

// ── Chart constants ───────────────────────────────────────────────────────────

const VB_W = 400;
const VB_H = 200;
const PAD = { top: 12, right: 16, bottom: 36, left: 44 };
const CX = PAD.left;                           // chart left x
const CY = PAD.top;                            // chart top y
const CW = VB_W - PAD.left - PAD.right;       // chart width
const CH = VB_H - PAD.top - PAD.bottom;        // chart height

function ptX(idx: number, total: number): number {
  if (total <= 1) return CX + CW / 2;
  return CX + (idx / (total - 1)) * CW;
}
function ptY(val: number, min: number, max: number): number {
  const range = max - min || 1;
  return CY + CH - ((val - min) / range) * CH;
}
function dateToX(date: string, minDate: string, maxDate: string): number {
  const t0 = new Date(minDate).getTime();
  const t1 = new Date(maxDate).getTime();
  const t = new Date(date).getTime();
  const range = t1 - t0 || 1;
  return CX + ((t - t0) / range) * CW;
}

// ── SVG line chart ────────────────────────────────────────────────────────────

function LineChart({
  points,
  events,
  color,
  unit,
}: {
  points: MetricPoint[];
  events: EventMarker[];
  color: string;
  unit: string;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [cursorIdx, setCursorIdx] = useState<number | null>(null);
  const [tooltip, setTooltip] = useState<{ x: number; y: number; value: string; date: string } | null>(null);
  const [activeEvent, setActiveEvent] = useState<EventMarker | null>(null);

  if (points.length === 0) {
    return (
      <div className="w-full rounded-2xl flex items-center justify-center" style={{ height: 200, background: "#faf9f6" }}>
        <p className="text-slate-400 text-sm">No data for this period</p>
      </div>
    );
  }

  const minV = 0;
  const maxV = 10;

  const xs = points.map((_, i) => ptX(i, points.length));
  const ys = points.map((p) => ptY(p.value, minV, maxV));

  // SVG paths
  const linePath = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
  const fillPath = linePath + ` L${xs[xs.length - 1].toFixed(1)} ${(CY + CH).toFixed(1)} L${CX.toFixed(1)} ${(CY + CH).toFixed(1)} Z`;

  // Y axis ticks: 0, 2, 4, 6, 8, 10
  const yTicks = [0, 2, 4, 6, 8, 10];

  // X axis ticks (4 ticks)
  const xTickCount = Math.min(4, points.length);
  const xTickIndices = xTickCount <= 1 ? [0]
    : Array.from({ length: xTickCount }, (_, i) => Math.round(i * (points.length - 1) / (xTickCount - 1)));

  function formatXLabel(date: string): string {
    const d = new Date(date + "T00:00:00");
    return `${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}`;
  }
  function formatYLabel(v: number): string {
    if (unit === "%") return `${Math.round(v)}%`;
    if (unit === "hrs") return `${v.toFixed(1)}`;
    return v.toFixed(1);
  }

  // Event marker x positions (date-based)
  const minDate = points[0]?.date ?? "";
  const maxDate = points[points.length - 1]?.date ?? "";
  const eventXs = events
    .filter((e) => e.date >= minDate && e.date <= maxDate)
    .map((e) => ({ ...e, x: dateToX(e.date, minDate, maxDate) }));

  // Group events by type for de-duplication on the marker row
  const uniqueEventTypes = new Set(events.map((e) => e.type));

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!svgRef.current || points.length === 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * VB_W;
    let minDist = Infinity, idx = 0;
    xs.forEach((x, i) => {
      const d = Math.abs(x - svgX);
      if (d < minDist) { minDist = d; idx = i; }
    });
    setCursorIdx(idx);
    setTooltip({
      x: xs[idx],
      y: ys[idx],
      value: formatValue(points[idx].value, unit),
      date: new Date(points[idx].date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    });
  }

  function handlePointerLeave() {
    setCursorIdx(null);
    setTooltip(null);
  }

  // Tooltip box positioning
  const tipW = 80, tipH = 36;
  const tipX = tooltip ? Math.min(Math.max(tooltip.x - tipW / 2, CX), CX + CW - tipW) : 0;
  const tipY = tooltip ? (tooltip.y - tipH - 10 < CY ? tooltip.y + 10 : tooltip.y - tipH - 10) : 0;

  return (
    <div className="w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        className="overflow-visible"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
        style={{ touchAction: "none" }}
      >
        <defs>
          <linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((v, i) => {
          const y = ptY(v, minV, maxV);
          return (
            <g key={i}>
              <line x1={CX} y1={y} x2={CX + CW} y2={y} stroke="#F1F5F9" strokeWidth={1} />
              <text x={CX - 6} y={y + 4} textAnchor="end" fontSize={9} fill="#94A3B8">{formatYLabel(v)}</text>
            </g>
          );
        })}

        {/* Gradient fill */}
        <path d={fillPath} fill="url(#chartFill)" />

        {/* Line */}
        <path d={linePath} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />

        {/* X axis labels */}
        {xTickIndices.map((idx) => (
          <text key={idx} x={xs[idx]} y={VB_H - 4} textAnchor="middle" fontSize={9} fill="#94A3B8">
            {formatXLabel(points[idx].date)}
          </text>
        ))}

        {/* Event marker dots — bottom strip */}
        {eventXs.map((ev, i) => (
          <circle
            key={i}
            cx={ev.x}
            cy={CY + CH + 8}
            r={4}
            fill={ev.type === "symptom_spike" ? color : EVENT_COLORS[ev.type]}
            opacity={0.85}
            style={{ cursor: "pointer" }}
            onClick={() => setActiveEvent(activeEvent?.date === ev.date && activeEvent.type === ev.type ? null : ev)}
          />
        ))}

        {/* Cursor vertical line */}
        {cursorIdx !== null && tooltip && (
          <>
            <line x1={tooltip.x} y1={CY} x2={tooltip.x} y2={CY + CH} stroke="#CBD5E1" strokeWidth={1} strokeDasharray="3,2" />
            <circle cx={tooltip.x} cy={tooltip.y} r={5} fill={color} stroke="white" strokeWidth={2} />
            {/* Tooltip bubble */}
            <rect x={tipX} y={tipY} width={tipW} height={tipH} rx={6} fill="#1a2420" opacity={0.92} />
            <text x={tipX + tipW / 2} y={tipY + 13} textAnchor="middle" fontSize={10} fontWeight="700" fill="white">
              {tooltip.value}
            </text>
            <text x={tipX + tipW / 2} y={tipY + 27} textAnchor="middle" fontSize={9} fill="#94A3B8">
              {tooltip.date}
            </text>
          </>
        )}

        {/* Event tooltip */}
        {activeEvent && (() => {
          const ex = dateToX(activeEvent.date, minDate, maxDate);
          const label = `${new Date(activeEvent.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}: ${activeEvent.label}`;
          return (
            <>
              <rect x={Math.min(ex - 4, CX + CW - 120)} y={CY + CH + 16} width={120} height={24} rx={4} fill="#1E293B" />
              <text x={Math.min(ex - 4 + 60, CX + CW - 60)} y={CY + CH + 32} textAnchor="middle" fontSize={9} fill="white">{label}</text>
            </>
          );
        })()}
      </svg>

      {/* Event type legend */}
      {uniqueEventTypes.size > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 px-1">
          {[...uniqueEventTypes].map((type) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: EVENT_COLORS[type] }} />
              <span className="text-xs text-slate-500">{EVENT_LABELS[type]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Timeframe selector ────────────────────────────────────────────────────────

function TimeframeSelector({ current, onChange }: { current: Timeframe; onChange: (tf: Timeframe) => void }) {
  const options: Timeframe[] = ["1W", "1M", "3M", "1Y"];
  return (
    <div className="flex gap-1 rounded-xl p-1" style={{ background: "#F1F5F9" }}>
      {options.map((tf) => (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          className="flex-1 py-2 rounded-lg text-sm font-bold transition-all"
          style={{
            background: current === tf ? "#1a2420" : "transparent",
            color: current === tf ? "white" : "#64748B",
          }}
        >{tf}</button>
      ))}
    </div>
  );
}

// ── Main client component ─────────────────────────────────────────────────────

export default function MetricDetailClient({ metricKey, onBack }: { metricKey: string; onBack?: () => void }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [timeframe, setTimeframe] = useState<Timeframe>("1M");

  const loadData = useCallback(async () => {
    try {
      const patients = await api.getPatients() as Patient[];
      if (!patients.length) { router.push("/onboarding"); return; }
      const p = patients[0];
      setPatient(p);
      const logsData = await api.getLogs(p.id) as DailyLog[];
      // Off-day and as-needed entries aren't misses (see lib/medSchedule.ts).
      setLogs(withAdherenceDoses(logsData, p.medications));
    } catch {
      // silent
    } finally {
      setDataLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!isLoading && !user) { router.push("/login"); return; }
    if (!isLoading && user) loadData();
  }, [user, isLoading, loadData, router]);

  const medications = patient?.medications ?? [];
  const config = useMemo(() => getMetricConfig(metricKey, medications), [metricKey, medications]);

  const allPoints = useMemo(() => {
    if (!config) return [];
    const sorted = [...logs].sort((a, b) => a.date.localeCompare(b.date));
    return config.extract(sorted);
  }, [config, logs]);

  const chartPoints = useMemo(() => {
    let pts = filterByTimeframe(allPoints, timeframe);
    if (timeframe === "1Y") pts = aggregateWeekly(pts);
    return pts;
  }, [allPoints, timeframe]);

  const allEvents = useMemo(
    () => extractEvents(logs, config?.unit === "/10" ? config.label : undefined),
    [logs, config]
  );
  const chartEvents = useMemo(() => {
    const days = timeframe === "1W" ? 7 : timeframe === "1M" ? 30 : timeframe === "3M" ? 90 : 365;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return allEvents.filter((e) => e.date >= localDateStr(cutoff));
  }, [allEvents, timeframe]);

  const chartColor = useMemo(() => {
    if (config?.unit !== "/10" || !chartPoints.length) return config?.color ?? "#EF4444";
    const avg = chartPoints.reduce((s, p) => s + p.value, 0) / chartPoints.length;
    return avg >= 8 ? "#EA580C" : avg >= 4 ? "#D97706" : "#16A34A";
  }, [config, chartPoints]);

  const observations = useMemo(() => computeObservations(logs), [logs]);

  const latestValue = allPoints.length ? allPoints[allPoints.length - 1].value : null;
  const change7d = useMemo(() => compute7dChange(allPoints), [allPoints]);

  const changeInfo = config ? formatChange(change7d, config.unit, config.higherIsBetter) : null;

  if (isLoading || dataLoading) {
    return (
      <div className="min-h-screen" style={{ background: "#faf9f6" }}>
        <style>{`
          @keyframes shimmer-ins {
            from { background-position: 200% 0; }
            to   { background-position: -200% 0; }
          }
          .sk-ins {
            background: linear-gradient(90deg, #e8f0eb 25%, #d4e0d7 50%, #e8f0eb 75%);
            background-size: 200% 100%;
            animation: shimmer-ins 1.5s ease-in-out infinite;
            border-radius: 8px;
          }
        `}</style>
        <NavBar />
        <div className="max-w-lg mx-auto px-4 pt-5 space-y-5">
          {/* Back nav placeholder */}
          <div className="sk-ins" style={{ width: 80, height: 18 }} />

          {/* Metric header */}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="sk-ins" style={{ width: 64, height: 12 }} />
            <div className="sk-ins" style={{ width: 200, height: 36 }} />
            <div className="sk-ins" style={{ width: 100, height: 28 }} />
          </div>

          {/* Chart card */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <div className="sk-ins" style={{ width: "100%", height: 200, borderRadius: 12 }} />
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className="sk-ins" style={{ width: 52, height: 32, borderRadius: 8 }} />
              ))}
            </div>
          </div>

          {/* Observations card */}
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div className="sk-ins" style={{ width: 120, height: 20 }} />
            {[0, 1, 2].map((i) => (
              <div key={i} className="sk-ins" style={{ width: "100%", height: 52, borderRadius: 12 }} />
            ))}
          </div>
        </div>
      </div>
    );
  }

  if (!config) {
    return (
      <div className="min-h-screen" style={{ background: "#faf9f6" }}>
        <NavBar />
        <div className="max-w-lg mx-auto px-4 pt-6">
          {onBack ? (
            <button onClick={onBack} className="text-base font-semibold" style={{ color: "#4a7c59" }}>Back to Insights</button>
          ) : (
            <Link href="/insights" className="text-base font-semibold" style={{ color: "#4a7c59" }}>Back to Insights</Link>
          )}
          <p className="text-slate-500 mt-4">Metric not found.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: "#faf9f6" }}>
      <NavBar />

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-5">

        {/* Back nav */}
        {onBack ? (
          <button onClick={onBack} className="flex items-center gap-1.5 text-base font-semibold" style={{ color: "#4a7c59" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Insights
          </button>
        ) : (
          <Link href="/insights" className="flex items-center gap-1.5 text-base font-semibold" style={{ color: "#4a7c59" }}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Insights
          </Link>
        )}

        {/* Metric header */}
        <div>
          <p className="text-sm font-semibold uppercase tracking-widest text-slate-400">
            {config.unit === "/10" ? "Symptom" : config.unit === "%" ? "Adherence" : "Metric"}
          </p>
          <h1 className="text-3xl font-bold text-navy mt-0.5">{config.label}</h1>
          <div className="flex items-baseline gap-3 mt-2">
            {config.unit === "/10" && latestValue !== null ? (
              <>
                <span className="text-2xl font-bold" style={{ color: latestValue >= 8 ? "#EA580C" : latestValue >= 4 ? "#D97706" : "#16A34A" }}>
                  {latestValue >= 8 ? "Severe" : latestValue >= 4 ? "Moderate" : "Mild"}
                </span>
                <span className="text-base text-slate-400">last recorded</span>
              </>
            ) : (
              <span className="text-4xl font-bold" style={{ color: config.color }}>
                {latestValue !== null ? formatValue(latestValue, config.unit) : "—"}
              </span>
            )}
            {changeInfo && changeInfo.direction !== "neutral" && (
              <span className="text-base font-semibold" style={{ color: changeInfo.color }}>
                {changeInfo.direction === "up" ? "▲" : "▼"} {changeInfo.text} vs prior 7d
              </span>
            )}
          </div>
        </div>

        {/* Chart card */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
          <LineChart
            points={chartPoints}
            events={chartEvents}
            color={chartColor}
            unit={config.unit}
          />
          <div className="mt-4">
            <TimeframeSelector current={timeframe} onChange={setTimeframe} />
          </div>
          {chartPoints.length > 0 && chartPoints.length === allPoints.length && timeframe !== "3M" && (
            <p className="text-xs text-slate-400 text-center mt-2">
              Showing all {allPoints.length} logged {allPoints.length === 1 ? "day" : "days"}. No earlier data available.
            </p>
          )}
        </div>

        {/* Observations */}
        {observations.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100 space-y-3">
            <h2 className="text-base font-bold text-navy">Observations</h2>
            <p className="text-xs text-slate-400">Based on {logs.length} days of data. Descriptive only and does not imply causation.</p>
            {observations.map((obs, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl p-3" style={{ background: "#faf9f6" }}>
                <div className="w-1 h-full rounded-full flex-shrink-0 self-stretch" style={{ background: "#4a7c59", minHeight: 16 }} />
                <p className="text-sm text-slate-700 leading-relaxed">{obs.text}</p>
              </div>
            ))}
          </div>
        )}

        {logs.length < 21 && (
          <p className="text-sm text-slate-400 text-center">
            Observations appear after 21 days of data ({21 - logs.length} more to go).
          </p>
        )}

        {/* Stats summary */}
        {chartPoints.length > 0 && (
          <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100">
            <h2 className="text-base font-bold text-navy mb-3">This period</h2>
            <div className="grid grid-cols-3 gap-3">
              {(() => {
                const avg = chartPoints.reduce((s, p) => s + p.value, 0) / chartPoints.length;
                const min = Math.min(...chartPoints.map(p => p.value));
                const max = Math.max(...chartPoints.map(p => p.value));
                const fmt = (v: number) => config.unit === "/10"
                  ? (v >= 8 ? "Severe" : v >= 4 ? "Moderate" : "Mild")
                  : formatValue(v, config.unit);
                return [
                  { label: "Average", value: fmt(avg) },
                  { label: "Best", value: fmt(min) },
                  { label: "Worst", value: fmt(max) },
                ].map((stat) => (
                  <div key={stat.label} className="text-center rounded-xl py-3" style={{ background: "#faf9f6" }}>
                    <p className="text-base font-bold text-navy">{stat.value}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{stat.label}</p>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
