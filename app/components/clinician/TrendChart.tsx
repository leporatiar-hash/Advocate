"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CHART_INK, seriesColor, fillFor, shortDate } from "../../lib/chartTheme";

export interface ChartSeries {
  label: string;
  values: (number | null)[];
  /** Explicit colour overrides the categorical slot. Used by single-series
   *  charts, where colour carries no identity. */
  color?: string;
}

interface TrendChartProps {
  dates: string[];
  series: ChartSeries[];
  yMin?: number;
  yMax?: number;
  /** Appended to the tooltip value, e.g. "/10" or "%". */
  valueSuffix?: string;
  height?: number;
  /** Area fill under the line. Only legible with a single series. */
  fill?: boolean;
  /** Legend is mandatory for 2+ series (identity must never be colour-alone);
   *  a single series is named by its card title, so it doesn't need one. */
  showLegend?: boolean;
}

/**
 * Chart.js line chart, loaded in the browser only.
 *
 * `output: "export"` prerenders every page at build time, so Chart.js — which
 * needs a real canvas — is dynamically imported inside an effect rather than at
 * module scope. The canvas renders as an empty box during prerender and fills in
 * on mount.
 *
 * Gaps are gaps: `spanGaps` is false throughout. A day the caregiver didn't log
 * must not be bridged by a line implying continuity, and it must never be
 * plotted as zero — on a severity axis zero reads as "a good day", which is the
 * opposite of "we don't know".
 */
export function TrendChart({
  dates,
  series,
  yMin = 0,
  yMax = 10,
  valueSuffix = "",
  height = 200,
  fill = false,
  showLegend,
}: TrendChartProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chartRef = useRef<any>(null);
  const [failed, setFailed] = useState(false);

  const legendVisible = showLegend ?? series.length > 1;

  // Callers build `series` inline, so it is a new array identity on every
  // render. Keying the effect on the data's *content* stops the canvas being
  // torn down and rebuilt (and visibly flickering) whenever the parent
  // re-renders for an unrelated reason.
  const dataKey = useMemo(() => JSON.stringify({ dates, series }), [dates, series]);

  useEffect(() => {
    let cancelled = false;

    async function draw() {
      const canvas = canvasRef.current;
      if (!canvas) return;
      try {
        const { default: Chart } = await import("chart.js/auto");
        if (cancelled) return;

        chartRef.current?.destroy();

        // Chart.js's config generics are deeply parameterised and scriptable
        // options (pointRadius below) don't narrow cleanly against them. The
        // shape is validated by Chart.js at runtime; typing it loosely here
        // keeps the rest of the file strictly typed.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const config: any = {
          type: "line",
          data: {
            labels: dates.map(shortDate),
            datasets: series.map((s, i) => {
              const color = s.color ?? seriesColor(i);
              return {
                label: s.label,
                data: s.values,
                borderColor: color,
                backgroundColor: fill ? fillFor(color) : color,
                borderWidth: 2,
                tension: 0.3,
                fill,
                spanGaps: false,
                // Points are hidden until hover so the line stays thin, but an
                // isolated value with gaps either side would otherwise be
                // invisible — Chart.js draws no segment for it. Showing points
                // only where a neighbour is missing keeps those days visible
                // without peppering a dense line.
                pointRadius: (ctx: { dataIndex: number }) => {
                  const v = s.values;
                  const i2 = ctx.dataIndex;
                  if (v[i2] == null) return 0;
                  const isolated = v[i2 - 1] == null && v[i2 + 1] == null;
                  return isolated ? 3 : 0;
                },
                pointHoverRadius: 5,
                pointBackgroundColor: color,
                pointBorderColor: CHART_INK.surface,
                pointBorderWidth: 2,
              };
            }),
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            // Crosshair-style read: hovering anywhere in a column surfaces
            // every series for that day, not just the nearest point.
            interaction: { mode: "index", intersect: false },
            scales: {
              y: {
                min: yMin,
                max: yMax,
                border: { display: false },
                grid: { color: CHART_INK.gridline },
                ticks: {
                  color: CHART_INK.textMuted,
                  font: { size: 11 },
                  maxTicksLimit: 5,
                },
              },
              x: {
                border: { color: CHART_INK.axis },
                grid: { display: false },
                ticks: {
                  color: CHART_INK.textMuted,
                  font: { size: 11 },
                  maxTicksLimit: 6,
                  autoSkip: true,
                },
              },
            },
            plugins: {
              legend: {
                display: legendVisible,
                position: "bottom",
                labels: {
                  color: CHART_INK.textSecondary,
                  boxWidth: 10,
                  boxHeight: 10,
                  usePointStyle: true,
                  pointStyle: "circle",
                  padding: 14,
                  font: { size: 11.5 },
                },
              },
              tooltip: {
                backgroundColor: "#1F2937",
                titleColor: "#FFFFFF",
                bodyColor: "#E5E7EB",
                padding: 10,
                cornerRadius: 8,
                displayColors: true,
                usePointStyle: true,
                callbacks: {
                  label: (ctx: { dataset: { label?: string }; parsed: { y: number | null } }) =>
                    ctx.parsed.y == null
                      ? `${ctx.dataset.label}: not logged`
                      : `${ctx.dataset.label}: ${ctx.parsed.y}${valueSuffix}`,
                },
              },
            },
          },
        };

        chartRef.current = new Chart(canvas, config);
      } catch {
        // A chart failing to load must never take the portal down with it —
        // the numeric sections below carry the same information.
        if (!cancelled) setFailed(true);
      }
    }

    void draw();
    return () => {
      cancelled = true;
      chartRef.current?.destroy();
      chartRef.current = null;
    };
    // `dataKey` stands in for `dates`/`series` by content — see the useMemo above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataKey, yMin, yMax, valueSuffix, fill, legendVisible]);

  if (failed) {
    return (
      <div
        className="flex items-center justify-center rounded-lg text-xs"
        style={{ height, color: CHART_INK.textMuted, background: "#FAFAF7" }}
      >
        Chart unavailable — see the figures below.
      </div>
    );
  }

  return (
    <div style={{ position: "relative", height }}>
      <canvas ref={canvasRef} role="img" aria-label={
        series.length === 1
          ? `Trend chart for ${series[0].label}`
          : `Trend chart comparing ${series.map((s) => s.label).join(", ")}`
      } />
    </div>
  );
}
