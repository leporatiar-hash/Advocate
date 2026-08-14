import type { InsightUnit } from "../../lib/types";

const CHIP_CONFIG: Record<InsightUnit["chip"], { label: string; color: string; bg: string }> = {
  watch: { label: "watch", color: "var(--cp-amber)", bg: "var(--cp-amber-light)" },
  steady: { label: "steady", color: "var(--cp-text-muted)", bg: "#F3F4F6" },
  low_data: { label: "low data", color: "var(--cp-text-muted)", bg: "#F3F4F6" },
};

// takeaway is required to be an exact substring of observation (enforced in
// services/synthesis.py) — if it somehow isn't, fall back to the plain
// observation rather than rendering nothing.
function withBoldedTakeaway(observation: string, takeaway: string) {
  if (!takeaway) return observation;
  const idx = observation.indexOf(takeaway);
  if (idx === -1) return observation;
  return (
    <>
      {observation.slice(0, idx)}
      <strong>{observation.slice(idx, idx + takeaway.length)}</strong>
      {observation.slice(idx + takeaway.length)}
    </>
  );
}

export function InsightUnits({
  insights,
  onReveal,
}: {
  insights: InsightUnit[];
  onReveal: (dates: string[]) => void;
}) {
  if (!insights.length) {
    return (
      <div className="rounded-2xl p-6" style={{ background: "var(--cp-teal-light)", border: "1.5px solid var(--cp-teal)" }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--cp-teal)", letterSpacing: "0.1em" }}>
          AI Summary · Notes Synthesis
        </p>
        <p className="text-sm" style={{ color: "var(--cp-text-muted)" }}>
          Not yet generated for this patient.
        </p>
      </div>
    );
  }

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "var(--cp-teal-light)", border: "1.5px solid var(--cp-teal)", boxShadow: "0 4px 20px rgba(15,107,102,0.10)" }}
    >
      <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--cp-teal)", letterSpacing: "0.1em" }}>
        AI Summary · Notes Synthesis
      </p>
      <div className="divide-y" style={{ borderColor: "rgba(15,107,102,0.15)" }}>
        {insights.map((insight) => {
          const chip = CHIP_CONFIG[insight.chip] ?? CHIP_CONFIG.steady;
          const noteCount = insight.source_note_ids.length;
          return (
            <div
              key={insight.category}
              className="py-3 first:pt-0 last:pb-0 flex items-start gap-x-3 gap-y-1 flex-wrap sm:flex-nowrap"
            >
              <span
                className="text-xs font-bold uppercase tracking-wide w-full sm:w-28 flex-shrink-0"
                style={{ color: "var(--cp-text-muted)" }}
              >
                {insight.category}
              </span>
              <p className="text-sm leading-snug flex-1 min-w-[60%]" style={{ color: "var(--cp-text)" }}>
                {withBoldedTakeaway(insight.observation, insight.takeaway)}
              </p>
              <div className="flex items-center gap-2 flex-shrink-0 ml-auto">
                <span
                  className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                  style={{ background: chip.bg, color: chip.color }}
                >
                  {chip.label}
                </span>
                {noteCount > 0 && (
                  <button
                    type="button"
                    onClick={() => onReveal(insight.source_note_ids)}
                    className="text-xs font-semibold whitespace-nowrap hover:underline"
                    style={{ color: "var(--cp-teal)" }}
                  >
                    {noteCount} note{noteCount !== 1 ? "s" : ""} ›
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p
        className="text-xs italic pt-3 mt-3"
        style={{ color: "var(--cp-text-muted)", borderTop: "1px solid rgba(15,107,102,0.15)" }}
      >
        AI-generated synthesis of caregiver notes. Attributed observations only — not a diagnosis.
      </p>
    </div>
  );
}
