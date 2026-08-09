import Link from "next/link";
import type { ClinicalSummary as ClinicalSummaryType } from "../../lib/types";

function fmtShortDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function fmtGeneratedAt(iso: string) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function ShieldIcon({ color }: { color: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 2l8 4v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10V6l8-4z" />
    </svg>
  );
}

function ClusterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-wide mb-1.5" style={{ color: "var(--cp-text-muted)" }}>
        {title}
      </p>
      {children}
    </div>
  );
}

export function ClinicalSummary({ data, patientId }: { data: ClinicalSummaryType | null; patientId: number }) {
  if (!data) {
    return (
      <div className="rounded-2xl p-6" style={{ background: "var(--cp-teal-light)", border: "1.5px solid var(--cp-teal)" }}>
        <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--cp-teal)", letterSpacing: "0.1em" }}>
          AI Summary · Notes Synthesis
        </p>
        <p className="text-xl font-bold mb-2" style={{ color: "var(--cp-teal)" }}>
          Clinical Summary
        </p>
        <p className="text-sm" style={{ color: "var(--cp-text-muted)" }}>
          Not yet generated for this patient.
        </p>
      </div>
    );
  }

  const { summary, safety, medication_response, trajectory, generated_at } = data;

  return (
    <div
      className="rounded-2xl p-6 space-y-5"
      style={{ background: "var(--cp-teal-light)", border: "1.5px solid var(--cp-teal)", boxShadow: "0 4px 20px rgba(15,107,102,0.10)" }}
    >
      <div>
        <p className="text-xs font-bold uppercase tracking-widest mb-1" style={{ color: "var(--cp-teal)", letterSpacing: "0.1em" }}>
          AI Summary · Notes Synthesis
        </p>
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h2 className="text-xl font-bold" style={{ color: "var(--cp-teal)" }}>Clinical Summary</h2>
          <span className="text-xs flex-shrink-0" style={{ color: "var(--cp-text-muted)" }}>
            Generated {fmtGeneratedAt(generated_at)}
          </span>
        </div>
      </div>

      <p className="text-base leading-relaxed" style={{ color: "var(--cp-text)" }}>{summary}</p>

      <ClusterSection title="Safety">
        {safety.has_events ? (
          <div className="space-y-2">
            {safety.events.map((ev, i) => {
              const dateBadge = ev.event_date && (
                <p className="text-xs font-bold cp-tabular mb-0.5" style={{ color: "var(--cp-red)" }}>
                  {fmtShortDate(ev.event_date)}
                </p>
              );
              return (
                <div key={i} className="rounded-xl p-3" style={{ background: "var(--cp-red-light)", border: "1px solid #fecaca" }}>
                  <div className="flex items-start gap-2">
                    <span className="flex-shrink-0 mt-0.5"><ShieldIcon color="var(--cp-red)" /></span>
                    <div className="min-w-0">
                      {ev.event_date ? (
                        <Link href={`/clinician/log/?patient_id=${patientId}&date=${ev.event_date}`} className="inline-block hover:underline">
                          {dateBadge}
                        </Link>
                      ) : (
                        <p className="text-xs font-semibold mb-0.5" style={{ color: "var(--cp-text-muted)" }}>Date unconfirmed</p>
                      )}
                      <p className="text-sm" style={{ color: "var(--cp-text)" }}>{ev.text}</p>
                      {ev.quote && (
                        <p className="text-sm italic mt-1" style={{ color: "var(--cp-text-muted)" }}>&ldquo;{ev.quote}&rdquo;</p>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl p-3" style={{ background: "#fff", border: "1px solid var(--cp-border)" }}>
            <ShieldIcon color="var(--cp-teal)" />
            <p className="text-sm" style={{ color: "var(--cp-text)" }}>{safety.no_events_text}</p>
          </div>
        )}
      </ClusterSection>

      <ClusterSection title="Medication Response">
        <div className="rounded-xl p-3" style={{ background: "#fff", border: "1px solid var(--cp-border)" }}>
          <p className="text-sm leading-relaxed" style={{ color: "var(--cp-text)" }}>{medication_response.text}</p>
        </div>
      </ClusterSection>

      <ClusterSection title="Trajectory">
        <div className="rounded-xl p-3" style={{ background: "#fff", border: "1px solid var(--cp-border)" }}>
          <p className="text-sm leading-relaxed" style={{ color: "var(--cp-text)" }}>{trajectory.text}</p>
        </div>
      </ClusterSection>

      <p className="text-xs italic pt-1" style={{ color: "var(--cp-text-muted)", borderTop: "1px solid rgba(15,107,102,0.15)" }}>
        AI-generated synthesis of caregiver notes. Attributed observations only — not a diagnosis.
      </p>
    </div>
  );
}
