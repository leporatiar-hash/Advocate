import type { SymptomFrequencyEntry } from "../../lib/types";
import { EmptyState } from "./EmptyState";

function DeltaLabel({ direction, prev }: { direction: SymptomFrequencyEntry["direction"]; prev: number | null }) {
  if (direction === "steady" || prev == null) {
    return <span style={{ color: "var(--cp-text-muted)" }}>→ steady</span>;
  }
  const arrow = direction === "worse" ? "↑" : "↓";
  const color = direction === "worse" ? "var(--cp-amber)" : "var(--cp-teal)";
  return <span style={{ color }}>{arrow} from {prev}</span>;
}

export function SymptomFrequencyBars({ data, windowDays }: { data: SymptomFrequencyEntry[]; windowDays: number }) {
  if (!data.length) return <EmptyState text="No symptoms logged in this period." />;

  return (
    <div className="space-y-3">
      {data.map((d) => {
        const pct = windowDays ? (d.days_present / windowDays) * 100 : 0;
        const sev = d.avg_severity ?? 0;
        // Red requires both high severity AND enough logged days to trust it — a
        // symptom logged once or twice at max severity must not paint the
        // loudest color on the page off a single data point.
        const color = d.low_n ? "var(--cp-text-muted)" : sev >= 8 ? "var(--cp-red)" : sev >= 5 ? "var(--cp-amber)" : "var(--cp-teal)";
        return (
          <div key={d.symptom}>
            <div className="flex flex-wrap justify-between items-baseline text-sm mb-1 gap-x-2 gap-y-0.5">
              <span className="font-medium truncate" style={{ color: "var(--cp-text)" }}>{d.symptom}</span>
              <span className="cp-tabular text-xs flex-shrink-0 flex items-center gap-2" style={{ color: "var(--cp-text-muted)" }}>
                <span>
                  {d.days_present}/{windowDays} days
                  {d.avg_severity != null ? ` · avg ${d.avg_severity}/10` : ""}
                </span>
                <span className="font-semibold">
                  {d.low_n ? "too few to trend" : <DeltaLabel direction={d.direction} prev={d.prev_avg_severity} />}
                </span>
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "#F3F4F6" }}>
              <div
                className="h-2 rounded-full"
                style={{ width: `${Math.min(pct, 100)}%`, background: color, opacity: d.low_n ? 0.6 : 1 }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
