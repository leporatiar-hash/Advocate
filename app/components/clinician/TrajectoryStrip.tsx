"use client";

import { useEffect, useState } from "react";
import { api } from "../../lib/api";
import type { TemporalBin, TemporalResponse } from "../../lib/types";
import { SEVERITY_COLORS } from "../../lib/clinicianSeverity";

function fmtShort(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function monthOf(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short" });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] font-bold uppercase tracking-wide w-24 flex-shrink-0" style={{ color: "var(--cp-text-muted)" }}>
        {label}
      </span>
      <div className="flex-1 flex gap-[2px]">{children}</div>
    </div>
  );
}

function SectionHeading() {
  return (
    <h2 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "var(--cp-text-muted)" }}>
      Temporal Data
    </h2>
  );
}

// Tick appears under the first bin of every calendar month a weekly ribbon
// crosses into — so the month arc reads on top of bins that don't carry
// individual month labels the way monthly bins do.
function monthTicks(bins: TemporalBin[]): { index: number; month: string }[] {
  const ticks: { index: number; month: string }[] = [];
  let prevMonth: string | null = null;
  bins.forEach((b, i) => {
    const month = monthOf(b.start);
    if (month !== prevMonth) ticks.push({ index: i, month });
    prevMonth = month;
  });
  return ticks;
}

export function TrajectoryStrip({ patientId }: { patientId: number }) {
  const [data, setData] = useState<TemporalResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .getClinicianTemporal(patientId)
      .then((res) => {
        if (!cancelled) setData(res as TemporalResponse);
      })
      .catch(() => {
        if (!cancelled) setData(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  if (loading) {
    return (
      <div>
        <SectionHeading />
        <div className="rounded-xl border p-4 h-24 animate-pulse" style={{ background: "#fff", borderColor: "var(--cp-border)" }} />
      </div>
    );
  }

  // No logged history at all in the temporal window — nothing to show, so
  // (heading included) render nothing rather than an empty shell.
  if (!data || data.bins.length === 0) return null;

  const { bins, bin_size, not_enough_history } = data;
  const ticks = bin_size === "week" ? monthTicks(bins) : [];
  const selected = selectedIdx != null ? bins[selectedIdx] : null;

  return (
    <div>
      <SectionHeading />
      <div className="rounded-xl border p-4" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
        <div className="space-y-2.5">
          <Row label="Severity">
            {bins.map((b, i) => (
              <button
                key={b.start}
                type="button"
                title={b.readout ?? b.label}
                aria-label={`${b.label}: ${b.readout ?? "no readout"}`}
                onClick={() => setSelectedIdx(i === selectedIdx ? null : i)}
                className="flex-1 h-4 rounded-sm cursor-pointer"
                style={{
                  background: SEVERITY_COLORS[b.color],
                  outline: selectedIdx === i ? `2px solid ${"var(--cp-teal)"}` : "none",
                  outlineOffset: 1,
                }}
              />
            ))}
          </Row>
          <Row label="Episodes">
            {bins.map((b) => (
              <span key={b.start} className="flex-1 flex items-center justify-center">
                {b.has_episode && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--cp-red)" }} />}
              </span>
            ))}
          </Row>
        </div>

        {bin_size === "week" && ticks.length > 0 && (
          <div className="relative h-3.5 mt-1">
            {ticks.map((t) => (
              <span
                key={t.index}
                className="absolute text-[10px] -translate-x-1/2"
                style={{ left: `${((t.index + 0.5) / bins.length) * 100}%`, color: "var(--cp-text-muted)" }}
              >
                {t.month}
              </span>
            ))}
          </div>
        )}

        {bin_size !== "week" && (
          <div className="flex justify-between text-[10px] mt-2" style={{ color: "var(--cp-text-muted)" }}>
            <span>{bin_size === "month" ? bins[0].label : fmtShort(bins[0].start)}</span>
            <span>{bin_size === "month" ? bins[bins.length - 1].label : fmtShort(bins[bins.length - 1].start)}</span>
          </div>
        )}

        <p className="text-xs italic mt-3" style={{ color: "var(--cp-text-muted)" }}>
          {not_enough_history
            ? "Not enough history yet to show a trend."
            : "Caregiver-logged, shown side by side. Patterns are for the clinician to interpret."}
        </p>

        {selected && (
          <div className="mt-3 rounded-lg p-3" style={{ background: "var(--cp-bg)", border: "1px solid var(--cp-border)" }}>
            <p className="text-xs font-bold uppercase tracking-wide mb-1" style={{ color: "var(--cp-text-muted)" }}>
              {selected.label}
              {selected.start !== selected.end ? `–${fmtShort(selected.end)}` : ""}
            </p>
            {selected.readout && (
              <p className="text-sm mb-2" style={{ color: "var(--cp-text)" }}>
                {selected.readout}
              </p>
            )}
            <p className="text-xs" style={{ color: "var(--cp-text-muted)" }}>
              {selected.scored_days} of {selected.logged_days} logged day{selected.logged_days === 1 ? "" : "s"} scored
              {selected.bin_sev != null ? ` · severity ${selected.bin_sev}/10` : ""}
              {selected.has_episode ? " · episode logged" : ""}
            </p>
            {selected.notes.length > 0 ? (
              <div className="mt-2 space-y-1.5">
                {selected.notes.map((n, i) => (
                  <p
                    key={i}
                    className="text-sm italic pl-2"
                    style={{ borderLeft: "2px solid var(--cp-border)", color: "var(--cp-text)" }}
                  >
                    &ldquo;{n}&rdquo;
                  </p>
                ))}
              </div>
            ) : (
              <p className="text-xs italic mt-2" style={{ color: "var(--cp-text-muted)" }}>
                No caregiver notes logged this period.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
