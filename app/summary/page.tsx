"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { api, localDateStr } from "../lib/api";
import { useAuth } from "../components/AuthProvider";
import { NavBar } from "../components/NavBar";
import { StepLoader } from "../components/StepLoader";
import type { Patient, SummaryResponse, AdherenceItem, SavedSummary, MedicationSideEffectSummary, AssessmentDataEntry, ReviewableFact } from "../lib/types";

const PRINT_STYLE = `
@media print {
  @page { margin: 1.8cm 2cm; }
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; color: #000 !important; background: #fff !important; }
  .no-print { display: none !important; }
  nav, footer { display: none !important; }

  /* Reset page background */
  .print-container { background: #fff !important; padding: 0 !important; min-height: auto !important; }

  /* Show print-only elements */
  .print-report-header, .print-footer { display: block !important; }

  /* Report header */
  .print-report-header { border-bottom: 2px solid #000 !important; padding-bottom: 12pt !important; margin-bottom: 16pt !important; }
  .print-report-title { font-size: 18pt !important; font-weight: bold !important; color: #000 !important; }
  .print-report-meta { font-size: 9pt !important; color: #333 !important; }

  /* Cards become plain sections */
  .insight-card {
    border: none !important;
    border-radius: 0 !important;
    box-shadow: none !important;
    background: #fff !important;
    margin-bottom: 14pt !important;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .insight-card-header {
    background: #fff !important;
    border-bottom: 1.5px solid #000 !important;
    padding: 0 0 4pt 0 !important;
    margin-bottom: 8pt !important;
  }
  .insight-card-header h2 {
    font-size: 10pt !important;
    font-weight: bold !important;
    text-transform: uppercase !important;
    letter-spacing: 0.08em !important;
    color: #000 !important;
  }
  .insight-card-body {
    background: #fff !important;
    padding: 0 !important;
  }

  /* Text */
  p, li, span { color: #000 !important; font-size: 10.5pt !important; }
  .finding-card {
    background: #fff !important;
    border: none !important;
    border-left: 3px solid #000 !important;
    border-radius: 0 !important;
    padding: 4pt 0 4pt 8pt !important;
    margin-bottom: 6pt !important;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .finding-card p { font-size: 10pt !important; }
  .finding-significance { color: #444 !important; font-style: italic !important; }

  /* Adherence */
  .adherence-bar-track { background: #ddd !important; }
  .adherence-label { border: 1px solid #000 !important; background: #fff !important; color: #000 !important; }
  .adherence-pct { color: #000 !important; }

  /* Discussion items */
  .discussion-item {
    background: #fff !important;
    border: none !important;
    border-radius: 0 !important;
    padding: 3pt 0 !important;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .discussion-num {
    background: #000 !important;
    color: #fff !important;
    font-size: 9pt !important;
  }

  /* Bullet dots */
  .lifestyle-dot { background: #000 !important; }

  /* Footer */
  .print-footer {
    border-top: 1px solid #000 !important;
    margin-top: 16pt !important;
    padding-top: 6pt !important;
    font-size: 8pt !important;
    color: #555 !important;
    text-align: center !important;
  }
}
`;


// ── Adherence bar ─────────────────────────────────────────────────────────────

function AdherenceBar({ item }: { item: AdherenceItem }) {
  const pct = Math.min(100, Math.max(0, item.percentage));
  const color = pct >= 85 ? "#16A34A" : pct >= 70 ? "#D97706" : "#DC2626";
  const bgColor = pct >= 85 ? "#DCFCE7" : pct >= 70 ? "#FEF3C7" : "#FEE2E2";
  const label = pct >= 85 ? "Good" : pct >= 70 ? "Fair" : "Low";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-base font-semibold text-navy">{item.medication}</span>
        <div className="flex items-center gap-2">
          <span className="adherence-label text-sm font-semibold px-2.5 py-1 rounded-full" style={{ background: bgColor, color }}>{label}</span>
          <span className="adherence-pct text-base font-bold" style={{ color }}>{pct.toFixed(0)}%</span>
        </div>
      </div>
      <div className="adherence-bar-track w-full h-3 rounded-full" style={{ background: "#E2E8F0" }}>
        <div className="h-3 rounded-full transition-all duration-700" style={{ width: `${pct}%`, background: color }} />
      </div>
      <p className="text-sm text-slate-400">{item.days_taken}/{item.days_logged} days taken{item.notes ? ` · ${item.notes}` : ""}</p>
    </div>
  );
}

