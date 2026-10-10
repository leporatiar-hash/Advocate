"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/api";
import { useAuth } from "../components/AuthProvider";
import { NavBar } from "../components/NavBar";
import { isAsNeeded, removeFalseMisses, scheduleLabel } from "../lib/medSchedule";
import { customReadings } from "../lib/customVitals";
import { computeProgressStats } from "../lib/progress";
import { ProgressSummary } from "../components/ProgressSummary";
import { EpisodeFollowUp } from "../components/EpisodeFollowUp";
import type { Patient, DailyLog, Vitals, SocialContact, Socialization, ProgressArea } from "../lib/types";

// ── Date helpers ──────────────────────────────────────────────────────────────

function fmtLong(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "long", month: "long", day: "numeric", year: "numeric",
  });
}

function fmtMed(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "long", day: "numeric",
  });
}

function fmtShort(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    month: "short", day: "numeric",
  });
}

// ── Aggregate computation ─────────────────────────────────────────────────────

function computeStatusSummary(logs: DailyLog[]): { text: string; warn: boolean } {
  const concernRe = /suicid|command hallucin/i;
  for (const log of logs) {
    if (log.symptoms?.some(s => concernRe.test(s.name))) {
      return { text: "⚠ Concerning. See episode notes.", warn: true };
    }
    if (log.episode?.occurred && concernRe.test(log.episode.description || "")) {
      return { text: "⚠ Concerning. See episode notes.", warn: true };
    }
  }
  const symptomDays = logs.filter(l => (l.symptoms?.length ?? 0) > 0).length;
  if (symptomDays >= 4) return { text: "Symptomatic. Review notes below.", warn: false };
  return { text: "Relatively stable over this period", warn: false };
}

interface MedRow {
  name: string;
  dose: string;
  schedule: string;
  asNeeded: boolean;
  takenDays: number;
  trackedDays: number;
  missedDates: string[];
}

function computeMedAggregates(logs: DailyLog[], patient: Patient): MedRow[] {
  return patient.medications
    .filter(m => m.active)
    .map(med => {
      let takenDays = 0, trackedDays = 0;
      const missedDates: string[] = [];
      const asNeeded = isAsNeeded(med);
      for (const log of logs) {
        // Off-day and as-needed "not taken" entries are dropped — not misses.
        const entries = removeFalseMisses(log.medications_taken, patient.medications, log.date)
          .filter(m => m.medication_id === med.id);
        if (!entries.length) continue;
        trackedDays++;
        if (entries.some(e => e.taken)) takenDays++;
        else missedDates.push(log.date);
      }
      return { name: med.name, dose: med.dose, schedule: scheduleLabel(med), asNeeded, takenDays, trackedDays, missedDates };
    })
    .filter(r => r.trackedDays > 0 || r.asNeeded);
}

// Severity over the period, not just how often a symptom was logged — a
// caregiver who logs every symptom daily would otherwise see "8 / 8" for
// everything. Higher severity is worse.
interface SymptomRow {
  name: string;
  avg: number;
  first: { value: number; date: string };
  latest: { value: number; date: string };
  peak: { value: number; date: string };
  change: "worse" | "better" | "steady" | null; // null = a single rating
}

function computeSymptomTable(logs: DailyLog[]): SymptomRow[] {
  const series = new Map<string, { value: number; date: string }[]>();
  for (const log of [...logs].sort((a, b) => a.date.localeCompare(b.date))) {
    const seen = new Set<string>();
    for (const sym of (log.symptoms ?? [])) {
      if (seen.has(sym.name) || typeof sym.severity !== "number") continue;
      seen.add(sym.name);
      const pts = series.get(sym.name) ?? [];
      pts.push({ value: sym.severity, date: log.date });
      series.set(sym.name, pts);
    }
  }
  return Array.from(series.entries())
    .map(([name, pts]) => {
      const first = pts[0], latest = pts[pts.length - 1];
      const peak = pts.reduce((m, p) => (p.value > m.value ? p : m), pts[0]);
      const delta = latest.value - first.value;
      return {
        name, first, latest, peak,
        avg: Math.round((pts.reduce((a, p) => a + p.value, 0) / pts.length) * 10) / 10,
        change: pts.length < 2 ? null : delta >= 1 ? "worse" as const : delta <= -1 ? "better" as const : "steady" as const,
      };
    })
    .sort((a, b) => b.latest.value - a.latest.value || b.avg - a.avg);
}

