import Link from "next/link";
import type { RecentNote } from "../../lib/types";
import { EmptyState } from "./EmptyState";

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

export function RecentNotes({ notes, patientId }: { notes: RecentNote[]; patientId: number }) {
  if (!notes.length) return <EmptyState text="No notes yet." />;

  return (
    <div className="space-y-2">
      {notes.map((n) => (
        <Link
          key={n.date}
          id={`note-${n.date}`}
          href={`/clinician/log/?patient_id=${patientId}&date=${n.date}`}
          className="block rounded-xl border p-3 transition-colors hover:border-[var(--cp-teal)]"
          style={{ background: "#fff", borderColor: "var(--cp-border)" }}
        >
          <div className="flex items-center justify-between gap-2 mb-1">
            <span className="text-xs font-semibold cp-tabular" style={{ color: "var(--cp-text-muted)" }}>
              {fmtDate(n.date)}
            </span>
            {n.badges.length > 0 && (
              <div className="flex gap-1 flex-wrap justify-end">
                {n.badges.map((b) => (
                  <span
                    key={b}
                    className="text-[10px] font-semibold px-1.5 py-0.5 rounded-full whitespace-nowrap"
                    style={{ background: "var(--cp-amber-light)", color: "var(--cp-amber)" }}
                  >
                    {b}
                  </span>
                ))}
              </div>
            )}
          </div>
          <p className="text-sm line-clamp-2 leading-snug" style={{ color: "var(--cp-text)" }}>
            {n.text}
          </p>
          {n.reaffirmed_dates.length > 0 && (
            <p className="text-xs mt-1.5" style={{ color: "var(--cp-text-muted)" }}>
              Reaffirmed without new detail on {n.reaffirmed_dates.map(fmtDate).join(", ")}
            </p>
          )}
        </Link>
      ))}
    </div>
  );
}