// ── Insight card ──────────────────────────────────────────────────────────────

function InsightCard({
  title, accentColor, bgColor, borderColor, children,
}: {
  title: string; accentColor: string; bgColor: string; borderColor: string; children: React.ReactNode;
}) {
  return (
    <div className="insight-card rounded-2xl overflow-hidden shadow-sm border" style={{ borderColor }}>
      <div className="insight-card-header px-5 py-3 border-b" style={{ background: accentColor, borderColor }}>
        <h2 className="text-base font-bold text-white">{title}</h2>
      </div>
      <div className="insight-card-body px-5 py-4 space-y-3" style={{ background: bgColor }}>
        {children}
      </div>
    </div>
  );
}

// ── Medication Safety card ────────────────────────────────────────────────────

function MedSafetyCard({ data }: { data: Record<string, MedicationSideEffectSummary> }) {
  const entries = Object.entries(data);
  if (!entries.length) return null;
  return (
    <InsightCard title="Medication Safety & Side Effects" accentColor="#7C3AED" bgColor="#FAF5FF" borderColor="#DDD6FE">
      <div className="space-y-5">
        {entries.map(([medName, info]) => {
          const hasObserved = info.observed.length > 0;
          return (
            <div key={medName} className="space-y-2">
              <p className="text-base font-bold text-navy">{medName}</p>

              {info.known.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "#7C3AED" }}>Known side effects</p>
                  <div className="flex flex-wrap gap-1.5">
                    {info.known.map((k, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: "#EDE9FE", color: "#5B21B6" }}>
                        {k}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <p className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: hasObserved ? "#DC2626" : "#4a7c59" }}>
                  Observed
                </p>
                {hasObserved ? (
                  <div className="flex flex-wrap gap-1.5">
                    {info.observed.map((o, i) => (
                      <span key={i} className="text-xs px-2 py-0.5 rounded-full font-medium"
                        style={{ background: "#FEE2E2", color: "#DC2626" }}>
                        {o}
                      </span>
                    ))}
                  </div>
                ) : (
                  <span className="text-sm text-slate-400">None reported</span>
                )}
              </div>

              {info.clinical_note && (
                <p className="text-sm leading-relaxed italic" style={{ color: "#475569" }}>{info.clinical_note}</p>
              )}
            </div>
          );
        })}
      </div>
    </InsightCard>
  );
}

// ── Assessment Scores card ───────────────────────────────────────────────────

const MODE_LABEL: Record<string, string> = { self: "self-completed", assisted: "caregiver-assisted" };

