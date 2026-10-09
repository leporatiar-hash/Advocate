import type { ProgressStats } from "../lib/types";

function fmtShort(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

const TREND_TEXT = { improving: "↑ Improving", steady: "Steady", declining: "↓ Declining" } as const;

/** Server-computed progress (services/progress.py): each improvement area,
 * then the caregiver's wins. Higher / "better" is good. Unstyled container so
 * the caregiver summary, print report and clinician dashboard can each wrap it
 * in their own card. */
export function ProgressSummary({ stats, maxWins = 5, inkColor = "#1a2420", softColor = "#64748B" }: {
  stats: ProgressStats;
  maxWins?: number;
  inkColor?: string;
  softColor?: string;
}) {
  const areas = Object.entries(stats.areas);
  const wins = [...stats.wins].reverse().slice(0, maxWins);
  if (!areas.length && !wins.length) return null;
  return (
    <div className="space-y-4">
      {areas.map(([name, st]) => (
        <div key={name} className="space-y-0.5">
          <p className="text-base font-semibold" style={{ color: inkColor }}>
            {name}
            {st.linked_medication && <span className="font-normal text-sm" style={{ color: softColor }}> · tracking {st.linked_medication}</span>}
          </p>
          {st.scale === "numeric" ? (
            <p className="text-sm" style={{ color: inkColor }}>
              Average <span className="font-semibold">{st.avg}/10</span> · latest {String(st.latest.value)}/10 on {fmtShort(st.latest.date)}
              {st.trend && (
                <span className="font-semibold"> · {TREND_TEXT[st.trend]}
                  {st.trend !== "steady" && <span className="font-normal" style={{ color: softColor }}> ({st.first_half_avg} → {st.last_half_avg})</span>}
                </span>
              )}
              {!st.trend && <span style={{ color: softColor }}> · {st.count} rating{st.count === 1 ? "" : "s"}, too few for a trend</span>}
            </p>
          ) : (
            <p className="text-sm" style={{ color: inkColor }}>
              Compared with usual: better on <span className="font-semibold">{st.counts?.better ?? 0}</span> day{st.counts?.better === 1 ? "" : "s"},
              same on {st.counts?.same ?? 0}, worse on {st.counts?.worse ?? 0}
            </p>
          )}
        </div>
      ))}
      {wins.length > 0 && (
        <div className="space-y-1">
          <p className="text-sm font-semibold" style={{ color: softColor }}>Wins</p>
          <ul className="space-y-1">
            {wins.map((w, i) => (
              <li key={i} className="text-sm" style={{ color: inkColor }}>
                <span style={{ color: softColor }}>{fmtShort(w.date)} · </span>{w.text}
              </li>
            ))}
          </ul>
          {stats.wins.length > wins.length && (
            <p className="text-xs" style={{ color: softColor }}>+ {stats.wins.length - wins.length} earlier</p>
          )}
        </div>
      )}
    </div>
  );
}
