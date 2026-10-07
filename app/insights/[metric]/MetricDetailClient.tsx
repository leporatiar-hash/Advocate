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
  computeObservations, formatValue, compute7dChange, metricDomain, severityWord,
  EVENT_COLORS, EVENT_LABELS,
  type MetricPoint, type EventMarker, type Timeframe,
} from "../../lib/insights";
import { TimeframeToggle } from "../../components/TimeframeToggle";
import { lora, serif, WARM } from "../../lib/warmTheme";
import { localDateStr } from "../../lib/api";
import type { Patient, DailyLog } from "../../lib/types";

// ── Chart ─────────────────────────────────────────────────────────────────────
//
// Points sit at their real dates across the whole period, so gaps in logging
// show as gaps (the line breaks) instead of being squeezed out. The y-scale is
// fixed per metric (0–10, 0–100%, hours), and symptom charts shade the
// Moderate and Severe bands so a reading can be judged at a glance. Context
// events (missed dose, low sleep, …) get their own lane under the plot, one
// row per kind, in the same colors as the legend.

const VB_W = 400;
const PLOT_H = 170;
const PAD = { top: 10, right: 12, left: 34 };
const LANE_H = 12;
const DAY_MS = 86_400_000;

function utc(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function shortDate(date: string): string {
  return new Date(utc(date)).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

function yTicks(unit: string, [lo, hi]: [number, number]): number[] {
  if (unit === "/10") return [0, 2, 4, 6, 8, 10];
  if (unit === "%") return [0, 25, 50, 75, 100];
  if (unit === "hrs") return Array.from({ length: hi / 4 + 1 }, (_, i) => i * 4);
  if (unit === "days") return [0, 1];
  return [lo, (lo + hi) / 2, hi];
}

function tickLabel(v: number, unit: string): string {
  if (unit === "%") return `${v}%`;
  if (unit === "hrs") return `${v}h`;
  if (unit === "days") return v ? "Yes" : "No";
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function LineChart({
  points, events, unit, label, startDate, endDate, maxGapDays,
}: {
  points: MetricPoint[];
  events: EventMarker[];
  unit: string;
  label: string;
  startDate: string;
  endDate: string;
  maxGapDays: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [active, setActive] = useState<number | null>(null);
  const [activeEvent, setActiveEvent] = useState<(EventMarker & { x: number; y: number }) | null>(null);

  if (points.length === 0) {
    return (
      <div className="w-full rounded-2xl flex items-center justify-center" style={{ height: PLOT_H, background: WARM.cream }}>
        <p className="text-sm" style={{ color: WARM.inkSoft }}>Nothing logged in this period</p>
      </div>
    );
  }

  const domain = metricDomain(unit, points);
  const [lo, hi] = domain;
  const t0 = utc(startDate), t1 = Math.max(utc(endDate), t0 + DAY_MS);
  const cw = VB_W - PAD.left - PAD.right;
  const x = (date: string) => PAD.left + ((utc(date) - t0) / (t1 - t0)) * cw;
  const y = (v: number) => PAD.top + (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo || 1)) * (PLOT_H - PAD.top);
  const baseY = y(lo);

  // Break the line wherever logging stopped for longer than maxGapDays.
  const segments: MetricPoint[][] = [];
  points.forEach((p, i) => {
    const gap = i > 0 ? (utc(p.date) - utc(points[i - 1].date)) / DAY_MS : 0;
    if (i === 0 || gap > maxGapDays) segments.push([p]);
    else segments[segments.length - 1].push(p);
  });

  const types = [...new Set(events.map((e) => e.type))];
  const lanesTop = PLOT_H + 26;
  const vbH = lanesTop + types.length * LANE_H + 4;
  const laneEvents = events
    .filter((e) => e.date >= startDate && e.date <= endDate)
    .map((e) => ({ ...e, x: x(e.date), y: lanesTop + types.indexOf(e.type) * LANE_H + LANE_H / 2 }));

  const midDate = new Date((t0 + t1) / 2).toISOString().slice(0, 10);
  // Dots mark individual entries when they're sparse; a dense daily run reads
  // better as a plain line (the latest point always keeps its dot).
  const spanDays = (utc(points[points.length - 1].date) - utc(points[0].date)) / DAY_MS + 1;
  const showDots = points.length <= 20 || spanDays / points.length > 1.5;
  const shown = active !== null ? points[active] : null;

  function handlePointerMove(e: React.PointerEvent<SVGSVGElement>) {
    if (!svgRef.current) return;
    const rect = svgRef.current.getBoundingClientRect();
    const svgX = ((e.clientX - rect.left) / rect.width) * VB_W;
    let best = 0;
    points.forEach((p, i) => { if (Math.abs(x(p.date) - svgX) < Math.abs(x(points[best].date) - svgX)) best = i; });
    setActive(best);
  }

  const ariaLabel = `${label}: ${points.length} entries from ${shortDate(points[0].date)} to ${shortDate(points[points.length - 1].date)}. `
    + points.slice(-14).map((p) => `${shortDate(p.date)} ${formatValue(p.value, unit)}`).join("; ");

  return (
    <div className="w-full">
      <div className="relative">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${VB_W} ${vbH}`}
          width="100%"
          role="img"
          aria-label={ariaLabel}
          onPointerMove={handlePointerMove}
          onPointerLeave={() => setActive(null)}
          style={{ touchAction: "pan-y" }}
        >
          {/* Severity bands for symptom scores */}
          {unit === "/10" && (
            <>
              <rect x={PAD.left} y={y(10)} width={cw} height={y(8) - y(10)} fill="#fbece6" />
              <rect x={PAD.left} y={y(8)} width={cw} height={y(4) - y(8)} fill="#fbf5ea" />
              <text x={VB_W - PAD.right - 4} y={y(10) + 11} textAnchor="end" fontSize={9} fill={WARM.inkSoft}>Severe</text>
              <text x={VB_W - PAD.right - 4} y={y(8) + 11} textAnchor="end" fontSize={9} fill={WARM.inkSoft}>Moderate</text>
            </>
          )}

          {/* Grid + y labels */}
          {yTicks(unit, domain).map((v) => (
            <g key={v}>
              <line x1={PAD.left} y1={y(v)} x2={VB_W - PAD.right} y2={y(v)} stroke={v === lo ? "#cfdad3" : "#edf1ee"} strokeWidth={1} />
              <text x={PAD.left - 6} y={y(v) + 3} textAnchor="end" fontSize={9} fill={WARM.inkSoft}>{tickLabel(v, unit)}</text>
            </g>
          ))}

          {/* x labels: start, middle, end of the period */}
          {[startDate, midDate, endDate].map((d, i) => (
            <text key={d + i} x={x(d)} y={baseY + 16} fontSize={9} fill={WARM.inkSoft}
              textAnchor={i === 0 ? "start" : i === 2 ? "end" : "middle"}>
              {shortDate(d)}
            </text>
          ))}

          {/* Line, broken at gaps */}
          {segments.map((seg, i) => seg.length > 1 && (
            <path key={i}
              d={seg.map((p, j) => `${j ? "L" : "M"}${x(p.date).toFixed(1)} ${y(p.value).toFixed(1)}`).join(" ")}
              fill="none" stroke={WARM.sage} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
          ))}
          {points.map((p, i) => (showDots || i === active || i === points.length - 1) && (
            <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={i === active ? 4.5 : 2.75}
              fill={WARM.sage} stroke="white" strokeWidth={1.5} />
          ))}

          {/* Crosshair */}
          {shown && (
            <line x1={x(shown.date)} y1={PAD.top} x2={x(shown.date)} y2={baseY} stroke="#b8c7bd" strokeWidth={1} strokeDasharray="3,3" />
          )}

          {/* Event lanes */}
          {types.map((t, i) => (
            <line key={t} x1={PAD.left} x2={VB_W - PAD.right} y1={lanesTop + i * LANE_H + LANE_H / 2} y2={lanesTop + i * LANE_H + LANE_H / 2}
              stroke="#f1f4f2" strokeWidth={1} />
          ))}
          {laneEvents.map((ev, i) => (
            <g key={i} onClick={() => setActiveEvent(activeEvent?.date === ev.date && activeEvent.type === ev.type ? null : ev)}
              style={{ cursor: "pointer" }}>
              <circle cx={ev.x} cy={ev.y} r={3.5} fill={EVENT_COLORS[ev.type]} stroke="white" strokeWidth={1} />
              <circle cx={ev.x} cy={ev.y} r={8} fill="transparent" />
            </g>
          ))}
        </svg>

        {shown && (
          <div className="absolute pointer-events-none px-2.5 py-1.5 rounded-lg text-xs bg-white shadow-md whitespace-nowrap"
            style={{
              border: `1px solid ${WARM.rule}`,
              left: `${(x(shown.date) / VB_W) * 100}%`,
              top: `${(y(shown.value) / vbH) * 100}%`,
              transform: `translate(${x(shown.date) > VB_W * 0.7 ? "-100%" : x(shown.date) < VB_W * 0.3 ? "0" : "-50%"}, -135%)`,
            }}>
            <span className="font-semibold" style={{ color: WARM.ink }}>
              {unit === "/10" ? `${shown.value.toFixed(shown.value % 1 ? 1 : 0)}/10 · ${severityWord(shown.value)}` : formatValue(shown.value, unit)}
            </span>
            <span style={{ color: WARM.inkSoft }}> · {shortDate(shown.date)}</span>
          </div>
        )}
        {activeEvent && (
          <div className="absolute px-2.5 py-1.5 rounded-lg text-xs bg-white shadow-md whitespace-nowrap"
            style={{
              border: `1px solid ${WARM.rule}`,
              left: `${(activeEvent.x / VB_W) * 100}%`,
              top: `${(activeEvent.y / vbH) * 100}%`,
              transform: `translate(${activeEvent.x > VB_W * 0.6 ? "-100%" : "0"}, -130%)`,
              color: WARM.ink,
            }}>
            {shortDate(activeEvent.date)}: {activeEvent.label}
          </div>
        )}
      </div>

      {/* Legend for the event lanes */}
      {types.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-1 px-1">
          {types.map((type) => (
            <div key={type} className="flex items-center gap-1.5">
              <div className="w-2.5 h-2.5 rounded-full" style={{ background: EVENT_COLORS[type] }} />
              <span className="text-xs" style={{ color: WARM.inkSoft }}>{EVENT_LABELS[type]}</span>
            </div>
          ))}
        </div>
      )}
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

  // The chart spans the whole selected period (today back N days).
  const range = useMemo(() => {
    const days = timeframe === "1W" ? 7 : timeframe === "1M" ? 30 : timeframe === "3M" ? 90 : 365;
    const start = new Date();
    start.setDate(start.getDate() - days);
    return { start: localDateStr(start), end: localDateStr() };
  }, [timeframe]);

  const observations = useMemo(() => computeObservations(logs), [logs]);

  const latestValue = allPoints.length ? allPoints[allPoints.length - 1].value : null;
  const change7d = useMemo(() => compute7dChange(allPoints), [allPoints]);

  const changeThreshold = config?.unit === "%" ? 2 : 0.3;
  const changeMoved = change7d !== null && Math.abs(change7d) >= changeThreshold;
  const changeBetter = changeMoved && config ? ((change7d! > 0) === config.higherIsBetter) : false;

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

  const kind = config.unit === "/10" ? "Symptom" : config.unit === "%" ? "Medication" : metricKey === "sleep" ? "Sleep" : "Daily routine";
  const backButton = (
    <>
      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
      </svg>
      Insights
    </>
  );
  const cardStyle = { border: `1px solid ${WARM.rule}` };

  return (
    <div className={`${lora.variable} min-h-screen pb-28`} style={{ background: WARM.cream }}>
      <NavBar />

      <div className="max-w-lg mx-auto px-4 pt-5 space-y-5">

        {onBack ? (
          <button onClick={onBack} className="flex items-center gap-1.5 text-base font-semibold" style={{ color: WARM.sage }}>{backButton}</button>
        ) : (
          <Link href="/insights" className="flex items-center gap-1.5 text-base font-semibold" style={{ color: WARM.sage }}>{backButton}</Link>
        )}

        {/* Header: what this is, where it stands, how it's moved */}
        <div>
          <p className="text-sm" style={{ color: WARM.inkSoft }}>{kind}</p>
          <h1 className="text-3xl mt-0.5" style={{ ...serif, color: WARM.ink, fontWeight: 500 }}>{config.label}</h1>
          <div className="flex items-baseline flex-wrap gap-x-3 gap-y-1 mt-2">
            <span className="text-2xl font-semibold" style={{ color: WARM.forest }}>
              {latestValue === null ? "—"
                : config.unit === "/10" ? `${severityWord(latestValue)} · ${latestValue.toFixed(latestValue % 1 ? 1 : 0)}/10`
                : formatValue(latestValue, config.unit)}
            </span>
            {latestValue !== null && <span className="text-sm" style={{ color: WARM.inkSoft }}>most recent</span>}
          </div>
          {change7d !== null && (
            <p className="text-sm mt-1" style={{ color: WARM.inkSoft }}>
              {changeMoved ? (
                <>
                  <span style={{ color: changeBetter ? WARM.better : WARM.worse, fontWeight: 600 }}>
                    {change7d > 0 ? "↑ " : "↓ "}
                    {config.unit === "%" ? `${Math.abs(change7d).toFixed(0)}%` : config.unit === "hrs" ? `${Math.abs(change7d).toFixed(1)}h` : Math.abs(change7d).toFixed(1)}
                  </span>
                  {" "}compared with the week before ({changeBetter ? "better" : "worse"})
                </>
              ) : "About the same as the week before"}
            </p>
          )}
        </div>

        {/* Chart card */}
        <div className="bg-white rounded-2xl p-4 shadow-sm space-y-4" style={cardStyle}>
          <LineChart
            points={chartPoints}
            events={chartEvents}
            unit={config.unit}
            label={config.label}
            startDate={range.start}
            endDate={range.end}
            maxGapDays={timeframe === "1Y" && chartPoints.length < allPoints.length ? 14 : 3}
          />
          <TimeframeToggle current={timeframe} onChange={setTimeframe} />
          {chartPoints.length > 0 && chartPoints.length === allPoints.length && timeframe !== "3M" && (
            <p className="text-xs text-center" style={{ color: WARM.inkSoft }}>
              Showing all {allPoints.length} logged {allPoints.length === 1 ? "day" : "days"}. Nothing earlier yet.
            </p>
          )}
        </div>

        {/* Period stats */}
        {chartPoints.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm" style={cardStyle}>
            <h2 className="text-base mb-3" style={{ ...serif, color: WARM.forest, fontWeight: 500 }}>This period</h2>
            <div className="grid grid-cols-3 gap-2">
              {(() => {
                const vals = chartPoints.map(p => p.value);
                const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
                const lowBest = !config.higherIsBetter;
                const best = lowBest ? Math.min(...vals) : Math.max(...vals);
                const worst = lowBest ? Math.max(...vals) : Math.min(...vals);
                const fmt = (v: number) => config.unit === "/10" ? `${v.toFixed(v % 1 ? 1 : 0)}/10` : formatValue(v, config.unit);
                const sub = (v: number) => config.unit === "/10" ? severityWord(v) : "";
                return [
                  { label: "Average", v: avg },
                  { label: "Best day", v: best },
                  { label: "Hardest day", v: worst },
                ].map((stat) => (
                  <div key={stat.label} className="text-center rounded-xl py-3" style={{ background: WARM.cream }}>
                    <p className="text-base font-semibold" style={{ color: WARM.ink }}>{fmt(stat.v)}</p>
                    {sub(stat.v) && <p className="text-xs" style={{ color: WARM.inkSoft }}>{sub(stat.v)}</p>}
                    <p className="text-xs mt-0.5" style={{ color: WARM.inkSoft }}>{stat.label}</p>
                  </div>
                ));
              })()}
            </div>
          </div>
        )}

        {/* Observations */}
        {observations.length > 0 && (
          <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3" style={cardStyle}>
            <div>
              <h2 className="text-base" style={{ ...serif, color: WARM.forest, fontWeight: 500 }}>Things we&apos;ve noticed</h2>
              <p className="text-xs mt-0.5" style={{ color: WARM.inkSoft }}>
                From {logs.length} days of logs. These are patterns, not causes. Worth raising with the care team.
              </p>
            </div>
            {observations.map((obs, i) => (
              <div key={i} className="rounded-xl px-3.5 py-3" style={{ background: WARM.cream, borderLeft: `3px solid ${WARM.sage}` }}>
                <p className="text-sm leading-relaxed" style={{ color: WARM.ink }}>{obs.text}</p>
              </div>
            ))}
          </div>
        )}

        {logs.length < 21 && (
          <p className="text-sm text-center" style={{ color: WARM.inkSoft }}>
            Patterns appear after 21 days of logs ({21 - logs.length} more to go).
          </p>
        )}
      </div>
    </div>
  );
}
