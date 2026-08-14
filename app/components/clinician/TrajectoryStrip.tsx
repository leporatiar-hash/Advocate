import type { TrajectoryDay } from "../../lib/types";

function severityColor(sev: number | null): string {
  if (sev == null) return "var(--cp-border)";
  if (sev >= 8) return "var(--cp-red)";
  if (sev >= 5) return "var(--cp-amber)";
  return "var(--cp-teal)";
}

function fmtShort(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
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

export function TrajectoryStrip({ days }: { days: TrajectoryDay[] }) {
  if (!days.length) return null;
  const mid = days[Math.floor(days.length / 2)];

  return (
    <div className="rounded-xl border p-4" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
      <div className="space-y-2.5">
        <Row label="Severity">
          {days.map((d) => (
            <span
              key={d.date}
              className="flex-1 h-4 rounded-sm"
              style={{ background: severityColor(d.severity), opacity: d.severity == null ? 0.4 : 1 }}
            />
          ))}
        </Row>
        <Row label="Episodes">
          {days.map((d) => (
            <span key={d.date} className="flex-1 flex items-center justify-center">
              {d.episode && <span className="w-1.5 h-1.5 rounded-full" style={{ background: "var(--cp-red)" }} />}
            </span>
          ))}
        </Row>
        <Row label="Smoking">
          {days.map((d) => (
            <span
              key={d.date}
              className="flex-1 h-2 rounded-sm"
              style={{ background: d.smoked ? "var(--cp-amber)" : "var(--cp-border)", opacity: d.smoked ? 1 : 0.4 }}
            />
          ))}
        </Row>
      </div>
      <div className="flex justify-between text-[10px] mt-2" style={{ color: "var(--cp-text-muted)" }}>
        <span>{fmtShort(days[0].date)}</span>
        <span>{fmtShort(mid.date)}</span>
        <span>{fmtShort(days[days.length - 1].date)}</span>
      </div>
      <p className="text-xs italic mt-3" style={{ color: "var(--cp-text-muted)" }}>
        Caregiver-logged, shown side by side. Patterns are for the clinician to interpret.
      </p>
    </div>
  );
}
