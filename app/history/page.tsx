"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/api";
import { useAuth } from "../components/AuthProvider";
import { NavBar } from "../components/NavBar";
import { adherenceEntries, removeFalseMisses } from "../lib/medSchedule";
import { customReadings, formatReading } from "../lib/customVitals";
import type { Patient, DailyLog, Medication } from "../lib/types";

const SIMPLE_TIME_LABELS: Record<string, string> = {
  "08:00": "Morning",
  "13:00": "Afternoon",
  "18:00": "Evening",
  "21:00": "Night",
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);

  if (d.getTime() === today.getTime()) return "Today";
  if (d.getTime() === yesterday.getTime()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

function fmtMonthGroup(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

function moodColor(score: number) {
  if (score >= 8) return "#16A34A";
  if (score >= 6) return "#4a7c59";
  if (score >= 4) return "#D97706";
  return "#DC2626";
}


// Scheduled doses only — off-day and as-needed entries aren't misses.
function medsStatus(log: DailyLog, medications: Medication[]) {
  const meds = adherenceEntries(log.medications_taken, medications, log.date);
  if (!meds.length) return null;
  const taken = meds.filter(m => m.taken).length;
  return { taken, total: meds.length, allTaken: taken === meds.length };
}

// ── Expanded log detail ────────────────────────────────────────────────────────

function LogDetail({ log, medications }: { log: DailyLog; medications: Medication[] }) {
  const doses = removeFalseMisses(log.medications_taken, medications, log.date);
  const v = log.vitals;
  const vitalParts = [
    v?.heart_rate && `HR ${v.heart_rate} bpm`,
    v?.blood_pressure && `BP ${v.blood_pressure}`,
    ...Object.entries(customReadings(v)).map(([name, r]) => `${name} ${formatReading(r)}`),
  ].filter(Boolean) as string[];
  return (
    <div className="mt-3 space-y-3 text-sm border-t border-slate-100 pt-3">

      {/* Vitals row */}
      {(log.mood_score !== null || log.sleep_hours !== null || log.water_intake_oz !== null) && (
        <div className="flex gap-4 flex-wrap">
          {log.mood_score !== null && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Mood</span>
              <span className="font-semibold" style={{ color: moodColor(log.mood_score) }}>
                {log.mood_score}/10
              </span>
            </div>
          )}
          {log.sleep_hours !== null && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Sleep</span>
              <span className="font-semibold text-navy">{log.sleep_hours}h</span>
            </div>
          )}
          {log.water_intake_oz !== null && (
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">Hydration</span>
              <span className="font-semibold text-navy">
                {log.water_intake_oz >= 70 ? "Good" : log.water_intake_oz >= 40 ? "Fair" : "Poor"}
              </span>
            </div>
          )}
        </div>
      )}

      {vitalParts.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Vitals</p>
          <p className="text-sm text-slate-700">{vitalParts.join(" · ")}</p>
        </div>
      )}

      {/* Medications */}
      {doses.length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Medications</p>
          <div className="space-y-1">
            {doses.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <span
                  className="w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0"
                  style={{ background: m.taken ? "#DCFCE7" : "#FEE2E2" }}
                >
                  {m.taken
                    ? <svg className="w-2.5 h-2.5" style={{ color: "#16A34A" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
                    : <svg className="w-2.5 h-2.5" style={{ color: "#DC2626" }} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M6 18L18 6M6 6l12 12" /></svg>
                  }
                </span>
                <span className={`text-sm ${m.taken ? "text-slate-700" : "text-slate-400 line-through"}`}>
                  {medications.find(med => med.id === m.medication_id)?.name ?? `Med ${m.medication_id}`}
                  {m.time_taken ? <span className="text-slate-400 no-underline not-line-through"> · {SIMPLE_TIME_LABELS[m.time_taken] ?? m.time_taken}</span> : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Symptoms */}
      {(log.symptoms ?? []).length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Symptoms</p>
          <div className="flex flex-wrap gap-1.5">
            {(log.symptoms ?? []).map((s, i) => {
              const sv = s.severity ?? 0;
              const sev = sv >= 8 ? { bg: "#FEE2E2", color: "#DC2626" }
                : sv >= 5 ? { bg: "#FEF3C7", color: "#D97706" }
                : { bg: "#F1F5F9", color: "#475569" };
              return (
                <span key={i} className="px-2.5 py-1 rounded-full text-xs font-semibold" style={{ background: sev.bg, color: sev.color }}>
                  {s.name}{s.severity != null ? ` · ${s.severity}/10` : ""}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Episode */}
      {log.episode?.occurred && (
        <div className="rounded-xl px-3 py-2.5" style={{ background: "#FEF2F2", border: "1px solid #FECACA" }}>
          <p className="text-xs font-bold uppercase tracking-wider mb-1" style={{ color: "#991B1B" }}>Episode</p>
          <p className="text-sm text-slate-700">
            {log.episode.description || "Episode logged with no description."}
            {log.episode.time ? <span className="text-slate-400"> · {log.episode.time}</span> : ""}
          </p>
        </div>
      )}

      {/* Activities */}
      {(log.activities ?? []).length > 0 && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Activities</p>
          <div className="flex flex-wrap gap-1.5">
            {(log.activities ?? []).map((a, i) => (
              <span key={i} className="px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
                {a.type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase())}
                {a.duration_minutes ? ` · ${a.duration_minutes}m` : ""}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Lifestyle */}
      {log.lifestyle && Object.values(log.lifestyle).some(Boolean) && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">Lifestyle</p>
          <div className="flex flex-wrap gap-1.5">
            {log.lifestyle.smoked && <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-700">Smoked</span>}
            {log.lifestyle.alcohol && <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-orange-50 text-orange-700">Alcohol</span>}
            {log.lifestyle.stressed && <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-yellow-50 text-yellow-700">Stressed</span>}
            {log.lifestyle.ate_well && <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700">Ate well</span>}
          </div>
        </div>
      )}

      {/* Notes */}
      {log.notes?.trim() && (
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Notes</p>
          <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">{log.notes}</p>
        </div>
      )}
    </div>
  );
}

// ── Day row ────────────────────────────────────────────────────────────────────

function DayRow({ log, medications }: { log: DailyLog; medications: Medication[] }) {
  const [open, setOpen] = useState(false);

  const meds = medsStatus(log, medications);
  const symptomCount = (log.symptoms ?? []).length;
  const maxSeverity = symptomCount > 0 ? Math.max(...(log.symptoms ?? []).map(s => s.severity ?? 0)) : 0;
  const hasEpisode = log.episode?.occurred;

  const dateLabel = fmtDate(log.date);
  const isToday = dateLabel === "Today";

  return (
    <div
      className="bg-white rounded-2xl border border-slate-100 shadow-sm overflow-hidden"
      style={{ borderColor: hasEpisode ? "#d4e0d7" : undefined }}
    >
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left"
      >
        {/* Date */}
        <div className="flex-shrink-0 w-14 text-center">
          <p className={`text-sm font-bold ${isToday ? "text-teal" : "text-navy"}`}>{dateLabel}</p>
          {isToday && <p className="text-xs text-teal">Today</p>}
        </div>

        {/* Summary pills */}
        <div className="flex-1 flex flex-wrap gap-1.5 min-w-0">
          {log.mood_score !== null && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#faf9f6", color: moodColor(log.mood_score), border: `1px solid ${moodColor(log.mood_score)}22` }}>
              Mood {log.mood_score}/10
            </span>
          )}
          {log.sleep_hours !== null && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
              Sleep {log.sleep_hours}h
            </span>
          )}
          {symptomCount > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{
                background: maxSeverity >= 8 ? "#FEF3C7" : "#e8f0eb",
                color: maxSeverity >= 8 ? "#92400E" : "#2d4f38",
              }}>
              {symptomCount} symptom{symptomCount !== 1 ? "s" : ""}
            </span>
          )}
          {meds && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
              style={{ background: meds.allTaken ? "#e8f0eb" : "#FEF3C7", color: meds.allTaken ? "#2d4f38" : "#92400E" }}>
              Meds {meds.taken}/{meds.total}
            </span>
          )}
          {hasEpisode && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{ background: "#FEF3C7", color: "#92400E", border: "1px solid #d4e0d7" }}>Episode</span>
          )}
        </div>

        {/* Chevron */}
        <svg
          className={`w-4 h-4 flex-shrink-0 text-slate-300 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="px-4 pb-4">
          <LogDetail log={log} medications={medications} />
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HistoryPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [search, setSearch] = useState("");

  const loadData = useCallback(async () => {
    try {
      const patients = await api.getPatients() as Patient[];
      if (!patients.length) { router.push("/onboarding"); return; }
      const p = patients[0];
      setPatient(p);
      const logsData = await api.getLogs(p.id) as DailyLog[];
      // newest first
      setLogs([...logsData].sort((a, b) => b.date.localeCompare(a.date)));
    } catch { /* silent */ } finally { setDataLoading(false); }
  }, [router]);

  useEffect(() => {
    if (!isLoading && !user) { router.push("/login"); return; }
    if (!isLoading && user) loadData();
  }, [user, isLoading, loadData, router]);

  if (isLoading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#faf9f6" }}>
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#4a7c59", borderTopColor: "transparent" }} />
      </div>
    );
  }

  // Filter by search (date or note keywords)
  const filtered = search.trim()
    ? logs.filter(l =>
        l.date.includes(search) ||
        l.notes?.toLowerCase().includes(search.toLowerCase()) ||
        (l.symptoms ?? []).some(s => s.name.toLowerCase().includes(search.toLowerCase()))
      )
    : logs;

  // Group by month
  const groups: { month: string; logs: DailyLog[] }[] = [];
  for (const log of filtered) {
    const month = fmtMonthGroup(log.date);
    const last = groups[groups.length - 1];
    if (last?.month === month) {
      last.logs.push(log);
    } else {
      groups.push({ month, logs: [log] });
    }
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: "#faf9f6" }}>
      <NavBar />

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">

        {/* Header */}
        <div>
          <h1 className="text-3xl font-bold text-navy">History</h1>
          {patient && (
            <p className="text-base text-slate-500 mt-1">{patient.name} · {logs.length} day{logs.length !== 1 ? "s" : ""} logged</p>
          )}
        </div>

        {/* Search */}
        {logs.length > 0 && (
          <div className="relative">
            <svg className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by date, symptom, or note…"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white border border-slate-200 text-base text-navy placeholder:text-slate-400 focus:outline-none focus:border-teal-500"
            />
          </div>
        )}

        {/* Empty state */}
        {logs.length === 0 && (
          <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-100 flex flex-col items-center gap-3 text-center">
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center" style={{ background: "#e8f0eb" }}>
              <svg className="w-7 h-7" style={{ color: "#4a7c59" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <p className="text-lg font-bold text-navy">No logs yet</p>
            <p className="text-base text-slate-500">Start logging daily observations and they&apos;ll appear here.</p>
          </div>
        )}

        {/* No search results */}
        {logs.length > 0 && filtered.length === 0 && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 text-center">
            <p className="text-base text-slate-400">No logs matching &ldquo;{search}&rdquo;</p>
          </div>
        )}

        {/* Timeline grouped by month */}
        {groups.map(group => (
          <div key={group.month} className="space-y-2">
            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 px-1">{group.month}</p>
            {group.logs.map(log => (
              <DayRow key={log.id} log={log} medications={patient?.medications ?? []} />
            ))}
          </div>
        ))}

      </div>
    </div>
  );
}
