import type { PortalFlag } from "../../lib/types";
import { EmptyState } from "./EmptyState";

function AlertIcon({ color }: { color: string }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
    </svg>
  );
}

const LABELS: Record<PortalFlag["severity"], string> = { high: "High", moderate: "Moderate", low: "Low" };

export function FlagList({ flags }: { flags: PortalFlag[] }) {
  if (!flags.length) return <EmptyState text="No flags in this period." />;

  return (
    <div className="space-y-2">
      {flags.map((flag, i) => {
        // Red is reserved for the single top-ranked flag; every other flag —
        // even another "high" one — reads as amber so red stays rare.
        const isTopSeverity = i === 0 && flag.severity === "high";
        const palette = isTopSeverity
          ? { bg: "var(--cp-red-light)", color: "var(--cp-red)" }
          : flag.severity === "low"
          ? { bg: "#F3F4F6", color: "var(--cp-text-muted)" }
          : { bg: "var(--cp-amber-light)", color: "var(--cp-amber)" };

        return (
          <div
            key={i}
            className="flex items-start gap-3 rounded-xl border p-3"
            style={{ background: "#fff", borderColor: "var(--cp-border)" }}
          >
            <span
              className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center mt-0.5"
              style={{ background: palette.bg }}
            >
              <AlertIcon color={palette.color} />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: palette.color }}>
                {LABELS[flag.severity]}
              </p>
              <p className="text-sm mt-0.5 leading-snug" style={{ color: "var(--cp-text)" }}>
                {flag.text}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
