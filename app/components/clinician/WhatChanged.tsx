"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api } from "../../lib/api";
import type { ChangesPrefs } from "../../lib/clinicianPrefs";
import type { ChangesResponse } from "../../lib/types";

// Top of the Detailed view: the biggest changes since the last visit (or a
// rolling window), past per-metric cutoffs only. Computed server-side with
// no LLM — see backend/services/changes.py. When nothing crossed a cutoff the
// panel says so; it never pads itself with small wobbles.

const DIRECTION_STYLE = {
  better: { color: "var(--cp-teal)", word: "Better" },
  worse: { color: "#B45309", word: "Worse" },
  neutral: { color: "var(--cp-text-muted)", word: "Changed" },
} as const;

function fmtDate(iso: string): string {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function title(data: ChangesResponse): string {
  if (data.kind === "visit" && data.last_visit) return `Since last visit · ${fmtDate(data.last_visit)}`;
  return `Last ${data.days} days vs the ${data.days} before`;
}

export function WhatChanged({ patientId, prefs }: { patientId: number; prefs: ChangesPrefs }) {
  const [data, setData] = useState<ChangesResponse | null>(null);
  const [error, setError] = useState(false);
  const noMetrics = prefs.metrics.length === 0;
  const metricsKey = prefs.metrics.join(",");

  useEffect(() => {
    if (noMetrics) return;
    let cancelled = false;
    api
      .getClinicianChanges(patientId, prefs.compare, prefs.count, metricsKey.split(","))
      .then((res) => { if (!cancelled) { setData(res as ChangesResponse); setError(false); } })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, [patientId, prefs.compare, prefs.count, metricsKey, noMetrics]);

  const fellBack = prefs.compare === "visit" && data?.kind === "window";

  return (
    <div className="rounded-2xl p-5" style={{ background: "#fff", border: "1px solid var(--cp-border)" }}>
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <div>
          <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--cp-text-muted)", letterSpacing: "0.08em" }}>
            What changed
          </p>
          {data && !noMetrics && (
            <p className="text-sm mt-0.5" style={{ color: "var(--cp-text-muted)" }}>
              {title(data)}
              {fellBack && (data.last_visit ? " (last visit was under a week ago)" : " (no visit on record)")}
            </p>
          )}
        </div>
        <Link href="/clinician/configure/" className="text-xs font-semibold hover:underline" style={{ color: "var(--cp-teal)" }}>
          Adjust
        </Link>
      </div>

      {noMetrics ? (
        <p className="text-sm mt-3" style={{ color: "var(--cp-text-muted)" }}>No metrics selected. Choose some in Configure.</p>
      ) : error ? (
        <p className="text-sm mt-3" style={{ color: "var(--cp-text-muted)" }}>Could not load changes.</p>
      ) : !data ? (
        <p className="text-sm mt-3" style={{ color: "var(--cp-text-muted)" }}>Loading…</p>
      ) : (
        <>
          {data.changes.length === 0 ? (
            <p className="text-base font-semibold mt-3" style={{ color: "var(--cp-text)" }}>
              No major changes {data.kind === "visit" ? "since the last visit" : "in this period"}.
            </p>
          ) : (
            <ul className="mt-3 divide-y" style={{ borderColor: "var(--cp-border)" }}>
              {data.changes.map((c) => {
                const d = DIRECTION_STYLE[c.direction];
                return (
                  <li key={`${c.metric}-${c.label}`} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
                    <span className="inline-block w-2 h-2 rounded-full flex-shrink-0" style={{ background: d.color }} aria-hidden />
                    <span className="text-base font-semibold flex-1" style={{ color: "var(--cp-text)" }}>{c.text}</span>
                    <span className="text-xs font-semibold" style={{ color: d.color }}>{d.word}</span>
                  </li>
                );
              })}
            </ul>
          )}
          {data.steady.length > 0 && (
            <p className="text-xs mt-3 pt-3" style={{ color: "var(--cp-text-muted)", borderTop: "1px solid var(--cp-border)" }}>
              Held steady: {data.steady.join(", ")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
