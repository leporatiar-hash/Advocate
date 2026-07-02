"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../lib/api";
import { useAuth } from "../components/AuthProvider";
import { NavBar } from "../components/NavBar";
import {
  buildMetricRows, filterByTimeframe,
  type MetricRow, type MetricPoint, type Timeframe,
} from "../lib/insights";
import type { Patient, DailyLog, AssessmentStatusItem } from "../lib/types";
import MetricDetailClient from "./[metric]/MetricDetailClient";
import { Sparkline } from "../components/Sparkline";

const NUDGE_DISMISSED_KEY = "truefit_assessments_nudge_dismissed";

// ── Severity color ────────────────────────────────────────────────────────────

function severityColor(value: number): string {
  if (value >= 8) return "#EA580C";
  if (value >= 4) return "#D97706";
  return "#16A34A";
}

// ── Window change (first half avg → second half avg) ─────────────────────────

function computeWindowChange(points: MetricPoint[]): number | null {
  if (points.length < 2) return null;
  const half = Math.ceil(points.length / 2);
  const first = points.slice(0, half);
  const second = points.slice(half);
  if (!second.length) return null;
  const firstAvg = first.reduce((s, p) => s + p.value, 0) / first.length;
  const secondAvg = second.reduce((s, p) => s + p.value, 0) / second.length;
  const diff = secondAvg - firstAvg;
  return Math.abs(diff) < 0.05 ? 0 : diff;
}

// ── Time toggle ───────────────────────────────────────────────────────────────

function TimeframeToggle({
  current,
  onChange,
  activeColor = "#4a7c59",
}: {
  current: Timeframe;
  onChange: (tf: Timeframe) => void;
  activeColor?: string;
}) {
  const options: Timeframe[] = ["1W", "1M", "3M", "1Y"];
  return (
    <div className="flex gap-1 rounded-xl p-1" style={{ background: "#F1F5F9" }}>
      {options.map((tf) => (
        <button
          key={tf}
          onClick={() => onChange(tf)}
          className="flex-1 py-2 rounded-lg text-sm font-bold transition-all"
          style={
            current === tf
              ? { background: "white", color: activeColor, border: `1.5px solid ${activeColor}` }
              : { background: "transparent", color: "#64748B" }
          }
        >
          {tf}
        </button>
      ))}
    </div>
  );
}

// ── Summary prose ─────────────────────────────────────────────────────────────

function buildSummaryProse(
  symptomRows: MetricRow[],
  metricRows: MetricRow[],
  timeframe: Timeframe
): string {
  const symptomData = symptomRows
    .map((r) => {
      const pts = filterByTimeframe(r.allPoints, timeframe);
      if (!pts.length) return null;
      const avg = pts.reduce((s, p) => s + p.value, 0) / pts.length;
      const change = computeWindowChange(pts);
      return { label: r.label, avg, change };
    })
    .filter(Boolean) as { label: string; avg: number; change: number | null }[];

  const sleepRow = metricRows.find((r) => r.key === "sleep");
  const sleepPts = sleepRow ? filterByTimeframe(sleepRow.allPoints, timeframe) : [];

  const adherenceRow = metricRows.find((r) => r.key === "adherence-overall");
  const adherencePts = adherenceRow ? filterByTimeframe(adherenceRow.allPoints, timeframe) : [];

  if (!symptomData.length && !sleepPts.length && !adherencePts.length) {
    return "Not enough logs in this period to show a summary.";
  }

  const periodLabel =
    timeframe === "1W" ? "week"
    : timeframe === "1M" ? "month"
    : timeframe === "3M" ? "three months"
    : "year";

  const sentences: string[] = [];

  if (symptomData.length > 0) {
    const sorted = [...symptomData].sort((a, b) => b.avg - a.avg);
    const top = sorted[0];
    const worsening = symptomData
      .filter((s) => s.change !== null && s.change > 0.5)
      .sort((a, b) => b.change! - a.change!);
    const improving = symptomData
      .filter((s) => s.change !== null && s.change < -0.5)
      .sort((a, b) => a.change! - b.change!);

    if (top.avg >= 7) {
      sentences.push(
        `${top.label} has been elevated this ${periodLabel}, averaging ${top.avg.toFixed(1)}/10.`
      );
    } else if (worsening.length > 0) {
      sentences.push(`${worsening[0].label} has been higher this ${periodLabel}.`);
    } else if (symptomData.every((s) => s.avg < 4)) {
      sentences.push(`Symptoms have been mild overall this ${periodLabel}.`);
    } else if (improving.length > 0) {
      sentences.push(`${improving[0].label} has been improving this ${periodLabel}.`);
    }
  }

  if (sleepPts.length > 0) {
    const avg = sleepPts.reduce((s, p) => s + p.value, 0) / sleepPts.length;
    sentences.push(`Sleep has been steady around ${avg.toFixed(1)} hours.`);
  }

  if (adherencePts.length > 0) {
    const avg = adherencePts.reduce((s, p) => s + p.value, 0) / adherencePts.length;
    sentences.push(`Medication adherence is ${Math.round(avg)}%.`);
  }

  return sentences.length > 0
    ? sentences.join(" ")
    : "Not enough logs in this period to show a summary.";
}

