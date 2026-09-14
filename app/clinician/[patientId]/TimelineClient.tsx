"use client";

import { useEffect, useState } from "react";
import { Lora } from "next/font/google";
import { api } from "../../lib/api";
import type { TimelineAxis, TimelineDomain, TimelineExtremePoint, TimelineResponse, TimelineSeriesPoint, TimelineWindow } from "../../lib/types";
import { TimelineChart, type PointRange } from "./TimelineChart";

// The "these are the caregiver's actual words" treatment — same role Lora
// italic plays for verbatim quotes elsewhere in the clinician-facing UI.
// `variable` exposes it as var(--font-voice), scoped via lora.variable below,
// so verbatim note text can reference the token by name (see globals.css).
const lora = Lora({ subsets: ["latin"], weight: ["500"], style: ["italic"], display: "swap", variable: "--font-voice" });

const WINDOW_LABELS: { key: TimelineWindow; label: string }[] = [
  { key: "1m", label: "1M" },
  { key: "2m", label: "2M" },
  { key: "3m", label: "3M" },
  { key: "12m", label: "12M" },
];

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtGeneratedAt(iso: string | null): string {
  if (!iso) return "not yet generated";
  const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  return `Updated ${d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// A single noisy day isn't a trend — the chart always renders the
// server-computed weekly average (re-bucketed into a band where applicable),
// never the raw daily series. Observation cards below still read the daily
// series directly, since those need day-level precision.
function weeklyChartData(domain: TimelineDomain): { series: TimelineSeriesPoint[]; dates: string[]; ranges: PointRange[] } {
  const series = domain.weekly_series.map((w) => ({ date: w.week_start, band: w.band, value: w.value }));
  const dates = domain.weekly_series.map((w) => w.week_start);
  const ranges: PointRange[] = domain.weekly_series.map((w) => ({ start: w.week_start, end: w.week_end }));
  return { series, dates, ranges };
}

function formatExtreme(p: TimelineExtremePoint, axis: TimelineAxis, bandLabels: Record<string, string> | null): string {
  if (axis === "numeric" && p.value != null) return `${p.value}`;
  if (p.band) return bandLabels?.[p.band] ?? cap(p.band);
  return "—";
}

// ── Deterministic observation cards (no LLM) ─────────────────────────────────
//
// One card per category, in this priority order, each SKIPPED (not invented)
// when the domain has nothing to say for it:
//   1. band crossing   — the most recent day the band changed (band axis only)
//   2. record high/low — the day of the window's most extreme raw value
//   3. streak boundary — the start date of the current trailing same-band run
//      (band axis only — a numeric domain like Weight has no "band" to hold
//      a streak in, so it only ever produces the record-high/low card).
interface ObservationCard {
  date: string;
  text: string;
}

function deriveObservationCards(domain: TimelineDomain): ObservationCard[] {
  const cards: ObservationCard[] = [];
  const series = domain.series;

  if (domain.axis === "band") {
    const logged = series.filter((p) => p.band != null);
    for (let i = logged.length - 1; i > 0; i--) {
      if (logged[i].band !== logged[i - 1].band) {
        cards.push({ date: logged[i].date, text: `Crossed from ${cap(logged[i - 1].band!)} to ${cap(logged[i].band!)}` });
        break;
      }
    }
  }

  const withValue = series.filter((p) => p.value != null) as { date: string; value: number }[];
  if (withValue.length > 0) {
    const max = withValue.reduce((a, b) => (b.value > a.value ? b : a));
    const min = withValue.reduce((a, b) => (b.value < a.value ? b : a));
    const pick = new Date(max.date) >= new Date(min.date) ? { p: max, label: "high" } : { p: min, label: "low" };
    if (max.value !== min.value) {
      cards.push({ date: pick.p.date, text: `Record ${pick.label} of ${pick.p.value}` });
    }
  }

  if (domain.axis === "band") {
    const logged = series.filter((p) => p.band != null);
    if (logged.length > 0) {
      const currentBand = logged[logged.length - 1].band!;
      let idx = logged.length - 1;
      while (idx > 0 && logged[idx - 1].band === currentBand) idx--;
      // Only worth a card if it's a genuine boundary (not day one of the window).
      if (idx > 0) {
        cards.push({ date: logged[idx].date, text: `${cap(currentBand)} since` });
      }
    }
  }

  return cards.slice(0, 3);
}

// ── "AI Summary · Notes Synthesis" — shared container styling for both the
// main compact multi-domain list and the overlay's single-domain notes ──────

function SynthesisCard({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="relative overflow-hidden"
      style={{ background: "var(--surface-1)", border: "1px solid var(--accent)", borderRadius: 14 }}
    >
      <div
        aria-hidden="true"
        className="absolute top-0 left-0"
        style={{
          width: 0, height: 0,
          borderTop: "18px solid var(--med-change-line)",
          borderRight: "18px solid transparent",
          opacity: 0.55,
        }}
      />
      <div className="px-5 py-4">{children}</div>
    </div>
  );
}

function SynthesisDisclaimer() {
  return (
    <p className="mt-3 pt-3" style={{ fontSize: 11, color: "var(--text-secondary)", borderTop: "1px solid var(--border)" }}>
      AI-generated synthesis of caregiver notes. Attributed observations only — not a diagnosis.
    </p>
  );
}

function VerbatimNote({ date, author, text }: { date: string; author: string; text: string }) {
  return (
    <div className="rounded-lg px-3 py-2.5" style={{ background: "var(--surface-0)" }}>
      <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{fmtDate(date)} · {author}</p>
      <p style={{ fontFamily: "var(--font-voice)", fontSize: 15, lineHeight: 1.5, marginTop: 2 }}>{text}</p>
    </div>
  );
}

export default function TimelineClient({ patientId }: { patientId: number }) {
  const [window_, setWindow] = useState<TimelineWindow>("1m");
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [error, setError] = useState(false);
  const [overlayDomain, setOverlayDomain] = useState<string | null>(null);
  const [otherNotesOpen, setOtherNotesOpen] = useState(false);
  const [weekFilter, setWeekFilter] = useState<{ start: string; end: string } | null>(null);

  function openOverlay(key: string) {
    setWeekFilter(null);
    setOverlayDomain(key);
  }
  function closeOverlay() {
    setWeekFilter(null);
    setOverlayDomain(null);
  }

  useEffect(() => {
    let cancelled = false;
    setError(false);
    api
      .getClinicianTimeline(patientId, window_)
      .then((res) => {
        if (!cancelled) setData(res as TimelineResponse);
      })
      .catch(() => {
        if (!cancelled) setError(true);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId, window_]);

  // Poll while a regeneration is in flight so the "pending" indicator and
  // the headline itself clear on their own once the background task
  // finishes — a clinician shouldn't have to manually refresh mid-demo.
  useEffect(() => {
    if (!data?.pending) return;
    const id = setInterval(() => {
      api.getClinicianTimeline(patientId, window_).then((res) => setData(res as TimelineResponse)).catch(() => {});
    }, 4000);
    return () => clearInterval(id);
  }, [data?.pending, patientId, window_]);

  // Overlay respects the current window: closing/reopening or switching
  // windows while it's open just re-renders against whatever `data` now is.
  useEffect(() => {
    if (!overlayDomain) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") closeOverlay();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlayDomain]);

  if (error) {
    return (
      <div className="clinician-timeline flex items-center justify-center min-h-screen">
        <p style={{ color: "var(--text-secondary)" }}>Could not load the timeline.</p>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="clinician-timeline flex items-center justify-center min-h-screen">
        <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const overlayDomainData = data.domains.find((d) => d.key === overlayDomain) ?? null;

  return (
    <div className={`${lora.variable} clinician-timeline px-6 py-8 max-w-[1100px] mx-auto`}>
      {/* Header */}
      <h1 style={{ fontSize: 22, fontWeight: 600 }}>{data.patient.name}</h1>
      <p className="tl-tabular mt-1" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
        {fmtDate(data.patient.range_start)}–{fmtDate(data.patient.range_end)} ·{" "}
        {data.patient.days_logged} of {data.patient.days_in_range} days logged · logged by{" "}
        {data.patient.authors.join(", ")}
      </p>

      {/* Headline */}
      <div
        className="mt-4 p-4"
        style={{ background: "var(--surface-1)", borderRadius: 12, fontSize: 18, lineHeight: 1.5 }}
      >
        {data.headline}
        <div className="flex items-center gap-2 mt-2" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          <span>{fmtGeneratedAt(data.headline_generated_at)}</span>
          {data.pending && (
            <span className="flex items-center gap-1">
              <span
                className="inline-block w-2 h-2 rounded-full animate-pulse"
                style={{ background: "var(--accent)" }}
              />
              updating…
            </span>
          )}
        </div>
      </div>

      {/* Time toggle */}
      <div className="flex gap-2 mt-5">
        {WINDOW_LABELS.map(({ key, label }) => {
          const available = data.available_windows.includes(key);
          const active = window_ === key;
          return (
            <button
              key={key}
              disabled={!available}
              onClick={() => setWindow(key)}
              aria-pressed={active}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors"
              style={{
                background: active ? "var(--accent)" : "var(--surface-1)",
                color: active ? "#fff" : available ? "var(--text-primary)" : "var(--text-secondary)",
                borderColor: "var(--border)",
                opacity: available ? 1 : 0.45,
                cursor: available ? "pointer" : "not-allowed",
              }}
            >
              {label}
            </button>
          );
        })}
      </div>

      {/* Domain tile grid */}
      <div
        className="mt-5"
        style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}
      >
        {data.domains.map((d) => {
          const weekly = weeklyChartData(d);
          return (
            <button
              key={d.key}
              onClick={() => openOverlay(d.key)}
              className="text-left border relative"
              style={{ background: "var(--surface-1)", borderRadius: 14, borderColor: "var(--border)", padding: "16px 18px" }}
            >
              <div className="flex items-center justify-between">
                <span style={{ fontSize: 16, fontWeight: 600 }}>{d.label}</span>
                {/* Maximize icon — purely an affordance; the whole tile opens the overlay. */}
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" aria-hidden="true">
                  <path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div style={{ aspectRatio: "300 / 140", marginTop: 8 }}>
                <TimelineChart
                  dates={weekly.dates}
                  series={weekly.series}
                  axis={d.axis}
                  events={data.events}
                  size="small"
                  pointRanges={weekly.ranges}
                  bandLabels={d.band_labels}
                />
              </div>
              <p className="mt-1" style={{ fontSize: 13, color: "var(--text-secondary)" }}>{d.caption}</p>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-4" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
        <span className="flex items-center gap-1.5">
          <span className="inline-block w-3 h-3" style={{ background: "var(--episode-band)", borderRadius: 2 }} />
          Episode
        </span>
        <span className="flex items-center gap-1.5">
          <svg width="20" height="10" aria-hidden="true">
            <line x1="0" y1="5" x2="20" y2="5" stroke="var(--med-change-line)" strokeWidth={1.5} strokeDasharray="4,3" />
          </svg>
          Med change
        </span>
      </div>

      {/* Caregiver notes — compact multi-domain synthesis; each row opens
          the same full-screen overlay the grid tiles do. */}
      <div className="mt-8">
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Caregiver notes</h2>
        <p className="mt-1 mb-3" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Summaries are generated. Entries are shown exactly as written.
        </p>

        <SynthesisCard>
          <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--accent)" }}>
            AI SUMMARY · NOTES SYNTHESIS
          </p>
          <div className="mt-2 divide-y" style={{ borderColor: "var(--border)" }}>
            {data.domains.map((d) => (
              <button
                key={d.key}
                onClick={() => openOverlay(d.key)}
                className="w-full flex items-start justify-between gap-4 py-3 text-left"
              >
                <div className="min-w-0">
                  <p style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-secondary)" }}>
                    {d.label.toUpperCase()}
                  </p>
                  <p
                    className="mt-1"
                    style={{
                      fontSize: 13, lineHeight: 1.5, color: "var(--text-primary)",
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden",
                    }}
                  >
                    {d.summary}
                  </p>
                </div>
                <span className="flex-shrink-0 whitespace-nowrap" style={{ fontSize: 12, color: "var(--accent)" }}>
                  {d.notes.length} note{d.notes.length !== 1 ? "s" : ""} ›
                </span>
              </button>
            ))}
          </div>
          <SynthesisDisclaimer />
        </SynthesisCard>

        {/* Unassigned bucket — no chart to open an overlay onto, so it stays
            a simple inline expander. */}
        <div className="mt-3">
          <button
            onClick={() => setOtherNotesOpen((v) => !v)}
            aria-expanded={otherNotesOpen}
            className="w-full flex items-center justify-between text-left gap-4"
          >
            <span style={{ fontSize: 14, fontWeight: 600 }}>Other notes</span>
            <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{data.other_notes.length} entries</span>
          </button>
          {otherNotesOpen && (
            <div className="mt-3 space-y-2">
              {data.other_notes.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Nothing unassigned this window.</p>
              ) : (
                data.other_notes.map((n) => <VerbatimNote key={`${n.date}-${n.author}`} date={n.date} author={n.author} text={n.text} />)
              )}
            </div>
          )}
        </div>
      </div>

      {/* Full-screen overlay */}
      {overlayDomainData && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto clinician-timeline"
          style={{ background: "var(--surface-0)" }}
        >
          <div className="max-w-[1240px] mx-auto px-8 py-8">
            <div className="flex items-start justify-between">
              <div>
                <h2 style={{ fontSize: 28, fontWeight: 600 }}>{overlayDomainData.label}</h2>
                <p className="tl-tabular mt-1" style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                  {data.patient.name} · {fmtDate(data.patient.range_start)}–{fmtDate(data.patient.range_end)}
                </p>
              </div>
              <button
                onClick={closeOverlay}
                aria-label="Close"
                className="rounded-full p-2"
                style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>
            </div>

            {(() => {
              const weekly = weeklyChartData(overlayDomainData);
              return (
                <div className="mt-6" style={{ height: 400 }}>
                  <TimelineChart
                    dates={weekly.dates}
                    series={weekly.series}
                    axis={overlayDomainData.axis}
                    events={data.events}
                    size="large"
                    pointRanges={weekly.ranges}
                    bandLabels={overlayDomainData.band_labels}
                    onPointClick={(i) => setWeekFilter(weekly.ranges[i])}
                  />
                </div>
              );
            })()}

            {/* Monthly highs & lows */}
            {overlayDomainData.monthly_extremes.length > 0 && (
              <div className="mt-6">
                <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-secondary)" }}>
                  MONTHLY HIGH / LOW
                </p>
                <div className="mt-2 grid gap-3" style={{ gridTemplateColumns: `repeat(${overlayDomainData.monthly_extremes.length}, 1fr)` }}>
                  {overlayDomainData.monthly_extremes.map((m) => (
                    <div key={m.month} className="p-3 border" style={{ borderRadius: 10, borderColor: "var(--border)", background: "var(--surface-1)" }}>
                      <p style={{ fontSize: 13, fontWeight: 600 }}>{m.month}</p>
                      <p className="mt-1" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        High: {formatExtreme(m.high, overlayDomainData.axis, overlayDomainData.band_labels)} ({fmtDate(m.high.date)})
                      </p>
                      <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        Low: {formatExtreme(m.low, overlayDomainData.axis, overlayDomainData.band_labels)} ({fmtDate(m.low.date)})
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deterministic observation cards */}
            {(() => {
              const cards = deriveObservationCards(overlayDomainData);
              if (cards.length === 0) return null;
              return (
                <div className="mt-6 grid gap-3" style={{ gridTemplateColumns: `repeat(${cards.length}, 1fr)` }}>
                  {cards.map((c, i) => (
                    <div key={i} className="p-3 border" style={{ borderRadius: 10, borderColor: "var(--border)", background: "var(--surface-1)" }}>
                      <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>{fmtDate(c.date)}</p>
                      <p className="mt-1" style={{ fontSize: 14, fontWeight: 500 }}>{c.text}</p>
                    </div>
                  ))}
                </div>
              );
            })()}

            {/* This domain's notes, in the same synthesis-card container.
                Clicking a week on the chart above scopes this list to that
                week; the summary paragraph only makes sense unscoped, so it
                hides while a week filter is active. */}
            <div className="mt-6">
              <SynthesisCard>
                <div className="flex items-center justify-between gap-4">
                  <p style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", color: "var(--accent)" }}>
                    AI SUMMARY · {overlayDomainData.label.toUpperCase()}
                  </p>
                  {weekFilter && (
                    <button
                      onClick={() => setWeekFilter(null)}
                      style={{ fontSize: 12, color: "var(--accent)", whiteSpace: "nowrap" }}
                    >
                      Clear week filter ×
                    </button>
                  )}
                </div>
                {weekFilter ? (
                  <p className="mt-2" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                    Showing notes for the week of {fmtDate(weekFilter.start)}–{fmtDate(weekFilter.end)}.
                  </p>
                ) : (
                  <p className="mt-2" style={{ fontSize: 14, lineHeight: 1.6 }}>{overlayDomainData.summary}</p>
                )}
                {(() => {
                  const visibleNotes = weekFilter
                    ? overlayDomainData.notes.filter((n) => n.date >= weekFilter.start && n.date <= weekFilter.end)
                    : overlayDomainData.notes;
                  if (visibleNotes.length === 0) {
                    return (
                      <p className="mt-3" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        {weekFilter ? "No notes logged that week." : "No caregiver notes on record."}
                      </p>
                    );
                  }
                  return (
                    <div className="mt-3 space-y-2">
                      {visibleNotes.map((n) => (
                        <VerbatimNote key={`${n.date}-${n.author}`} date={n.date} author={n.author} text={n.text} />
                      ))}
                    </div>
                  );
                })()}
                <SynthesisDisclaimer />
              </SynthesisCard>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
