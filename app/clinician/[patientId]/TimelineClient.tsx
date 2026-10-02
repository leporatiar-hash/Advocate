"use client";

import { useEffect, useMemo, useState } from "react";
import { Lora } from "next/font/google";
import { api } from "../../lib/api";
import type { TimelineDomain, TimelineEventItem, TimelineExtremePoint, TimelineNote, TimelineResponse, TimelineWindow } from "../../lib/types";
import { TREND_CFG, TrendAxis, TrendChart, type TrendSpec } from "./TrendChart";

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

const ALERT = "#C2410C";

const AUTHOR_COLOR: Record<string, string> = {
  mom: "#0F6B66",
  dad: "#4F46E5",
  brother: "#B45309",
};

function fmtDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtWeekday(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtGeneratedAt(iso: string | null): string {
  if (!iso) return "not yet generated";
  const d = new Date(iso.endsWith("Z") ? iso : `${iso}Z`);
  return `Updated ${d.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;
}

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Real value with its unit where one exists (e.g. "9/10", "1h", "0%");
 * socialization has no number, so it falls back to its level word. */
function formatExtreme(p: TimelineExtremePoint, key: string): string {
  const view = DOMAIN_VIEW[key];
  if (p.value != null && view) {
    const unit = view.unit === "lb" ? " lb" : view.unit;
    return `${view.fmtValue(p.value)}${unit}`;
  }
  if (p.band) return key === "socialization" ? SOCIAL_WORDS[SOCIAL_LEVEL[p.band]] ?? cap(p.band) : cap(p.band);
  return "—";
}

/** The AI headline quotes dates as ISO strings; render them like every other
 * date on the page. */
function prettyDates(text: string): string {
  return text.replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (iso) => fmtDate(iso));
}

// ── Per-domain chart model ───────────────────────────────────────────────────
//
// Charts plot the DAILY logged value on a fixed, domain-specific scale (so a
// 9/10 anxiety day always sits in the same place), with a lightly smoothed
// trend line on top and a shaded watch zone. Socialization has no raw number,
// so its three bands plot as 1/2/3.

const SOCIAL_LEVEL: Record<string, number> = { low: 1, medium: 2, high: 3 };
const SOCIAL_WORDS: Record<number, string> = { 1: "Stayed home", 2: "Went out", 3: "Social contact" };

interface DomainView {
  spec: TrendSpec;
  /** Which direction is the concerning one — drives the "peak" callout. */
  worse: "up" | "down" | null;
  unit: string;
  fmtValue: (v: number) => string;
  smooth: "weighted" | "none" | "interpolate";
}

const DOMAIN_VIEW: Record<string, DomainView> = {
  anxiety: { spec: { min: 0, max: 10, concern: { from: 7, to: 10 }, fmt: (v) => `${v}` }, worse: "up", unit: "/10", fmtValue: (v) => `${Math.round(v)}`, smooth: "weighted" },
  sleep: { spec: { min: 0, max: 14, concern: { from: 0, to: 5 }, fmt: (v) => `${v}h` }, worse: "down", unit: "h", fmtValue: (v) => v.toFixed(1).replace(/\.0$/, ""), smooth: "weighted" },
  cigarettes: { spec: { min: 0, max: 18, concern: { from: 11, to: 18 }, fmt: (v) => `${v}` }, worse: "up", unit: "/day", fmtValue: (v) => `${Math.round(v)}`, smooth: "weighted" },
  medication: { spec: { min: 0, max: 100, concern: { from: 0, to: 50 }, fmt: (v) => `${v}%` }, worse: "down", unit: "%", fmtValue: (v) => `${Math.round(v)}`, smooth: "none" },
  socialization: { spec: { min: 0.6, max: 3.4, concern: { from: 0.6, to: 1.4 }, fmt: (v) => SOCIAL_WORDS[v] ?? "" }, worse: "down", unit: "", fmtValue: (v) => SOCIAL_WORDS[Math.round(v)] ?? "—", smooth: "weighted" },
  weight: { spec: { min: 0, max: 1, fmt: (v) => `${Math.round(v)} lb` }, worse: "up", unit: "lb", fmtValue: (v) => `${Math.round(v)}`, smooth: "interpolate" },
};

function rawValues(domain: TimelineDomain): (number | null)[] {
  if (domain.key === "socialization") return domain.series.map((p) => (p.band ? SOCIAL_LEVEL[p.band] ?? null : null));
  return domain.series.map((p) => p.value);
}

function trendLine(raw: (number | null)[], mode: DomainView["smooth"]): (number | null)[] {
  if (mode === "none") return raw;
  if (mode === "interpolate") {
    const known = raw.map((v, i) => (v == null ? null : i)).filter((i): i is number => i != null);
    return raw.map((v, i) => {
      if (v != null) return v;
      const prev = [...known].reverse().find((k) => k < i);
      const next = known.find((k) => k > i);
      if (prev == null || next == null) return null;
      const t = (i - prev) / (next - prev);
      return (raw[prev] as number) + t * ((raw[next] as number) - (raw[prev] as number));
    });
  }
  // 1-2-1 weighted average over the day and its neighbours; a single missing
  // day is bridged, a longer gap breaks the line.
  return raw.map((v, i) => {
    const parts: [number | null, number][] = [[raw[i - 1] ?? null, 1], [v, 2], [raw[i + 1] ?? null, 1]];
    const present = parts.filter(([pv]) => pv != null) as [number, number][];
    if (v == null && present.length < 2) return null;
    if (present.length === 0) return null;
    const w = present.reduce((a, [, pw]) => a + pw, 0);
    return present.reduce((a, [pv, pw]) => a + pv * pw, 0) / w;
  });
}

interface RowModel {
  domain: TimelineDomain;
  view: DomainView;
  spec: TrendSpec;
  raw: (number | null)[];
  line: (number | null)[];
  current: { value: number; date: string } | null;
  weekAgo: number | null;
  extreme: { value: number; date: string } | null;
  currentInZone: boolean;
}

function buildRow(domain: TimelineDomain): RowModel {
  const view = DOMAIN_VIEW[domain.key] ?? DOMAIN_VIEW.anxiety;
  const raw = rawValues(domain);
  const line = trendLine(raw, view.smooth);
  const dates = domain.series.map((p) => p.date);

  let spec = view.spec;
  if (domain.key === "weight") {
    const vals = raw.filter((v): v is number => v != null);
    const lo = vals.length ? Math.min(...vals) : 0;
    const hi = vals.length ? Math.max(...vals) : 1;
    spec = { ...spec, min: Math.floor(lo - 3), max: Math.ceil(hi + 3) };
  }

  let curIdx = -1;
  for (let i = raw.length - 1; i >= 0; i--) if (raw[i] != null) { curIdx = i; break; }
  const current = curIdx >= 0 ? { value: raw[curIdx] as number, date: dates[curIdx] } : null;

  let weekAgo: number | null = null;
  if (curIdx >= 0) {
    for (let i = curIdx - 7; i >= Math.max(0, curIdx - 10); i--) if (raw[i] != null) { weekAgo = raw[i]; break; }
  }

  let extreme: RowModel["extreme"] = null;
  if (view.worse) {
    raw.forEach((v, i) => {
      if (v == null) return;
      if (!extreme || (view.worse === "up" ? v > extreme.value : v < extreme.value)) extreme = { value: v, date: dates[i] };
    });
  }

  const z = spec.concern;
  const currentInZone = !!(current && z && current.value >= z.from && current.value <= z.to);

  return { domain, view, spec, raw, line, current, weekAgo, extreme, currentInZone };
}

function deltaText(row: RowModel): string | null {
  const { current, weekAgo, view } = row;
  if (!current || weekAgo == null) return null;
  if (row.domain.key === "socialization") {
    return current.value === weekAgo ? "Same as a week ago" : `${view.fmtValue(weekAgo)} a week ago`;
  }
  const diff = current.value - weekAgo;
  if (Math.abs(diff) < 0.01) return "Same as a week ago";
  return `${diff > 0 ? "▲" : "▼"} from ${view.fmtValue(weekAgo)}${view.unit === "%" ? "%" : ""} a week ago`;
}

function extremeText(row: RowModel): string | null {
  const { extreme, view, domain } = row;
  if (!extreme || domain.key === "socialization") return null;
  const word = view.worse === "up" ? "Peak" : "Low";
  return `${word} ${view.fmtValue(extreme.value)}${view.unit === "/10" ? "/10" : view.unit === "%" ? "%" : view.unit === "h" ? "h" : ""} · ${fmtDate(extreme.date)}`;
}

function CurrentValue({ row, big }: { row: RowModel; big?: boolean }) {
  const { current, view, domain, currentInZone } = row;
  const color = currentInZone ? ALERT : "var(--text-primary)";
  if (!current) return <span style={{ fontSize: big ? 32 : 22, color: "var(--text-secondary)" }}>—</span>;
  if (domain.key === "socialization") {
    return <span style={{ fontSize: big ? 26 : 18, fontWeight: 650, color }}>{view.fmtValue(current.value)}</span>;
  }
  return (
    <span className="tl-tabular" style={{ color }}>
      <span style={{ fontSize: big ? 36 : 26, fontWeight: 650, letterSpacing: "-0.02em" }}>{view.fmtValue(current.value)}</span>
      <span style={{ fontSize: big ? 16 : 13, fontWeight: 500, marginLeft: 2, color: "var(--text-secondary)" }}>{view.unit === "lb" ? " lb" : view.unit}</span>
    </span>
  );
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
      cards.push({ date: pick.p.date, text: `Record ${pick.label} of ${Math.round(pick.p.value * 10) / 10}` });
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

// ── Caregiver notes ──────────────────────────────────────────────────────────
//
// Notes stand on their own, independent of the charts: every note in the
// window (the union of each domain's assigned notes and the unassigned
// bucket, de-duplicated), newest first, grouped by calendar week.

function mondayOf(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  const back = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - back);
  return d.toISOString().slice(0, 10);
}

function addDays(iso: string, n: number): string {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function allNotes(data: TimelineResponse): TimelineNote[] {
  const seen = new Map<string, TimelineNote>();
  for (const n of [...data.domains.flatMap((d) => d.notes), ...data.other_notes]) {
    seen.set(`${n.date}|${n.author}`, n);
  }
  return [...seen.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

function eventsInRange(events: TimelineEventItem[], start: string, end: string): string[] {
  const out: string[] = [];
  for (const e of events) {
    if (e.type === "episode" && e.start <= end && e.end >= start) out.push(`Episode ${fmtDate(e.start)}–${fmtDate(e.end)}`);
    if (e.type === "med_change" && e.date >= start && e.date <= end) out.push(`Med change ${fmtDate(e.date)}`);
  }
  return out;
}

function VerbatimNote({ date, author, text }: { date: string; author: string; text: string }) {
  return (
    <div className="rounded-lg px-4 py-3" style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}>
      <p className="flex items-center gap-2" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
        <span
          className="inline-block rounded-full px-2 py-0.5"
          style={{ fontSize: 11, fontWeight: 600, color: AUTHOR_COLOR[author] ?? "var(--text-primary)", background: "var(--surface-0)", border: "1px solid var(--border)" }}
        >
          {author}
        </span>
        {fmtWeekday(date)}
      </p>
      <p style={{ fontFamily: "var(--font-voice)", fontSize: 15, lineHeight: 1.55, marginTop: 6 }}>{text}</p>
    </div>
  );
}

function CaregiverNotes({ data }: { data: TimelineResponse }) {
  const notes = useMemo(() => allNotes(data), [data]);
  const authors = useMemo(() => [...new Set(notes.map((n) => n.author))].sort(), [notes]);
  const [author, setAuthor] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const filtered = author ? notes.filter((n) => n.author === author) : notes;
  const weeks: { start: string; notes: TimelineNote[] }[] = [];
  for (const n of filtered) {
    const start = mondayOf(n.date);
    const last = weeks[weeks.length - 1];
    if (last && last.start === start) last.notes.push(n);
    else weeks.push({ start, notes: [n] });
  }
  const visibleWeeks = showAll ? weeks : weeks.slice(0, 3);

  return (
    <section className="mt-12">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 600 }}>Caregiver notes</h2>
          <p className="mt-1" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
            {notes.length} entries, shown exactly as written. Newest first.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[null, ...authors].map((a) => {
            const active = author === a;
            return (
              <button
                key={a ?? "all"}
                onClick={() => setAuthor(a)}
                aria-pressed={active}
                className="px-3 py-1 rounded-full border"
                style={{
                  fontSize: 12,
                  fontWeight: 600,
                  background: active ? "var(--text-primary)" : "var(--surface-1)",
                  color: active ? "#fff" : "var(--text-primary)",
                  borderColor: "var(--border)",
                }}
              >
                {a ?? "All"}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5 space-y-7">
        {visibleWeeks.map((w) => {
          const end = addDays(w.start, 6);
          const evs = eventsInRange(data.events, w.start, end);
          return (
            <div key={w.start} className="grid gap-3 md:grid-cols-[150px_1fr]">
              <div className="md:pt-3">
                <p style={{ fontSize: 13, fontWeight: 600 }}>Week of {fmtDate(w.start)}</p>
                <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                  {w.notes.length} note{w.notes.length !== 1 ? "s" : ""}
                </p>
                {evs.map((e) => (
                  <span
                    key={e}
                    className="inline-block mt-1.5 mr-1 rounded px-1.5 py-0.5"
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      background: e.startsWith("Episode") ? "var(--episode-band)" : "var(--surface-1)",
                      color: e.startsWith("Episode") ? "#8A1C12" : "var(--text-primary)",
                      border: "1px solid var(--border)",
                    }}
                  >
                    {e}
                  </span>
                ))}
              </div>
              <div className="space-y-2">
                {w.notes.map((n) => (
                  <VerbatimNote key={`${n.date}-${n.author}`} date={n.date} author={n.author} text={n.text} />
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {weeks.length > 3 && (
        <button
          onClick={() => setShowAll((v) => !v)}
          className="mt-6 px-4 py-2 rounded-lg border"
          style={{ fontSize: 13, fontWeight: 600, background: "var(--surface-1)", borderColor: "var(--border)" }}
        >
          {showAll ? "Show recent weeks only" : `Show ${weeks.length - 3} earlier week${weeks.length - 3 !== 1 ? "s" : ""}`}
        </button>
      )}
    </section>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export default function TimelineClient({ patientId }: { patientId: number }) {
  const [window_, setWindow] = useState<TimelineWindow>("2m");
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [error, setError] = useState(false);
  const [overlayDomain, setOverlayDomain] = useState<string | null>(null);

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

  useEffect(() => {
    if (!overlayDomain) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOverlayDomain(null);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [overlayDomain]);

  const rows = useMemo(() => {
    if (!data) return [];
    const order = ["anxiety", "sleep", "medication", "socialization", "cigarettes", "weight"];
    return [...data.domains]
      .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key))
      .map(buildRow);
  }, [data]);

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

  const dates = data.domains[0]?.series.map((p) => p.date) ?? [];
  const overlayRow = rows.find((r) => r.domain.key === overlayDomain) ?? null;
  const rowAspect = `${TREND_CFG.row.vbW} / ${TREND_CFG.row.vbH}`;

  return (
    <div className={`${lora.variable} clinician-timeline px-4 sm:px-6 py-8 max-w-[1180px] mx-auto`}>
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
        {prettyDates(data.headline)}
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

      {/* Time toggle + legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 mt-6">
        <div className="flex gap-2">
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
        <div className="flex flex-wrap items-center gap-4" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          <span className="flex items-center gap-1.5">
            <svg width="22" height="10" aria-hidden="true">
              <line x1="1" y1="5" x2="21" y2="5" stroke="var(--accent)" strokeWidth={2.5} strokeLinecap="round" />
            </svg>
            Trend
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ background: "var(--text-primary)", opacity: 0.35 }} />
            Daily log
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3" style={{ background: "#FDEBE3", border: `1px solid ${ALERT}`, borderRadius: 2 }} />
            Watch zone
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-3 h-3" style={{ background: "var(--episode-band)", borderRadius: 2 }} />
            Episode
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="20" height="10" aria-hidden="true">
              <line x1="0" y1="5" x2="20" y2="5" stroke="var(--text-primary)" strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="5,4" />
            </svg>
            Med change
          </span>
        </div>
      </div>

      {/* Stacked trend rows on one shared time axis */}
      <div className="mt-4 overflow-hidden" style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 14 }}>
        <div className="hidden md:grid md:grid-cols-[210px_1fr]" style={{ borderBottom: "1px solid var(--border)" }}>
          <div />
          <div style={{ aspectRatio: `${TREND_CFG.row.vbW} / 44` }}>
            <TrendAxis dates={dates} events={data.events} />
          </div>
        </div>
        {rows.map((row, i) => {
          const delta = deltaText(row);
          const ext = extremeText(row);
          return (
            <button
              key={row.domain.key}
              onClick={() => setOverlayDomain(row.domain.key)}
              className="w-full text-left grid md:grid-cols-[210px_1fr] items-center transition-colors hover:bg-[var(--surface-0)]"
              style={{ borderTop: i === 0 ? "none" : "1px solid var(--border)" }}
            >
              <div className="px-4 pt-3 md:py-3">
                <div className="flex items-center justify-between gap-2">
                  <span style={{ fontSize: 13, fontWeight: 600, letterSpacing: "0.02em", color: "var(--text-secondary)", textTransform: "uppercase" }}>
                    {row.domain.label}
                  </span>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--text-secondary)" strokeWidth="2" aria-hidden="true">
                    <path d="M9 18l6-6-6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div className="mt-0.5">
                  <CurrentValue row={row} />
                </div>
                {delta && <p className="tl-tabular" style={{ fontSize: 12, color: "var(--text-secondary)" }}>{delta}</p>}
                {ext && <p className="tl-tabular" style={{ fontSize: 12, color: "var(--text-secondary)" }}>{ext}</p>}
              </div>
              <div className="px-1 md:px-0" style={{ aspectRatio: rowAspect }}>
                <TrendChart dates={dates} raw={row.raw} line={row.line} spec={row.spec} events={data.events} size="row" />
              </div>
            </button>
          );
        })}
      </div>

      {/* Caregiver notes — standalone, not tied to any chart */}
      <CaregiverNotes data={data} />

      {/* Full-screen overlay */}
      {overlayRow && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto clinician-timeline"
          style={{ background: "var(--surface-0)" }}
        >
          <div className="max-w-[1240px] mx-auto px-4 sm:px-8 py-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 style={{ fontSize: 28, fontWeight: 600 }}>{overlayRow.domain.label}</h2>
                <p className="tl-tabular mt-1" style={{ fontSize: 14, color: "var(--text-secondary)" }}>
                  {data.patient.name} · {fmtDate(data.patient.range_start)}–{fmtDate(data.patient.range_end)}
                </p>
              </div>
              <div className="flex items-start gap-6">
                <div className="text-right">
                  <CurrentValue row={overlayRow} big />
                  {deltaText(overlayRow) && <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>{deltaText(overlayRow)}</p>}
                </div>
                <button
                  onClick={() => setOverlayDomain(null)}
                  aria-label="Close"
                  className="rounded-full p-2"
                  style={{ background: "var(--surface-1)", border: "1px solid var(--border)" }}
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-primary)" strokeWidth="2">
                    <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
            </div>

            <div className="mt-6 p-2" style={{ background: "var(--surface-1)", border: "1px solid var(--border)", borderRadius: 14, aspectRatio: `${TREND_CFG.large.vbW} / ${TREND_CFG.large.vbH}` }}>
              <TrendChart
                dates={dates}
                raw={overlayRow.raw}
                line={overlayRow.line}
                spec={overlayRow.spec}
                events={data.events}
                size="large"
              />
            </div>

            {/* Monthly highs & lows */}
            {overlayRow.domain.monthly_extremes.length > 0 && (
              <div className="mt-6">
                <p style={{ fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", color: "var(--text-secondary)" }}>
                  MONTHLY HIGH / LOW
                </p>
                <div className="mt-2 grid gap-3" style={{ gridTemplateColumns: `repeat(${overlayRow.domain.monthly_extremes.length}, 1fr)` }}>
                  {overlayRow.domain.monthly_extremes.map((m) => (
                    <div key={m.month} className="p-3 border" style={{ borderRadius: 10, borderColor: "var(--border)", background: "var(--surface-1)" }}>
                      <p style={{ fontSize: 13, fontWeight: 600 }}>{m.month}</p>
                      <p className="mt-1" style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        High: {formatExtreme(m.high, overlayRow.domain.key)} ({fmtDate(m.high.date)})
                      </p>
                      <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>
                        Low: {formatExtreme(m.low, overlayRow.domain.key)} ({fmtDate(m.low.date)})
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Deterministic observation cards */}
            {(() => {
              const cards = deriveObservationCards(overlayRow.domain);
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
          </div>
        </div>
      )}
    </div>
  );
}
