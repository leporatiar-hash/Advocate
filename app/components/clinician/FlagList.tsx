import type { PortalFlag } from "../../lib/types";

const LABELS: Record<PortalFlag["severity"], string> = { high: "HIGH", moderate: "MODERATE", low: "LOW" };

function metricLabel(metric: string): string {
  switch (metric) {
    case "symptom": return "Symptom pattern";
    case "med_adherence": return "Medication adherence";
    case "sleep": return "Sleep";
    case "log_frequency": return "Logging gap";
    default: return metric;
  }
}

export function FlagList({ flags }: { flags: PortalFlag[] }) {
  return (
    <div className="rounded-2xl p-5" style={{ background: "var(--cp-flag-bg)", border: `1px solid var(--cp-flag-border)` }}>
      <h2 className="text-base font-bold" style={{ color: "var(--cp-text)" }}>Flagged This Period</h2>
      <p className="text-xs italic mt-1 mb-4" style={{ color: "var(--cp-text-muted)" }}>
        Deterministic flags computed from logged severity and frequency — placed after the summary so they don&apos;t color the read.
      </p>

      {!flags.length ? (
        <p className="text-sm" style={{ color: "var(--cp-text-muted)" }}>No flags in this period.</p>
      ) : (
        <div className="divide-y" style={{ borderColor: "var(--cp-flag-border)" }}>
          {flags.map((flag, i) => {
            // Red is reserved for the single top-ranked flag; every other flag —
            // even another "high" one — reads as amber so red stays rare.
            const isTopSeverity = i === 0 && flag.severity === "high";
            const pillColor = isTopSeverity
              ? "var(--cp-red)"
              : flag.severity === "low"
              ? "var(--cp-text-muted)"
              : "var(--cp-amber)";

            return (
              <div key={i} className="py-3 first:pt-0 last:pb-0">
                <div className="flex items-center gap-2 mb-1">
                  <span
                    className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white flex-shrink-0"
                    style={{ background: pillColor }}
                  >
                    {LABELS[flag.severity]}
                  </span>
                  <p className="text-sm font-bold" style={{ color: "var(--cp-text)" }}>{metricLabel(flag.metric)}</p>
                </div>
                <p className="text-sm leading-snug" style={{ color: "var(--cp-text)" }}>{flag.text}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