// ── Symptom card ──────────────────────────────────────────────────────────────

function SymptomCard({
  row,
  timeframe,
  onSelect,
  isLast,
}: {
  row: MetricRow;
  timeframe: Timeframe;
  onSelect: () => void;
  isLast: boolean;
}) {
  const windowPoints = filterByTimeframe(row.allPoints, timeframe);
  const latestInWindow = windowPoints.length > 0 ? windowPoints[windowPoints.length - 1].value : null;
  const change = computeWindowChange(windowPoints);

  const dotColor = latestInWindow !== null ? severityColor(latestInWindow) : "#E2E8F0";
  const isWorsening = change !== null && change > 0.3;
  const isImproving = change !== null && change < -0.3;
  const sparkColor = latestInWindow !== null ? severityColor(latestInWindow) : "#B4B2A9";

  const deltaText =
    change === null || Math.abs(change) < 0.3
      ? "—"
      : `${change > 0 ? "↑" : "↓"} ${Math.abs(change).toFixed(1)}`;
  const deltaColor =
    change === null || Math.abs(change) < 0.3
      ? "#94A3B8"
      : change > 0
      ? "#EA580C"
      : "#16A34A";

  const borderStyle = isLast ? undefined : { borderBottom: "0.5px solid #F1F5F9" };

  if (windowPoints.length === 0) {
    return (
      <button
        type="button"
        onClick={onSelect}
        className="w-full flex items-center gap-3 px-5 py-4 text-left active:bg-slate-50"
        style={borderStyle}
      >
        <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: "#E2E8F0" }} />
        <p className="flex-1 min-w-0 text-base font-semibold text-navy truncate">{row.label}</p>
        <p className="text-sm text-slate-400 flex-shrink-0">No data</p>
        <svg className="w-4 h-4 flex-shrink-0" style={{ color: "#CBD5E1" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-5 py-4 text-left transition-colors active:bg-slate-50"
      style={borderStyle}
    >
      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: dotColor }} />
      <p className="flex-1 min-w-0 text-base font-semibold text-navy truncate">{row.label}</p>
      <Sparkline points={windowPoints} color={sparkColor} />
      <p className="text-sm font-semibold flex-shrink-0 min-w-[44px] text-right" style={{ color: deltaColor }}>
        {deltaText}
      </p>
      <svg className="w-4 h-4 flex-shrink-0" style={{ color: "#CBD5E1" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function InsightsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState<string | null>(null);
  const [timeframe, setTimeframe] = useState<Timeframe>("1W");
  const [dueAssessments, setDueAssessments] = useState<AssessmentStatusItem[]>([]);
  const [nudgeDismissed, setNudgeDismissed] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const patients = (await api.getPatients()) as Patient[];
      if (!patients.length) { router.push("/onboarding"); return; }
      const p = patients[0];
      setPatient(p);
      const logsData = (await api.getLogs(p.id)) as DailyLog[];
      setLogs(logsData);
      api.getAssessmentStatus(p.id)
        .then((status) => setDueAssessments((status as AssessmentStatusItem[]).filter((s) => s.due)))
        .catch(() => {});
    } catch {
      // silent
    } finally {
      setDataLoading(false);
    }
  }, [router]);

  useEffect(() => {
    setNudgeDismissed(sessionStorage.getItem(NUDGE_DISMISSED_KEY) === "1");
  }, []);

  function dismissNudge() {
    sessionStorage.setItem(NUDGE_DISMISSED_KEY, "1");
    setNudgeDismissed(true);
  }

  useEffect(() => {
    if (!isLoading && !user) { router.push("/login"); return; }
    if (!isLoading && user) loadData();
  }, [user, isLoading, loadData, router]);

  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") loadData();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadData]);

  const allMedications = useMemo(() => patient?.medications ?? [], [patient]);

  const configuredSymptoms = useMemo(() => {
    if (user?.user_config?.symptoms?.length) return user.user_config.symptoms as string[];
    if (patient?.dashboard_config?.symptoms?.length) return patient.dashboard_config.symptoms as string[];
    return [] as string[];
  }, [user, patient]);

  const metricRows = useMemo(
    () => buildMetricRows(logs, allMedications, configuredSymptoms),
    [logs, allMedications, configuredSymptoms]
  );

  const symptomRows = useMemo(
    () =>
      metricRows
        .filter((r) => r.unit === "/10")
        .sort((a, b) => (b.latestValue ?? 0) - (a.latestValue ?? 0)),
    [metricRows]
  );

  const summaryProse = useMemo(
    () => buildSummaryProse(symptomRows, metricRows, timeframe),
    [symptomRows, metricRows, timeframe]
  );

  const dominantSeverityColor = useMemo(() => {
    const pts = symptomRows.flatMap((r) => filterByTimeframe(r.allPoints, timeframe));
    if (!pts.length) return "#4a7c59";
    const avg = pts.reduce((s, p) => s + p.value, 0) / pts.length;
    return avg >= 8 ? "#EA580C" : avg >= 4 ? "#D97706" : "#16A34A";
  }, [symptomRows, timeframe]);

  if (isLoading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#faf9f6" }}>
        <div
          className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
          style={{ borderColor: "#4a7c59", borderTopColor: "transparent" }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: "#faf9f6" }}>
      {selectedMetric && (
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "#faf9f6" }}>
          <MetricDetailClient metricKey={selectedMetric} onBack={() => setSelectedMetric(null)} />
        </div>
      )}
      <NavBar />

      <div className="max-w-lg mx-auto pt-6 px-4 space-y-4">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-navy">Insights</h1>
          {patient && (
            <p className="text-base text-slate-500 mt-1">{patient.name}</p>
          )}
        </div>

        {/* Assessments nudge */}
        {dueAssessments.length > 0 && !nudgeDismissed && (
          <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-slate-100 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <Link href="/assessments" className="text-base font-semibold text-navy">
                {dueAssessments.length} monthly check-in{dueAssessments.length > 1 ? "s" : ""} available
              </Link>
            </div>
            <button
              type="button"
              onClick={dismissNudge}
              aria-label="Dismiss"
              className="w-7 h-7 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 flex-shrink-0"
            >
              ×
            </button>
          </div>
        )}

        {/* Time toggle */}
        <TimeframeToggle current={timeframe} onChange={setTimeframe} activeColor={dominantSeverityColor} />

        {metricRows.length === 0 ? (
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 text-center">
            <p className="text-lg font-semibold text-navy">No data yet</p>
            <p className="text-base text-slate-500 mt-2">
              Start logging daily to see trends and patterns here.
            </p>
            <Link
              href="/log"
              className="inline-block mt-5 px-6 py-3 rounded-2xl text-white font-semibold text-base"
              style={{ background: "#4a7c59" }}
            >
              Log Today
            </Link>
          </div>
        ) : (
          <>
            {/* Summary card */}
            <div className="bg-white rounded-2xl px-5 py-4 shadow-sm border border-slate-100">
              <p className="text-base text-slate-700 leading-relaxed">{summaryProse}</p>
            </div>

            {/* Symptom grid */}
            {symptomRows.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
                {symptomRows.map((r, i) => (
                  <SymptomCard
                    key={r.key}
                    row={r}
                    timeframe={timeframe}
                    onSelect={() => setSelectedMetric(r.key)}
                    isLast={i === symptomRows.length - 1}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
