"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { QuickTilesResponse, TimelineSeriesPoint } from "../../lib/types";
import { TREND_CFG, TrendChart, type TrendSpec } from "../../clinician/[patientId]/TrendChart";

// Dashboard Quick View: a "what's new" headline over three trend tiles
// (Sleep, Anxiety, Medication). The tiles reuse the demo timeline's
// TrendChart, fed from the link-checked /quick-tiles endpoint so they work
// for real patients, not just is_demo ones.

const RANGES = [
  { days: 30, label: "1M" },
  { days: 60, label: "2M" },
  { days: 90, label: "3M" },
];

type TileKey = QuickTilesResponse["domains"][number]["key"];

interface TileView {
  spec: TrendSpec;
  top: string;
  bottom: string;
  smooth: boolean;
}

const TILE_VIEW: Record<TileKey, TileView> = {
  sleep: { spec: { min: 0, max: 12, concern: { from: 0, to: 5 }, fmt: (v) => `${v}h` }, top: "Long", bottom: "Short", smooth: true },
  anxiety: { spec: { min: 0, max: 10, concern: { from: 7, to: 10 }, fmt: (v) => `${v}` }, top: "High", bottom: "Low", smooth: true },
  // Already a rolling 7-day percentage server-side — no further smoothing.
  medication: { spec: { min: 0, max: 100, concern: { from: 0, to: 50 }, fmt: (v) => `${v}%` }, top: "All taken", bottom: "None", smooth: false },
};

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function round1(v: number): string {
  return v.toFixed(1).replace(/\.0$/, "");
}

/** 1-2-1 weighted average over each day and its neighbours; a single missing
 * day is bridged, a longer gap breaks the line. Same as the timeline. */
function smoothLine(raw: (number | null)[]): (number | null)[] {
  return raw.map((v, i) => {
    const parts: [number | null, number][] = [[raw[i - 1] ?? null, 1], [v, 2], [raw[i + 1] ?? null, 1]];
    const present = parts.filter(([pv]) => pv != null) as [number, number][];
    if (present.length === 0 || (v == null && present.length < 2)) return null;
    const w = present.reduce((a, [, pw]) => a + pw, 0);
    return present.reduce((a, [pv, pw]) => a + pv * pw, 0) / w;
  });
}

/** One factual line under each tile — computed from the logged values only. */
function caption(key: TileKey, series: TimelineSeriesPoint[], data: QuickTilesResponse): string {
  const logged = series.filter((p) => p.value != null) as { date: string; value: number }[];

  if (key === "medication") {
    if (data.doses_expected === 0) return "No doses logged in this period";
    if (data.doses_missed === 0) return `All ${data.doses_expected} logged doses taken`;
    return `${data.doses_missed} missed of ${data.doses_expected} logged doses`;
  }

  if (logged.length === 0) return `No ${key} logged in this period`;
  const avg = logged.reduce((a, p) => a + p.value, 0) / logged.length;

  if (key === "sleep") {
    const short = logged.filter((p) => p.value < 5).length;
    return short > 0
      ? `Averaging ${round1(avg)}h a night · under 5h on ${short} night${short !== 1 ? "s" : ""}`
      : `Averaging ${round1(avg)}h a night`;
  }

  const peak = logged.reduce((a, p) => (p.value > a.value ? p : a));
  return peak.value - avg >= 1
    ? `Averaging ${round1(avg)}/10 · peaked ${round1(peak.value)}/10 on ${fmtDate(peak.date)}`
    : `Averaging ${round1(avg)}/10`;
}

