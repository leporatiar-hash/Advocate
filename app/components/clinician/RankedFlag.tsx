import Link from "next/link";
import type { TopFlag } from "../../lib/types";

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Only the single highest-severity note this period gets the red treatment —
// every other flagged metric stays in Supporting Data / Raw Notes so red
// keeps meaning "the one thing to look at first."
export function RankedFlag({ topFlag, patientId }: { topFlag: TopFlag | null; patientId: number }) {
  if (!topFlag) {
    return (
      <div className="rounded-2xl p-5" style={{ background: "var(--cp-teal-light)", border: "1px solid var(--cp-teal)" }}>
        <p className="text-sm font-semibold" style={{ color: "var(--cp-teal)" }}>
          No high-severity notes flagged this period.
        </p>
      </div>
    );
  }

  return (
    <Link
      href={`/clinician/log/?patient_id=${patientId}&date=${topFlag.date}`}
      className="block rounded-2xl p-5 transition-colors hover:opacity-90"
      style={{ background: "var(--cp-red-light)", border: "1px solid var(--cp-red)" }}
    >
      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: "var(--cp-red)" }}>
        Highest-severity note · {fmtDate(topFlag.date)}
      </p>
      {/* text and quote are always the same caregiver note verbatim — shown
          once, as a quote, rather than duplicated as a synthesized lead-in
          plus a repeated quote below it. */}
      <p
        className="text-sm italic mt-2 pl-3"
        style={{ color: "var(--cp-text)", borderLeft: "2px solid var(--cp-red)" }}
      >
        &ldquo;{topFlag.quote ?? topFlag.text}&rdquo;
      </p>
    </Link>
  );
}

/** Quick View version: the same single highest-severity note, in a quiet
 * neutral card instead of red. Still links to the full day's log. */
export function CalmCaregiverAlert({ topFlag, patientId }: { topFlag: TopFlag | null; patientId: number }) {
  return (
    <div>
      <h2 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "var(--cp-text-muted)" }}>
        Caregiver alert
      </h2>
      {topFlag ? (
        <Link
          href={`/clinician/log/?patient_id=${patientId}&date=${topFlag.date}`}
          className="block rounded-2xl px-5 py-4 transition-colors hover:opacity-90"
          style={{ background: "#fff", border: "1px solid var(--cp-border)", borderLeft: "3px solid var(--cp-teal)" }}
        >
          <p className="text-xs font-semibold" style={{ color: "var(--cp-text-muted)" }}>
            Caregiver note · {fmtDate(topFlag.date)}
          </p>
          <p className="text-sm italic mt-1.5" style={{ color: "var(--cp-text)" }}>
            &ldquo;{topFlag.quote ?? topFlag.text}&rdquo;
          </p>
        </Link>
      ) : (
        <div className="rounded-2xl px-5 py-4" style={{ background: "#fff", border: "1px solid var(--cp-border)" }}>
          <p className="text-sm" style={{ color: "var(--cp-text-muted)" }}>Nothing flagged by caregivers this period.</p>
        </div>
      )}
    </div>
  );
}
