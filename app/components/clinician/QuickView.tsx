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

interface TileModel {
  key: TileKey;
  label: string;
  view: TileView;
  raw: (number | null)[];
  line: (number | null)[];
  caption: string;
}

export function QuickView({ patientId }: { patientId: number }) {
  const [windowDays, setWindowDays] = useState(30);
  const [tiles, setTiles] = useState<QuickTilesResponse | null>(null);
  const [headline, setHeadline] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState<TileKey | null>(null);

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

  useEffect(() => {
    if (!expanded) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setExpanded(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [expanded]);

  const models: TileModel[] = (["sleep", "anxiety", "medication"] as TileKey[]).map((key) => {
    const domain = tiles?.domains.find((d) => d.key === key);
    const view = TILE_VIEW[key];
    const raw = domain?.series.map((p) => p.value) ?? [];
    return {
      key,
      label: domain?.label ?? key.charAt(0).toUpperCase() + key.slice(1),
      view,
      raw,
      line: view.smooth ? smoothLine(raw) : raw,
      caption: tiles && domain ? caption(key, domain.series, tiles) : "",
    };
  });
  const open = models.find((m) => m.key === expanded) ?? null;

  const hasEpisodes = !!tiles?.events.some((e) => e.type === "episode");
  const hasMedChanges = !!tiles?.events.some((e) => e.type === "med_change");
  const rangeText = tiles
    ? `${fmtDate(tiles.dates[0])} to ${fmtDate(tiles.dates[tiles.dates.length - 1])}`
    : "";

  return (
    <div className="clinician-tiles space-y-4">
      {headline && (
        <div
          className="rounded-xl px-4 py-3 flex items-baseline gap-3 flex-wrap sm:flex-nowrap"
          style={{ background: "#fff", border: "1px solid var(--cp-border)" }}
        >
          <span
            className="text-[11px] font-bold uppercase flex-shrink-0"
            style={{ color: "var(--cp-text-muted)", letterSpacing: "0.12em" }}
          >
            What&apos;s new
          </span>
          <p className="text-sm leading-snug" style={{ color: "var(--cp-text)" }}>{headline}</p>
        </div>
      )}

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm" style={{ color: "var(--cp-text-muted)" }}>
          {tiles ? `${rangeText} · ${tiles.days_logged} of ${tiles.window_days} days logged` : " "}
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
          {models.map((m) => (
            <button
              key={m.key}
              type="button"
              onClick={() => tiles && setExpanded(m.key)}
              aria-label={`Open ${m.label} full screen`}
              className="text-left rounded-xl border p-4 transition-shadow hover:shadow-md"
              style={{ background: "#fff", borderColor: "var(--cp-border)", opacity: tiles && tiles.window_days !== windowDays ? 0.6 : 1 }}
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-base font-bold" style={{ color: "var(--cp-text)" }}>{m.label}</h3>
                <ExpandIcon />
              </div>
              <div className="grid grid-cols-[auto_1fr] gap-2 mt-2">
                <div className="flex flex-col justify-between text-[11px] py-0.5" style={{ color: "var(--cp-text-muted)" }}>
                  <span>{m.view.top}</span>
                  <span>{m.view.bottom}</span>
                </div>
                <div style={{ aspectRatio: `${TREND_CFG.tile.vbW} / ${TREND_CFG.tile.vbH}` }}>
                  {tiles && (
                    <TrendChart dates={tiles.dates} raw={m.raw} line={m.line} spec={m.view.spec} events={tiles.events} size="tile" plain />
                  )}
                </div>
              </div>
              <p className="text-sm mt-3" style={{ color: "var(--cp-text)" }}>{m.caption || " "}</p>
            </button>
          ))}
        </div>
      )}

      {(hasEpisodes || hasMedChanges) && (
        <div className="flex flex-wrap items-center gap-4 text-xs" style={{ color: "var(--cp-text-muted)" }}>
          {hasEpisodes && (
            <span className="flex items-center gap-1.5">
              <span className="inline-block w-3 h-3" style={{ background: "#E5E7EB", borderRadius: 2 }} />
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
      )}

      {/* Full-screen view of one tile */}
      {open && tiles && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`${open.label} trend`}
          className="clinician-tiles fixed inset-0 z-50 overflow-y-auto"
          style={{ background: "var(--surface-0)" }}
        >
          <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 style={{ fontSize: 28, fontWeight: 600, color: "var(--cp-text)" }}>{open.label}</h2>
                <p className="mt-1 text-sm" style={{ color: "var(--cp-text-muted)" }}>{rangeText}</p>
              </div>
              <button
                onClick={() => setExpanded(null)}
                aria-label="Close"
                className="rounded-full p-2 flex-shrink-0"
                style={{ background: "#fff", border: "1px solid var(--cp-border)" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>
            <div
              className="mt-6 p-2"
              style={{ background: "#fff", border: "1px solid var(--cp-border)", borderRadius: 14, aspectRatio: `${TREND_CFG.large.vbW} / ${TREND_CFG.large.vbH}` }}
            >
              <TrendChart dates={tiles.dates} raw={open.raw} line={open.line} spec={open.view.spec} events={tiles.events} size="large" plain />
            </div>
            <p className="mt-4 text-base" style={{ color: "var(--cp-text)" }}>{open.caption}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--cp-text-muted)" strokeWidth="2" aria-hidden="true">
      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
