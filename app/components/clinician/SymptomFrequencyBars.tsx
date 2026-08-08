import type { SymptomFrequencyEntry } from "../../lib/types";
import { EmptyState } from "./EmptyState";

export function SymptomFrequencyBars({ data, windowDays }: { data: SymptomFrequencyEntry[]; windowDays: number }) {
  if (!data.length) return <EmptyState text="No symptoms logged in this period." />;

  return (
    <div className="space-y-3">
      {data.map((d) => {
        const pct = windowDays ? (d.days_present / windowDays) * 100 : 0;
        const sev = d.avg_severity ?? 0;
        const color = sev >= 8 ? "var(--cp-red)" : sev >= 5 ? "var(--cp-amber)" : "var(--cp-teal)";
        return (
          <div key={d.symptom}>
            <div className="flex justify-between items-baseline text-sm mb-1 gap-2">
              <span className="font-medium truncate" style={{ color: "var(--cp-text)" }}>{d.symptom}</span>
              <span className="cp-tabular text-xs flex-shrink-0" style={{ color: "var(--cp-text-muted)" }}>
                {d.days_present}/{windowDays} days
                {d.avg_severity != null ? ` · avg ${d.avg_severity}/10` : ""}
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "#F3F4F6" }}>
              <div className="h-2 rounded-full" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
