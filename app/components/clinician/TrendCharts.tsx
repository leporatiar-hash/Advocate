"use client";

import { useMemo, useState } from "react";
import { TrendChart } from "./TrendChart";
import { seriesColor, SINGLE_SERIES_COLOR, shortDate } from "../../lib/chartTheme";
import type { AdherenceSeriesBlock, SymptomSeriesBlock } from "../../lib/types";

/* ── shared chrome ─────────────────────────────────────────────────────────── */

function ChartCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border p-4" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-bold" style={{ color: "var(--cp-text)" }}>{title}</h3>
          {subtitle && (
            <p className="text-xs mt-0.5" style={{ color: "var(--cp-text-muted)" }}>{subtitle}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </div>
  );
}

function ViewToggle({ view, onChange }: { view: "chart" | "table"; onChange: (v: "chart" | "table") => void }) {
  return (
    <div className="flex rounded-lg overflow-hidden border flex-shrink-0" style={{ borderColor: "var(--cp-border)" }}>
      {(["chart", "table"] as const).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          aria-pressed={view === v}
          className="px-2.5 py-1 text-xs font-semibold capitalize transition-colors"
          style={{
            background: view === v ? "var(--cp-teal)" : "#fff",
            color: view === v ? "#fff" : "var(--cp-text-muted)",
          }}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

function mean(values: (number | null)[]): number | null {
  const nums = values.filter((v): v is number => v != null);
  if (!nums.length) return null;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10;
}

/* ── symptom severity over time ────────────────────────────────────────────── */

/**
 * Multi-series severity chart plus a series key.
 *
 * The key is not decoration: three of the five categorical slots fall below 3:1
 * against white, so the palette's contrast result obliges visible relief.
 * The swatch-plus-name-plus-value row is that relief — identity and value are
 * both readable without perceiving hue — and the table view is the second.
 */
export function SymptomTrendChart({
  block,
  windowDays,
}: {
  block: SymptomSeriesBlock;
  windowDays: number;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");

  const stats = useMemo(
    () =>
      block.series.map((s, i) => ({
        symptom: s.symptom,
        color: seriesColor(i),
        avg: mean(s.values),
        latest: [...s.values].reverse().find((v) => v != null) ?? null,
        daysScored: s.values.filter((v) => v != null).length,
      })),
    [block.series]
  );

  if (!block.series.length) {
    return (
      <ChartCard title="Symptom severity over time">
        <p className="text-sm py-6 text-center" style={{ color: "var(--cp-text-muted)" }}>
          No symptoms have been scored in this window.
        </p>
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Symptom severity over time"
      subtitle={`Severity 0–10, higher is worse · last ${windowDays} days${
        block.omitted > 0 ? ` · ${block.omitted} less-frequent symptom${block.omitted === 1 ? "" : "s"} not charted` : ""
      }`}
      action={<ViewToggle view={view} onChange={setView} />}
    >
      {view === "chart" ? (
        <>
          <TrendChart
            dates={block.dates}
            series={block.series.map((s) => ({ label: s.symptom, values: s.values }))}
            yMin={0}
            yMax={10}
            valueSuffix="/10"
            height={240}
          />
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 pt-3 border-t" style={{ borderColor: "var(--cp-border)" }}>
            {stats.map((s) => (
              <div key={s.symptom} className="flex items-center gap-1.5 text-xs">
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ background: s.color }}
                  aria-hidden="true"
                />
                <span style={{ color: "var(--cp-text)" }}>{s.symptom}</span>
                <span className="cp-tabular font-semibold" style={{ color: "var(--cp-text-muted)" }}>
                  avg {s.avg ?? "—"}
                </span>
              </div>
            ))}
          </div>
        </>
      ) : (
        <SeriesTable dates={block.dates} rows={block.series.map((s) => ({ label: s.symptom, values: s.values }))} />
      )}
    </ChartCard>
  );
}

/* ── per-symptom small multiples ───────────────────────────────────────────── */

/**
 * One mini chart per symptom. Every panel uses the same single hue on purpose:
 * the panel title carries identity here, so colour would be encoding nothing,
 * and a grid of differently-coloured panels reads as five unrelated widgets
 * rather than one comparison.
 */
export function SymptomSmallMultiples({ block }: { block: SymptomSeriesBlock }) {
  if (block.series.length < 2) return null;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      {block.series.map((s) => {
        const avg = mean(s.values);
        const scored = s.values.filter((v) => v != null).length;
        return (
          <div
            key={s.symptom}
            className="rounded-xl border p-3"
            style={{ background: "#fff", borderColor: "var(--cp-border)" }}
          >
            <div className="flex items-baseline justify-between gap-2 mb-1">
              <h4 className="text-xs font-bold truncate" style={{ color: "var(--cp-text)" }}>{s.symptom}</h4>
              <span className="text-xs cp-tabular flex-shrink-0" style={{ color: "var(--cp-text-muted)" }}>
                avg {avg ?? "—"} · {scored}d
              </span>
            </div>
            <TrendChart
              dates={block.dates}
              series={[{ label: s.symptom, values: s.values, color: SINGLE_SERIES_COLOR }]}
              yMin={0}
              yMax={10}
              valueSuffix="/10"
              height={110}
              fill
              showLegend={false}
            />
          </div>
        );
      })}
    </div>
  );
}

/* ── adherence over time ───────────────────────────────────────────────────── */

export function AdherenceTrendChart({
  block,
  windowDays,
}: {
  block: AdherenceSeriesBlock;
  windowDays: number;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const scored = block.values.filter((v) => v != null).length;

  if (!scored) {
    return (
      <ChartCard title="Medication adherence over time">
        <p className="text-sm py-6 text-center" style={{ color: "var(--cp-text-muted)" }}>
          No medication doses have been logged in this window.
        </p>
      </ChartCard>
    );
  }

  return (
    <ChartCard
      title="Medication adherence over time"
      subtitle={`Percent of each day's logged doses taken · last ${windowDays} days`}
      action={<ViewToggle view={view} onChange={setView} />}
    >
      {view === "chart" ? (
        <TrendChart
          dates={block.dates}
          series={[{ label: "Adherence", values: block.values, color: SINGLE_SERIES_COLOR }]}
          yMin={0}
          yMax={100}
          valueSuffix="%"
          height={180}
          fill
          showLegend={false}
        />
      ) : (
        <SeriesTable dates={block.dates} rows={[{ label: "Adherence %", values: block.values }]} />
      )}
    </ChartCard>
  );
}

/* ── table view (the accessibility channel) ────────────────────────────────── */

function SeriesTable({
  dates,
  rows,
}: {
  dates: string[];
  rows: { label: string; values: (number | null)[] }[];
}) {
  // Only days with at least one value — a table of 30 rows of "not logged" is
  // noise, and the gaps are already visible in the chart.
  const populated = dates
    .map((d, i) => ({ date: d, index: i }))
    .filter(({ index }) => rows.some((r) => r.values[index] != null));

  if (!populated.length) {
    return <p className="text-sm py-4 text-center" style={{ color: "var(--cp-text-muted)" }}>Nothing logged in this window.</p>;
  }

  return (
    <div className="overflow-x-auto -mx-1 px-1 max-h-72 overflow-y-auto">
      <table className="w-full text-xs border-collapse">
        <thead className="sticky top-0" style={{ background: "#fff" }}>
          <tr style={{ borderBottom: "1px solid var(--cp-border)" }}>
            <th className="text-left font-semibold py-1.5 pr-3" style={{ color: "var(--cp-text-muted)" }}>Date</th>
            {rows.map((r) => (
              <th key={r.label} className="text-right font-semibold py-1.5 pl-3" style={{ color: "var(--cp-text-muted)" }}>
                {r.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {populated.map(({ date, index }) => (
            <tr key={date} style={{ borderBottom: "1px solid var(--cp-border)" }}>
              <td className="py-1.5 pr-3 cp-tabular" style={{ color: "var(--cp-text)" }}>{shortDate(date)}</td>
              {rows.map((r) => (
                <td
                  key={r.label}
                  className="py-1.5 pl-3 text-right cp-tabular"
                  style={{ color: r.values[index] == null ? "var(--cp-text-muted)" : "var(--cp-text)" }}
                >
                  {r.values[index] ?? "—"}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
