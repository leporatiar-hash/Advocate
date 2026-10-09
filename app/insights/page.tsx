"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../lib/api";
import { withAdherenceDoses } from "../lib/medSchedule";
import { useAuth } from "../components/AuthProvider";
import { NavBar } from "../components/NavBar";
import {
  buildMetricRows, filterByTimeframe, formatValue, metricDomain, severityWord,
  type MetricRow, type MetricPoint, type Timeframe,
} from "../lib/insights";
import { TimeframeToggle, periodLabel } from "../components/TimeframeToggle";
import { lora, serif, WARM } from "../lib/warmTheme";
import type { Patient, DailyLog, AssessmentStatusItem } from "../lib/types";
import MetricDetailClient from "./[metric]/MetricDetailClient";
import { Sparkline } from "../components/Sparkline";

const NUDGE_DISMISSED_KEY = "truefit_assessments_nudge_dismissed";

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

// ── Metric row ────────────────────────────────────────────────────────────────

// One line per metric: name and where it stands now, a sparkline on a fixed
// scale (so a 0→1 blip stays a blip), and the change across the period in
// words-and-arrows. Text stays in ink colors; only the arrow carries
// better/worse color.
function MetricListRow({
  row, timeframe, onSelect, isLast,
}: {
  row: MetricRow; timeframe: Timeframe; onSelect: () => void; isLast: boolean;
}) {
  const points = filterByTimeframe(row.allPoints, timeframe);
  const latest = points.length ? points[points.length - 1].value : null;
  const change = computeWindowChange(points);
  const threshold = row.unit === "%" ? 2 : 0.3;
  const moved = change !== null && Math.abs(change) >= threshold;
  const better = moved && ((change! > 0) === row.higherIsBetter);

  const nowText = latest === null
    ? "No entries in this period"
    : row.unit === "/10"
      ? `${severityWord(latest)} · ${latest.toFixed(0)}/10 now`
      : `${formatValue(latest, row.unit)} now`;
  const changeText = !moved ? "Steady"
    : row.unit === "%" ? `${Math.abs(change!).toFixed(0)}%`
    : row.unit === "hrs" ? `${Math.abs(change!).toFixed(1)}h`
    : Math.abs(change!).toFixed(1);

  return (
    <button
      type="button"
      onClick={onSelect}
      className="w-full flex items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[#f7faf8] active:bg-[#eef4f0]"
      style={isLast ? undefined : { borderBottom: `1px solid ${WARM.rule}` }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold truncate" style={{ color: WARM.ink }}>{row.label}</p>
        <p className="text-sm mt-0.5 truncate" style={{ color: WARM.inkSoft }}>{nowText}</p>
      </div>
      {points.length > 0 && (
        <Sparkline points={points} color={WARM.sage} domain={metricDomain(row.unit, row.allPoints)} width={64} endDot />
      )}
      <p className="text-sm font-semibold flex-shrink-0 w-[60px] text-right" style={{ color: WARM.ink }}>
        {moved && (
          <span style={{ color: better ? WARM.better : WARM.worse }} aria-hidden="true">{change! > 0 ? "↑ " : "↓ "}</span>
        )}
        <span className={moved ? "" : "font-normal"} style={moved ? undefined : { color: WARM.inkSoft }}>{changeText}</span>
        {moved && <span className="sr-only">{change! > 0 ? " up" : " down"}{better ? ", better" : ", worse"}</span>}
      </p>
      <svg className="w-4 h-4 flex-shrink-0" style={{ color: "#b8c7bd" }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </button>
  );
}

function MetricGroup({ title, rows, timeframe, onSelect }: {
  title: string; rows: MetricRow[]; timeframe: Timeframe; onSelect: (key: string) => void;
}) {
  if (!rows.length) return null;
  return (
    <section className="space-y-2">
      <h2 className="text-base px-1" style={{ ...serif, color: WARM.forest, fontWeight: 500 }}>{title}</h2>
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm" style={{ border: `1px solid ${WARM.rule}` }}>
        {rows.map((r, i) => (
          <MetricListRow key={r.key} row={r} timeframe={timeframe} onSelect={() => onSelect(r.key)} isLast={i === rows.length - 1} />
        ))}
      </div>
    </section>
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
      // Off-day and as-needed entries aren't misses (see lib/medSchedule.ts).
      setLogs(withAdherenceDoses(logsData, p.medications));
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
    () => buildMetricRows(logs, allMedications, configuredSymptoms, user?.user_config?.progress_areas ?? []),
    [logs, allMedications, configuredSymptoms, user]
  );

  const progressRows = useMemo(
    () => metricRows.filter((r) => r.key.startsWith("progress-")),
    [metricRows]
  );

  const symptomRows = useMemo(
    () =>
      metricRows
        .filter((r) => r.unit === "/10")
        .sort((a, b) => (b.latestValue ?? 0) - (a.latestValue ?? 0)),
    [metricRows]
  );

  const routineRows = useMemo(
    () => ["sleep", "adherence-overall"]
      .map((k) => metricRows.find((r) => r.key === k))
      .filter((r): r is MetricRow => !!r && r.allPoints.length > 0),
    [metricRows]
  );

  const summaryProse = useMemo(
    () => buildSummaryProse(symptomRows, metricRows, timeframe),
    [symptomRows, metricRows, timeframe]
  );

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
    <div className={`${lora.variable} min-h-screen pb-28`} style={{ background: WARM.cream }}>
      {selectedMetric && (
        <div className="fixed inset-0 z-50 overflow-y-auto" style={{ background: "#faf9f6" }}>
          <MetricDetailClient metricKey={selectedMetric} onBack={() => setSelectedMetric(null)} />
        </div>
      )}
      <NavBar />

      <div className="max-w-lg mx-auto pt-6 px-4 space-y-6">

        <div>
          <h1 className="text-3xl" style={{ ...serif, color: WARM.ink, fontWeight: 500 }}>Insights</h1>
          {patient && <p className="text-base mt-1" style={{ color: WARM.inkSoft }}>How {patient.name} has been doing</p>}
        </div>

        {/* Assessments nudge */}
        {dueAssessments.length > 0 && !nudgeDismissed && (
          <div className="bg-white rounded-2xl px-4 py-3.5 shadow-sm flex items-center gap-3" style={{ border: `1px solid ${WARM.rule}` }}>
            <Link href="/assessments" className="flex-1 min-w-0">
              <p className="text-base font-semibold" style={{ color: WARM.ink }}>
                {dueAssessments.length} monthly check-in{dueAssessments.length > 1 ? "s" : ""} ready
              </p>
              <p className="text-sm" style={{ color: WARM.inkSoft }}>A few minutes each · <span style={{ color: WARM.sage, fontWeight: 600 }}>Start ›</span></p>
            </Link>
            <button
              type="button"
              onClick={dismissNudge}
              aria-label="Dismiss"
              className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 hover:bg-slate-50"
              style={{ color: WARM.inkSoft }}
            >
              ×
            </button>
          </div>
        )}

        <TimeframeToggle current={timeframe} onChange={setTimeframe} />

        {metricRows.length === 0 ? (
          <div className="rounded-3xl p-8 text-center" style={{ background: WARM.warm, border: `1px solid ${WARM.warmBorder}` }}>
            <p className="text-lg" style={{ ...serif, color: WARM.forest, fontWeight: 500 }}>Nothing to show yet</p>
            <p className="text-base mt-2" style={{ color: WARM.inkSoft }}>
              Trends and patterns appear here once you&apos;ve logged a few days.
            </p>
            <Link href="/log" className="inline-block mt-5 px-6 py-3 rounded-2xl text-white font-semibold text-base" style={{ background: WARM.sage }}>
              Log today
            </Link>
          </div>
        ) : (
          <>
            {/* Plain-language summary of the period */}
            <div className="rounded-3xl px-5 py-4" style={{ background: WARM.warm, border: `1px solid ${WARM.warmBorder}` }}>
              <p className="text-sm" style={{ color: WARM.inkSoft }}>{periodLabel(timeframe)}</p>
              <p className="text-base leading-relaxed mt-1" style={{ color: WARM.ink }}>{summaryProse}</p>
            </div>

            <MetricGroup title="Symptoms" rows={symptomRows} timeframe={timeframe} onSelect={setSelectedMetric} />
            <MetricGroup title="Progress" rows={progressRows} timeframe={timeframe} onSelect={setSelectedMetric} />
            <MetricGroup title="Sleep & medications" rows={routineRows} timeframe={timeframe} onSelect={setSelectedMetric} />
          </>
        )}
      </div>
    </div>
  );
}