export function QuickView({ patientId }: { patientId: number }) {
  const [windowDays, setWindowDays] = useState(30);
  const [tiles, setTiles] = useState<QuickTilesResponse | null>(null);
  const [headline, setHeadline] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getClinicianQuickTiles(patientId, windowDays)
      .then((res) => { if (!cancelled) { setTiles(res as QuickTilesResponse); setError(false); } })
      .catch(() => { if (!cancelled) setError(true); });
    // The headline is a separate, slower call (live LLM with a deterministic
    // fallback) — the tiles never wait on it.
    api
      .getSymptomTicker(patientId, windowDays)
      .then((res) => { if (!cancelled) setHeadline((res as { headline?: string }).headline ?? null); })
      .catch(() => { if (!cancelled) setHeadline(null); });
    return () => { cancelled = true; };
  }, [patientId, windowDays]);

  const hasEpisodes = !!tiles?.events.some((e) => e.type === "episode");
  const hasMedChanges = !!tiles?.events.some((e) => e.type === "med_change");

  return (
    <div className="clinician-tiles space-y-4">
      {headline && (
        <div
          className="rounded-xl px-4 py-3 flex items-baseline gap-3 flex-wrap sm:flex-nowrap"
          style={{ background: "var(--cp-amber-light)", border: "1px solid var(--cp-amber)" }}
        >
          <span
            className="text-[11px] font-bold uppercase flex-shrink-0"
            style={{ color: "var(--cp-amber)", letterSpacing: "0.12em" }}
          >
            What&apos;s new
          </span>
          <p className="text-sm leading-snug" style={{ color: "var(--cp-text)" }}>{headline}</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm" style={{ color: "var(--cp-text-muted)" }}>
          {tiles
            ? `${fmtDate(tiles.dates[0])} to ${fmtDate(tiles.dates[tiles.dates.length - 1])} · ${tiles.days_logged} of ${tiles.window_days} days logged`
            : " "}
        </p>
        <div className="flex gap-2">
          {RANGES.map((r) => (
            <button
              key={r.days}
              onClick={() => setWindowDays(r.days)}
              aria-pressed={windowDays === r.days}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors"
              style={{
                background: windowDays === r.days ? "var(--cp-teal)" : "#fff",
                color: windowDays === r.days ? "#fff" : "var(--cp-text)",
                borderColor: "var(--cp-border)",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl border p-6 text-center" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
          <p className="text-sm" style={{ color: "var(--cp-text-muted)" }}>Could not load trends.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {(["sleep", "anxiety", "medication"] as TileKey[]).map((key) => {
            const domain = tiles?.domains.find((d) => d.key === key);
            const view = TILE_VIEW[key];
            const raw = domain?.series.map((p) => p.value) ?? [];
            const line = view.smooth ? smoothLine(raw) : raw;
            return (
              <div
                key={key}
                className="rounded-xl border p-4"
                style={{ background: "#fff", borderColor: "var(--cp-border)", opacity: tiles && tiles.window_days !== windowDays ? 0.6 : 1 }}
              >
                <h3 className="text-base font-bold" style={{ color: "var(--cp-text)" }}>
                  {domain?.label ?? key.charAt(0).toUpperCase() + key.slice(1)}
                </h3>
                <div className="grid grid-cols-[auto_1fr] gap-2 mt-2">
                  <div className="flex flex-col justify-between text-[11px] py-0.5" style={{ color: "var(--cp-text-muted)" }}>
                    <span>{view.top}</span>
                    <span>{view.bottom}</span>
                  </div>
                  <div style={{ aspectRatio: `${TREND_CFG.tile.vbW} / ${TREND_CFG.tile.vbH}` }}>
                    {tiles && domain && (
                      <TrendChart dates={tiles.dates} raw={raw} line={line} spec={view.spec} events={tiles.events} size="tile" />
                    )}
                  </div>
                </div>
                <p className="text-sm mt-3" style={{ color: "var(--cp-text)" }}>
                  {tiles && domain ? caption(key, domain.series, tiles) : " "}
                </p>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: "var(--cp-text-muted)" }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3" style={{ background: "#FDEBE3", border: "1px solid #C2410C", borderRadius: 2 }} />
          Watch zone
        </span>
        {hasEpisodes && (
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3" style={{ background: "#F7C1C1", borderRadius: 2 }} />
            Episode
          </span>
        )}
        {hasMedChanges && (
          <span className="flex items-center gap-1.5">
            <svg width="20" height="10" aria-hidden="true">
              <line x1="0" y1="5" x2="20" y2="5" stroke="#1A2420" strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="5,4" />
            </svg>
            Med change
          </span>
        )}
      </div>
    </div>
  );
}
