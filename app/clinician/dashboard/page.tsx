"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../lib/api";
import { useAuth } from "../../components/AuthProvider";
import { ClinicianHeader } from "../../components/clinician/ClinicianHeader";
import { StatCard } from "../../components/clinician/StatCard";
import { SymptomFrequencyBars } from "../../components/clinician/SymptomFrequencyBars";
import { MedAdherenceBars } from "../../components/clinician/MedAdherenceBars";
import { RecentNotes } from "../../components/clinician/RecentNotes";
import { InsightUnits } from "../../components/clinician/InsightUnits";
import { GlanceLayer } from "../../components/clinician/GlanceLayer";
import { TrajectoryStrip } from "../../components/clinician/TrajectoryStrip";
import { RankedFlag } from "../../components/clinician/RankedFlag";
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
  const rawNotesRef = useRef<HTMLDetailsElement>(null);

  // Opens the Raw Notes disclosure (if closed) and scrolls the cited note(s)
  // into view with a brief highlight — the credibility mechanism an insight's
  // "N notes" link exists for, so this can't be deferred to a plain nav-away.
  const revealNotes = useCallback((dates: string[]) => {
    if (rawNotesRef.current) rawNotesRef.current.open = true;
    setTimeout(() => {
      dates.forEach((date) => {
        const el = document.getElementById(`note-${date}`);
        if (!el) return;
        el.classList.add("note-highlight");
        setTimeout(() => el.classList.remove("note-highlight"), 1600);
      });
      const firstEl = dates[0] ? document.getElementById(`note-${dates[0]}`) : null;
      firstEl?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);
  }, []);

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

  const { patient, clinical_summary, stats, symptom_frequency, med_adherence, recent_notes, window, trajectory, top_flag } = portal;

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

        {/* Glance layer — the 5-second read; everything below is for the clinician who wants more */}
        <GlanceLayer portal={portal} />

        {/* Insight units — the hero, synthesized from caregiver notes */}
        <InsightUnits insights={clinical_summary?.insights ?? []} onReveal={revealNotes} />

        {/* Objective trends — glance owns adherence/symptom-load/episodes/days
            now, so only the metrics with no glance equivalent stay here. */}
        <div className="space-y-6">
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

          {/* How the month moved */}
          <div>
            <SectionTitle>How the Month Moved</SectionTitle>
            <TrajectoryStrip days={trajectory.days} />
          </div>

          {/* Symptom frequency */}
          <div>
            <SectionTitle>Symptom Frequency</SectionTitle>
            <div className="rounded-xl border p-4" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
              <SymptomFrequencyBars data={symptom_frequency} windowDays={window.days} />
            </div>
          </div>

          {/* Ranked flag — the one and only flag section, red reserved for this only */}
          <div>
            <SectionTitle>Flagged This Period</SectionTitle>
            <RankedFlag topFlag={top_flag} patientId={patientId} />
          </div>

          {/* Medication adherence */}
          <div>
            <SectionTitle>Medication Adherence</SectionTitle>
            <div className="rounded-xl border p-4" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
              <MedAdherenceBars data={med_adherence} />
            </div>
          </div>
        </div>

        {/* Raw notes — chronological, collapsed by default, deduplicated */}
        <details className="group" ref={rawNotesRef}>
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
