import type { MedAdherenceEntry } from "../../lib/types";
import { EmptyState } from "./EmptyState";

export function MedAdherenceBars({ data }: { data: MedAdherenceEntry[] }) {
  if (!data.length) return <EmptyState text="No active medications on file." />;

  return (
    <div className="space-y-3">
      {data.map((d) => {
        const color = d.pct >= 80 ? "var(--cp-teal)" : d.pct >= 60 ? "var(--cp-amber)" : "var(--cp-red)";
        return (
          <div key={d.medication}>
            <div className="flex justify-between items-baseline text-sm mb-1 gap-2">
              <span className="font-medium truncate" style={{ color: "var(--cp-text)" }}>{d.medication}</span>
              <span className="cp-tabular text-xs flex-shrink-0" style={{ color: "var(--cp-text-muted)" }}>
                {d.taken}/{d.expected} days · {d.pct}%
              </span>
            </div>
            <div className="h-2 rounded-full overflow-hidden" style={{ background: "#F3F4F6" }}>
              <div className="h-2 rounded-full" style={{ width: `${Math.min(d.pct, 100)}%`, background: color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