function AssessmentScoresCard({ data }: { data: Record<string, AssessmentDataEntry> }) {
  const entries = Object.entries(data);
  if (!entries.length) return null;
  return (
    <InsightCard title="Assessment Scores" accentColor="#2d4f38" bgColor="#f2f7f3" borderColor="#d4e0d7">
      <div className="space-y-5">
        {entries.map(([key, item]) => {
          const trendText =
            item.delta === null || Math.abs(item.delta) < 0.01
              ? "No change"
              : `${item.delta > 0 ? "Up" : "Down"} ${Math.abs(item.delta)} over this period`;
          return (
            <div key={key} className="space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-base font-semibold text-navy">{item.name}</span>
                <span className="text-base font-bold text-navy">{item.latest} of {item.max_score}</span>
              </div>
              <p className="text-sm text-slate-500">{trendText}</p>
              <div className="space-y-0.5 pt-1">
                {item.scores.map((s, i) => (
                  <p key={i} className="text-sm text-slate-400">
                    {new Date(s.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    {" — "}{s.score}
                    {s.mode && ` (${MODE_LABEL[s.mode] ?? s.mode})`}
                  </p>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </InsightCard>
  );
}

// ── Review facts ──────────────────────────────────────────────────────────────

function formatShortDate(dateStr: string): string {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

function ReviewFacts({
  facts, confirmKey, updatedKeys, correctingKey, onRequestConfirm, onCancelConfirm, onConfirm,
}: {
  facts: ReviewableFact[];
  confirmKey: string | null;
  updatedKeys: Set<string>;
  correctingKey: string | null;
  onRequestConfirm: (key: string) => void;
  onCancelConfirm: () => void;
  onConfirm: (fact: ReviewableFact) => void;
}) {
  if (facts.length === 0) {
    return <p className="text-sm text-slate-400 pt-2">No flagged facts to review.</p>;
  }
  return (
    <div className="space-y-3 pt-1">
      {facts.map((fact) => {
        const key = `${fact.medication_id}-${fact.date}`;
        const isConfirming = confirmKey === key;
        const isUpdated = updatedKeys.has(key);
        const isCorrecting = correctingKey === key;
        return (
          <div key={key}>
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-slate-700 flex-1">{fact.label}</p>
              {isUpdated ? (
                <span className="text-sm font-semibold whitespace-nowrap" style={{ color: "#16A34A" }}>Updated</span>
              ) : !isConfirming ? (
                <button
                  onClick={() => onRequestConfirm(key)}
                  className="text-sm font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
                  style={{ background: "#f2f7f3", color: "#4a7c59" }}
                >
                  He took it
                </button>
              ) : null}
            </div>
            {isConfirming && (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-xl px-3 py-2" style={{ background: "#f8fafc" }}>
                <p className="text-sm text-slate-600">Mark {formatShortDate(fact.date)} as taken?</p>
                <div className="flex gap-2">
                  <button
                    onClick={onCancelConfirm}
                    disabled={isCorrecting}
                    className="text-sm font-semibold px-3 py-1.5 rounded-lg"
                    style={{ background: "#f1f5f9", color: "#475569" }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => onConfirm(fact)}
                    disabled={isCorrecting}
                    className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white"
                    style={{ background: "#4a7c59" }}
                  >
                    Yes
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Summary title helpers ──────────────────────────────────────────────────────

function formatSummaryTitle(startStr: string, endStr: string): string {
  const start = new Date(startStr + "T00:00:00");
  const end = new Date(endStr + "T00:00:00");
  const diffDays = Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
  const endLabel = end.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  if (diffDays >= 6 && diffDays <= 8) return `Last 7 days · ${endLabel}`;
  if (diffDays >= 28 && diffDays <= 32) return `Last 30 days · ${endLabel}`;
  const startLabel = start.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${startLabel} – ${endLabel}, ${end.getFullYear()}`;
}

function parseSummaryTitle(title: string): string {
  const match = title.match(/Summary[:\s—-]+(\d{4}-\d{2}-\d{2})\s+to\s+(\d{4}-\d{2}-\d{2})/);
  if (!match) return title;
  return formatSummaryTitle(match[1], match[2]);
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SummaryPage() {
  const { isLoading } = useAuth();
  const router = useRouter();

  type RangeType = "7days" | "30days" | "custom";

  const [patient, setPatient] = useState<Patient | null>(null);
  const [summary, setSummary] = useState<SummaryResponse | null>(null);
  const [generating, setGenerating] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [savedSummaries, setSavedSummaries] = useState<SavedSummary[]>([]);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [rangeType, setRangeType] = useState<RangeType>("30days");
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return localDateStr(d);
  });
  const [customTo, setCustomTo] = useState(() => localDateStr(new Date()));
  const [summaryDateRange, setSummaryDateRange] = useState<{ startDate: string; endDate: string } | null>(null);
  const [loaderDone, setLoaderDone] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [confirmFactKey, setConfirmFactKey] = useState<string | null>(null);
  const [updatedFactKeys, setUpdatedFactKeys] = useState<Set<string>>(new Set());
  const [correctingFactKey, setCorrectingFactKey] = useState<string | null>(null);

  const { user } = useAuth();

  const loadPatient = useCallback(async () => {
    try {
      const patients = await api.getPatients() as Patient[];
      if (!patients.length) { router.push("/onboarding"); return; }
      const p = patients[0];
      setPatient(p);
    } catch { /* silent */ } finally { setPageLoading(false); }
  }, [router]);

  const loadSavedSummaries = useCallback(async () => {
    try {
      const data = await api.getSavedSummaries() as SavedSummary[];
      setSavedSummaries(data);
    } catch { /* silent */ }
  }, []);

  useEffect(() => {
    if (!isLoading && !user) { router.push("/login"); return; }
    if (!isLoading && user) { loadPatient(); loadSavedSummaries(); }
  }, [user, isLoading, loadPatient, loadSavedSummaries, router]);

  function getDateRange(): { startDate: string; endDate: string } {
    const today = new Date();
    const endDate = localDateStr(today);
    if (rangeType === "7days") {
      const start = new Date(today);
      start.setDate(start.getDate() - 7);
      return { startDate: localDateStr(start), endDate };
    } else if (rangeType === "30days") {
      const start = new Date(today);
      start.setDate(start.getDate() - 30);
      return { startDate: localDateStr(start), endDate };
    } else {
      return { startDate: customFrom, endDate: customTo };
    }
  }

  async function handleGenerate() {
    if (!patient) return;
    setIsSaved(false);
    setGenerating(true);
    setSummary(null);
    const dateRange = getDateRange();
    setSummaryDateRange(dateRange);
    try {
      const result = await api.generateSummary(patient.id, dateRange.startDate, dateRange.endDate) as SummaryResponse;
      setSummary(result);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to generate insights");
    } finally {
      setLoaderDone(true);
      setGenerating(false);
      setTimeout(() => setLoaderDone(false), 600);
    }
  }

  function handleClear() {
    setSummary(null);
  }

  async function handleCorrectFact(fact: ReviewableFact) {
    if (!patient) return;
    const key = `${fact.medication_id}-${fact.date}`;
    setCorrectingFactKey(key);
    try {
      await api.correctMedicationTaken(patient.id, fact.date, fact.medication_id);
      setConfirmFactKey(null);
      setUpdatedFactKeys((prev) => new Set(prev).add(key));
      const range = summaryDateRange ?? getDateRange();
      const result = await api.generateSummary(patient.id, range.startDate, range.endDate) as SummaryResponse;
      setSummary(result);
      setIsSaved(false);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setCorrectingFactKey(null);
    }
  }

  async function handleSave() {
    if (!summary || !patient) return;
    const { startDate: startStr, endDate: endStr } = summaryDateRange ?? getDateRange();
    try {
      await api.saveSummary({
        patient_id: patient.id,
        title: formatSummaryTitle(startStr, endStr),
        content: JSON.stringify(summary),
        date_range_start: startStr,
        date_range_end: endStr,
      });
      setIsSaved(true);
      await loadSavedSummaries();
      toast.success("Saved.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    }
  }

  async function handleDelete(id: number) {
    try {
      await api.deleteSavedSummary(id);
      if (expandedId === id) setExpandedId(null);
      setDeleteConfirmId(null);
      await loadSavedSummaries();
      toast.success("Deleted.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  if (isLoading || pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#faf9f6" }}>
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#4a7c59", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });

  return (
    <>
      <style>{PRINT_STYLE}</style>
    <div className="min-h-screen pb-28 print-container" style={{ background: "#faf9f6" }}>
      <NavBar />

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">

        {/* Header — screen only */}
        <div className="no-print">
          <h1 className="text-3xl font-bold text-navy">Summary</h1>
          {patient && (
            <p className="text-base text-slate-500 mt-1">{patient.name} · {patient.diagnosis}</p>
          )}

        </div>

        {/* Print-only report header */}
        {summary && (
          <div className="print-report-header hidden" style={{ display: "none" }}>
            <p style={{ fontSize: "9pt", fontWeight: "bold", textTransform: "uppercase", letterSpacing: "0.08em", color: "#555", marginBottom: "4pt" }}>
              Caregiver Observation Report with AI-Generated Insights
            </p>
            <p className="print-report-title">{patient?.name}</p>
            <div className="print-report-meta" style={{ marginTop: "6pt", lineHeight: "1.6" }}>
              {patient?.diagnosis && <span><strong>Diagnosis:</strong> {patient.diagnosis} &nbsp;·&nbsp; </span>}
              <span><strong>Generated:</strong> {today} &nbsp;·&nbsp; </span>
              <span><strong>Prepared by:</strong> Advocate (Caregiver Health Tracking)</span>
            </div>
          </div>
        )}

        {/* Generate prompt */}
        {!summary && !generating && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-5">
            <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center" style={{ background: "#e8f0eb" }}>
              <svg className="w-7 h-7" style={{ color: "#4a7c59" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-lg font-bold text-navy">Ready to generate insights</p>
              <p className="text-base text-slate-500 mt-1">
                Analyzes the last 30 days of logs and produces a doctor-ready summary.
              </p>
            </div>

            {/* Date range toggle */}
            <div className="flex rounded-xl border border-slate-200 overflow-hidden">
              {(["7days", "30days", "custom"] as const).map((opt, i) => (
                <button
                  key={opt}
                  onClick={() => setRangeType(opt)}
                  className={`flex-1 py-2.5 text-sm font-semibold transition-colors${i < 2 ? " border-r border-slate-200" : ""}`}
                  style={{
                    background: rangeType === opt ? "#2d4f38" : "transparent",
                    color: rangeType === opt ? "white" : "#94a3b8",
                  }}
                >
                  {opt === "7days" ? "7 Days" : opt === "30days" ? "30 Days" : "Custom"}
                </button>
              ))}
            </div>

            {/* Custom date inputs */}
            {rangeType === "custom" && (
              <div className="flex gap-3">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-3 text-base text-navy"
                  style={{ background: "#f8fafc" }}
                />
                <input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="flex-1 border border-slate-200 rounded-xl px-3 py-3 text-base text-navy"
                  style={{ background: "#f8fafc" }}
                />
              </div>
            )}

            <button
              onClick={handleGenerate}
              className="w-full py-4 rounded-2xl font-bold text-white text-base"
              style={{ background: "linear-gradient(135deg, #4a7c59, #2d4f38)" }}
            >
              Generate Insights
            </button>
          </div>
        )}

        {/* Loading */}
        {(generating || loaderDone) && (
          <div className="flex items-center justify-center py-16">
            <StepLoader
              steps={[
                "Reading your logs...",
                "Calculating medication adherence...",
                "Finding patterns across the month...",
                "Writing your summary...",
              ]}
              intervalMs={3000}
              done={loaderDone}
            />
          </div>
        )}

        {/* Results — stacked insight cards */}
        {summary && (
          <>
            {/* Export row */}
            <div className="flex gap-3 no-print">
              <button
                onClick={() => window.print()}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-base font-semibold text-slate-600 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
                Print / PDF
              </button>
              <button
                onClick={handleClear}
                className="py-3 px-4 rounded-xl border border-slate-200 text-base font-semibold text-slate-400 flex items-center justify-center gap-2"
                title="Clear saved insights"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>

            {/* Executive Summary */}
            <InsightCard title="Executive Summary" accentColor="#1a2420" bgColor="white" borderColor="#d4e0d7">
              <p className="text-base leading-relaxed text-slate-700">{summary.executive_summary}</p>
            </InsightCard>

            {/* Adherence */}
            {summary.adherence?.length > 0 && (
              <InsightCard title="Adherence" accentColor="#2d4f38" bgColor="#f2f7f3" borderColor="#d4e0d7">
                <div className="space-y-5">
                  {summary.adherence.map((item, i) => <AdherenceBar key={i} item={item} />)}
                </div>
              </InsightCard>
            )}

            {/* Medication Safety */}
            {summary.medication_side_effects && Object.keys(summary.medication_side_effects).length > 0 && (
              <MedSafetyCard data={summary.medication_side_effects} />
            )}

            {/* Assessment Scores */}
            {summary.assessment_data && Object.keys(summary.assessment_data).length > 0 && (
              <AssessmentScoresCard data={summary.assessment_data} />
            )}

            {/* Patterns */}
            {summary.patterns?.length > 0 && (
              <InsightCard title="Patterns" accentColor="#3d4f47" bgColor="#f2f7f3" borderColor="#d4e0d7">
                <div className="space-y-3">
                  {summary.patterns.map((p, i) => (
                    <div key={i} className="finding-card rounded-xl p-4 border-l-4" style={{ background: "white", borderColor: "#4a7c59" }}>
                      <p className="text-base font-semibold text-navy">{p.finding}</p>
                      <p className="finding-significance text-sm text-slate-500 mt-1">{p.significance}</p>
                    </div>
                  ))}
                </div>
              </InsightCard>
            )}

            {/* Lifestyle */}
            {summary.lifestyle_notes?.length > 0 && (
              <InsightCard title="Lifestyle Notes" accentColor="#4a7c59" bgColor="#f2f7f3" borderColor="#d4e0d7">
                <ul className="space-y-2">
                  {summary.lifestyle_notes.map((note, i) => (
                    <li key={i} className="flex items-start gap-3 text-base text-slate-700">
                      <span className="lifestyle-dot w-1.5 h-1.5 rounded-full mt-2.5 flex-shrink-0" style={{ background: "#4a7c59" }} />
                      {note}
                    </li>
                  ))}
                </ul>
              </InsightCard>
            )}

            {/* Discussion items */}
            {summary.discussion_items?.length > 0 && (
              <InsightCard title="Bring Up at the Appointment" accentColor="#2d4f38" bgColor="#f2f7f3" borderColor="#d4e0d7">
                <div className="space-y-3">
                  {summary.discussion_items.map((item, i) => (
                    <div key={i} className="discussion-item flex items-start gap-3 p-4 rounded-xl bg-white">
                      <span className="discussion-num text-base font-bold flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-sm" style={{ background: "#4a7c59" }}>
                        {i + 1}
                      </span>
                      <p className="text-base text-slate-700">{item}</p>
                    </div>
                  ))}
                </div>
              </InsightCard>
            )}

            {/* Print footer — hidden on screen, shown when printing */}
            <div className="print-footer" style={{ display: "none" }}>
              Generated by Advocate · Caregiver Health Tracking · {today}
            </div>

            {/* Something look wrong? review */}
            <div className="no-print bg-white rounded-2xl border border-slate-100 shadow-sm p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-base font-semibold text-navy">Something look wrong?</p>
                <button
                  onClick={() => setReviewOpen((o) => !o)}
                  className="text-sm font-semibold px-3 py-1.5 rounded-lg whitespace-nowrap"
                  style={{ background: "#f2f7f3", color: "#4a7c59" }}
                >
                  {reviewOpen ? "Hide" : "Review"}
                </button>
              </div>
              {reviewOpen && (
                <div className="pt-1 border-t border-slate-100">
                  <ReviewFacts
                    facts={summary.reviewable_facts ?? []}
                    confirmKey={confirmFactKey}
                    updatedKeys={updatedFactKeys}
                    correctingKey={correctingFactKey}
                    onRequestConfirm={setConfirmFactKey}
                    onCancelConfirm={() => setConfirmFactKey(null)}
                    onConfirm={handleCorrectFact}
                  />
                </div>
              )}
            </div>

            {/* Save + Regenerate row */}
            <div className="flex gap-3 no-print">
              <button
                onClick={handleSave}
                disabled={isSaved}
                className="flex-1 py-3 rounded-xl border border-slate-200 text-base font-semibold flex items-center justify-center gap-2"
                style={{ color: isSaved ? "#94a3b8" : "#475569" }}
              >
                {isSaved ? (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                    Saved
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                    </svg>
                    Save Summary
                  </>
                )}
              </button>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="flex-1 py-3 rounded-xl border-2 border-dashed border-slate-200 text-base font-semibold text-slate-400 transition-colors hover:border-slate-300"
              >
                Regenerate
              </button>
            </div>
          </>
        )}

        {/* Saved Summaries */}
        <div className="no-print space-y-3 pb-4">
          <h2 className="text-xl font-bold text-navy">Saved Summaries</h2>
          {savedSummaries.length === 0 ? (
            <p className="text-sm text-slate-400">No saved summaries yet. Generate a summary above and save it.</p>
          ) : (
            savedSummaries.map((saved) => {
              const parsed: SummaryResponse | null = (() => { try { return JSON.parse(saved.content); } catch { return null; } })();
              return (
                <div key={saved.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden">
                  <div className="px-4 py-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-semibold text-navy truncate">{parseSummaryTitle(saved.title)}</p>
                      <p className="text-xs text-slate-400 mt-0.5">
                        Saved {new Date(saved.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    <button
                      onClick={() => setExpandedId(expandedId === saved.id ? null : saved.id)}
                      className="text-sm font-semibold px-3 py-1.5 rounded-lg"
                      style={{ background: "#f2f7f3", color: "#4a7c59" }}
                    >
                      {expandedId === saved.id ? "Collapse" : "View"}
                    </button>
                    <button
                      onClick={() => setDeleteConfirmId(deleteConfirmId === saved.id ? null : saved.id)}
                      className="p-1.5 rounded-lg transition-colors"
                      style={{ color: deleteConfirmId === saved.id ? "#DC2626" : "#94a3b8" }}
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </div>

                  {deleteConfirmId === saved.id && (
                    <div className="px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-3" style={{ background: "#fef2f2" }}>
                      <p className="text-sm text-slate-600">Delete this saved summary?</p>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setDeleteConfirmId(null)}
                          className="text-sm font-semibold px-3 py-1.5 rounded-lg"
                          style={{ background: "#f1f5f9", color: "#475569" }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={() => handleDelete(saved.id)}
                          className="text-sm font-semibold px-3 py-1.5 rounded-lg text-white"
                          style={{ background: "#DC2626" }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}

                  {expandedId === saved.id && parsed && (
                    <div className="px-4 pb-4 pt-2 space-y-3 border-t border-slate-100">
                      <InsightCard title="Executive Summary" accentColor="#1a2420" bgColor="white" borderColor="#d4e0d7">
                        <p className="text-base leading-relaxed text-slate-700">{parsed.executive_summary}</p>
                      </InsightCard>
                      {parsed.adherence?.length > 0 && (
                        <InsightCard title="Adherence" accentColor="#2d4f38" bgColor="#f2f7f3" borderColor="#d4e0d7">
                          <div className="space-y-5">
                            {parsed.adherence.map((item, i) => <AdherenceBar key={i} item={item} />)}
                          </div>
                        </InsightCard>
                      )}
                      {parsed.medication_side_effects && Object.keys(parsed.medication_side_effects).length > 0 && (
                        <MedSafetyCard data={parsed.medication_side_effects} />
                      )}
                      {parsed.assessment_data && Object.keys(parsed.assessment_data).length > 0 && (
                        <AssessmentScoresCard data={parsed.assessment_data} />
                      )}
                      {parsed.patterns?.length > 0 && (
                        <InsightCard title="Patterns" accentColor="#3d4f47" bgColor="#f2f7f3" borderColor="#d4e0d7">
                          <div className="space-y-3">
                            {parsed.patterns.map((p, i) => (
                              <div key={i} className="finding-card rounded-xl p-4 border-l-4" style={{ background: "white", borderColor: "#4a7c59" }}>
                                <p className="text-base font-semibold text-navy">{p.finding}</p>
                                <p className="finding-significance text-sm text-slate-500 mt-1">{p.significance}</p>
                              </div>
                            ))}
                          </div>
                        </InsightCard>
                      )}
                      {parsed.lifestyle_notes?.length > 0 && (
                        <InsightCard title="Lifestyle Notes" accentColor="#4a7c59" bgColor="#f2f7f3" borderColor="#d4e0d7">
                          <ul className="space-y-2">
                            {parsed.lifestyle_notes.map((note, i) => (
                              <li key={i} className="flex items-start gap-3 text-base text-slate-700">
                                <span className="lifestyle-dot w-1.5 h-1.5 rounded-full mt-2.5 flex-shrink-0" style={{ background: "#4a7c59" }} />
                                {note}
                              </li>
                            ))}
                          </ul>
                        </InsightCard>
                      )}
                      {parsed.discussion_items?.length > 0 && (
                        <InsightCard title="Bring Up at the Appointment" accentColor="#2d4f38" bgColor="#f2f7f3" borderColor="#d4e0d7">
                          <div className="space-y-3">
                            {parsed.discussion_items.map((item, i) => (
                              <div key={i} className="discussion-item flex items-start gap-3 p-4 rounded-xl bg-white">
                                <span className="discussion-num text-base font-bold flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-white text-sm" style={{ background: "#4a7c59" }}>
                                  {i + 1}
                                </span>
                                <p className="text-base text-slate-700">{item}</p>
                              </div>
                            ))}
                          </div>
                        </InsightCard>
                      )}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
    </>
  );
}