interface EpisodeRow {
  date: string;
  time: string | null;
  description: string | null;
  episode: NonNullable<DailyLog["episode"]>;
}

function computeEpisodes(logs: DailyLog[]): EpisodeRow[] {
  return logs
    .filter(l => l.episode?.occurred)
    .map(l => ({
      date: l.date,
      time: (l.episode as { occurred: boolean; time?: string; description?: string }).time || null,
      description: (l.episode as { occurred: boolean; time?: string; description?: string }).description || null,
      episode: l.episode!,
    }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

interface VitalsRange {
  hrMin: number | null;
  hrMax: number | null;
  hrAvg: number | null;
  bpValues: string[];
}

function computeVitalsRange(logs: DailyLog[]): VitalsRange {
  const hrs: number[] = [];
  const bpSet = new Set<string>();
  for (const log of logs) {
    if (!log.vitals) continue;
    const v = log.vitals as Vitals;
    const hr = parseInt(v.heart_rate || "");
    if (!isNaN(hr)) hrs.push(hr);
    if (v.blood_pressure?.trim()) bpSet.add(v.blood_pressure.trim());
  }
  return {
    hrMin: hrs.length ? Math.min(...hrs) : null,
    hrMax: hrs.length ? Math.max(...hrs) : null,
    hrAvg: hrs.length ? Math.round(hrs.reduce((a, b) => a + b) / hrs.length) : null,
    bpValues: Array.from(bpSet),
  };
}

interface CustomVitalRow {
  name: string;
  unit: string | null;
  readings: { date: string; value: string }[];
  min: number | null;
  max: number | null;
}

function computeCustomVitals(logs: DailyLog[]): CustomVitalRow[] {
  const map = new Map<string, CustomVitalRow>();
  for (const log of [...logs].sort((a, b) => a.date.localeCompare(b.date))) {
    for (const [name, r] of Object.entries(customReadings(log.vitals))) {
      const row = map.get(name) ?? { name, unit: null, readings: [], min: null, max: null };
      row.readings.push({ date: log.date, value: r.unit ? `${r.value} ${r.unit}` : r.value });
      row.unit = r.unit ?? row.unit;
      const n = Number(r.value);
      if (r.value.trim() !== "" && Number.isFinite(n)) {
        row.min = row.min === null ? n : Math.min(row.min, n);
        row.max = row.max === null ? n : Math.max(row.max, n);
      }
      map.set(name, row);
    }
  }
  return Array.from(map.values());
}

interface ActivityRow { type: string; daysActive: number }

function computeActivities(logs: DailyLog[]): ActivityRow[] {
  const map = new Map<string, number>();
  for (const log of logs) {
    const seen = new Set<string>();
    for (const a of (log.activities ?? [])) {
      if (seen.has(a.type)) continue;
      seen.add(a.type);
      map.set(a.type, (map.get(a.type) ?? 0) + 1);
    }
  }
  return Array.from(map.entries())
    .map(([type, daysActive]) => ({
      type: type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase()),
      daysActive,
    }))
    .sort((a, b) => b.daysActive - a.daysActive);
}

interface SocializationSummary {
  daysTracked: number;
  totalDays: number;
  daysLeftHouse: number;
  daysHadContact: number;
  contactFrequency: { name: string; count: number }[];
  qualityBreakdown: { good: number; neutral: number; difficult: number; total: number };
  daysInitiatedBySelf: number;
  totalInitiatedAnswered: number;
}

function computeSocialization(logs: DailyLog[], contacts: SocialContact[]): SocializationSummary | null {
  const contactMap = new Map(contacts.map(c => [c.id, c.name]));
  const contactCounts = new Map<number, number>();

  let daysTracked = 0, daysLeftHouse = 0, daysHadContact = 0;
  let good = 0, neutral = 0, difficult = 0, qualityTotal = 0;
  let daysInitiatedBySelf = 0, totalInitiatedAnswered = 0;

  for (const log of logs) {
    const s = log.socialization as Socialization | null;
    if (!s || (s.left_house === null && s.had_contact === null)) continue;
    daysTracked++;
    if (s.left_house === true) daysLeftHouse++;
    if (s.had_contact === true) {
      daysHadContact++;
      for (const id of (s.contact_ids ?? [])) {
        contactCounts.set(id, (contactCounts.get(id) ?? 0) + 1);
      }
    }
    if (s.quality !== null && s.quality !== undefined) {
      qualityTotal++;
      if (s.quality === "good") good++;
      else if (s.quality === "neutral") neutral++;
      else if (s.quality === "difficult") difficult++;
    }
    if (s.initiated_by !== null && s.initiated_by !== undefined) {
      totalInitiatedAnswered++;
      if (s.initiated_by === "self") daysInitiatedBySelf++;
    }
  }

  if (daysTracked === 0) return null;

  const contactFrequency = Array.from(contactCounts.entries())
    .map(([id, count]) => ({ name: contactMap.get(id) ?? `Contact #${id}`, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    daysTracked,
    totalDays: logs.length,
    daysLeftHouse,
    daysHadContact,
    contactFrequency,
    qualityBreakdown: { good, neutral, difficult, total: qualityTotal },
    daysInitiatedBySelf,
    totalInitiatedAnswered,
  };
}

// ── Print stylesheet ──────────────────────────────────────────────────────────

const PRINT_STYLE = `
@media print {
  body { font-family: Georgia, 'Times New Roman', serif; font-size: 11pt; color: #000; background: #fff; margin: 0; }
  .no-print { display: none !important; }
  .print-page { background: #fff !important; box-shadow: none !important; border: none !important; border-radius: 0 !important; padding: 0 !important; }
  .section-rule { border-top: 1.5px solid #000 !important; }
  .section-title { color: #000 !important; border-bottom: 1.5px solid #000 !important; }
  table { width: 100%; border-collapse: collapse; }
  th { font-weight: bold; border-bottom: 1.5px solid #000; padding: 3pt 8pt 3pt 0; text-align: left; }
  td { border-bottom: 0.5px solid #bbb; padding: 3pt 8pt 3pt 0; vertical-align: top; }
  .status-badge { border: 1px solid #000 !important; background: #fff !important; color: #000 !important; }
  h1 { font-size: 16pt; }
}
`;

// ── Section wrapper ───────────────────────────────────────────────────────────

function Section({
  title, children, accent = "#0D1B2A",
}: {
  title: string; children: React.ReactNode; accent?: string;
}) {
  return (
    <div className="mb-7">
      <h2
        className="section-title text-xs font-bold uppercase tracking-widest pb-1.5 mb-4 border-b-2"
        style={{ color: accent, borderColor: accent }}
      >
        {title}
      </h2>
      {children}
    </div>
  );
}

// ── Clinical report ───────────────────────────────────────────────────────────

function ClinicalReport({
  patient, logs, userName, contacts, progressAreas,
}: {
  progressAreas: ProgressArea[];
  patient: Patient;
  logs: DailyLog[];
  userName: string | undefined;
  contacts: SocialContact[];
}) {
  const today = new Date().toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
  const startDate = logs.length ? fmtShort(logs[0].date) : "—";
  const endDate = logs.length ? fmtShort(logs[logs.length - 1].date) : "—";
  const totalDays = logs.length;

  const status = computeStatusSummary(logs);
  const medRows = computeMedAggregates(logs, patient);
  const symptomRows = computeSymptomTable(logs);
  const episodes = computeEpisodes(logs);
  const vitals = computeVitalsRange(logs);
  const activityRows = computeActivities(logs);
  const socData = computeSocialization(logs, contacts);
  const noteEntries = [...logs]
    .filter(l => l.notes?.trim())
    .sort((a, b) => a.date.localeCompare(b.date));

  const customVitalRows = computeCustomVitals(logs);
  const progress = computeProgressStats(logs, progressAreas, patient.medications);
  const hasProgress = Object.keys(progress.areas).length > 0 || progress.wins.length > 0;
  const hasVitals = vitals.hrMin !== null || vitals.bpValues.length > 0 || customVitalRows.length > 0;

  return (
    <div className="print-page bg-white rounded-2xl shadow-sm border border-slate-100 p-6">

      {/* ── Report header ── */}
      <div className="mb-7 pb-5 border-b-2 border-slate-300">
        <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">
          Caregiver Observation Report
        </p>
        <h1 className="text-2xl font-bold text-navy">{patient.name}</h1>

        <div className="mt-3 text-sm text-slate-600 space-y-0.5">
          {patient.diagnosis && (
            <p><span className="font-semibold">Diagnosis:</span> {patient.diagnosis}</p>
          )}
          <p>
            <span className="font-semibold">Reporting period:</span>{" "}
            {startDate} – {endDate}{" "}
            <span className="text-slate-400">({totalDays} day{totalDays !== 1 ? "s" : ""} logged)</span>
          </p>
          <p><span className="font-semibold">Generated:</span> {today}</p>
          <p><span className="font-semibold">Prepared by:</span> Advocate (Caregiver Health Tracking)</p>
        </div>

        {/* Status summary */}
        {totalDays > 0 && (
          <div
            className="status-badge mt-4 px-4 py-2.5 rounded-xl text-sm font-semibold inline-block"
            style={{
              background: status.warn ? "#FEF2F2" : "#F0FDF4",
              color: status.warn ? "#991B1B" : "#14532D",
              border: `1.5px solid ${status.warn ? "#FECACA" : "#86EFAC"}`,
            }}
          >
            {status.text}
          </div>
        )}
      </div>

      {totalDays === 0 ? (
        <p className="text-slate-400 text-base py-8 text-center">No logs found for this period.</p>
      ) : (
        <>
          {/* ── Medications ── */}
          {medRows.length > 0 && (
            <Section title="Medications" accent="#0D9488">
              <table>
                <thead>
                  <tr>
                    <th className="text-xs text-slate-500 font-semibold">Medication</th>
                    <th className="text-xs text-slate-500 font-semibold">Dose</th>
                    <th className="text-xs text-slate-500 font-semibold">Schedule</th>
                    <th className="text-xs text-slate-500 font-semibold">Days Taken</th>
                    <th className="text-xs text-slate-500 font-semibold">Missed Dates</th>
                  </tr>
                </thead>
                <tbody>
                  {medRows.map((row, i) => (
                    <tr key={i}>
                      <td className="text-sm font-semibold text-navy py-2">{row.name}</td>
                      <td className="text-sm text-slate-600 py-2">{row.dose || "—"}</td>
                      <td className="text-sm text-slate-600 py-2">{row.schedule}</td>
                      <td className="text-sm text-slate-700 py-2">
                        {row.asNeeded ? `Given on ${row.takenDays} day${row.takenDays === 1 ? "" : "s"}` : `${row.takenDays} of ${row.trackedDays}`}
                      </td>
                      <td className="text-sm text-slate-500 py-2">
                        {row.asNeeded
                          ? <span className="text-slate-400">n/a</span>
                          : row.missedDates.length === 0
                          ? <span className="text-slate-300">—</span>
                          : row.missedDates.map(d => fmtMed(d)).join(", ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* ── Symptoms ── */}
          {symptomRows.length > 0 && (
            <Section title="Symptoms" accent="#1E40AF">
              <table>
                <thead>
                  <tr>
                    <th className="text-xs text-slate-500 font-semibold">Symptom (0–10)</th>
                    <th className="text-xs text-slate-500 font-semibold">First → Latest</th>
                    <th className="text-xs text-slate-500 font-semibold">Average</th>
                    <th className="text-xs text-slate-500 font-semibold">Peak</th>
                    <th className="text-xs text-slate-500 font-semibold">Change</th>
                  </tr>
                </thead>
                <tbody>
                  {symptomRows.map((row, i) => (
                    <tr key={i}>
                      <td className="text-sm font-semibold text-navy py-2">{row.name}</td>
                      <td className="text-sm text-slate-700 py-2">
                        {row.first.value} → <span className="font-semibold">{row.latest.value}</span>
                      </td>
                      <td className="text-sm text-slate-700 py-2">{row.avg}</td>
                      <td className="text-sm text-slate-700 py-2">{row.peak.value} <span className="text-slate-400">({new Date(row.peak.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })})</span></td>
                      <td className="text-sm py-2" style={{ color: row.change === "worse" ? "#B91C1C" : row.change === "better" ? "#166534" : "#64748B" }}>
                        {row.change === "worse" ? "↑ Worse" : row.change === "better" ? "↓ Better" : row.change === "steady" ? "Steady" : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* ── Episodes ── */}
          <Section title="Episodes" accent="#7C3AED">
            {episodes.length === 0 ? (
              <p className="text-sm text-slate-400 italic">No acute episodes logged in this period.</p>
            ) : (
              <div className="space-y-3">
                {episodes.map((ep, i) => (
                  <div key={i} className="flex gap-4 text-sm">
                    <span className="font-semibold text-navy flex-shrink-0 min-w-[140px]">
                      {fmtMed(ep.date)}{ep.time ? `, ${ep.time}` : ""}
                    </span>
                    <span className="text-slate-700 leading-relaxed">
                      {ep.description ?? <span className="italic text-slate-400">No description logged.</span>}
                      <EpisodeFollowUp episode={ep.episode} className="text-sm text-slate-600 mt-0.5" />
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ── Progress ── */}
          {hasProgress && (
            <Section title="Progress & Improvements" accent="#166534">
              <ProgressSummary stats={progress} maxWins={10} />
            </Section>
          )}

          {/* ── Vitals ── */}
          {hasVitals && (
            <Section title="Vitals" accent="#0D1B2A">
              <div className="space-y-2 text-sm">
                {vitals.hrMin !== null && (
                  <p className="text-slate-700">
                    <span className="font-semibold text-navy">Heart Rate:</span>{" "}
                    {vitals.hrMin}–{vitals.hrMax} bpm over period (avg: {vitals.hrAvg})
                  </p>
                )}
                {vitals.bpValues.length > 0 && (
                  <p className="text-slate-700">
                    <span className="font-semibold text-navy">Blood Pressure:</span>{" "}
                    {vitals.bpValues.join(", ")}
                  </p>
                )}
                {customVitalRows.map(row => (
                  <p key={row.name} className="text-slate-700">
                    <span className="font-semibold text-navy">{row.unit ? `${row.name} (${row.unit})` : row.name}:</span>{" "}
                    {row.readings.map(r => `${fmtMed(r.date)}: ${r.value}`).join("; ")}
                    {row.min !== null && row.max !== null && row.readings.length > 1 && (
                      <span className="text-slate-500"> · range {row.min}–{row.max}{row.unit ? ` ${row.unit}` : ""}</span>
                    )}
                  </p>
                ))}
              </div>
            </Section>
          )}

          {/* ── Caregiver Observations ── */}
          {noteEntries.length > 0 && (
            <Section title="Caregiver Observations" accent="#166534">
              <div className="space-y-3">
                {noteEntries.map((log, i) => (
                  <div key={i} className="flex gap-4 text-sm">
                    <span className="font-semibold text-navy flex-shrink-0 min-w-[80px]">
                      {fmtMed(log.date)}
                    </span>
                    <span className="text-slate-700 leading-relaxed whitespace-pre-wrap">{log.notes}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* ── Functional Engagement ── */}
          {activityRows.length > 0 && (
            <Section title="Functional Engagement" accent="#92400E">
              <table>
                <thead>
                  <tr>
                    <th className="text-xs text-slate-500 font-semibold w-1/2">Activity</th>
                    <th className="text-xs text-slate-500 font-semibold">Days Active</th>
                  </tr>
                </thead>
                <tbody>
                  {activityRows.map((row, i) => (
                    <tr key={i}>
                      <td className="text-sm font-semibold text-navy py-2">{row.type}</td>
                      <td className="text-sm text-slate-700 py-2">{row.daysActive}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Section>
          )}

          {/* ── Socialization ── */}
          {socData && (
            <Section title="Socialization" accent="#0D7490">
              <div className="space-y-1.5 text-sm">
                <p className="text-slate-700">
                  <span className="font-semibold text-navy">Days tracked:</span>{" "}
                  {socData.daysTracked} / {socData.totalDays}
                </p>
                <p className="text-slate-700">
                  <span className="font-semibold text-navy">Left the house:</span>{" "}
                  {socData.daysLeftHouse} day{socData.daysLeftHouse !== 1 ? "s" : ""}
                </p>
                <p className="text-slate-700">
                  <span className="font-semibold text-navy">Had social contact:</span>{" "}
                  {socData.daysHadContact} day{socData.daysHadContact !== 1 ? "s" : ""}
                  {socData.contactFrequency.length > 0 && (
                    <span className="text-slate-500">
                      {" "}(most frequent: {socData.contactFrequency.map(c => `${c.name} (${c.count})`).join(", ")})
                    </span>
                  )}
                </p>
                {socData.qualityBreakdown.total > 0 && (
                  <p className="text-slate-700">
                    <span className="font-semibold text-navy">Quality breakdown:</span>{" "}
                    Good {socData.qualityBreakdown.good} · Neutral {socData.qualityBreakdown.neutral} · Difficult {socData.qualityBreakdown.difficult}
                  </p>
                )}
                {socData.totalInitiatedAnswered > 0 && (
                  <p className="text-slate-700">
                    <span className="font-semibold text-navy">Initiated by {patient.name}:</span>{" "}
                    {socData.daysInitiatedBySelf} of {socData.totalInitiatedAnswered} contact day{socData.totalInitiatedAnswered !== 1 ? "s" : ""}
                  </p>
                )}
              </div>
            </Section>
          )}
        </>
      )}

      {/* Footer */}
      <div className="mt-8 pt-4 border-t border-slate-200 text-xs text-slate-400 text-center">
        Generated by Advocate · Caregiver Health Tracking · {today}
        {userName ? ` · Submitted by ${userName}` : ""}
      </div>
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function PrintPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [contacts, setContacts] = useState<SocialContact[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [range, setRange] = useState<7 | 30>(7);

  const loadData = useCallback(async () => {
    try {
      const [patients, contactsData] = await Promise.all([
        api.getPatients() as Promise<Patient[]>,
        api.getSocialContacts() as Promise<SocialContact[]>,
      ]);
      if (!patients.length) { router.push("/onboarding"); return; }
      const p = patients[0];
      setPatient(p);
      setContacts(contactsData);
      const logsData = await api.getLogs(p.id) as DailyLog[];
      setLogs(logsData);
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

  const cutoff = (() => {
    const d = new Date();
    d.setDate(d.getDate() - range);
    return d.toISOString().split("T")[0];
  })();

  const filtered = [...logs]
    .filter(l => l.date >= cutoff)
    .sort((a, b) => a.date.localeCompare(b.date));

  const fmtShortLocal = (dateStr: string) =>
    new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (isLoading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#F8FAFC" }}>
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#0D9488", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <>
      <style>{PRINT_STYLE}</style>

      <div className="min-h-screen pb-28" style={{ background: "#F8FAFC" }}>
        <div className="no-print">
          <NavBar />
        </div>

        <div className="max-w-2xl mx-auto px-4 pt-6">

          {/* Controls */}
          <div className="no-print mb-6 space-y-4">
            <div>
              <h1 className="text-3xl font-bold text-navy">Print Report</h1>
              <p className="text-base text-slate-500 mt-1">Generate a clinical summary for the doctor.</p>
            </div>

            <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 space-y-3">
              <p className="text-sm font-semibold text-slate-600">Reporting period</p>
              <div className="flex gap-3">
                {([7, 30] as const).map(r => (
                  <button key={r} type="button" onClick={() => setRange(r)}
                    className="flex-1 py-3 rounded-xl border-2 text-base font-semibold transition-all"
                    style={{
                      borderColor: range === r ? "#0D9488" : "#CBD5E1",
                      background: range === r ? "#0D9488" : "white",
                      color: range === r ? "white" : "#334155",
                    }}
                  >Last {r} days</button>
                ))}
              </div>
              <p className="text-sm text-slate-400">
                {filtered.length} log{filtered.length !== 1 ? "s" : ""} found
                {filtered.length > 0 && ` (${fmtShortLocal(filtered[0].date)} – ${fmtShortLocal(filtered[filtered.length - 1].date)})`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="w-full py-4 rounded-2xl font-bold text-white text-lg shadow-lg transition-all active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, #0D9488, #0B7A70)" }}
            >
              Print / Save as PDF
            </button>
          </div>

          {patient && (
            <ClinicalReport
              patient={patient}
              logs={filtered}
              userName={user?.name}
              progressAreas={user?.user_config?.progress_areas ?? []}
              contacts={contacts}
            />
          )}

        </div>
      </div>
    </>
  );
}
