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
import { WhatWentWell } from "../../components/clinician/WhatWentWell";
import { CustomizeControl } from "../../components/clinician/CustomizeControl";
import { DEFAULT_CLINICIAN_PREFS, loadClinicianPrefs, saveClinicianPrefs, type ClinicianPrefs } from "../../lib/clinicianPrefs";
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

  // Demo-local view preferences — see app/lib/clinicianPrefs.ts. Starts at
  // defaults (safe for the server-rendered shell) and is replaced with the
  // real stored value on mount, client-side only.
  const [prefs, setPrefs] = useState<ClinicianPrefs>(DEFAULT_CLINICIAN_PREFS);
  useEffect(() => {
    setPrefs(loadClinicianPrefs());
  }, []);
  const updatePrefs = useCallback((next: ClinicianPrefs) => {
    setPrefs(next);
    saveClinicianPrefs(next);
  }, []);
  const resetPrefs = useCallback(() => {
    setPrefs(DEFAULT_CLINICIAN_PREFS);
    saveClinicianPrefs(DEFAULT_CLINICIAN_PREFS);
  }, []);

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

  const { patient, clinical_summary, stats, symptom_frequency, med_adherence, recent_notes, window, top_flag } = portal;

  // A patient with literally zero sleep logs ever gets no card at all, rather
  // than a "No data" shell sitting alone — sections with nothing to say
  // render nothing, per the same principle EmptyState applies elsewhere.
  const hasSleepData = stats.avg_sleep.days_logged > 0;

  return (
    <div className="min-h-screen pb-10">
      <ClinicianHeader
        patientName={patient.name}
        backHref="/clinician"
        actions={<CustomizeControl prefs={prefs} onChange={updatePrefs} onReset={resetPrefs} />}
      />

      <div className="mx-auto px-4 pt-6 space-y-6 max-w-[1150px]">

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

        {/* Glance layer — full-width banner, the 5-second read. Never optional. */}
        <GlanceLayer portal={portal} />

        {/* Two columns on desktop (~60/40), single stacked column below ~900px.
            Each column flows independently at its own natural height — this is
            a layout wrapper only, the section components underneath are untouched. */}
        <div className="grid grid-cols-1 gap-6 min-[900px]:grid-cols-[3fr_2fr] min-[900px]:gap-8 items-start">
          {/* Left column — the hero read */}
          <div className="space-y-6 min-w-0">
            <InsightUnits insights={clinical_summary?.insights ?? []} onReveal={revealNotes} />

            {/* Caregiver Alert (red, ranked flag — never optional) beside What
                Went Well (green, attributed positives) — good and bad side by
                side on desktop, Caregiver Alert first when stacked on mobile. */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-stretch">
              <div>
                <SectionTitle>Caregiver Alert</SectionTitle>
                <RankedFlag topFlag={top_flag} patientId={patientId} />
              </div>
              <div>
                <SectionTitle>What Went Well</SectionTitle>
                <WhatWentWell items={clinical_summary?.what_went_well ?? []} />
              </div>
            </div>
          </div>

          {/* Right column — objective trends. Glance owns adherence/symptom-load/
              episodes/days already, so only metrics with no glance equivalent,
              or with per-day/per-symptom detail, live here. */}
          <div className="space-y-6 min-w-0">
            {hasSleepData && (
              <StatCard
                label="Avg Sleep"
                value={stats.avg_sleep.hours != null ? `${stats.avg_sleep.hours}h` : "Insufficient data"}
                sublabel={
                  stats.avg_sleep.hours == null
                    ? `${stats.avg_sleep.days_logged} of ${window.days} days logged`
                    : undefined
                }
              />
            )}

            {prefs.showTrajectory && <TrajectoryStrip patientId={patientId} />}

            {prefs.showSymptomFrequency && (
              <div>
                <SectionTitle>Symptom Frequency</SectionTitle>
                <div className="rounded-xl border p-4" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
                  <SymptomFrequencyBars data={symptom_frequency} windowDays={window.days} />
                </div>
              </div>
            )}

            {prefs.showMedAdherence && (
              <div>
                <SectionTitle>Medication Adherence</SectionTitle>
                <div className="rounded-xl border p-4" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
                  <MedAdherenceBars data={med_adherence} />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Raw notes — full width, chronological, collapsed by default,
            deduplicated. The page's deliberate end, before the footer. */}
        {prefs.showRawNotes && (
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
        )}

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
