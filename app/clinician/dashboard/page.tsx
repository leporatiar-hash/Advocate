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
import {
  SymptomTrendChart,
  SymptomSmallMultiples,
  AdherenceTrendChart,
} from "../../components/clinician/TrendCharts";
import {
  DEFAULT_CLINICIAN_PREFS,
  loadClinicianPrefs,
  orderedEnabled,
  type ClinicianPrefs,
  type ModuleId,
} from "../../lib/clinicianPrefs";
import type { ClinicianPortalResponse } from "../../lib/types";

const WINDOW_OPTIONS = [14, 30, 90];

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
  const [windowDays, setWindowDays] = useState(30);
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
    setDataLoading(true);
    try {
      const result = (await api.getClinicianPortal(patientId, windowDays)) as ClinicianPortalResponse;
      setPortal(result);
      setError(false);
    } catch {
      setError(true);
    } finally {
      setDataLoading(false);
    }
  }, [patientId, windowDays]);

  useEffect(() => {
    if (!isLoading && !user) { router.push("/login"); return; }
    if (!patientId) { router.push("/clinician"); return; }
    if (!isLoading && user) loadData();
  }, [user, isLoading, patientId, loadData, router]);

  if (isLoading || (dataLoading && !portal)) {
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

  const {
    patient, clinical_summary, stats, symptom_frequency, symptom_series,
    adherence_series, med_adherence, recent_notes, window: portalWindow, top_flag,
  } = portal;

  // A patient with literally zero sleep logs ever gets no card at all, rather
  // than a "No data" shell sitting alone — sections with nothing to say
  // render nothing, per the same principle EmptyState applies elsewhere.
  const hasSleepData = stats.avg_sleep.days_logged > 0;

  /**
   * Modules render in the clinician's configured order (see /clinician/configure).
   * The glance banner is deliberately not in this list — it is the five-second
   * read the whole page is built around, and stays pinned above everything.
   */
  function renderModule(id: ModuleId) {
    switch (id) {
      case "summary":
        return <InsightUnits insights={clinical_summary?.insights ?? []} onReveal={revealNotes} />;

      case "alerts":
        return (
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
        );

      case "symptomCharts":
        return <SymptomTrendChart block={symptom_series} windowDays={portalWindow.days} />;

      case "smallMultiples":
        return <SymptomSmallMultiples block={symptom_series} />;

      case "adherenceChart":
        return <AdherenceTrendChart block={adherence_series} windowDays={portalWindow.days} />;

      case "trajectory":
        return <TrajectoryStrip patientId={patientId} />;

      case "symptomFrequency":
        return (
          <div>
            <SectionTitle>Symptom Frequency</SectionTitle>
            <div className="rounded-xl border p-4" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
              <SymptomFrequencyBars data={symptom_frequency} windowDays={portalWindow.days} />
            </div>
          </div>
        );

      case "medAdherence":
        return (
          <div>
            <SectionTitle>Adherence by Medication</SectionTitle>
            <div className="rounded-xl border p-4" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
              <MedAdherenceBars data={med_adherence} />
            </div>
          </div>
        );

      case "rawNotes":
        return (
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
        );

      default:
        return null;
    }
  }

  return (
    <div className="min-h-screen pb-10">
      <ClinicianHeader
        patientName={patient.name}
        backHref="/clinician"
        actions={<CustomizeControl />}
      />

      <div className="mx-auto px-4 pt-6 space-y-6 max-w-[1150px]">

        {/* Patient header */}
        <div className="flex items-start justify-between gap-3 flex-wrap">
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
          </div>

          {/* Time range, in one row with the header rather than buried in a
              section — it reframes every number on the page. */}
          <div className="flex rounded-lg overflow-hidden border" style={{ borderColor: "var(--cp-border)" }}>
            {WINDOW_OPTIONS.map((d) => (
              <button
                key={d}
                onClick={() => setWindowDays(d)}
                aria-pressed={windowDays === d}
                className="px-3 py-1.5 text-xs font-semibold transition-colors"
                style={{
                  background: windowDays === d ? "var(--cp-teal)" : "#fff",
                  color: windowDays === d ? "#fff" : "var(--cp-text-muted)",
                }}
              >
                {d} days
              </button>
            ))}
          </div>
        </div>

        {/* Glance layer — full-width banner, the 5-second read. Never optional. */}
        <GlanceLayer portal={portal} />

        {hasSleepData && (
          <StatCard
            label="Avg Sleep"
            value={stats.avg_sleep.hours != null ? `${stats.avg_sleep.hours}h` : "Insufficient data"}
            sublabel={
              stats.avg_sleep.hours == null
                ? `${stats.avg_sleep.days_logged} of ${portalWindow.days} days logged`
                : undefined
            }
          />
        )}

        {/* Configurable modules, in the clinician's order. */}
        <div className={`space-y-6 transition-opacity ${dataLoading ? "opacity-50" : ""}`}>
          {orderedEnabled(prefs).map((id) => (
            <div key={id}>{renderModule(id)}</div>
          ))}
        </div>

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
