"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Lora } from "next/font/google";
import { api, localDateStr } from "../../lib/api";
import { CHART_INK, seriesColor } from "../../lib/chartTheme";
import type { RecentNote, SymptomDelta, SymptomTickerResponse } from "../../lib/types";
import { EmptyState } from "./EmptyState";

const lora = Lora({ subsets: ["latin"], weight: ["500", "600"], style: ["normal", "italic"], display: "swap" });

// There is no stored "visit" anywhere in the data model (see
// backend/routers/clinicians.py's /symptom-ticker docstring) — this fixed
// trailing window stands in for "since the last visit" everywhere in this file.
const DELTA_WINDOW_DAYS = 30;

// Matches the "high" severity bucket used elsewhere on the portal
// (build_flags, _note_badges) — a day only counts as "elevated" here if it
// would already earn a badge on the notes feed.
const ELEVATED_SEVERITY = 8;

const MAX_CHARTED = 5;

const RISING = "#d03b3b";
const FALLING = "#0ca30c";

const RANGES: { key: string; label: string; days: number }[] = [
  { key: "1W", label: "1W", days: 7 },
  { key: "1M", label: "1M", days: 30 },
  { key: "3M", label: "3M", days: 90 },
  { key: "6M", label: "6M", days: 182 },
  { key: "1Y", label: "1Y", days: 365 },
];

// One dash pattern per charted slot, in addition to color — with up to five
// overlapping lines on one axis, color alone isn't enough separation for
// colorblind readers or a quick glance across a printed page.
const DASH_PATTERNS: number[][] = [[], [2, 3], [8, 4], [8, 3, 2, 3], [3, 3]];

function sliceRange<T>(arr: T[], days: number): T[] {
  return arr.slice(Math.max(0, arr.length - days));
}

function fmtDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

interface TickerRow extends SymptomDelta {
  absDelta: number;
  direction: "up" | "down" | "flat" | "new";
}

function toRows(symptoms: SymptomDelta[]): TickerRow[] {
  return symptoms.map((s) => ({
    ...s,
    absDelta: s.delta == null ? -1 : Math.abs(s.delta),
    direction: s.low_n || s.delta == null ? "new" : s.delta > 0 ? "up" : s.delta < 0 ? "down" : "flat",
  }));
}

/**
 * Plain-sentence summary generated from the numbers already computed above —
 * no LLM call. Deliberately conservative about the adherence correlation: the
 * backend only gives us a window-level adherence delta, not day-by-day
 * causality, so this states "over the same period," not a specific week.
 */
function buildHeadline(rows: TickerRow[], adherence: SymptomTickerResponse["adherence"]): string {
  const scored = rows.filter((r) => r.direction !== "new");
  if (scored.length === 0) {
    return `Not enough data yet to compare the last ${DELTA_WINDOW_DAYS} days.`;
  }

  const worse = scored.filter((r) => r.direction === "up");
  const better = scored.filter((r) => r.direction === "down");
  const changed = scored.filter((r) => r.direction !== "flat");

  if (changed.length === 0) {
    return `No symptoms have changed in the last ${DELTA_WINDOW_DAYS} days.`;
  }

  const leadingWorse = worse.length >= better.length;
  const leadCount = leadingWorse ? worse.length : better.length;
  const leadWord = leadingWorse ? "worse" : "better";
  const sentence1 = `${leadCount} of ${scored.length} symptom${scored.length === 1 ? "" : "s"} ${leadCount === 1 ? "is" : "are"} ${leadWord} than ${DELTA_WINDOW_DAYS} days ago.`;

  const maxAbs = Math.max(...changed.map((r) => r.absDelta));
  const topMovers = changed.filter((r) => r.absDelta === maxAbs);
  const names = topMovers.map((r) => r.symptom).join(" and ");
  const verb = topMovers[0].direction === "up" ? "up" : "down";
  const magnitude = topMovers[0].absDelta.toFixed(1);
  const pointsWord = magnitude === "1.0" ? "point" : "points";
  const subjectVerb = topMovers.length === 1 ? "is" : "are both";

  let sentence2 = `${names} ${subjectVerb} ${verb} ${magnitude} ${pointsWord}`;
  if (adherence.delta != null && adherence.delta <= -15 && worse.length > 0) {
    sentence2 += ", and medication adherence dropped over the same period.";
  } else {
    sentence2 += ".";
  }

  return `${sentence1} ${sentence2}`;
}

