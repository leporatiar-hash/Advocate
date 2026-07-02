"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../lib/api";
import { useAuth } from "../components/AuthProvider";
import { NavBar } from "../components/NavBar";
import { Sparkline } from "../components/Sparkline";
import type { Patient, Assessment, AssessmentStatusItem, InstrumentKey } from "../lib/types";

const INSTRUMENT_ORDER: InstrumentKey[] = ["lawton_iadl", "phq9", "csi"];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

// ── Status card ───────────────────────────────────────────────────────────────

function StatusCard({ item }: { item: AssessmentStatusItem }) {
  return (
    <div
      className="bg-white rounded-2xl p-5 shadow-sm border flex items-center gap-4"
      style={{ borderColor: item.due ? "#FDBA74" : "#E2E8F0" }}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-base font-bold text-navy">{item.name}</p>
          {item.due && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0" style={{ background: "#FFF7ED", color: "#C2410C" }}>
              Due
            </span>
          )}
        </div>
        <p className="text-sm text-slate-500 mt-0.5">{item.description}</p>
        <p className="text-sm text-slate-400 mt-1">
          {item.last_taken_at ? `Last taken ${formatDate(item.last_taken_at)}` : "Not yet taken"}
        </p>
        {item.instrument_key === "csi" && (
          <p className="text-xs text-slate-400 mt-2 italic">Private to you. Never included in clinician reports.</p>
        )}
      </div>
      <Link
        href={`/assessments/${item.instrument_key}`}
        className="px-4 py-2.5 rounded-xl font-semibold text-sm text-white flex-shrink-0"
        style={{ background: item.due ? "#4a7c59" : "#94A3B8" }}
      >
        Start
      </Link>
    </div>
  );
}

// ── History row ───────────────────────────────────────────────────────────────

function HistoryRow({ instrumentKey, name, maxScore, entries }: {
  instrumentKey: InstrumentKey; name: string; maxScore: number; entries: Assessment[];
}) {
  const points = useMemo(
    () => entries.map((a) => ({ date: a.created_at, value: a.computed_score })),
    [entries]
  );
  const latest = entries[entries.length - 1];
  const previous = entries.length > 1 ? entries[entries.length - 2] : null;
  const delta = previous ? latest.computed_score - previous.computed_score : null;
  const deltaText = delta === null || Math.abs(delta) < 0.01 ? "—" : `${delta > 0 ? "↑" : "↓"} ${Math.abs(delta).toFixed(0)}`;

  return (
    <Link
      href={`/assessments/${instrumentKey}/history`}
      className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 last:border-0 active:bg-slate-50"
    >
      <p className="flex-1 min-w-0 text-base font-semibold text-navy truncate">{name}</p>
      <Sparkline points={points} color="#4a7c59" />
      <p className="text-sm font-semibold flex-shrink-0 text-navy">
        {latest.computed_score} of {maxScore}
      </p>
      <p className="text-sm font-semibold flex-shrink-0 min-w-[36px] text-right text-slate-400">{deltaText}</p>
    </Link>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function AssessmentsPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [status, setStatus] = useState<AssessmentStatusItem[]>([]);
  const [history, setHistory] = useState<Assessment[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const patients = (await api.getPatients()) as Patient[];
      if (!patients.length) { router.push("/onboarding"); return; }
      const p = patients[0];
      setPatient(p);
      const [statusData, historyData] = await Promise.all([
        api.getAssessmentStatus(p.id) as Promise<AssessmentStatusItem[]>,
        api.getAssessments(p.id) as Promise<Assessment[]>,
      ]);
      setStatus(statusData);
      setHistory(historyData);
    } catch {
      // silent
    } finally {
      setDataLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!isLoading && !user) { router.push("/login"); return; }
    if (!isLoading && user) loadData();
  }, [user, isLoading, loadData, router]);

  const orderedStatus = useMemo(
    () => [...status].sort((a, b) => INSTRUMENT_ORDER.indexOf(a.instrument_key) - INSTRUMENT_ORDER.indexOf(b.instrument_key)),
    [status]
  );

  const historyByInstrument = useMemo(() => {
    const map = new Map<InstrumentKey, Assessment[]>();
    for (const a of history) {
      const list = map.get(a.instrument_key) ?? [];
      list.push(a);
      map.set(a.instrument_key, list);
    }
    return map;
  }, [history]);

  const allCaughtUp = status.length > 0 && status.every((s) => !s.due);

  if (isLoading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#faf9f6" }}>
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#4a7c59", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: "#faf9f6" }}>
      <NavBar />

      <div className="max-w-lg mx-auto pt-6 px-4 space-y-4">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-navy">Assessments</h1>
          {patient && <p className="text-base text-slate-500 mt-1">{patient.name}</p>}
        </div>

        {allCaughtUp && (
          <div className="rounded-2xl px-5 py-3 text-center" style={{ background: "#f2f7f3" }}>
            <p className="text-sm font-semibold" style={{ color: "#2d4f38" }}>All caught up this cycle</p>
          </div>
        )}

        {/* Status cards */}
        <div className="space-y-3">
          {orderedStatus.map((item) => (
            <StatusCard key={item.instrument_key} item={item} />
          ))}
        </div>

        {/* History */}
        {history.length > 0 && (
          <div className="space-y-2 pt-2">
            <h2 className="text-lg font-bold text-navy px-1">History</h2>
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              {INSTRUMENT_ORDER.filter((key) => historyByInstrument.has(key)).map((key) => {
                const entries = historyByInstrument.get(key)!;
                const statusItem = status.find((s) => s.instrument_key === key);
                return (
                  <HistoryRow
                    key={key}
                    instrumentKey={key}
                    name={statusItem?.name ?? key}
                    maxScore={entries[entries.length - 1].max_score}
                    entries={entries}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
