"use client";

import { useEffect, useMemo, useState } from "react";
import { Lora } from "next/font/google";
import { api } from "../../lib/api";
import type { TimelineResponse, TimelineWindow } from "../../lib/types";
import { TimelineChart } from "./TimelineChart";

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

export default function TimelineClient({ patientId }: { patientId: number }) {
  const [window_, setWindow] = useState<TimelineWindow>("1m");
  const [data, setData] = useState<TimelineResponse | null>(null);
  const [error, setError] = useState(false);
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const [expandedNoteDomain, setExpandedNoteDomain] = useState<string | null>(null);

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

  const dates = useMemo(() => (data ? data.domains[0]?.series.map((s) => s.date) ?? [] : []), [data]);

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

  const expandedDomain = data.domains.find((d) => d.key === expandedCard) ?? null;

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

      {/* Six-card grid */}
      <div
        className="mt-5"
        style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(196px, 1fr))", gap: 12 }}
      >
        {data.domains.map((d) => (
          <button
            key={d.key}
            onClick={() => setExpandedCard(expandedCard === d.key ? null : d.key)}
            className="text-left p-3 border"
            style={{
              background: "var(--surface-1)",
              borderRadius: 12,
              borderColor: expandedCard === d.key ? "var(--accent)" : "var(--border)",
              borderWidth: expandedCard === d.key ? 2 : 1,
              aspectRatio: "1 / 1",
              display: "flex",
              flexDirection: "column",
            }}
          >
            <div className="flex items-center justify-between">
              <span style={{ fontSize: 13, fontWeight: 600 }}>{d.label}</span>
              <span style={{ fontSize: 11, color: "var(--text-secondary)" }}>{d.caption}</span>
            </div>
            <div className="flex-1 mt-1">
              <TimelineChart dates={dates} series={d.series} axis={d.axis} events={data.events} expanded={false} />
            </div>
          </button>
        ))}
      </div>

      {/* Expanded detail panel */}
      {expandedDomain && (
        <div className="mt-4 p-5" style={{ background: "var(--surface-1)", borderRadius: 12, border: "1px solid var(--border)" }}>
          <div className="flex items-center justify-between">
            <h2 style={{ fontSize: 16, fontWeight: 600 }}>{expandedDomain.label}</h2>
            <span className="tl-tabular" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
              {fmtDate(data.patient.range_start)}–{fmtDate(data.patient.range_end)}
            </span>
          </div>
          <div style={{ height: 280 }} className="mt-3">
            <TimelineChart
              dates={dates}
              series={expandedDomain.series}
              axis={expandedDomain.axis}
              events={data.events}
              expanded
            />
          </div>
          <p className="mt-3" style={{ fontSize: 14, lineHeight: 1.6, color: "var(--text-primary)" }}>
            {expandedDomain.summary}
          </p>
          <p style={{ fontSize: 11, color: "var(--text-secondary)" }}>{fmtGeneratedAt(expandedDomain.summary_generated_at)}</p>
        </div>
      )}

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

      {/* Caregiver notes */}
      <div className="mt-8">
        <h2 style={{ fontSize: 16, fontWeight: 600 }}>Caregiver notes</h2>
        <p className="mt-1" style={{ fontSize: 12, color: "var(--text-secondary)" }}>
          Summaries below are generated. Entries are shown exactly as the caregiver wrote them.
        </p>

        <div className="mt-3 divide-y" style={{ borderColor: "var(--border)" }}>
          {data.domains.map((d) => {
            const isOpen = expandedNoteDomain === d.key;
            return (
              <div key={d.key} className="py-3">
                <button
                  onClick={() => setExpandedNoteDomain(isOpen ? null : d.key)}
                  aria-expanded={isOpen}
                  className="w-full flex items-center justify-between text-left gap-4"
                >
                  <span style={{ fontSize: 14, fontWeight: 600 }}>{d.label}</span>
                  <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{d.notes.length} entries</span>
                </button>
                <p className="mt-1" style={{ fontSize: 13, color: "var(--text-secondary)" }}>{d.summary}</p>
                {isOpen && (
                  <div className="mt-3 space-y-3">
                    {d.notes.length === 0 ? (
                      <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>No notes this window.</p>
                    ) : (
                      d.notes.map((n) => (
                        <div key={`${n.date}-${n.author}`} style={{ borderLeft: "2px solid var(--accent)", paddingLeft: 12 }}>
                          <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                            {fmtDate(n.date)} · {n.author}
                          </p>
                          <p style={{ fontFamily: "var(--font-voice)", fontSize: 15, lineHeight: 1.5, marginTop: 2 }}>
                            {n.text}
                          </p>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Unassigned bucket — always last */}
          <div className="py-3">
            <button
              onClick={() => setExpandedNoteDomain(expandedNoteDomain === "__other__" ? null : "__other__")}
              aria-expanded={expandedNoteDomain === "__other__"}
              className="w-full flex items-center justify-between text-left gap-4"
            >
              <span style={{ fontSize: 14, fontWeight: 600 }}>Other notes</span>
              <span style={{ fontSize: 12, color: "var(--text-secondary)" }}>{data.other_notes.length} entries</span>
            </button>
            {expandedNoteDomain === "__other__" && (
              <div className="mt-3 space-y-3">
                {data.other_notes.length === 0 ? (
                  <p style={{ fontSize: 13, color: "var(--text-secondary)" }}>Nothing unassigned this window.</p>
                ) : (
                  data.other_notes.map((n) => (
                    <div key={`${n.date}-${n.author}`} style={{ borderLeft: "2px solid var(--text-secondary)", paddingLeft: 12 }}>
                      <p style={{ fontSize: 12, color: "var(--text-secondary)" }}>
                        {fmtDate(n.date)} · {n.author}
                      </p>
                      <p style={{ fontFamily: "var(--font-voice)", fontSize: 15, lineHeight: 1.5, marginTop: 2 }}>
                        {n.text}
                      </p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
