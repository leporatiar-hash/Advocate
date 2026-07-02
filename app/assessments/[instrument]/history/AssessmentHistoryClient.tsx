"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "../../../lib/api";
import { useAuth } from "../../../components/AuthProvider";
import { NavBar } from "../../../components/NavBar";
import type { Patient, Assessment, InstrumentDefinition } from "../../../lib/types";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const MODE_LABEL: Record<string, string> = { self: "Self-completed", assisted: "Caregiver-assisted" };

export default function AssessmentHistoryClient({ instrumentKey }: { instrumentKey: string }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [entries, setEntries] = useState<Assessment[]>([]);
  const [definition, setDefinition] = useState<InstrumentDefinition | null>(null);
  const [pageLoading, setPageLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const patients = (await api.getPatients()) as Patient[];
      if (!patients.length) { router.push("/onboarding"); return; }
      const [history, defs] = await Promise.all([
        api.getAssessments(patients[0].id, instrumentKey) as Promise<Assessment[]>,
        api.getInstrumentDefinitions() as Promise<Record<string, InstrumentDefinition>>,
      ]);
      setEntries([...history].sort((a, b) => b.created_at.localeCompare(a.created_at)));
      setDefinition(defs[instrumentKey] ?? null);
    } catch {
      // silent
    } finally {
      setPageLoading(false);
    }
  }, [router, instrumentKey]);

  useEffect(() => {
    if (!isLoading && !user) { router.push("/login"); return; }
    if (!isLoading && user) load();
  }, [user, isLoading, load, router]);

  if (isLoading || pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#faf9f6" }}>
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#4a7c59", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const chronological = [...entries].reverse();

  return (
    <div className="min-h-screen pb-28" style={{ background: "#faf9f6" }}>
      <NavBar />

      <div className="max-w-lg mx-auto pt-6 px-4 space-y-5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push("/assessments")}
            className="w-9 h-9 rounded-full flex items-center justify-center bg-white border border-slate-200 text-slate-500 hover:text-navy transition-colors flex-shrink-0"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-navy">{definition?.name ?? "History"}</h1>
        </div>

        {entries.length === 0 ? (
          <p className="text-base text-slate-400 px-1">No history yet.</p>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
            {entries.map((entry, i) => {
              const chronoIndex = chronological.findIndex((e) => e.id === entry.id);
              const prev = chronoIndex > 0 ? chronological[chronoIndex - 1] : null;
              const delta = prev ? entry.computed_score - prev.computed_score : null;
              const deltaText = delta === null || Math.abs(delta) < 0.01 ? "—" : `${delta > 0 ? "↑" : "↓"} ${Math.abs(delta).toFixed(0)}`;
              return (
                <div
                  key={entry.id}
                  className="flex items-center gap-3 px-5 py-4"
                  style={i < entries.length - 1 ? { borderBottom: "0.5px solid #F1F5F9" } : undefined}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-navy">{formatDate(entry.created_at)}</p>
                    {entry.completion_mode && (
                      <p className="text-sm text-slate-400 mt-0.5">{MODE_LABEL[entry.completion_mode] ?? entry.completion_mode}</p>
                    )}
                  </div>
                  <p className="text-base font-semibold text-navy flex-shrink-0">
                    {entry.computed_score} of {entry.max_score}
                  </p>
                  <p className="text-sm font-semibold flex-shrink-0 min-w-[36px] text-right text-slate-400">{deltaText}</p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
