"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../lib/api";
import { useAuth } from "../../components/AuthProvider";
import { ClinicianHeader } from "../../components/clinician/ClinicianHeader";
import { StatCard } from "../../components/clinician/StatCard";
import { FlagList } from "../../components/clinician/FlagList";
import { SymptomFrequencyBars } from "../../components/clinician/SymptomFrequencyBars";
import { MedAdherenceBars } from "../../components/clinician/MedAdherenceBars";
import { RecentNotes } from "../../components/clinician/RecentNotes";
import { ClinicalSummary } from "../../components/clinician/ClinicalSummary";
import type { ClinicianPortalResponse } from "../../lib/types";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: "var(--cp-text-muted)" }}>
      {children}
    </h2>
  );
}

function DashboardContent() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = Number(searchParams.get("patient_id"));

  const [portal, setPortal] = useState<ClinicianPortalResponse | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const result = (await api.getClinicianPortal(patientId, 30)) as ClinicianPortalResponse;
      setPortal(result);
    } catch {
      setError(true);
    } finally {
      setDataLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    if (!isLoading && !user) { router.push("/login"); return; }
    if (!patientId) { router.push("/clinician"); return; }
    if (!isLoading && user) loadData();
  }, [user, isLoading, patientId, loadData, router]);

  if (isLoading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--cp-bg)" }}>
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--cp-teal)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (error || !portal) {
    return (
      <div className="min-h-screen">
        <ClinicianHeader backHref="/clinician" />
        <div className="max-w-lg mx-auto px-4 pt-8">
          <div className="rounded-xl border p-6 text-center" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
            <p className="text-sm" style={{ color: "var(--cp-text-muted)" }}>Could not load this patient&apos;s data.</p>
          </div>
        </div>
      </div>
    );
  }

  const { patient, clinical_summary, stats, flags, symptom_frequency, med_adherence, recent_notes, window } = portal;

  return (
    <div className="min-h-screen pb-10">
      <ClinicianHeader patientName={patient.name} backHref="/clinician" />

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-6">

        {/* Patient header */}
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold" style={{ color: "var(--cp-text)" }}>{patient.name}</h1>
            <span
              className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full"
              style={{ background: "var(--cp-teal-light)", color: "var(--cp-teal)", letterSpacing: "0.05em" }}
            >
              Read-only
            </span>
          </div>
          <p className="text-sm mt-0.5" style={{ color: "var(--cp-text-muted)" }}>
            {patient.age !== null ? `Age ${patient.age}` : "Age unknown"}
            {patient.active_medications.length > 0 ? ` · ${patient.active_medications.join(", ")}` : ""}
          </p>
          <p className="text-xs font-semibold mt-2 inline-block px-2 py-0.5 rounded-full" style={{ background: "var(--cp-teal-light)", color: "var(--cp-teal)" }}>
            Last {window.days} days
          </p>
        </div>

        {/* Clinical Summary — the hero, synthesized from caregiver notes */}
        <ClinicalSummary data={clinical_summary} patientId={patientId} />

        {/* Supporting structured data — demoted below the notes synthesis */}
        <div>
          <p className="text-xs font-bold uppercase tracking-widest mb-3" style={{ color: "var(--cp-text-muted)", letterSpacing: "0.08em" }}>
            Supporting Data
          </p>

          <div className="space-y-6">
            {/* 4 stat cards */}
            <div className="grid grid-cols-2 gap-3">
              <StatCard
                label="Log Frequency"
                value={`${stats.log_frequency.days_logged}/${stats.log_frequency.days_in_window}`}
                sublabel={`${stats.log_frequency.pct}% of days logged`}
              />
              <StatCard
                label="Symptom Load"
                value={stats.symptom_load.avg_severity != null ? `${stats.symptom_load.avg_severity}/10` : "—"}
                sublabel={`${stats.symptom_load.distinct_symptoms} distinct symptom${stats.symptom_load.distinct_symptoms !== 1 ? "s" : ""}`}
              />
              <StatCard
                label="Avg Sleep"
                value={
                  stats.avg_sleep.hours != null
                    ? `${stats.avg_sleep.hours}h`
                    : stats.avg_sleep.days_logged > 0
                    ? "Insufficient data"
                    : "No data"
                }
                sublabel={
                  stats.avg_sleep.hours == null
                    ? `${stats.avg_sleep.days_logged} of ${window.days} days logged`
                    : undefined
                }
              />
              <StatCard
                label="Med Adherence"
                value={`${stats.med_adherence.pct}%`}
              />
            </div>

            {/* Flags */}
            <FlagList flags={flags} />

            {/* Symptom frequency */}
            <div>
              <SectionTitle>Symptom Frequency</SectionTitle>
              <div className="rounded-xl border p-4" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
                <SymptomFrequencyBars data={symptom_frequency} windowDays={window.days} />
              </div>
            </div>

            {/* Medication adherence */}
            <div>
              <SectionTitle>Medication Adherence</SectionTitle>
              <div className="rounded-xl border p-4" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
                <MedAdherenceBars data={med_adherence} />
              </div>
            </div>
          </div>
        </div>

        {/* Raw notes — chronological, collapsed by default, deduplicated */}
        <details className="group">
          <summary className="text-xs font-bold uppercase tracking-wide mb-2 cursor-pointer select-none list-none flex items-center gap-1.5" style={{ color: "var(--cp-text-muted)" }}>
            <svg className="w-3.5 h-3.5 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            Raw Notes
          </summary>
          <div className="mt-2">
            <RecentNotes notes={recent_notes} patientId={patientId} />
          </div>
        </details>

        <p className="text-xs text-center pt-2" style={{ color: "var(--cp-text-muted)" }}>
          Read-only pre-visit summary generated by Advocate from caregiver-logged observations. Not a diagnostic tool.
        </p>

      </div>
    </div>
  );
}

export default function ClinicianDashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--cp-bg)" }}>
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--cp-teal)", borderTopColor: "transparent" }} />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
