import type { DailyLog, MedicationTaken } from "../../lib/types";

const SIMPLE_TIME_LABELS: Record<string, string> = {
  "08:00": "Morning",
  "13:00": "Afternoon",
  "18:00": "Evening",
  "21:00": "Night",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
      <p className="text-xs font-bold uppercase tracking-wide mb-2" style={{ color: "var(--cp-text-muted)" }}>
        {title}
      </p>
      {children}
    </div>
  );
}

export function LogDrillDown({ log }: { log: DailyLog }) {
  const meds = (log.medications_taken ?? []) as MedicationTaken[];
  const symptoms = log.symptoms ?? [];
  const hasVitals = log.mood_score !== null || log.sleep_hours !== null;

  return (
    <div className="space-y-3">
      {hasVitals && (
        <Section title="Vitals">
          <div className="flex gap-5 flex-wrap text-sm">
            {log.mood_score !== null && (
              <div>
                <span style={{ color: "var(--cp-text-muted)" }}>Mood </span>
                <span className="cp-tabular font-semibold" style={{ color: "var(--cp-text)" }}>{log.mood_score}/10</span>
              </div>
            )}
            {log.sleep_hours !== null && (
              <div>
                <span style={{ color: "var(--cp-text-muted)" }}>Sleep </span>
                <span className="cp-tabular font-semibold" style={{ color: "var(--cp-text)" }}>{log.sleep_hours}h</span>
              </div>
            )}
          </div>
        </Section>
      )}

      {meds.length > 0 && (
        <Section title="Medications">
          <div className="space-y-1.5">
            {meds.map((m, i) => (
              <div key={i} className="flex items-center gap-2 text-sm">
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: m.taken ? "#DCFCE7" : "var(--cp-red-light)" }}
                >
                  {m.taken ? (
                    <svg className="w-2.5 h-2.5" style={{ color: "#16A34A" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    <svg className="w-2.5 h-2.5" style={{ color: "var(--cp-red)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  )}
                </span>
                <span style={{ color: m.taken ? "var(--cp-text)" : "var(--cp-text-muted)" }}>
                  {m.medication_name ?? `Medication ${m.medication_id}`}
                  {m.time_taken ? ` · ${SIMPLE_TIME_LABELS[m.time_taken] ?? m.time_taken}` : ""}
                </span>
              </div>
            ))}
          </div>
        </Section>
      )}

      {symptoms.length > 0 && (
        <Section title="Symptoms">
          <div className="flex flex-wrap gap-1.5">
            {symptoms.map((s, i) => {
              const sv = s.severity ?? 0;
              const palette =
                sv >= 8
                  ? { bg: "var(--cp-red-light)", color: "var(--cp-red)" }
                  : sv >= 5
                  ? { bg: "var(--cp-amber-light)", color: "var(--cp-amber)" }
                  : { bg: "#F3F4F6", color: "var(--cp-text-muted)" };
              return (
                <span
                  key={i}
                  className="px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{ background: palette.bg, color: palette.color }}
                >
                  {s.name}{s.severity != null ? ` · ${s.severity}/10` : ""}
                </span>
              );
            })}
          </div>
        </Section>
      )}

      {log.notes?.trim() && (
        <Section title="Caregiver Notes">
          <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--cp-text)" }}>
            {log.notes}
          </p>
        </Section>
      )}

      {log.photo && (
        <Section title="Photo">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={log.photo} alt="Daily log photo" className="w-full rounded-lg object-cover max-h-96" />
        </Section>
      )}

      {!hasVitals && meds.length === 0 && symptoms.length === 0 && !log.notes?.trim() && !log.photo && (
        <Section title="Log">
          <p className="text-sm" style={{ color: "var(--cp-text-muted)" }}>
            This day has a log entry with no details recorded.
          </p>
        </Section>
      )}
    </div>
  );
}
