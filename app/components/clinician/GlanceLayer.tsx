import type { ClinicianPortalResponse, TrendStat } from "../../lib/types";

type Status = "review" | "watch" | "stable";

const STATUS_CONFIG: Record<Status, { label: string; color: string; bg: string }> = {
  review: { label: "Review recommended", color: "var(--cp-amber)", bg: "var(--cp-amber-light)" },
  watch: { label: "Watch", color: "var(--cp-amber)", bg: "var(--cp-amber-light)" },
  stable: { label: "Stable", color: "var(--cp-teal)", bg: "var(--cp-teal-light)" },
};

// Single place that decides the pill + headline, so "what counts as needing a
// look" never drifts between two copies of the same rule.
export function deriveGlanceStatus(portal: ClinicianPortalResponse): { status: Status; headline: string } {
  const { glance_stats, top_flag } = portal;

  if (top_flag || glance_stats.flagged_episodes.direction === "up") {
    return {
      status: "review",
      headline: top_flag
        ? top_flag.text
        : `Flagged episodes rose to ${glance_stats.flagged_episodes.value} this period, up from ${glance_stats.flagged_episodes.prev ?? 0}.`,
    };
  }

  if (glance_stats.symptom_load.direction === "up") {
    return {
      status: "watch",
      headline: `Symptom load is trending up, averaging ${glance_stats.symptom_load.value ?? "—"}/10 this period.`,
    };
  }

  return { status: "stable", headline: "No major changes since the prior period." };
}

function TrendArrow({ direction }: { direction: TrendStat["direction"] }) {
  if (direction === "steady") return <span aria-hidden>→</span>;
  return <span aria-hidden>{direction === "up" ? "↑" : "↓"}</span>;
}

function MicroStat({
  label,
  value,
  prev,
  direction,
  goodDirection,
}: {
  label: string;
  value: string;
  prev: string | null;
  direction: TrendStat["direction"];
  goodDirection: "up" | "down"; // which raw direction reads as improvement for this metric
}) {
  const isGood = direction === goodDirection;
  const isBad = direction !== "steady" && direction !== goodDirection;
  const color = isGood ? "var(--cp-teal)" : isBad ? "var(--cp-amber)" : "var(--cp-text-muted)";
  const word = direction === "steady" ? "steady" : prev != null ? `from ${prev}` : direction;

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--cp-text-muted)" }}>{label}</p>
      <p className="cp-tabular text-2xl font-bold mt-0.5" style={{ color: "var(--cp-text)" }}>{value}</p>
      <p className="text-xs font-semibold mt-0.5 flex items-center gap-1" style={{ color }}>
        <TrendArrow direction={direction} /> {word}
      </p>
    </div>
  );
}

export function GlanceLayer({ portal }: { portal: ClinicianPortalResponse }) {
  const { glance_stats } = portal;
  const { status, headline } = deriveGlanceStatus(portal);
  const cfg = STATUS_CONFIG[status];
  const accentColor = status === "stable" ? "var(--cp-teal)" : "var(--cp-amber)";

  return (
    <div
      className="rounded-2xl p-5"
      style={{ background: "#fff", border: "1px solid var(--cp-border)", borderLeft: `4px solid ${accentColor}` }}
    >
      <span
        className="inline-block text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
        style={{ background: cfg.bg, color: cfg.color, letterSpacing: "0.05em" }}
      >
        {cfg.label}
      </span>
      <p className="text-base font-semibold mt-2 leading-snug" style={{ color: "var(--cp-text)" }}>{headline}</p>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-4 pt-4" style={{ borderTop: "1px solid var(--cp-border)" }}>
        <MicroStat
          label="Med Adherence"
          value={glance_stats.adherence.value != null ? `${glance_stats.adherence.value}%` : "—"}
          prev={glance_stats.adherence.prev != null ? `${glance_stats.adherence.prev}%` : null}
          direction={glance_stats.adherence.direction}
          goodDirection="up"
        />
        <MicroStat
          label="Flagged Episodes"
          value={glance_stats.flagged_episodes.value != null ? `${glance_stats.flagged_episodes.value}` : "—"}
          prev={glance_stats.flagged_episodes.prev != null ? `${glance_stats.flagged_episodes.prev}` : null}
          direction={glance_stats.flagged_episodes.direction}
          goodDirection="down"
        />
        <MicroStat
          label="Symptom Load"
          value={glance_stats.symptom_load.value != null ? `${glance_stats.symptom_load.value}/10` : "—"}
          prev={glance_stats.symptom_load.prev != null ? `${glance_stats.symptom_load.prev}/10` : null}
          direction={glance_stats.symptom_load.direction}
          goodDirection="down"
        />
        <div>
          <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--cp-text-muted)" }}>Days Logged</p>
          <p className="cp-tabular text-2xl font-bold mt-0.5" style={{ color: "var(--cp-text)" }}>
            {glance_stats.days_logged.value}/{glance_stats.days_logged.total}
          </p>
          <p className="text-xs font-semibold mt-0.5" style={{ color: "var(--cp-text-muted)" }}>
            {glance_stats.days_logged.total > 0 && glance_stats.days_logged.value / glance_stats.days_logged.total >= 0.75
              ? "strong"
              : "low"}
          </p>
        </div>
      </div>
    </div>
  );
}
