"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Lora } from "next/font/google";
import { api, localDateStr } from "../../lib/api";
import { CHART_INK, seriesColor } from "../../lib/chartTheme";
import type { RecentNote, SymptomDelta, SymptomEvent, SymptomTickerResponse } from "../../lib/types";
import { EmptyState } from "./EmptyState";

const lora = Lora({ subsets: ["latin"], weight: ["500", "600"], style: ["normal", "italic"], display: "swap" });

// Matches the "high" severity bucket used elsewhere on the portal
// (build_flags, _note_badges) — a day only counts as "elevated" here if it
// would already earn a badge on the notes feed.
const ELEVATED_SEVERITY = 8;

const MAX_CHARTED = 5;

const RISING = "#d03b3b";
const FALLING = "#0ca30c";

// Mirrors TIER_RANK / EVENT_RANK in backend/services/aggregation.py — the
// list and chart must rank the same way the headline does, or "rank should
// be visible in the chart" breaks the moment the two disagree. Keep in sync.
const TIER_RANK: Record<string, number> = { red: 0, amber: 1, routine: 2 };
const EVENT_RANK: Record<string, number> = {
  emerged: 0, persisting: 1, worsening: 2, resolved: 3, improving: 4, steady: 5,
};

// binDays mirrors bin_days_for_window in backend/services/aggregation.py —
// the chart's own visual binning and the backend's delta-averaging must
// agree on what a "weekly average" means for the same range, or the chart
// and the headline's numbers would describe two different things.
const RANGES: { key: string; label: string; days: number; binDays: number; aggLabel: string }[] = [
  { key: "1W", label: "1W", days: 7, binDays: 1, aggLabel: "Daily values" },
  { key: "1M", label: "1M", days: 30, binDays: 1, aggLabel: "Daily values" },
  { key: "3M", label: "3M", days: 90, binDays: 7, aggLabel: "Weekly average" },
  { key: "6M", label: "6M", days: 182, binDays: 14, aggLabel: "Biweekly average" },
  { key: "1Y", label: "1Y", days: 365, binDays: 30, aggLabel: "Monthly average" },
];

// One dash pattern per charted slot, in addition to color — with up to five
// overlapping lines on one axis, color alone isn't enough separation for
// colorblind readers or a quick glance across a printed page.
const DASH_PATTERNS: number[][] = [[], [2, 3], [8, 4], [8, 3, 2, 3], [3, 3]];

function sliceRange<T>(arr: T[], days: number): T[] {
  return arr.slice(Math.max(0, arr.length - days));
}

/**
 * Chunks a (dates, values) series into `binDays`-wide bins, mean of whatever
 * non-null values fall in each bin — a bin with zero scored days stays null,
 * same "a gap is a gap" rule as everywhere else on this page. Binned from the
 * END backward so the most recent bin always ends on the last day, regardless
 * of how evenly `binDays` divides the array length.
 */
function downsample(dates: string[], values: (number | null)[], binDays: number): { dates: string[]; values: (number | null)[] } {
  if (binDays <= 1) return { dates, values };
  const outDates: string[] = [];
  const outValues: (number | null)[] = [];
  for (let end = values.length; end > 0; end -= binDays) {
    const start = Math.max(0, end - binDays);
    const chunk = values.slice(start, end).filter((v): v is number => v != null);
    outValues.unshift(chunk.length ? Math.round((chunk.reduce((a, b) => a + b, 0) / chunk.length) * 10) / 10 : null);
    outDates.unshift(dates[start]);
  }
  return { dates: outDates, values: outValues };
}

/** Nearest chart-label index for a visit date that may not land exactly on a
 * bin boundary once the range is binned weekly/biweekly/monthly — null when
 * the visit predates or postdates every label, so the marker is omitted
 * rather than pinned to an edge it doesn't actually belong to. */
function visitDateIndex(dates: string[], visitDate?: string | null): number | null {
  if (!visitDate || dates.length === 0) return null;
  if (visitDate < dates[0] || visitDate > dates[dates.length - 1]) return null;
  let closest = 0;
  for (let i = 0; i < dates.length; i++) {
    if (dates[i] <= visitDate) closest = i;
  }
  return closest;
}