function elevatedDates(row: TickerRow, deltaStartIso: string): string[] {
  return row.dates.filter((d, i) => d >= deltaStartIso && (row.values[i] ?? -1) >= ELEVATED_SEVERITY);
}

function DashSwatch({ color, dash }: { color: string; dash: number[] }) {
  return (
    <svg width="20" height="10" aria-hidden="true" className="flex-shrink-0">
      <line x1="0" y1="5" x2="20" y2="5" strokeWidth={2} strokeDasharray={dash.join(",")} style={{ stroke: color }} />
    </svg>
  );
}

/* ── chart ─────────────────────────────────────────────────────────────────── */

interface TickerSeries {
  label: string;
  values: (number | null)[];
  color: string;
  dash: number[];
}

/**
 * Bespoke Chart.js instance (rather than the shared TrendChart) because this
 * view needs two things TrendChart doesn't do: a per-series dash pattern, and
 * a reference line marking where the fixed delta window begins. Chart.js is
 * dynamically imported on mount, same as TrendChart — `output: "export"`
 * prerenders this page at build time with no real canvas available.
 */
function TickerChart({
  dates,
  series,
  anchorDateIso,
  anchorLabel,
}: {
  dates: string[];
  series: TickerSeries[];
  anchorDateIso: string;
  anchorLabel: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);
  const [failed, setFailed] = useState(false);

  const dataKey = useMemo(() => JSON.stringify({ dates, series, anchorDateIso }), [dates, series, anchorDateIso]);

  useEffect(() => {
    let cancelled = false;

    async function draw() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const { default: Chart } = await import("chart.js/auto");
        if (cancelled) return;

        chartRef.current?.destroy();

        const anchorIndex = dates.indexOf(anchorDateIso);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const anchorPlugin: any = {
          id: "deltaAnchor",
          afterDraw(chart: { ctx: CanvasRenderingContext2D; chartArea: { top: number; bottom: number; left: number; right: number }; scales: { x: { getPixelForValue: (i: number) => number } } }) {
            if (anchorIndex < 0) return;
            const { ctx, chartArea, scales } = chart;
            const x = scales.x.getPixelForValue(anchorIndex);
            if (x < chartArea.left || x > chartArea.right) return;
            ctx.save();
            ctx.strokeStyle = CHART_INK.axis;
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(x, chartArea.top);
            ctx.lineTo(x, chartArea.bottom);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.fillStyle = CHART_INK.textMuted;
            ctx.font = "11px Inter, sans-serif";
            ctx.textAlign = "center";
            ctx.fillText(anchorLabel, x, chartArea.top - 6);
            ctx.restore();
          },
        };

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const config: any = {
          type: "line",
          data: {
            labels: dates.map((d) => {
              const dd = new Date(`${d}T00:00:00`);
              return dd.toLocaleDateString("en-US", { month: "short", day: "numeric" });
            }),
            datasets: series.map((s) => ({
              label: s.label,
              data: s.values,
              borderColor: s.color,
              backgroundColor: s.color,
              borderWidth: 2,
              borderDash: s.dash,
              tension: 0.3,
              fill: false,
              spanGaps: false,
              // Caregivers log intermittently, not daily — with spanGaps off, an
              // isolated scored day with gaps on both sides gets no line segment
              // at all, so a flat pointRadius:0 would render it as nothing.
              // Same isolated-point exception as TrendChart.tsx.
              pointRadius: (ctx: { dataIndex: number }) => {
                const v = s.values;
                const i2 = ctx.dataIndex;
                if (v[i2] == null) return 0;
                const isolated = v[i2 - 1] == null && v[i2 + 1] == null;
                return isolated ? 3 : 0;
              },
              pointHoverRadius: 5,
              pointBackgroundColor: s.color,
              pointBorderColor: CHART_INK.surface,
              pointBorderWidth: 2,
            })),
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 20 } },
            interaction: { mode: "index", intersect: false },
            scales: {
              y: {
                min: 0,
                max: 10,
                border: { display: false },
                grid: { color: CHART_INK.gridline },
                ticks: { color: CHART_INK.textMuted, font: { size: 11 }, maxTicksLimit: 5 },
              },
              x: {
                border: { color: CHART_INK.axis },
                grid: { display: false },
                ticks: { color: CHART_INK.textMuted, font: { size: 11 }, maxTicksLimit: 8, autoSkip: true },
              },
            },
            plugins: {
              legend: { display: false },
              tooltip: {
                backgroundColor: "#1F2937",
                titleColor: "#FFFFFF",
                bodyColor: "#E5E7EB",
                padding: 10,
                cornerRadius: 8,
                callbacks: {
                  label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
                    ctx.parsed.y == null ? `${ctx.dataset.label}: not logged` : `${ctx.dataset.label}: ${ctx.parsed.y}/10`,
                },
              },
            },
          },
          plugins: [anchorPlugin],
        };

        chartRef.current = new Chart(canvas, config);
      } catch {
        if (!cancelled) setFailed(true);
      }
    }

    void draw();
    return () => {
      cancelled = true;
      chartRef.current?.destroy();
      chartRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey]);

  if (failed) {
    return (
      <div
        className="flex items-center justify-center rounded-lg text-xs"
        style={{ height: 260, color: CHART_INK.textMuted, background: "#FAFAF7" }}
      >
        Chart unavailable — see the list below.
      </div>
    );
  }

  return (
    <div style={{ position: "relative", height: 260 }}>
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Symptom trend chart comparing ${series.map((s) => s.label).join(", ")}`}
      />
    </div>
  );
}

/* ── drill-down ────────────────────────────────────────────────────────────── */

function DrillDown({
  row,
  notesByDate,
  deltaStartIso,
}: {
  row: TickerRow;
  notesByDate: Map<string, RecentNote>;
  deltaStartIso: string;
}) {
  const dates = elevatedDates(row, deltaStartIso);
  const matched = dates.map((d) => notesByDate.get(d)).filter((n): n is RecentNote => !!n);

  if (matched.length === 0) {
    return (
      <p className="text-sm py-2" style={{ color: "var(--cp-text-muted)" }}>
        No notes mention this. Scores only.
      </p>
    );
  }

  return (
    <div className="space-y-3 py-2">
      {matched.map((n) => (
        <div key={n.date} style={{ borderLeft: "2px solid var(--cp-amber)", borderRadius: 0, paddingLeft: 12 }}>
          <p className="text-xs" style={{ color: "var(--cp-text-muted)" }}>{fmtDate(n.date)}</p>
          <p className={lora.className} style={{ fontSize: 15, lineHeight: 1.5, color: "var(--cp-text)", marginTop: 2 }}>
            {n.text}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ── main component ───────────────────────────────────────────────────────── */

export function SymptomTicker({
  patientId,
  patientName,
  daysLogged,
  daysInWindow,
  recentNotes,
}: {
  patientId: number;
  patientName: string;
  daysLogged: number;
  daysInWindow: number;
  recentNotes: RecentNote[];
}) {
  const [data, setData] = useState<SymptomTickerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [range, setRange] = useState<string>("1M");
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(false);
    api
      .getSymptomTicker(patientId, DELTA_WINDOW_DAYS, 365)
      .then((res) => {
        if (!cancelled) setData(res as SymptomTickerResponse);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const notesByDate = useMemo(() => new Map(recentNotes.map((n) => [n.date, n])), [recentNotes]);

  const deltaStartIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - DELTA_WINDOW_DAYS);
    return localDateStr(d);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div
          className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: "var(--cp-teal)", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  if (error || !data) {
    return <EmptyState text="Could not load the symptom ticker." />;
  }

  const rows = toRows(data.symptoms);
  const headline = buildHeadline(rows, data.adherence);
  const changedRows = rows.filter((r) => r.direction === "up" || r.direction === "down");
  const charted = [...changedRows].sort((a, b) => b.absDelta - a.absDelta).slice(0, MAX_CHARTED);
  const chartedIndexBySymptom = new Map(charted.map((c, i) => [c.symptom, i]));
  const tickerList = [...rows].sort((a, b) => b.absDelta - a.absDelta);

  const activeRangeDays = RANGES.find((r) => r.key === range)?.days ?? 30;
  const slicedDates = charted[0] ? sliceRange(charted[0].dates, activeRangeDays) : [];

  return (
    <div className="space-y-5">
      {/* Headline */}
      <div
        className={lora.className}
        style={{
          borderLeft: "2px solid var(--cp-amber)",
          borderRadius: 0,
          paddingLeft: 16,
          fontSize: 17,
          lineHeight: 1.5,
          color: "var(--cp-text)",
        }}
      >
        {headline}
      </div>

      {/* Range selector + chart — hidden entirely when nothing changed */}
      {charted.length > 0 && (
        <div className="rounded-xl border p-4" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
            <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--cp-border)" }}>
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  onClick={() => setRange(r.key)}
                  aria-pressed={range === r.key}
                  className="px-3 py-1.5 text-xs font-semibold transition-colors"
                  style={{
                    background: range === r.key ? "var(--cp-teal)" : "#fff",
                    color: range === r.key ? "#fff" : "var(--cp-text-muted)",
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <p className="text-xs cp-tabular" style={{ color: "var(--cp-text-muted)" }}>
              {patientName} · {daysLogged} of {daysInWindow} days logged
            </p>
          </div>

          <TickerChart
            dates={slicedDates}
            series={charted.map((c, i) => ({
              label: c.symptom,
              values: sliceRange(c.values, activeRangeDays),
              color: seriesColor(i),
              dash: DASH_PATTERNS[i] ?? [],
            }))}
            anchorDateIso={deltaStartIso}
            anchorLabel={`${DELTA_WINDOW_DAYS} days ago`}
          />
        </div>
      )}

      {/* Ticker list — also the legend for the chart above */}
      <div className="rounded-xl border divide-y" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
        <p
          className="text-[11px] font-bold uppercase tracking-wide px-3 pt-3 pb-1"
          style={{ color: "var(--cp-text-muted)" }}
        >
          Sorted by change, last {DELTA_WINDOW_DAYS} days
        </p>
        {tickerList.map((row) => {
          const chartedIndex = chartedIndexBySymptom.get(row.symptom);
          const isCharted = chartedIndex !== undefined;
          const isExpanded = expanded === row.symptom;
          const deltaColor =
            row.direction === "up" ? RISING : row.direction === "down" ? FALLING : "var(--cp-text-muted)";
          const deltaText =
            row.direction === "new"
              ? "not enough data"
              : row.direction === "flat"
              ? "no change"
              : `${row.direction} ${row.absDelta.toFixed(1)}`;

          return (
            <div key={row.symptom}>
              <button
                onClick={() => setExpanded(isExpanded ? null : row.symptom)}
                aria-expanded={isExpanded}
                className="w-full flex items-center gap-3 p-3 text-left"
              >
                <DashSwatch
                  color={isCharted ? seriesColor(chartedIndex) : "var(--cp-text-muted)"}
                  dash={isCharted ? DASH_PATTERNS[chartedIndex] ?? [] : [1, 3]}
                />
                <span className="flex-1 text-sm font-semibold truncate" style={{ color: "var(--cp-text)" }}>
                  {row.symptom}
                </span>
                <span className="text-sm cp-tabular" style={{ color: "var(--cp-text)" }}>
                  {row.current_value != null ? row.current_value.toFixed(1) : "—"}
                </span>
                <span
                  className="text-sm font-semibold cp-tabular flex-shrink-0 text-right"
                  style={{ color: deltaColor, minWidth: 100 }}
                >
                  {deltaText}
                </span>
              </button>
              {isExpanded && (
                <div className="px-3 pb-3">
                  <DrillDown row={row} notesByDate={notesByDate} deltaStartIso={deltaStartIso} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