function fmtDate(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

interface TickerRow extends SymptomDelta {
  absDelta: number;
}

function toRows(symptoms: SymptomDelta[]): TickerRow[] {
  return symptoms.map((s) => ({ ...s, absDelta: s.delta == null ? -1 : Math.abs(s.delta) }));
}

function rankKey(s: { tier: string; event: string; delta: number | null }): [number, number, number] {
  return [TIER_RANK[s.tier] ?? 2, EVENT_RANK[s.event] ?? 5, -Math.abs(s.delta ?? 0)];
}

function compareRank(a: TickerRow, b: TickerRow): number {
  const [at, ae, ad] = rankKey(a);
  const [bt, be, bd] = rankKey(b);
  return at - bt || ae - be || ad - bd;
}

function eventLabel(row: TickerRow): { text: string; color: string } {
  switch (row.event as SymptomEvent) {
    case "emerged":
      return { text: "new", color: RISING };
    case "persisting":
      return { text: `persisting at ${row.current_value?.toFixed(1) ?? "—"}`, color: RISING };
    case "worsening":
      return { text: `up ${row.absDelta.toFixed(1)}`, color: RISING };
    case "resolved":
      return { text: "resolved", color: FALLING };
    case "improving":
      return { text: `down ${row.absDelta.toFixed(1)}`, color: FALLING };
    case "steady":
    default:
      return { text: "not enough data", color: "var(--cp-text-muted)" };
  }
}

function elevatedDates(row: TickerRow, deltaStartIso: string): string[] {
  return row.dates.filter((d, i) => d >= deltaStartIso && (row.values[i] ?? -1) >= ELEVATED_SEVERITY);
}

// The badge conveys meaning, not the color's own name — printing "red"/"amber"
// as the label would make the word and the hue the same signal, which breaks
// down the moment either one is misread (colorblind vision, black-and-white
// print). "red"/"amber" here are tier keys from the backend, not display text.
const TIER_LABEL: Record<string, string> = { red: "urgent", amber: "monitor" };

function TierBadge({ tier }: { tier: string }) {
  if (tier === "routine") return null;
  const color = tier === "red" ? RISING : "var(--cp-amber)";
  return (
    <span
      className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full flex-shrink-0"
      style={{ background: `${color}1A`, color }}
    >
      {TIER_LABEL[tier] ?? tier}
    </span>
  );
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
  weight: number;
}

/**
 * Bespoke Chart.js instance (rather than the shared TrendChart) because this
 * view needs things TrendChart doesn't do: a per-series dash pattern and
 * weight, and gap segments styled as deliberate rather than as a broken
 * line. Chart.js is dynamically imported on mount, same as TrendChart —
 * `output: "export"` prerenders this page at build time with no real canvas
 * available.
 *
 * `visitDate` draws one reference marker — the patient's last recorded
 * appointment — as a dashed vertical line via a small inline Chart.js plugin
 * (afterDraw + getPixelForValue), rather than pulling in
 * chartjs-plugin-annotation for one line. Silently omitted when the date
 * doesn't fall inside the currently displayed range.
 */
function TickerChart({
  dates,
  series,
  visitDate,
}: {
  dates: string[];
  series: TickerSeries[];
  visitDate?: string | null;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);
  const [failed, setFailed] = useState(false);

  const dataKey = useMemo(() => JSON.stringify({ dates, series, visitDate }), [dates, series, visitDate]);

  useEffect(() => {
    let cancelled = false;

    async function draw() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const { default: Chart } = await import("chart.js/auto");
        if (cancelled) return;

        chartRef.current?.destroy();

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
              borderWidth: s.weight,
              borderDash: s.dash,
              tension: 0,
              fill: false,
              // Connects across a gap rather than breaking the line outright
              // (a real day with no neighbor otherwise renders as a stray,
              // unexplained dot) — but the segment styling below fades and
              // dashes exactly the spans that cross a gap, so "connected"
              // still reads as "we don't actually know what happened here",
              // never as continuous observation.
              spanGaps: true,
              segment: {
                borderDash: (ctx: { p0DataIndex: number; p1DataIndex: number }) =>
                  ctx.p1DataIndex - ctx.p0DataIndex > 1 ? [2, 3] : s.dash,
                borderColor: (ctx: { p0DataIndex: number; p1DataIndex: number }) =>
                  ctx.p1DataIndex - ctx.p0DataIndex > 1 ? `${s.color}55` : s.color,
              },
              pointRadius: 0,
              pointHoverRadius: 5,
              pointBackgroundColor: s.color,
              pointBorderColor: CHART_INK.surface,
              pointBorderWidth: 2,
            })),
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: { padding: { top: 8 } },
            interaction: { mode: "index", intersect: false },
            scales: {
              y: {
                min: 0,
                max: 10,
                border: { display: false },
                grid: { color: CHART_INK.gridline },
                ticks: { color: CHART_INK.textMuted, font: { size: 11 }, stepSize: 2 },
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
        };

        const visitIndex = visitDateIndex(dates, visitDate);
        if (visitIndex !== null) {
          config.plugins = [{
            id: "visitMarker",
            afterDraw(chart: any) {
              const { ctx, chartArea, scales } = chart;
              const x = scales.x.getPixelForValue(visitIndex);
              if (x < chartArea.left || x > chartArea.right) return;
              ctx.save();
              ctx.strokeStyle = CHART_INK.axis;
              ctx.setLineDash([3, 3]);
              ctx.lineWidth = 1;
              ctx.beginPath();
              ctx.moveTo(x, chartArea.top);
              ctx.lineTo(x, chartArea.bottom);
              ctx.stroke();
              ctx.setLineDash([]);
              ctx.fillStyle = CHART_INK.textMuted;
              ctx.font = "10px sans-serif";
              ctx.textAlign = "center";
              ctx.fillText("Last visit", x, chartArea.top + 10);
              ctx.restore();
            },
          }];
        }

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
}: {
  patientId: number;
  patientName: string;
}) {
  const [data, setData] = useState<SymptomTickerResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // Separate from `loading`: a range click keeps the previous view visible
  // (dimmed) rather than blanking to a spinner, since it's now a real
  // network round-trip — the headline and deltas are recomputed server-side
  // for whatever range is newly selected, not just re-sliced client-side.
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [range, setRange] = useState<string>("1M");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [notesShown, setNotesShown] = useState(5);
  // Per-symptom visibility override, keyed by symptom name so it survives a
  // range change (the rank-based default below does not: a symptom's rank can
  // move when the window changes, but a clinician's explicit on/off choice
  // shouldn't flip with it). Undefined = no explicit choice yet, use the
  // rank-based default (top 3 visible).
  const [visibilityOverride, setVisibilityOverride] = useState<Record<string, boolean>>({});

  const activeRange = RANGES.find((r) => r.key === range) ?? RANGES[1];

  useEffect(() => {
    let cancelled = false;
    setRefreshing(true);
    setError(false);
    setNotesShown(5);
    api
      .getSymptomTicker(patientId, activeRange.days)
      .then((res) => {
        if (!cancelled) setData(res as SymptomTickerResponse);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, activeRange.days]);

  // Matches whatever range is currently selected, not a fixed 30 — the
  // drill-down's "elevated days" must scope to the same window the headline
  // and deltas describe.
  const deltaStartIso = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - (activeRange.days - 1));
    return localDateStr(d);
  }, [activeRange.days]);

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
  // Steady (insufficient recent data, no real signal) never gets a line —
  // that was the source of the stray, unconnected dots a sparse symptom like
  // an occasional side-effect note used to scatter across the chart. Every
  // other event, including a single-day "emerged", is real signal worth a line.
  const chartable = rows.filter((r) => r.event !== "steady");
  const rankedChartable = [...chartable].sort(compareRank);
  // Default-on: the top 3 by priority rank — five overlapping lines is a
  // chart wall a clinician has to squint through. An explicit toggle click
  // always wins over this default, in either direction.
  const isVisible = (symptom: string, rankIndex: number) =>
    visibilityOverride[symptom] ?? rankIndex < 3;
  const charted = rankedChartable
    .filter((c, i) => isVisible(c.symptom, i))
    .slice(0, MAX_CHARTED);
  const chartedSymptoms = new Set(charted.map((c) => c.symptom));
  const tickerList = [...rows].sort(compareRank);

  const binned = charted.map((c) =>
    downsample(sliceRange(c.dates, activeRange.days), sliceRange(c.values, activeRange.days), activeRange.binDays)
  );
  const chartDates = binned[0]?.dates ?? [];

  // Already window-scoped by the backend (unlike the portal's recent_notes,
  // a fixed global cap of the 5 most-recent notable periods in the patient's
  // whole history — see SymptomTickerResponse.window_notes), just sorted
  // newest-first here. Never paraphrased or re-scored, only sorted.
  const windowNotes = [...data.window_notes].sort((a, b) => (a.date < b.date ? 1 : -1));
  const notesByDate = new Map(data.window_notes.map((n) => [n.date, n]));

  return (
    <div className="space-y-5" style={{ opacity: refreshing ? 0.6 : 1, transition: "opacity 0.15s" }}>
      {/* Headline — describes whatever range is currently selected */}
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
        {data.headline}
      </div>

      {/* Range selector + chart — hidden entirely when nothing changed.
          Gated on rankedChartable (any real signal at all), not on the
          currently toggled-on `charted`: hiding it whenever a clinician
          toggles every visible symptom off would hide the range selector
          they'd need to get back here. */}
      {rankedChartable.length > 0 && (
        <div className="rounded-xl border p-4" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
          <div className="flex items-center justify-between gap-3 flex-wrap mb-1">
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
              {patientName} · {data.days_logged} of {data.days_in_window} days logged
            </p>
          </div>
          <p className="text-xs mb-2" style={{ color: "var(--cp-text-muted)" }}>
            {activeRange.aggLabel}
          </p>

          <TickerChart
            dates={chartDates}
            series={charted.map((c, i) => ({
              label: c.symptom,
              values: binned[i]?.values ?? [],
              // Keyed by symptom identity (color_index, assigned server-side —
              // see symptom_color_index in aggregation.py), never by i: i is
              // this symptom's rank position, which is recomputed per window,
              // and a symptom's color must not flicker when the range toggles.
              color: seriesColor(c.color_index),
              dash: DASH_PATTERNS[c.color_index % DASH_PATTERNS.length] ?? [],
              // The single leading (rank-0) symptom draws heavier — same
              // priority the headline and ticker list already use, made
              // visible in the chart too, not just the sort order.
              weight: i === 0 ? 3 : 1.5,
            }))}
            visitDate={data.last_appointment_date}
          />
        </div>
      )}

      {/* Ticker list — also the legend for the chart above */}
      <div className="rounded-xl border divide-y" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
        <p
          className="text-[11px] font-bold uppercase tracking-wide px-3 pt-3 pb-1"
          style={{ color: "var(--cp-text-muted)" }}
        >
          Sorted by clinical priority, {activeRange.days === 7 ? "the last week" : `last ${activeRange.days} days`}
        </p>
        {tickerList.map((row) => {
          const isChartable = chartable.some((c) => c.symptom === row.symptom);
          const isCharted = chartedSymptoms.has(row.symptom);
          const isExpanded = expanded === row.symptom;
          const { text: eventText, color: eventColor } = eventLabel(row);

          return (
            <div key={row.symptom} style={{ opacity: isChartable && !isCharted ? 0.5 : 1 }}>
              <div className="w-full flex items-center gap-3 p-3 text-left">
                {isChartable ? (
                  <button
                    onClick={() =>
                      setVisibilityOverride((prev) => ({ ...prev, [row.symptom]: !isCharted }))
                    }
                    aria-pressed={isCharted}
                    aria-label={`${isCharted ? "Hide" : "Show"} ${row.symptom} on the chart`}
                    className="flex-shrink-0"
                  >
                    <DashSwatch color={seriesColor(row.color_index)} dash={DASH_PATTERNS[row.color_index % DASH_PATTERNS.length] ?? []} />
                  </button>
                ) : (
                  <DashSwatch color="var(--cp-text-muted)" dash={[1, 3]} />
                )}
                <button
                  onClick={() => setExpanded(isExpanded ? null : row.symptom)}
                  aria-expanded={isExpanded}
                  className="flex-1 flex items-center gap-3 text-left min-w-0"
                >
                  <TierBadge tier={row.tier} />
                  <span className="flex-1 text-sm font-semibold truncate" style={{ color: "var(--cp-text)" }}>
                    {row.symptom}
                  </span>
                  <span className="text-sm cp-tabular" style={{ color: "var(--cp-text)" }}>
                    {row.current_value != null ? row.current_value.toFixed(1) : "—"}
                  </span>
                  <span
                    className="text-sm font-semibold cp-tabular flex-shrink-0 text-right"
                    style={{ color: eventColor, minWidth: 120 }}
                  >
                    {eventText}
                  </span>
                </button>
              </div>
              {isExpanded && (
                <div className="px-3 pb-3">
                  <DrillDown row={row} notesByDate={notesByDate} deltaStartIso={deltaStartIso} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Caregiver notes, verbatim — the differentiator this page otherwise
          buries under numbers: a human watched this person every day and
          wrote it down. Never paraphrased, never scored here. */}
      {windowNotes.length > 0 && (
        <div className="rounded-xl border p-4" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
          <p
            className="text-[11px] font-bold uppercase tracking-wide pb-2"
            style={{ color: "var(--cp-text-muted)" }}
          >
            Caregiver notes, {activeRange.days === 7 ? "the last week" : `last ${activeRange.days} days`}
          </p>
          <div className="space-y-3 divide-y" style={{ borderColor: "var(--cp-border)" }}>
            {windowNotes.slice(0, notesShown).map((n) => (
              <div key={n.date} className="pt-3 first:pt-0" style={{ borderLeft: "2px solid var(--cp-amber)", paddingLeft: 12 }}>
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="text-xs" style={{ color: "var(--cp-text-muted)" }}>{fmtDate(n.date)}</p>
                  {n.badges.map((b) => (
                    <span
                      key={b}
                      className="text-[9px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full"
                      style={{ background: "rgba(11,11,11,0.06)", color: "var(--cp-text-muted)" }}
                    >
                      {b}
                    </span>
                  ))}
                </div>
                <p className={lora.className} style={{ fontSize: 15, lineHeight: 1.5, color: "var(--cp-text)", marginTop: 2 }}>
                  {n.text}
                </p>
              </div>
            ))}
          </div>
          {windowNotes.length > notesShown && (
            <button
              onClick={() => setNotesShown((n) => n + 5)}
              className="text-xs font-semibold mt-3"
              style={{ color: "var(--cp-teal)" }}
            >
              Show {Math.min(5, windowNotes.length - notesShown)} more
            </button>
          )}
        </div>
      )}
    </div>
  );
}
