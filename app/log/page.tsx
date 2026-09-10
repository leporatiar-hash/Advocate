"use client";

import { useState, useEffect, useCallback, useRef, Suspense } from "react";
import { flushSync } from "react-dom";
import { useRouter, useSearchParams } from "next/navigation";
import toast from "react-hot-toast";
import { api, localDateStr } from "../lib/api";
import { useAuth } from "../components/AuthProvider";
import { NavBar } from "../components/NavBar";
import { StepLoader } from "../components/StepLoader";
import type { Patient, Medication, MedicationTaken, Symptom, MedicationSideEffect, Activity, Lifestyle, SocialContact, Socialization, KnownSideEffect, TreatmentPlan, Episode, EpisodeOutcome } from "../lib/types";
import { DEFAULT_SYMPTOM_NAMES, DEFAULT_ACTIVITY_OPTIONS } from "../lib/constants";

// ── Constants ─────────────────────────────────────────────────────────────────


const SIMPLE_DOSE_TIMES = [
  { label: "Morning", time: "08:00" },
  { label: "Afternoon", time: "13:00" },
  { label: "Evening", time: "18:00" },
  { label: "Night", time: "21:00" },
];

const SIMPLE_TIME_LABELS: Record<string, string> = {
  "08:00": "Morning",
  "13:00": "Afternoon",
  "18:00": "Evening",
  "21:00": "Night",
};

const FALLBACK_SIDE_EFFECT_OPTIONS: KnownSideEffect[] = [
  { name: "Nausea", frequency: "common", category: "GI" },
  { name: "Vomiting", frequency: "common", category: "GI" },
  { name: "Constipation", frequency: "common", category: "GI" },
  { name: "Diarrhea", frequency: "common", category: "GI" },
  { name: "Dizziness", frequency: "common", category: "neurological" },
  { name: "Drowsiness", frequency: "common", category: "neurological" },
  { name: "Headache", frequency: "common", category: "neurological" },
  { name: "Rash", frequency: "uncommon", category: "dermatological" },
  { name: "Dry mouth", frequency: "common", category: "GI" },
  { name: "Loss of appetite", frequency: "common", category: "metabolic" },
];

// ── Other Side Effect Input ───────────────────────────────────────────────────

function OtherSideEffectInput({ onAdd }: { onAdd: (name: string) => void }) {
  const [value, setValue] = useState("");
  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          if (e.key === "Enter" && value.trim()) {
            e.preventDefault();
            onAdd(value.trim());
            setValue("");
          }
        }}
        placeholder="Other side effect…"
        maxLength={50}
        className="flex-1 px-3 py-2 rounded-lg border text-sm focus:outline-none bg-white"
        style={{ borderColor: "#E2E8F0", color: "#374151" }}
      />
      <button
        type="button"
        onClick={() => { if (value.trim()) { onAdd(value.trim()); setValue(""); } }}
        className="px-3 py-2 rounded-lg text-sm font-semibold text-white"
        style={{ background: value.trim() ? "#EF4444" : "#CBD5E1" }}
      >
        Add
      </button>
    </div>
  );
}

// ── Accordion section ─────────────────────────────────────────────────────────

function AccordionSection({
  id, title, summaryLine, bgColor, borderColor, headingColor,
  isOpen, onToggle, onSettings, children,
}: {
  id: string; title: string; summaryLine: string;
  bgColor: string; borderColor: string; headingColor: string;
  isOpen: boolean; onToggle: () => void; onSettings?: () => void; children: React.ReactNode;
}) {
  return (
    <div id={id} className="rounded-2xl overflow-hidden shadow-sm border" style={{ borderColor }}>
      <div className="flex items-stretch" style={{ background: bgColor }}>
        <button
          type="button"
          onClick={onToggle}
          className="flex-1 flex items-center justify-between px-5 py-4 text-left min-w-0"
        >
          <div className="flex-1 min-w-0 pr-3">
            <p className="text-lg font-bold" style={{ color: headingColor }}>{title}</p>
            <p
              className="text-sm mt-0.5 truncate transition-opacity duration-200"
              style={{ color: headingColor + "99", opacity: isOpen ? 0 : 1 }}
            >{summaryLine}</p>
          </div>
          <svg
            className="w-5 h-5 flex-shrink-0 transition-transform duration-200"
            style={{ color: headingColor, transform: isOpen ? "rotate(180deg)" : "none" }}
            fill="none" stroke="currentColor" viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>
        {onSettings && (
          <button
            type="button"
            onClick={onSettings}
            className="px-4 flex items-center border-l"
            style={{ color: headingColor + "80", borderColor: headingColor + "20" }}
            aria-label="Manage contacts"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        )}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateRows: isOpen ? "1fr" : "0fr",
          transition: "grid-template-rows 0.25s ease",
          background: bgColor,
        }}
      >
        <div style={{ overflow: "hidden" }}>
          <div className="px-5 pb-5 space-y-4">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Slider ────────────────────────────────────────────────────────────────────

function LabeledSlider({
  label, value, min, max, step = 1, onChange, leftLabel, rightLabel, unit = "",
}: {
  label: string; value: number | null; min: number; max: number; step?: number;
  onChange: (v: number) => void; leftLabel?: string; rightLabel?: string; unit?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-base font-semibold text-slate-700">{label}</label>
        {value !== null
          ? <span className="text-base font-bold" style={{ color: "#4a7c59" }}>{value}{unit}</span>
          : <span className="text-sm font-medium" style={{ color: "#94A3B8" }}>Not logged</span>
        }
      </div>
      <input
        type="range" min={min} max={max} step={step} value={value ?? min}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full"
      />
      {(leftLabel || rightLabel) && (
        <div className="flex justify-between text-sm text-slate-400">
          <span>{leftLabel}</span><span>{rightLabel}</span>
        </div>
      )}
    </div>
  );
}

// ── Word severity selector ──────────────────────────────────────────────────
//
// Same 0-10 severity is saved either way — this is a display alternative to
// the numeric slider (see the "Symptom Scale" setting), not a new scale.
// Word -> representative value uses the exact band thresholds the rest of
// the app already buckets by (backend/services/aggregation.py's
// BAND_THRESHOLDS: low 0-3, medium 4-6, high 7-10), so a word logged here
// and a number logged elsewhere land in the same band everywhere downstream.
const WORD_SEVERITY_VALUES = { none: 0, low: 2, medium: 5, high: 8 } as const;

function wordForSeverity(value: number | null): keyof typeof WORD_SEVERITY_VALUES {
  if (!value) return "none";
  if (value <= 3) return "low";
  if (value <= 6) return "medium";
  return "high";
}

function WordSeveritySelector({
  label, value, onChange,
}: {
  label: string; value: number | null; onChange: (v: number) => void;
}) {
  const active = wordForSeverity(value);
  return (
    <div className="space-y-2">
      <label className="text-base font-semibold text-slate-700">{label}</label>
      <div className="grid grid-cols-4 gap-2">
        {(Object.keys(WORD_SEVERITY_VALUES) as (keyof typeof WORD_SEVERITY_VALUES)[]).map(word => (
          <button
            key={word}
            type="button"
            onClick={() => onChange(WORD_SEVERITY_VALUES[word])}
            className="py-2.5 rounded-xl border-2 text-sm font-semibold capitalize transition-all"
            style={{
              borderColor: active === word ? "#4a7c59" : "#CBD5E1",
              background: active === word ? "#4a7c59" : "white",
              color: active === word ? "white" : "#64748B",
            }}
          >
            {word}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Tile ──────────────────────────────────────────────────────────────────────

function Tile({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button" onClick={onClick}
      className="flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 text-center transition-all min-h-[72px]"
      style={{ borderColor: active ? "#4a7c59" : "#CBD5E1", background: active ? "#4a7c59" : "white" }}
    >
      {active ? (
        <svg className="w-5 h-5" style={{ color: "white" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      ) : (
        <div className="w-5 h-5 rounded-full border-2" style={{ borderColor: "#CBD5E1" }} />
      )}
      <span className="text-sm font-semibold leading-tight" style={{ color: active ? "white" : "#334155" }}>{label}</span>
    </button>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button" onClick={() => onChange(!value)}
      className="relative w-14 h-7 rounded-full transition-colors flex-shrink-0 overflow-hidden"
      style={{ background: value ? "#4a7c59" : "#CBD5E1" }}
    >
      <span
        className="absolute top-0.5 w-6 h-6 rounded-full bg-white"
        style={{ left: value ? "calc(100% - 26px)" : "2px", transition: "left 0.2s ease" }}
      />
    </button>
  );
}

// ── YesNoToggle ───────────────────────────────────────────────────────────────

function YesNoToggle({ value, onChange }: { value: boolean | null; onChange: (v: boolean | null) => void }) {
  return (
    <div className="flex gap-2">
      {([["Yes", true], ["No", false]] as [string, boolean][]).map(([label, v]) => {
        const active = value === v;
        return (
          <button
            key={label}
            type="button"
            onClick={() => onChange(active ? null : v)}
            className="flex-1 py-3 rounded-xl border-2 text-base font-semibold transition-all active:scale-95"
            style={{
              borderColor: active ? "#4a7c59" : "#CBD5E1",
              background: active ? "#4a7c59" : "white",
              color: active ? "white" : "#334155",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

interface Vitals {
  heart_rate: string;
  blood_pressure: string;
  cigarettes: string;
  alcohol: boolean;
  alcohol_drinks: string;
  custom_substances?: Record<string, boolean>;
}


const HYDRATION_PRESETS = [
  { label: "Good", value: 80 },
  { label: "Fair", value: 48 },
  { label: "Poor", value: 24 },
] as const;

interface LogDraft {
  date: string;
  patientId: number | null;
  // Multi-dose: multiple entries per medication_id are allowed (each dose = one entry with taken: true)
  medicationsTaken: MedicationTaken[];
  symptoms: Symptom[];
  medicationSideEffects: MedicationSideEffect[];
  sleepHours: number | null;
  hydration: "Good" | "Fair" | "Poor" | null;
  lifestyle: Lifestyle;
  activities: Activity[];
  notes: string;
  episode: Episode;
  vitals: Vitals;
  photo: string | null; // base64 JPEG data URL (compressed ~50-100 KB)
  socialization: Socialization;
}

// ── Photo compression ─────────────────────────────────────────────────────────

async function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 900;
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas")); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("load")); };
    img.src = url;
  });
}

function emptyVitals(): Vitals {
  return { heart_rate: "", blood_pressure: "", cigarettes: "", alcohol: false, alcohol_drinks: "" };
}

function emptySocialization(): Socialization {
  return { left_house: null, had_contact: null, contact_ids: [], quality: null, initiated_by: null };
}

function defaultDraft(patientId: number | null, meds: Medication[], date?: string): LogDraft {
  return {
    date: date ?? localDateStr(),
    patientId,
    medicationsTaken: [],
    symptoms: [],
    medicationSideEffects: meds.filter(m => m.active).map(m => ({ medication_id: m.id, medication_name: m.name, side_effects: [] })),
    sleepHours: null,
    hydration: null,
    lifestyle: { smoked: false, alcohol: false, stressed: false, ate_well: false },
    activities: [],
    notes: "",
    episode: { occurred: false, time: "", description: "" },
    vitals: emptyVitals(),
    photo: null,
    socialization: emptySocialization(),
  };
}

function fmt12(time: string): string {
  if (!time) return "";
  const [h, m] = time.split(":").map(Number);
  const ampm = h >= 12 ? "pm" : "am";
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, "0")}${ampm}`;
}

function displayDoseTime(time: string | null): string {
  if (!time) return "";
  return SIMPLE_TIME_LABELS[time] ?? fmt12(time);
}

// ── Main page ─────────────────────────────────────────────────────────────────

function LogPageInner() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get("date");
  const isHistorical = !!dateParam && dateParam !== localDateStr();
  const targetDate = isHistorical ? dateParam! : localDateStr();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [draft, setDraft] = useState<LogDraft | null>(null);
  const [loadedFromServer, setLoadedFromServer] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [openSection, setOpenSection] = useState<string | null>("medications");
  const [expandedSE, setExpandedSE] = useState<number | null>(null);
  const [knownSideEffects, setKnownSideEffects] = useState<Record<number, KnownSideEffect[]>>({});
  const [treatmentPlan, setTreatmentPlan] = useState<TreatmentPlan | null>(null);
  const [planOpen, setPlanOpen] = useState(false);

  // Catch-up mode
  const [catchupMode, setCatchupMode] = useState(false);
  const [catchupDays, setCatchupDays] = useState<string[]>([]);
  const [dayStatuses, setDayStatuses] = useState<Record<string, "same" | "nothing_notable" | "log_it" | "queued">>({});
  const [daysSaving, setDaysSaving] = useState<Record<string, boolean>>({});
  const [logItOpenFor, setLogItOpenFor] = useState<string | null>(null);
  const [noteTexts, setNoteTexts] = useState<Record<string, string>>({});
  const [notesSaving, setNotesSaving] = useState<Record<string, boolean>>({});

  // Quick actions (today's log)
  const [hasYesterdayLog, setHasYesterdayLog] = useState(false);
  const [quickActioning, setQuickActioning] = useState(false);

  // Queued detail prompt (after today's log is saved)
  const [queuedDetailPrompt, setQueuedDetailPrompt] = useState<string[]>([]);

  // Medication management
  const [showMedManage, setShowMedManage] = useState(false);
  const [newMedName, setNewMedName] = useState("");
  const [newMedTime, setNewMedTime] = useState("morning");
  const [addingMed, setAddingMed] = useState(false);

  // Multi-dose: which med has "add dose" panel open + pending time
  const [addDoseOpenFor, setAddDoseOpenFor] = useState<number | null>(null);
  const [addDoseTime, setAddDoseTime] = useState("");

  // Quick dose mode
  const [quickAllTaken, setQuickAllTaken] = useState<boolean | null>(null);
  const [quickMissedText, setQuickMissedText] = useState("");

  // Photo capture
  const [photoLoading, setPhotoLoading] = useState(false);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const libraryInputRef = useRef<HTMLInputElement>(null);

  // Social contacts
  const [socialContacts, setSocialContacts] = useState<SocialContact[]>([]);
  const [showContactsSheet, setShowContactsSheet] = useState(false);
  const [newContactName, setNewContactName] = useState("");
  const [addingContact, setAddingContact] = useState(false);

  // Auto-save
  const isDirtyRef = useRef(false);
  const [lastAutoSaved, setLastAutoSaved] = useState<Date | null>(null);
  const draftRef = useRef<LogDraft | null>(null);
  const patientRef = useRef<Patient | null>(null);

  // Auto-expand section from URL hash
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    if (hash) setOpenSection(hash);
  }, []);

  const restoreDraftFromLog = useCallback((logData: Record<string, unknown>, p: Patient, date: string): LogDraft => {
    const ep = logData.episode as Episode | null;
    const vt = logData.vitals as Vitals | null;
    const savedSoc = logData.socialization as Socialization | null;
    const savedDoses = (logData.medications_taken as MedicationTaken[] | null) ?? [];
    const takenDoses = savedDoses.filter(m => m.taken);
    const waterOz = logData.water_intake_oz as number | null;
    const hydrPreset = waterOz === 80 ? "Good" : waterOz === 48 ? "Fair" : waterOz === 24 ? "Poor" : null;
    return {
      date,
      patientId: p.id,
      medicationsTaken: takenDoses,
      symptoms: (logData.symptoms as Symptom[]) ?? [],
      medicationSideEffects: (logData.medication_side_effects as MedicationSideEffect[]) ?? p.medications.filter(m => m.active).map(m => ({ medication_id: m.id, medication_name: m.name, side_effects: [] })),
      sleepHours: logData.sleep_hours as number | null,
      hydration: hydrPreset,
      lifestyle: (logData.lifestyle as Lifestyle | null) ?? { smoked: false, alcohol: false, stressed: false, ate_well: false },
      activities: (logData.activities as Activity[]) ?? [],
      notes: (logData.notes as string) ?? "",
      episode: ep ?? { occurred: false, time: "", description: "" },
      vitals: vt ? {
        heart_rate: vt.heart_rate ?? "",
        blood_pressure: vt.blood_pressure ?? "",
        cigarettes: (vt as Vitals).cigarettes ?? "",
        alcohol: (vt as Vitals).alcohol ?? false,
        alcohol_drinks: (vt as Vitals).alcohol_drinks ?? "",
      } : emptyVitals(),
      photo: (logData.photo as string | null) ?? null,
      socialization: savedSoc ? {
        left_house: savedSoc.left_house ?? null,
        had_contact: savedSoc.had_contact ?? null,
        contact_ids: savedSoc.contact_ids ?? [],
        quality: savedSoc.quality ?? null,
        initiated_by: savedSoc.initiated_by ?? null,
      } : emptySocialization(),
    };
  }, []);

  const loadPatient = useCallback(async () => {
    try {
      const [patients, contacts] = await Promise.all([
        api.getPatients() as Promise<Patient[]>,
        api.getSocialContacts() as Promise<SocialContact[]>,
      ]);
      if (!patients.length) { router.push("/onboarding"); return; }
      const p = patients[0];
      setPatient(p);
      setSocialContacts(contacts);

      const activeMedIds = p.medications.filter(m => m.active).map(m => m.id);
      const [knownEffectsEntries] = await Promise.all([
        Promise.all(
          activeMedIds.map(async (medId) => {
            try {
              const effects = await api.getKnownSideEffects(medId) as KnownSideEffect[];
              return [medId, effects] as [number, KnownSideEffect[]];
            } catch {
              return [medId, []] as [number, KnownSideEffect[]];
            }
          })
        ),
        api.getTreatmentPlan(p.id).then(plan => setTreatmentPlan(plan as TreatmentPlan)).catch(() => {}),
      ]);
      setKnownSideEffects(Object.fromEntries(knownEffectsEntries));

      // Fetch existing log for the target date
      const existingLog = isHistorical
        ? await api.getLogByDate(p.id, targetDate) as Record<string, unknown> | null
        : await api.getTodayLog(p.id) as Record<string, unknown> | null;

      if (existingLog) {
        setLoadedFromServer(true);
        setDraft(restoreDraftFromLog(existingLog, p, targetDate));
      } else {
        setDraft(defaultDraft(p.id, p.medications, targetDate));

        if (!isHistorical) {
          // Check for catch-up mode (≥2 consecutive missed days ending at yesterday)
          const missedResp = await api.getMissedDays(p.id) as { missed_days: string[] };
          const missedSet = new Set(missedResp.missed_days);

          const yesterday = new Date();
          yesterday.setDate(yesterday.getDate() - 1);
          const yesterdayStr = localDateStr(yesterday);

          let streak = 0;
          const cur = new Date(yesterday);
          while (missedSet.has(localDateStr(cur))) {
            streak++;
            cur.setDate(cur.getDate() - 1);
          }

          if (streak >= 2) {
            // Collect the streak dates oldest-first
            const streakDates: string[] = [];
            const d = new Date(yesterday);
            for (let i = 0; i < streak; i++) {
              streakDates.unshift(localDateStr(new Date(d)));
              d.setDate(d.getDate() - 1);
            }
            setCatchupDays(streakDates);
            setCatchupMode(true);
          }

          // "Same as yesterday" is only available when yesterday has a log
          setHasYesterdayLog(!missedSet.has(yesterdayStr));
        }
      }
    } catch { /* silent */ } finally { setLoading(false); }
  }, [router, isHistorical, targetDate, restoreDraftFromLog]);

  useEffect(() => {
    if (!isLoading && !user) { router.push("/login"); return; }
    if (!isLoading && user) loadPatient();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, isLoading]);

  // Keep refs current so the auto-save interval always reads the latest values
  useEffect(() => { draftRef.current = draft; }, [draft]);
  useEffect(() => { patientRef.current = patient; }, [patient]);

  // Auto-save every 30s when there are unsaved changes
  useEffect(() => {
    const timer = setInterval(async () => {
      const d = draftRef.current;
      const p = patientRef.current;
      if (!isDirtyRef.current || !d || !p) return;
      try {
        await performSave(d, p);
        isDirtyRef.current = false;
        setLastAutoSaved(new Date());
      } catch { /* silent — user can still save manually */ }
    }, 30_000);
    return () => clearInterval(timer);
  // performSave is stable (defined outside render cycle via refs)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Warn before closing the tab with unsaved changes
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (isDirtyRef.current) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  function update(patch: Partial<LogDraft>) {
    setDraft(d => d ? { ...d, ...patch } : d);
    isDirtyRef.current = true;
  }

  function startFresh() {
    if (!patient) return;
    setDraft(defaultDraft(patient.id, patient.medications, targetDate));
    setLoadedFromServer(false);
  }

  // ── Quick actions (today's log) ───────────────────────────────────────────

  async function handleQuickAction(type: "same_as_yesterday" | "nothing_notable") {
    if (!patient) return;
    setQuickActioning(true);
    try {
      await api.quickLog(patient.id, localDateStr(), type);
      const label = type === "same_as_yesterday" ? "Copied from yesterday" : "Marked as nothing notable";
      toast.success(label);
      setTimeout(() => router.push("/dashboard"), 600);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
      setQuickActioning(false);
    }
  }

  // ── Catch-up mode ─────────────────────────────────────────────────────────

  async function handleDayAction(dateStr: string, type: "same_as_yesterday" | "nothing_notable") {
    if (!patient) return;
    setDaysSaving(s => ({ ...s, [dateStr]: true }));
    // Close any open Log it field for this day
    setLogItOpenFor(prev => prev === dateStr ? null : prev);
    try {
      await api.quickLog(patient.id, dateStr, type);
      setDayStatuses(s => ({ ...s, [dateStr]: type === "same_as_yesterday" ? "same" : "nothing_notable" }));
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setDaysSaving(s => ({ ...s, [dateStr]: false }));
    }
  }

  async function handleSaveCatchupNote(dateStr: string) {
    if (!patient) return;
    const noteText = (noteTexts[dateStr] ?? "").trim();
    setNotesSaving(s => ({ ...s, [dateStr]: true }));
    try {
      await api.quickLog(patient.id, dateStr, "catch_up_note", noteText || undefined);
      setDayStatuses(s => ({ ...s, [dateStr]: "log_it" }));
      setLogItOpenFor(null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setNotesSaving(s => ({ ...s, [dateStr]: false }));
    }
  }

  async function handleMarkAllNothing() {
    if (!patient) return;
    const unaddressed = catchupDays.filter(d => !dayStatuses[d]);
    setLogItOpenFor(null);
    await Promise.all(unaddressed.map(d => handleDayAction(d, "nothing_notable")));
  }

  function handleContinueCatchup() {
    const queued = catchupDays.filter(d => dayStatuses[d] === "queued");
    if (queued.length > 0) {
      sessionStorage.setItem("truefit_queued_days", JSON.stringify(queued));
    }
    setCatchupMode(false);
  }

  // ── Medication multi-dose ─────────────────────────────────────────────────

  function openAddDose(medId: number) {
    setAddDoseOpenFor(medId);
    setAddDoseTime(new Date().toTimeString().slice(0, 5));
  }

  function confirmDose(medId: number) {
    if (!addDoseTime) return;
    update({ medicationsTaken: [...draft!.medicationsTaken, { medication_id: medId, taken: true, time_taken: addDoseTime }] });
    setAddDoseOpenFor(null);
  }

  function confirmDoseSimple(medId: number, time: string) {
    update({ medicationsTaken: [...draft!.medicationsTaken, { medication_id: medId, taken: true, time_taken: time }] });
    setAddDoseOpenFor(null);
  }

  function removeDose(medId: number, time: string | null) {
    const idx = draft!.medicationsTaken.findIndex(m => m.medication_id === medId && m.time_taken === time);
    if (idx >= 0) {
      const updated = [...draft!.medicationsTaken];
      updated.splice(idx, 1);
      update({ medicationsTaken: updated });
    }
  }

  function handleQuickTookAll(allTaken: boolean) {
    setQuickAllTaken(allTaken);
    if (allTaken) {
      const meds = patient?.medications.filter(m => m.active) ?? [];
      update({ medicationsTaken: meds.map(m => ({ medication_id: m.id, taken: true, time_taken: null })) });
    } else {
      update({ medicationsTaken: [] });
      setQuickMissedText("");
    }
  }

  // ── Symptoms ─────────────────────────────────────────────────────────────

  function setSymptomSeverity(name: string, chipValue: number) {
    const existing = draft!.symptoms.find(s => s.name === name);
    if (existing?.severity === chipValue) {
      // Tap same chip → clear symptom
      update({ symptoms: draft!.symptoms.filter(s => s.name !== name) });
    } else if (existing) {
      update({ symptoms: draft!.symptoms.map(s => s.name === name ? { ...s, severity: chipValue } : s) });
    } else {
      update({ symptoms: [...draft!.symptoms, { name, severity: chipValue }] });
    }
  }

  // ── Side effects ──────────────────────────────────────────────────────────

  function toggleSideEffect(medId: number, seName: string) {
    update({
      medicationSideEffects: draft!.medicationSideEffects.map(mse => {
        if (mse.medication_id !== medId) return mse;
        const has = mse.side_effects.some(se => se.name === seName);
        return { ...mse, side_effects: has ? mse.side_effects.filter(se => se.name !== seName) : [...mse.side_effects, { name: seName, severity: 5 }] };
      }),
    });
  }

  function setSideEffectSeverity(medId: number, seName: string, severity: number) {
    update({
      medicationSideEffects: draft!.medicationSideEffects.map(mse =>
        mse.medication_id !== medId ? mse : { ...mse, side_effects: mse.side_effects.map(se => se.name === seName ? { ...se, severity } : se) }
      ),
    });
  }

  // ── Activities ────────────────────────────────────────────────────────────

  function toggleActivity(type: string) {
    const acts = draft!.activities;
    update({ activities: acts.some(a => a.type === type) ? acts.filter(a => a.type !== type) : [...acts, { type }] });
  }

  // ── Socialization ────────────────────────────────────────────────────────────

  function updateSocialization(patch: Partial<Socialization>) {
    update({ socialization: { ...draft!.socialization, ...patch } });
  }

  function toggleContactId(id: number) {
    const ids = draft!.socialization.contact_ids;
    updateSocialization({ contact_ids: ids.includes(id) ? ids.filter(c => c !== id) : [...ids, id] });
  }

  async function handleAddContact() {
    if (!newContactName.trim()) return;
    setAddingContact(true);
    try {
      const added = await api.createSocialContact(newContactName.trim()) as SocialContact;
      setSocialContacts(prev => [...prev, added].sort((a, b) => a.name.localeCompare(b.name)));
      setNewContactName("");
      // Auto-select newly added contact when contact section is visible
      if (draft?.socialization.had_contact) {
        updateSocialization({ contact_ids: [...draft!.socialization.contact_ids, added.id] });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add contact");
    } finally {
      setAddingContact(false);
    }
  }

  async function handleDeleteContact(contactId: number) {
    try {
      await api.deleteSocialContact(contactId);
      setSocialContacts(prev => prev.filter(c => c.id !== contactId));
      if (draft?.socialization.contact_ids.includes(contactId)) {
        updateSocialization({ contact_ids: draft!.socialization.contact_ids.filter(id => id !== contactId) });
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove contact");
    }
  }

  // ── Episode / Vitals ──────────────────────────────────────────────────────

  function updateEpisode(patch: Partial<Episode>) {
    update({ episode: { ...draft!.episode, ...patch } });
  }

  function updateVitals(patch: Partial<Vitals>) {
    update({ vitals: { ...draft!.vitals, ...patch } });
  }

  // ── Medication management ─────────────────────────────────────────────────

  async function handleAddMed() {
    if (!newMedName.trim() || !patient) return;
    setAddingMed(true);
    try {
      const added = await api.addMedication(patient.id, {
        name: newMedName.trim(),
        dose: "",
        frequency: "daily",
        time_of_day: newMedTime,
      }) as Medication;
      setPatient({ ...patient, medications: [...patient.medications, added] });
      update({
        medicationSideEffects: [...draft!.medicationSideEffects, { medication_id: added.id, medication_name: added.name, side_effects: [] }],
      });
      setNewMedName("");
      toast.success(`${added.name} added`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add medication");
    } finally {
      setAddingMed(false);
    }
  }

  async function handleRemoveMed(medId: number) {
    if (!patient) return;
    try {
      await api.deleteMedication(medId);
      setPatient({ ...patient, medications: patient.medications.map(m => m.id === medId ? { ...m, active: false } : m) });
      update({
        medicationsTaken: draft!.medicationsTaken.filter(m => m.medication_id !== medId),
        medicationSideEffects: draft!.medicationSideEffects.filter(m => m.medication_id !== medId),
      });
      toast.success("Medication removed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove medication");
    }
  }

  async function handlePhotoFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoLoading(true);
    try {
      const compressed = await compressPhoto(file);
      update({ photo: compressed });
    } catch {
      toast.error("Could not process photo");
    } finally {
      setPhotoLoading(false);
      // Reset input so same file can be re-selected
      e.target.value = "";
    }
  }

  function toggle(id: string) {
    const el = document.getElementById(id);
    const beforeTop = el?.getBoundingClientRect().top ?? 0;
    flushSync(() => {
      setOpenSection(prev => prev === id ? null : id);
    });
    const afterTop = el?.getBoundingClientRect().top ?? 0;
    const delta = afterTop - beforeTop;
    if (delta !== 0) window.scrollBy({ top: delta, behavior: "instant" });
  }

  async function performSave(d: LogDraft, p: Patient): Promise<void> {
    const activeMeds = p.medications.filter(m => m.active);
    const medsWithDoses = new Set(d.medicationsTaken.map(e => e.medication_id));
    // Include untaken entries for meds with no doses (for adherence tracking)
    const notTakenEntries: MedicationTaken[] = activeMeds
      .filter(m => !medsWithDoses.has(m.id))
      .map(m => ({ medication_id: m.id, taken: false, time_taken: null }));
    const hydrationOz = d.hydration === "Good" ? 80 : d.hydration === "Fair" ? 48 : d.hydration === "Poor" ? 24 : null;
    await api.createLog({
      patient_id: p.id,
      date: d.date,
      medications_taken: [...d.medicationsTaken, ...notTakenEntries],
      symptoms: d.symptoms,
      medication_side_effects: d.medicationSideEffects.filter(mse => mse.side_effects.length > 0),
      sleep_hours: d.sleepHours,
      mood_score: null,
      water_intake_oz: hydrationOz,
      activities: d.activities,
      lifestyle: null,
      notes: d.notes || null,
      episode: d.episode,
      vitals: (d.vitals.heart_rate || d.vitals.blood_pressure || d.vitals.cigarettes || d.vitals.alcohol || d.vitals.alcohol_drinks || Object.values(d.vitals.custom_substances ?? {}).some(Boolean))
        ? d.vitals
        : null,
      photo: d.photo || null,
      socialization: (d.socialization.left_house !== null || d.socialization.had_contact !== null)
        ? d.socialization
        : null,
    });
  }

  async function handleSubmit() {
    if (!draft || !patient) return;
    setSaving(true);
    try {
      const mode = user?.user_config?.dose_timing_mode ?? "quick";
      let draftToSave = draft;
      if (mode === "quick" && quickAllTaken === false && quickMissedText.trim()) {
        const prefix = `Missed meds: ${quickMissedText.trim()}`;
        const existingNotes = draft.notes.trim();
        draftToSave = { ...draft, notes: existingNotes ? `${prefix}\n${existingNotes}` : prefix };
      }
      await performSave(draftToSave, patient);
      isDirtyRef.current = false;
      setSaved(true);

      if (isHistorical) {
        // This is a queued detail day — pop it from the queue and move to next
        const queuedStr = sessionStorage.getItem("truefit_queued_days");
        const queued = queuedStr ? (JSON.parse(queuedStr) as string[]) : [];
        const remaining = queued.filter(d => d !== targetDate);
        if (remaining.length > 0) {
          sessionStorage.setItem("truefit_queued_days", JSON.stringify(remaining));
          setTimeout(() => { router.push(`/log?date=${remaining[0]}`); }, 800);
        } else {
          sessionStorage.removeItem("truefit_queued_days");
          setTimeout(() => { router.push("/dashboard"); }, 800);
        }
      } else {
        // Today's log — check for queued detail days
        const queuedStr = sessionStorage.getItem("truefit_queued_days");
        const queued = queuedStr ? (JSON.parse(queuedStr) as string[]) : [];
        if (queued.length > 0) {
          setQueuedDetailPrompt(queued);
          // Don't navigate — let user respond to the prompt
        } else {
          setTimeout(() => { router.push("/dashboard"); }, 800);
        }
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save log");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#faf9f6" }}>
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#4a7c59", borderTopColor: "transparent" }} />
      </div>
    );
  }

  if (!draft || !patient) return null;

  // ── Catch-up screen ───────────────────────────────────────────────────────

  if (catchupMode) {
    const allAddressed = catchupDays.every(d => !!dayStatuses[d]);

    return (
      <div className="min-h-screen pb-24" style={{ background: "#faf9f6" }}>
        <NavBar />
        <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
          <div>
            <h1 className="text-3xl font-bold text-navy">
              {catchupDays.length} {catchupDays.length === 1 ? "day" : "days"} missed
            </h1>
            <p className="text-base text-slate-500 mt-1">Log what you remember for each day</p>
          </div>

          <div className="space-y-3">
            {catchupDays.map(dateStr => {
              const status = dayStatuses[dateStr];
              const saving = daysSaving[dateStr];
              const logItOpen = logItOpenFor === dateStr;
              const [yr, mo, dy] = dateStr.split("-").map(Number);
              const d = new Date(yr, mo - 1, dy);
              const dayLabel = d.toLocaleDateString("en-US", { weekday: "long" });
              const dateLabel = d.toLocaleDateString("en-US", { month: "long", day: "numeric" });

              const rowBorderColor =
                status === "log_it" ? "#6366F1"
                : status === "queued" ? "#D97706"
                : status === "same" ? "#4a7c59"
                : status === "nothing_notable" ? "#94A3B8"
                : logItOpen ? "#C7D2FE"
                : "#E2E8F0";
              const rowBg =
                status === "log_it" ? "#EEF2FF"
                : status === "queued" ? "#FFFBEB"
                : status === "same" ? "#F0FDF4"
                : status === "nothing_notable" ? "#F8FAFC"
                : "white";

              return (
                <div
                  key={dateStr}
                  className="rounded-2xl border overflow-hidden"
                  style={{ borderColor: rowBorderColor, background: rowBg }}
                >
                  {/* Header row */}
                  <div className="flex items-center gap-2 px-4 pt-4 pb-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-base font-bold text-navy">{dayLabel}</p>
                      <p className="text-sm text-slate-500">{dateLabel}</p>
                      {status === "same" && (
                        <p className="text-xs font-semibold mt-0.5" style={{ color: "#4a7c59" }}>Copied from previous day</p>
                      )}
                      {status === "nothing_notable" && (
                        <p className="text-xs font-semibold mt-0.5" style={{ color: "#64748B" }}>Nothing notable</p>
                      )}
                      {status === "log_it" && (
                        <p className="text-xs font-semibold mt-0.5 truncate" style={{ color: "#4F46E5" }}>
                          Note saved{noteTexts[dateStr] ? ` · ${noteTexts[dateStr].slice(0, 45)}${noteTexts[dateStr].length > 45 ? "…" : ""}` : ""}
                        </p>
                      )}
                      {status === "queued" && (
                        <p className="text-xs font-semibold mt-0.5" style={{ color: "#B45309" }}>Queued for full log</p>
                      )}
                    </div>

                    {/* Three action buttons */}
                    <div className="flex gap-1.5 flex-shrink-0">
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleDayAction(dateStr, "same_as_yesterday")}
                        className="px-2.5 py-2 rounded-xl text-sm font-semibold border-2 transition-all active:scale-95"
                        style={{
                          borderColor: "#4a7c59",
                          background: status === "same" ? "#4a7c59" : "white",
                          color: status === "same" ? "white" : "#4a7c59",
                        }}
                      >
                        Same
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={() => handleDayAction(dateStr, "nothing_notable")}
                        className="px-2.5 py-2 rounded-xl text-sm font-semibold border-2 transition-all active:scale-95"
                        style={{
                          borderColor: "#CBD5E1",
                          background: status === "nothing_notable" ? "#64748B" : "white",
                          color: status === "nothing_notable" ? "white" : "#64748B",
                        }}
                      >
                        Nothing
                      </button>
                      <button
                        type="button"
                        onClick={() => setLogItOpenFor(logItOpen ? null : dateStr)}
                        className="px-2.5 py-2 rounded-xl text-sm font-semibold border-2 transition-all active:scale-95"
                        style={{
                          borderColor: "#6366F1",
                          background: (status === "log_it" || logItOpen) ? "#6366F1" : "white",
                          color: (status === "log_it" || logItOpen) ? "white" : "#6366F1",
                        }}
                      >
                        Log it
                      </button>
                    </div>
                  </div>

                  {/* Inline note field — visible when Log it is open */}
                  {logItOpen && (
                    <div className="px-4 pb-4 pt-1 space-y-2.5 border-t" style={{ borderColor: "#E0E7FF" }}>
                      <label className="block text-sm font-semibold text-slate-600">
                        What do you remember about this day?
                      </label>
                      <textarea
                        rows={3}
                        value={noteTexts[dateStr] ?? ""}
                        onChange={e => setNoteTexts(prev => ({ ...prev, [dateStr]: e.target.value }))}
                        placeholder="e.g. He seemed low energy, stayed in his room most of the day…"
                        autoFocus
                        className="w-full px-3 py-2.5 rounded-xl border text-navy text-sm focus:outline-none resize-none bg-white"
                        style={{ borderColor: "#C7D2FE" }}
                      />
                      <div className="flex items-center justify-between">
                        <button
                          type="button"
                          disabled={!noteTexts[dateStr]?.trim() || notesSaving[dateStr]}
                          onClick={() => handleSaveCatchupNote(dateStr)}
                          className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
                          style={{ background: noteTexts[dateStr]?.trim() ? "#4a7c59" : "#CBD5E1" }}
                        >
                          {notesSaving[dateStr] ? "Saving…" : "Save note"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setLogItOpenFor(null);
                            setDayStatuses(s => ({ ...s, [dateStr]: "queued" }));
                          }}
                          className="text-sm font-semibold transition-colors"
                          style={{ color: "#6366F1" }}
                        >
                          Full log instead →
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Bulk action */}
          <button
            type="button"
            onClick={handleMarkAllNothing}
            className="w-full py-3 rounded-xl border-2 text-base font-semibold transition-all active:scale-95"
            style={{ borderColor: "#CBD5E1", color: "#64748B", background: "white" }}
          >
            Mark all as nothing notable
          </button>

          {/* Continue */}
          <button
            type="button"
            disabled={!allAddressed}
            onClick={handleContinueCatchup}
            className="w-full py-4 rounded-2xl font-bold text-white text-lg transition-all active:scale-[0.98]"
            style={{
              background: allAddressed
                ? "linear-gradient(135deg, #4a7c59, #2d4f38)"
                : "#CBD5E1",
            }}
          >
            Continue →
          </button>
        </div>
      </div>
    );
  }

  const activeMeds = patient.medications.filter(m => m.active);

  // Dynamic symptom/activity lists — user_config first, fall back to patient config, then defaults
  // Use .length check so empty arrays fall through to the next level (same as missing)
  const symptomNames: string[] =
    user?.user_config?.symptoms?.length ? user.user_config.symptoms :
    patient?.dashboard_config?.symptoms?.length ? patient.dashboard_config.symptoms :
    DEFAULT_SYMPTOM_NAMES;

  // Display only — the saved severity is always 0-10 either way (see
  // WordSeveritySelector). user_config wins over dashboard_config, same
  // precedence as symptomNames above.
  const symptomScale: "numeric" | "words" =
    user?.user_config?.symptom_scale ?? patient?.dashboard_config?.symptom_scale ?? "numeric";

  const _activitySlugs =
    user?.user_config?.activities?.length ? user.user_config.activities :
    patient?.dashboard_config?.activities?.length ? patient.dashboard_config.activities :
    null;
  const activityOptions: { type: string; label: string }[] = _activitySlugs
    ? _activitySlugs.map((type: string) => {
        const found = DEFAULT_ACTIVITY_OPTIONS.find(a => a.type === type);
        return found ?? { type, label: type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()) };
      })
    : DEFAULT_ACTIVITY_OPTIONS;

  const configSubstanceFields: string[] =
    user?.user_config?.substance_fields ?? patient?.dashboard_config?.substance_fields ?? ["cigarettes", "alcohol"];

  const customSubstanceNames = configSubstanceFields.filter(s => s !== "cigarettes" && s !== "alcohol");

  const doseTimingMode: "quick" | "simple" | "exact" = user?.user_config?.dose_timing_mode ?? "quick";
  const showSocialization: boolean = user?.user_config?.show_socialization !== false;

  const totalDoses = draft.medicationsTaken.filter(m => m.taken).length;
  const medsText = totalDoses > 0 ? `${totalDoses} dose${totalDoses !== 1 ? "s" : ""} logged` : "Nothing logged yet";
  const symptomsText = draft.symptoms.length > 0 ? `${draft.symptoms.length} symptom${draft.symptoms.length !== 1 ? "s" : ""} noted` : "None noted";
  const activitiesText = draft.activities.length ? `${draft.activities.length} selected` : "None selected";
  const socializationText = (() => {
    const s = draft.socialization;
    if (s.left_house === null && s.had_contact === null) return "Tap to log";
    const parts: string[] = [];
    if (s.left_house === true) parts.push("Left house");
    else if (s.left_house === false) parts.push("Stayed home");
    if (s.had_contact === true) parts.push(`Contact: ${s.contact_ids.length} person${s.contact_ids.length !== 1 ? "s" : ""}`);
    else if (s.had_contact === false) parts.push("No contact");
    return parts.join(" · ") || "Tap to log";
  })();
  const notesText = draft.notes ? draft.notes.slice(0, 40) + (draft.notes.length > 40 ? "…" : "") : "Tap to add";
  const photoText = draft.photo ? "Photo saved" : "No photo yet";
  const episodeText = draft.episode.occurred ? `Episode at ${draft.episode.time ? fmt12(draft.episode.time) : "unknown time"}` : "No episode today";
  const vitalsText = draft.vitals.heart_rate || draft.vitals.blood_pressure
    ? [draft.vitals.heart_rate && `HR ${draft.vitals.heart_rate}`, draft.vitals.blood_pressure && `BP ${draft.vitals.blood_pressure}`].filter(Boolean).join(" · ")
    : "Tap to record";
  const sleepText = draft.sleepHours !== null ? `${draft.sleepHours} hrs` : "Tap to record";
  const hydrationText = draft.hydration ?? "Tap to record";
  const substancesText = (() => {
    const parts = [];
    if (draft.vitals.cigarettes) parts.push(`${draft.vitals.cigarettes} cig${Number(draft.vitals.cigarettes) !== 1 ? "s" : ""}`);
    if (draft.vitals.alcohol) parts.push(`alcohol${draft.vitals.alcohol_drinks ? ` (${draft.vitals.alcohol_drinks})` : ""}`);
    return parts.length ? parts.join(" · ") : "None today";
  })();

  // Parse target date for display
  const [tyr, tmo, tdy] = targetDate.split("-").map(Number);
  const targetDateObj = new Date(tyr, tmo - 1, tdy);

  return (
    <div className="min-h-screen pb-36" style={{ background: "#faf9f6" }}>
      <NavBar />

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        {isHistorical ? (
          <div>
            <button
              type="button"
              onClick={() => router.back()}
              className="flex items-center gap-1.5 text-sm font-semibold mb-3"
              style={{ color: "#4a7c59" }}
            >
              ← Back
            </button>
            <h1 className="text-3xl font-bold text-navy">
              {targetDateObj.toLocaleDateString("en-US", { weekday: "long" })}
            </h1>
            <p className="text-base text-slate-500 mt-1">
              {targetDateObj.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" })}
            </p>
          </div>
        ) : (
          <div>
            <h1 className="text-3xl font-bold text-navy">Daily Log</h1>
            <p className="text-base text-slate-500 mt-1">
              {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
            </p>
          </div>
        )}

        {/* ── Quick actions (today only, no existing log) ── */}
        {!loadedFromServer && !isHistorical && (
          <div className="space-y-3">
            <div className="flex gap-3">
              {hasYesterdayLog && (
                <button
                  type="button"
                  disabled={quickActioning}
                  onClick={() => handleQuickAction("same_as_yesterday")}
                  className="flex-1 py-4 rounded-2xl border-2 text-base font-bold transition-all active:scale-[0.98]"
                  style={{ borderColor: "#4a7c59", color: "#4a7c59", background: "white" }}
                >
                  {quickActioning ? "Saving…" : "Same as yesterday"}
                </button>
              )}
              <button
                type="button"
                disabled={quickActioning}
                onClick={() => handleQuickAction("nothing_notable")}
                className="flex-1 py-4 rounded-2xl border-2 text-base font-bold transition-all active:scale-[0.98]"
                style={{ borderColor: "#94A3B8", color: "#64748B", background: "white" }}
              >
                {quickActioning ? "Saving…" : "Nothing notable"}
              </button>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ background: "#E2E8F0" }} />
              <span className="text-sm font-medium" style={{ color: "#94A3B8" }}>or log in detail</span>
              <div className="flex-1 h-px" style={{ background: "#E2E8F0" }} />
            </div>
          </div>
        )}

        {loadedFromServer && (
          <div className="flex items-center justify-between rounded-xl px-4 py-3 text-sm" style={{ background: "#EFF6FF", border: "1px solid #BFDBFE" }}>
            <span style={{ color: "#1D4ED8" }}>Previous entry loaded. Want to start fresh?</span>
            <button
              type="button"
              onClick={startFresh}
              className="ml-3 font-semibold underline underline-offset-2 flex-shrink-0"
              style={{ color: "#1D4ED8" }}
            >
              Clear form
            </button>
          </div>
        )}

        {/* ── Treatment Plan Reference ── */}
        {treatmentPlan && (() => {
          const tp = treatmentPlan;
          const hasTherapy = (tp.therapies ?? []).length > 0;
          const hasClinician = (tp.clinicians ?? []).length > 0;
          const hasSleep = tp.bedtime || tp.wake_time;
          const hasGoals = tp.care_goals;
          const hasAvoid = tp.substances_to_avoid;
          const hasAppt = tp.next_appointment_date;
          const hasAny = hasTherapy || hasClinician || hasSleep || hasGoals || hasAvoid || hasAppt;
          if (!hasAny) return null;
          return (
            <div className="rounded-2xl overflow-hidden border" style={{ borderColor: "#BFDBFE", background: "#EFF6FF" }}>
              <button
                type="button"
                onClick={() => setPlanOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 text-left"
              >
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 flex-shrink-0" style={{ color: "#2563EB" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
                  </svg>
                  <span className="text-sm font-semibold" style={{ color: "#1D4ED8" }}>Today&apos;s Treatment Plan Reference</span>
                </div>
                <svg
                  className="w-4 h-4 flex-shrink-0 transition-transform duration-200"
                  style={{ color: "#2563EB", transform: planOpen ? "rotate(180deg)" : "none" }}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {planOpen && (
                <div className="px-4 pb-4 space-y-2 border-t" style={{ borderColor: "#BFDBFE" }}>
                  <div className="pt-3 space-y-1.5">
                    {(tp.therapies ?? []).length > 0 && (tp.therapies ?? []).map((t, i) => (
                      <p key={i} className="text-sm" style={{ color: "#1D4ED8" }}>
                        <span className="font-semibold capitalize">{t.modality} therapy:</span> {t.name}
                      </p>
                    ))}
                    {(tp.clinicians ?? []).length > 0 && (tp.clinicians ?? []).map((c, i) => (
                      <p key={i} className="text-sm" style={{ color: "#1D4ED8" }}>
                        <span className="font-semibold">{c.role}:</span> {c.name}
                        {c.specialty ? ` (${c.specialty})` : ""}
                      </p>
                    ))}
                    {hasSleep && (
                      <p className="text-sm" style={{ color: "#1D4ED8" }}>
                        <span className="font-semibold">Sleep plan:</span>{" "}
                        {tp.bedtime && `Bedtime ${tp.bedtime}`}
                        {tp.bedtime && tp.wake_time && " → "}
                        {tp.wake_time && `Wake ${tp.wake_time}`}
                        {tp.sleep_notes && ` · ${tp.sleep_notes}`}
                      </p>
                    )}
                    {hasAvoid && (
                      <p className="text-sm" style={{ color: "#1D4ED8" }}>
                        <span className="font-semibold">Avoid:</span> {tp.substances_to_avoid}
                      </p>
                    )}
                    {hasGoals && (
                      <div>
                        <p className="text-sm font-semibold" style={{ color: "#1D4ED8" }}>Goals:</p>
                        <p className="text-sm whitespace-pre-line" style={{ color: "#1D4ED8" }}>{tp.care_goals}</p>
                      </div>
                    )}
                    {hasAppt && (
                      <p className="text-sm" style={{ color: "#1D4ED8" }}>
                        <span className="font-semibold">Next appointment:</span>{" "}
                        {tp.next_appointment_date}
                        {tp.next_appointment_with && ` with ${tp.next_appointment_with}`}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>
          );
        })()}

        {/* ── Medications ── */}
        <AccordionSection id="medications" title="Medications" summaryLine={medsText}
          bgColor="#f2f7f3" borderColor="#d4e0d7" headingColor="#2d4f38"
          isOpen={openSection === "medications"} onToggle={() => toggle("medications")}>

          {doseTimingMode === "quick" ? (
            <div className="space-y-4">
              {activeMeds.length === 0 ? (
                <p className="text-base text-slate-400">No active medications on file.</p>
              ) : (
                <div className="rounded-2xl border-2 p-5 space-y-4" style={{ borderColor: "#d4e0d7", background: "#f8fcf9" }}>
                  <p className="text-lg font-bold text-navy">Took all meds today?</p>
                  <div className="flex gap-3">
                    <button
                      type="button"
                      onClick={() => handleQuickTookAll(true)}
                      className="flex-1 py-3.5 rounded-xl text-base font-bold border-2 transition-all active:scale-95"
                      style={{
                        borderColor: quickAllTaken === true ? "#4a7c59" : "#CBD5E1",
                        background: quickAllTaken === true ? "#4a7c59" : "white",
                        color: quickAllTaken === true ? "white" : "#64748B",
                      }}
                    >
                      Yes
                    </button>
                    <button
                      type="button"
                      onClick={() => handleQuickTookAll(false)}
                      className="flex-1 py-3.5 rounded-xl text-base font-bold border-2 transition-all active:scale-95"
                      style={{
                        borderColor: quickAllTaken === false ? "#EF4444" : "#CBD5E1",
                        background: quickAllTaken === false ? "#FEF2F2" : "white",
                        color: quickAllTaken === false ? "#EF4444" : "#64748B",
                      }}
                    >
                      No
                    </button>
                  </div>
                  {quickAllTaken === false && (
                    <div className="space-y-2 pt-1">
                      <label className="text-sm font-semibold text-slate-600">Which ones did he miss?</label>
                      <input
                        type="text"
                        value={quickMissedText}
                        onChange={e => setQuickMissedText(e.target.value)}
                        placeholder="e.g. Metformin, Atorvastatin…"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-base text-navy focus:outline-none bg-white"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <>
          {activeMeds.length === 0 && (
            <p className="text-base text-slate-400">No active medications on file.</p>
          )}

          {activeMeds.map((med, idx) => {
            const doses = draft.medicationsTaken.filter(m => m.medication_id === med.id && m.taken);
            const mse = draft.medicationSideEffects.find(m => m.medication_id === med.id);
            const seOpen = expandedSE === med.id;
            const doseOpen = addDoseOpenFor === med.id;

            return (
              <div key={med.id} className="space-y-3">
                {idx > 0 && <div className="border-t border-amber-100" />}

                {/* Med name + dose count */}
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-base font-semibold text-navy">{med.name}</p>
                    {doses.length > 0 ? (
                      <p className="text-sm" style={{ color: "#4a7c59" }}>
                        taken {doses.length}× today at {doses.map(d => displayDoseTime(d.time_taken)).join(", ")}
                      </p>
                    ) : (
                      <p className="text-sm text-slate-400">{med.time_of_day} · not logged yet</p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => doseOpen ? setAddDoseOpenFor(null) : openAddDose(med.id)}
                    className="px-4 py-2 rounded-xl text-sm font-semibold text-white transition-all active:scale-95"
                    style={{ background: "#4a7c59" }}
                  >
                    + Dose
                  </button>
                </div>

                {/* Logged dose chips with remove */}
                {doses.length > 0 && (
                  <div className="flex flex-wrap gap-2">
                    {doses.map((d, i) => (
                      <span key={i} className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm font-medium"
                        style={{ background: "#e8f0eb", color: "#065F46" }}>
                        {displayDoseTime(d.time_taken)}
                        <button type="button" onClick={() => removeDose(med.id, d.time_taken)}
                          className="text-teal-700 hover:text-red-500 leading-none transition-colors">×</button>
                      </span>
                    ))}
                  </div>
                )}

                {/* Inline add-dose panel */}
                {doseOpen && doseTimingMode === "simple" && (
                  <div className="bg-white rounded-xl px-3 py-3 border border-amber-200 space-y-2">
                    <div className="grid grid-cols-4 gap-2">
                      {SIMPLE_DOSE_TIMES.map(({ label, time }) => (
                        <button
                          key={label}
                          type="button"
                          onClick={() => confirmDoseSimple(med.id, time)}
                          className="py-2 rounded-lg text-sm font-semibold border-2 transition-all active:scale-95"
                          style={{ borderColor: "#4a7c59", color: "#4a7c59", background: "white" }}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <button type="button" onClick={() => setAddDoseOpenFor(null)}
                      className="text-xs text-slate-400 w-full text-center">Cancel</button>
                  </div>
                )}

                {doseOpen && doseTimingMode === "exact" && (
                  <div className="flex gap-2 items-center bg-white rounded-xl px-3 py-2.5 border border-amber-200">
                    <input
                      type="time"
                      value={addDoseTime}
                      onChange={e => setAddDoseTime(e.target.value)}
                      className="flex-1 text-navy text-base focus:outline-none bg-transparent"
                    />
                    <button type="button" onClick={() => confirmDose(med.id)}
                      className="px-3 py-1.5 rounded-lg text-sm font-semibold text-white"
                      style={{ background: "#4a7c59" }}>Log</button>
                    <button type="button" onClick={() => setAddDoseOpenFor(null)}
                      className="text-slate-400 text-lg leading-none">×</button>
                  </div>
                )}

                {/* Side effects */}
                <button
                  type="button"
                  onClick={() => setExpandedSE(seOpen ? null : med.id)}
                  className="flex items-center gap-1.5 text-sm font-medium"
                  style={{ color: (mse?.side_effects?.length ?? 0) > 0 ? "#EF4444" : "#94A3B8" }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {(mse?.side_effects?.length ?? 0) > 0 ? `${mse!.side_effects.length} side effect(s)` : "Log side effects"}
                  <span style={{ display: "inline-block", transition: "transform 0.2s", transform: seOpen ? "rotate(180deg)" : "none" }}>▾</span>
                </button>

                {seOpen && (() => {
                  const medKnown = (knownSideEffects[med.id] ?? []).length > 0
                    ? knownSideEffects[med.id]
                    : FALLBACK_SIDE_EFFECT_OPTIONS;
                  const freqColor = (freq: string) =>
                    freq === "common" ? "#D97706" : freq === "uncommon" ? "#6366F1" : "#94A3B8";
                  const freqBg = (freq: string) =>
                    freq === "common" ? "#FEF3C7" : freq === "uncommon" ? "#EEF2FF" : "#F1F5F9";

                  return (
                    <div className="space-y-4 border-l-2 border-amber-200 pl-3">
                      {(knownSideEffects[med.id] ?? []).length > 0 && (
                        <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#94A3B8" }}>
                          Known side effects to watch for
                        </p>
                      )}
                      <div className="grid grid-cols-2 gap-2">
                        {medKnown.map(effect => {
                          const active = mse?.side_effects.some(s => s.name === effect.name) ?? false;
                          return (
                            <button key={effect.name} type="button" onClick={() => toggleSideEffect(med.id, effect.name)}
                              className="text-left px-3 py-2 rounded-lg border text-sm font-medium transition-all space-y-0.5"
                              style={{ borderColor: active ? "#EF4444" : "#E2E8F0", background: active ? "#FEF2F2" : "white" }}>
                              <span className="block" style={{ color: active ? "#EF4444" : "#374151" }}>{effect.name}</span>
                              <span className="inline-block text-xs font-semibold px-1.5 py-0.5 rounded-full"
                                style={{ background: active ? "#FECACA" : freqBg(effect.frequency), color: active ? "#EF4444" : freqColor(effect.frequency) }}>
                                {effect.frequency}
                              </span>
                            </button>
                          );
                        })}
                      </div>

                      {(mse?.side_effects ?? []).some(se => !medKnown.find(k => k.name === se.name)) && (
                        <div className="space-y-1.5">
                          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#94A3B8" }}>Other observed</p>
                          <div className="flex flex-wrap gap-2">
                            {(mse?.side_effects ?? [])
                              .filter(se => !medKnown.find(k => k.name === se.name))
                              .map(se => (
                                <button key={se.name} type="button" onClick={() => toggleSideEffect(med.id, se.name)}
                                  className="px-3 py-1.5 rounded-lg border text-sm font-medium"
                                  style={{ borderColor: "#EF4444", background: "#FEF2F2", color: "#EF4444" }}>
                                  {se.name} ×
                                </button>
                              ))
                            }
                          </div>
                        </div>
                      )}

                      {(mse?.side_effects ?? []).length > 0 && (
                        <div className="space-y-3">
                          <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#94A3B8" }}>Severity</p>
                          {(mse?.side_effects ?? []).map(se => (
                            <div key={se.name} className="space-y-1">
                              <div className="flex justify-between text-sm">
                                <span className="text-slate-600">{se.name}</span>
                                <span className="font-bold" style={{ color: "#EF4444" }}>{se.severity}/10</span>
                              </div>
                              <input type="range" min={1} max={10} value={se.severity}
                                onChange={e => setSideEffectSeverity(med.id, se.name, parseInt(e.target.value))}
                                className="w-full" />
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="pt-1">
                        <OtherSideEffectInput
                          onAdd={(name) => {
                            if (!mse?.side_effects.some(s => s.name === name)) {
                              toggleSideEffect(med.id, name);
                            }
                          }}
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
            );
          })}

            </>
          )}

          {/* ── Manage medications ── */}
          <div className="pt-2 border-t border-amber-100">
            <button
              type="button"
              onClick={() => setShowMedManage(v => !v)}
              className="flex items-center gap-1.5 text-sm font-medium text-amber-700"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Manage medications
              <span style={{ display: "inline-block", transition: "transform 0.2s", transform: showMedManage ? "rotate(180deg)" : "none" }}>▾</span>
            </button>

            {showMedManage && (
              <div className="mt-3 space-y-3">
                {patient.medications.filter(m => m.active).map(med => (
                  <div key={med.id} className="flex items-center justify-between bg-white rounded-xl px-3 py-2.5 border border-amber-100">
                    <span className="text-sm font-medium text-navy">{med.name} <span className="text-slate-400 font-normal">· {med.time_of_day}</span></span>
                    <button type="button" onClick={() => handleRemoveMed(med.id)}
                      className="text-red-400 hover:text-red-600 text-lg leading-none transition-colors" title="Remove">×</button>
                  </div>
                ))}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-amber-700 uppercase tracking-wide">Add medication</p>
                  <input
                    type="text" value={newMedName} onChange={e => setNewMedName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddMed(); } }}
                    placeholder="Medication name"
                    className="w-full px-3 py-2 rounded-xl border border-amber-200 text-navy text-sm focus:outline-none bg-white"
                  />
                  <div className="flex gap-2">
                    {["morning", "noon", "night"].map(t => (
                      <button key={t} type="button" onClick={() => setNewMedTime(t)}
                        className="flex-1 py-2 rounded-xl border text-sm font-medium capitalize transition-all"
                        style={{ borderColor: newMedTime === t ? "#4a7c59" : "#CBD5E1", background: newMedTime === t ? "#4a7c59" : "white", color: newMedTime === t ? "white" : "#64748B" }}
                      >{t}</button>
                    ))}
                  </div>
                  <button type="button" onClick={handleAddMed} disabled={addingMed || !newMedName.trim()}
                    className="w-full py-2.5 rounded-xl text-sm font-semibold text-white transition-all"
                    style={{ background: newMedName.trim() ? "#4a7c59" : "#CBD5E1" }}
                  >{addingMed ? "Adding…" : "Add medication"}</button>
                </div>
              </div>
            )}
          </div>
        </AccordionSection>

        {/* ── Symptoms ── */}
        <AccordionSection id="symptoms" title="Symptoms" summaryLine={symptomsText}
          bgColor="white" borderColor="#d4e0d7" headingColor="#1a2420"
          isOpen={openSection === "symptoms"} onToggle={() => toggle("symptoms")}>

          {symptomNames.map(name => {
            const s = draft.symptoms.find(s => s.name === name);
            const activeValue = s?.severity ?? null;

            if (symptomScale === "words") {
              return (
                <WordSeveritySelector
                  key={name}
                  label={name}
                  value={activeValue}
                  onChange={(v) => {
                    if (v === 0) {
                      update({ symptoms: draft!.symptoms.filter(s => s.name !== name) });
                    } else {
                      setSymptomSeverity(name, v);
                    }
                  }}
                />
              );
            }

            return (
              <div key={name} className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-base font-semibold text-slate-700">{name}</label>
                  <span className="text-base font-bold" style={{ color: activeValue ? "#4a7c59" : "#94A3B8" }}>
                    {activeValue ? `${activeValue} / 10` : "None"}
                  </span>
                </div>
                <input
                  type="range" min={0} max={10} step={1}
                  value={activeValue ?? 0}
                  onChange={e => {
                    const v = parseInt(e.target.value, 10);
                    if (v === 0) {
                      update({ symptoms: draft!.symptoms.filter(s => s.name !== name) });
                    } else {
                      setSymptomSeverity(name, v);
                    }
                  }}
                  className="w-full"
                />
                <div className="flex justify-between text-sm text-slate-400">
                  <span>{activeValue ? "" : "None"}</span><span>10</span>
                </div>
              </div>
            );
          })}
        </AccordionSection>

        {/* ── Episode ── */}
        <AccordionSection id="episode" title="Episode" summaryLine={episodeText}
          bgColor="#f2f7f3" borderColor="#d4e0d7" headingColor="#2d4f38"
          isOpen={openSection === "episode"} onToggle={() => toggle("episode")}>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <p className="text-base font-semibold text-slate-700">Did an episode happen today?</p>
              <Toggle value={draft.episode.occurred} onChange={v => updateEpisode({ occurred: v })} />
            </div>

            {draft.episode.occurred && (
              <>
                <div className="space-y-1.5">
                  <label className="text-sm text-slate-500">What time?</label>
                  <input
                    type="time" value={draft.episode.time}
                    onChange={e => updateEpisode({ time: e.target.value })}
                    className="w-full px-4 py-3 rounded-xl border border-rose-200 text-navy text-base focus:outline-none bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm text-slate-500">What happened?</label>
                  <textarea
                    value={draft.episode.description}
                    onChange={e => updateEpisode({ description: e.target.value })}
                    rows={4}
                    placeholder="e.g. Around 4pm Jack had a catatonic episode that lasted about 20 minutes…"
                    className="w-full px-4 py-3 rounded-xl border border-rose-200 text-navy text-base focus:outline-none resize-none bg-white"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm text-slate-500">What happened as a result?</label>
                  <select
                    value={draft.episode.outcome ?? ""}
                    onChange={e => updateEpisode({ outcome: (e.target.value || null) as EpisodeOutcome | null })}
                    className="w-full px-4 py-3 rounded-xl border border-rose-200 text-navy text-base focus:outline-none bg-white"
                  >
                    <option value="">Not sure yet</option>
                    <option value="held_at_home">Held at home</option>
                    <option value="crisis_line">Called the crisis line</option>
                    <option value="ed_visit">ER visit</option>
                    <option value="admitted">Admitted</option>
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <label className="text-sm text-slate-500">This started on an earlier day</label>
                  <Toggle
                    value={draft.episode.start != null}
                    onChange={v => updateEpisode({ start: v ? draft.episode.start ?? draft.date : null })}
                  />
                </div>
                {draft.episode.start != null && (
                  <div className="space-y-1.5">
                    <label className="text-sm text-slate-500">Started on</label>
                    <input
                      type="date" value={draft.episode.start ?? draft.date} max={draft.date}
                      onChange={e => updateEpisode({ start: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-rose-200 text-navy text-base focus:outline-none bg-white"
                    />
                    <p className="text-xs text-slate-400">
                      Logged today ({draft.date}); shown on the clinician timeline as {draft.episode.start ?? draft.date} through {draft.date}.
                    </p>
                  </div>
                )}
              </>
            )}
          </div>
        </AccordionSection>

        {/* ── Vitals ── */}
        <AccordionSection id="vitals" title="Vitals" summaryLine={vitalsText}
          bgColor="#f2f7f3" borderColor="#d4e0d7" headingColor="#2d4f38"
          isOpen={openSection === "vitals"} onToggle={() => toggle("vitals")}>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-base font-semibold text-slate-700">Heart Rate <span className="text-sm font-normal text-slate-400">(bpm)</span></label>
              <input type="number" inputMode="numeric" value={draft.vitals.heart_rate}
                onChange={e => updateVitals({ heart_rate: e.target.value })}
                placeholder="e.g. 72"
                className="w-full px-4 py-3 rounded-xl border border-sky-200 text-navy text-base focus:outline-none bg-white"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-base font-semibold text-slate-700">Blood Pressure <span className="text-sm font-normal text-slate-400">(e.g. 120/80)</span></label>
              <input type="text" inputMode="numeric" value={draft.vitals.blood_pressure}
                onChange={e => updateVitals({ blood_pressure: e.target.value })}
                placeholder="120/80"
                className="w-full px-4 py-3 rounded-xl border border-sky-200 text-navy text-base focus:outline-none bg-white"
              />
            </div>
          </div>
        </AccordionSection>

        {/* ── Sleep ── */}
        <AccordionSection id="sleep" title="Sleep" summaryLine={sleepText}
          bgColor="#f2f7f3" borderColor="#d4e0d7" headingColor="#2d4f38"
          isOpen={openSection === "sleep"} onToggle={() => toggle("sleep")}>

          <LabeledSlider label="Hours of sleep last night" value={draft.sleepHours}
            min={0} max={12} step={0.5} onChange={v => update({ sleepHours: v })}
            leftLabel="0 hrs" rightLabel="12 hrs" unit=" hrs" />
        </AccordionSection>

        {/* ── Hydration ── */}
        <AccordionSection id="hydration" title="Hydration" summaryLine={hydrationText}
          bgColor="#f2f7f3" borderColor="#d4e0d7" headingColor="#2d4f38"
          isOpen={openSection === "hydration"} onToggle={() => toggle("hydration")}>

          <div className="space-y-2">
            <p className="text-sm text-slate-500">How well hydrated was {patient.name} today?</p>
            <div className="grid grid-cols-3 gap-3">
              {HYDRATION_PRESETS.map(preset => {
                const isActive = draft.hydration === preset.label;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    onClick={() => update({ hydration: isActive ? null : preset.label })}
                    className="py-4 rounded-xl border-2 text-base font-semibold transition-all"
                    style={{
                      borderColor: isActive ? "#4a7c59" : "#CBD5E1",
                      background: isActive ? "#4a7c59" : "white",
                      color: isActive ? "white" : "#334155",
                    }}
                  >{preset.label}</button>
                );
              })}
            </div>
          </div>
        </AccordionSection>

        {/* ── Activities ── */}
        <AccordionSection id="activities" title="Activities" summaryLine={activitiesText}
          bgColor="#f2f7f3" borderColor="#d4e0d7" headingColor="#2d4f38"
          isOpen={openSection === "activities"} onToggle={() => toggle("activities")}>

          <div className="grid grid-cols-3 gap-3">
            {activityOptions.map(a => (
              <Tile key={a.type} label={a.label}
                active={draft.activities.some(act => act.type === a.type)}
                onClick={() => toggleActivity(a.type)} />
            ))}
          </div>
        </AccordionSection>

        {/* ── Substances ── */}
        {configSubstanceFields.length > 0 && (
          <AccordionSection id="substances" title="Substances" summaryLine={substancesText}
            bgColor="#f2f7f3" borderColor="#d4e0d7" headingColor="#2d4f38"
            isOpen={openSection === "substances"} onToggle={() => toggle("substances")}>

            <div className="space-y-5">
              {/* Cigarettes */}
              {configSubstanceFields.includes("cigarettes") && (
                <div className="space-y-2">
                  <label className="text-base font-semibold text-slate-700">Cigarettes today</label>
                  <div className="flex items-center gap-3">
                    <button type="button"
                      onClick={() => updateVitals({ cigarettes: String(Math.max(0, parseInt(draft.vitals.cigarettes || "0") - 1)) })}
                      className="w-12 h-12 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-600 font-bold text-xl">−</button>
                    <input
                      type="number" inputMode="numeric" min={0}
                      value={draft.vitals.cigarettes}
                      onChange={e => updateVitals({ cigarettes: e.target.value })}
                      placeholder="0"
                      className="flex-1 text-center px-4 py-3 rounded-xl border border-orange-200 text-navy text-2xl font-bold focus:outline-none bg-white"
                    />
                    <button type="button"
                      onClick={() => updateVitals({ cigarettes: String(parseInt(draft.vitals.cigarettes || "0") + 1) })}
                      className="w-12 h-12 rounded-full border-2 border-slate-200 flex items-center justify-center text-slate-600 font-bold text-xl">+</button>
                  </div>
                </div>
              )}

              {/* Alcohol */}
              {configSubstanceFields.includes("alcohol") && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <label className="text-base font-semibold text-slate-700">Alcohol today?</label>
                    <Toggle value={draft.vitals.alcohol} onChange={v => updateVitals({ alcohol: v, alcohol_drinks: v ? draft.vitals.alcohol_drinks : "" })} />
                  </div>
                  {draft.vitals.alcohol && (
                    <div className="space-y-1.5">
                      <label className="text-sm text-slate-500">How many drinks?</label>
                      <input
                        type="number" inputMode="numeric" min={0}
                        value={draft.vitals.alcohol_drinks}
                        onChange={e => updateVitals({ alcohol_drinks: e.target.value })}
                        placeholder="e.g. 2"
                        className="w-full px-4 py-3 rounded-xl border border-orange-200 text-navy text-base focus:outline-none bg-white"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Custom substances */}
              {customSubstanceNames.map(name => {
                const val = draft.vitals.custom_substances?.[name] ?? false;
                return (
                  <div key={name} className="flex items-center justify-between">
                    <label className="text-base font-semibold text-slate-700">{name} today?</label>
                    <Toggle
                      value={val}
                      onChange={v => updateVitals({ custom_substances: { ...draft.vitals.custom_substances, [name]: v } })}
                    />
                  </div>
                );
              })}
            </div>
          </AccordionSection>
        )}

        {/* ── Today's Photo ── */}
        <AccordionSection id="photo" title="Today's Photo" summaryLine={photoText}
          bgColor="white" borderColor="#d4e0d7" headingColor="#1a2420"
          isOpen={openSection === "photo"} onToggle={() => toggle("photo")}>

          {/* Hidden file inputs */}
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment"
            className="hidden" onChange={handlePhotoFile} />
          <input ref={libraryInputRef} type="file" accept="image/*"
            className="hidden" onChange={handlePhotoFile} />

          {draft.photo ? (
            <div className="space-y-3">
              {/* Photo preview */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={draft.photo}
                alt="Today's photo"
                className="w-full rounded-2xl object-cover"
                style={{ maxHeight: 320 }}
              />
              <div className="flex gap-3">
                <button type="button"
                  onClick={() => libraryInputRef.current?.click()}
                  className="flex-1 py-3 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 bg-white">
                  Replace
                </button>
                <button type="button"
                  onClick={() => update({ photo: null })}
                  className="flex-1 py-3 rounded-xl border border-red-100 text-sm font-semibold text-red-500 bg-red-50">
                  Remove
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-slate-400">One photo per day. Saves with the log and appears in the photo timeline.</p>
              {photoLoading ? (
                <div className="flex items-center justify-center py-8">
                  <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#4a7c59", borderTopColor: "transparent" }} />
                </div>
              ) : (
                <div className="flex gap-3">
                  <button type="button"
                    onClick={() => cameraInputRef.current?.click()}
                    className="flex-1 flex flex-col items-center gap-2 py-5 rounded-2xl border-2 border-dashed border-slate-200 text-slate-500 bg-slate-50 active:bg-slate-100 transition-colors">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    <span className="text-sm font-semibold">Take Photo</span>
                  </button>
                  <button type="button"
                    onClick={() => libraryInputRef.current?.click()}
                    className="flex-1 flex flex-col items-center gap-2 py-5 rounded-2xl border-2 border-dashed border-slate-200 text-slate-500 bg-slate-50 active:bg-slate-100 transition-colors">
                    <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                    </svg>
                    <span className="text-sm font-semibold">Add Photo</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </AccordionSection>

        {/* ── Socialization ── */}
        {showSocialization && <AccordionSection id="socialization" title="Socialization" summaryLine={socializationText}
          bgColor="#f2f7f3" borderColor="#d4e0d7" headingColor="#2d4f38"
          isOpen={openSection === "socialization"} onToggle={() => toggle("socialization")}
          onSettings={() => setShowContactsSheet(true)}>

          <div className="space-y-5">
            {/* Q1: Left the house? */}
            <div className="space-y-2">
              <p className="text-base font-semibold text-slate-700">Did {patient.name} leave the house today?</p>
              <YesNoToggle
                value={draft.socialization.left_house}
                onChange={v => updateSocialization({ left_house: v })}
              />
            </div>

            {/* Q2: Social contact? */}
            <div className="space-y-2">
              <p className="text-base font-semibold text-slate-700">Any social contact outside the household?</p>
              <YesNoToggle
                value={draft.socialization.had_contact}
                onChange={v => updateSocialization({ had_contact: v, contact_ids: v ? draft.socialization.contact_ids : [], quality: v ? draft.socialization.quality : null, initiated_by: v ? draft.socialization.initiated_by : null })}
              />
            </div>

            {draft.socialization.had_contact && (
              <>
                {/* Q3: Who? */}
                <div className="space-y-2">
                  <p className="text-base font-semibold text-slate-700">Who?</p>
                  <div className="flex flex-wrap gap-2">
                    {socialContacts.map(contact => (
                      <button
                        key={contact.id}
                        type="button"
                        onClick={() => toggleContactId(contact.id)}
                        className="px-4 py-2 rounded-full border-2 text-sm font-semibold transition-all active:scale-95"
                        style={{
                          borderColor: draft.socialization.contact_ids.includes(contact.id) ? "#4a7c59" : "#CBD5E1",
                          background: draft.socialization.contact_ids.includes(contact.id) ? "#4a7c59" : "white",
                          color: draft.socialization.contact_ids.includes(contact.id) ? "white" : "#334155",
                        }}
                      >
                        {contact.name}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => setShowContactsSheet(true)}
                      className="px-4 py-2 rounded-full border-2 border-dashed text-sm font-semibold transition-all active:scale-95"
                      style={{ borderColor: "#CBD5E1", color: "#64748B", background: "white" }}
                    >
                      + Add
                    </button>
                  </div>
                </div>

                {/* Q4: Quality */}
                <div className="space-y-2">
                  <p className="text-base font-semibold text-slate-700">How did it go?</p>
                  <div className="flex gap-2">
                    {([["Good", "good"], ["Neutral", "neutral"], ["Difficult", "difficult"]] as [string, string][]).map(([label, val]) => {
                      const active = draft.socialization.quality === val;
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => updateSocialization({ quality: active ? null : val as Socialization["quality"] })}
                          className="flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all active:scale-95"
                          style={{
                            borderColor: active ? "#4a7c59" : "#CBD5E1",
                            background: active ? "#4a7c59" : "white",
                            color: active ? "white" : "#334155",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Q5: Initiated by */}
                <div className="space-y-2">
                  <p className="text-base font-semibold text-slate-700">Who reached out first?</p>
                  <div className="flex gap-2">
                    {([
                      [`${patient.name} did`, "self"],
                      ["Someone else", "other"],
                    ] as [string, string][]).map(([label, val]) => {
                      const active = draft.socialization.initiated_by === val;
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => updateSocialization({ initiated_by: active ? null : val as Socialization["initiated_by"] })}
                          className="flex-1 py-3 rounded-xl border-2 text-sm font-semibold transition-all active:scale-95"
                          style={{
                            borderColor: active ? "#4a7c59" : "#CBD5E1",
                            background: active ? "#4a7c59" : "white",
                            color: active ? "white" : "#334155",
                          }}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </div>
        </AccordionSection>}

        {/* ── Notes ── */}
        <AccordionSection id="notes" title="Notes" summaryLine={notesText}
          bgColor="white" borderColor="#d4e0d7" headingColor="#1a2420"
          isOpen={openSection === "notes"} onToggle={() => toggle("notes")}>

          <div className="flex justify-between mb-1">
            <span className="text-sm text-slate-500" />
            <span className="text-sm text-slate-400">{draft.notes.length}/500</span>
          </div>
          <textarea
            value={draft.notes}
            onChange={e => { if (e.target.value.length <= 500) update({ notes: e.target.value }); }}
            rows={4}
            placeholder="Anything added here will appear in the summary report."
            className="w-full px-4 py-3 rounded-xl border border-slate-200 text-navy text-base focus:outline-none resize-none"
          />
        </AccordionSection>
      </div>

      {/* ── Manage Contacts Sheet ── */}
      {showContactsSheet && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ background: "rgba(0,0,0,0.45)" }}
          onClick={e => { if (e.target === e.currentTarget) setShowContactsSheet(false); }}
        >
          <div className="bg-white rounded-t-3xl flex flex-col" style={{ maxHeight: "70vh" }}>
            {/* Sheet header */}
            <div className="flex items-center justify-between px-5 pt-5 pb-3 flex-shrink-0">
              <h2 className="text-xl font-bold text-navy">Manage Contacts</h2>
              <button
                type="button"
                onClick={() => setShowContactsSheet(false)}
                className="px-5 py-2 rounded-xl text-sm font-semibold text-white"
                style={{ background: "#4a7c59" }}
              >
                Done
              </button>
            </div>

            {/* Contact list */}
            <div className="flex-1 overflow-y-auto px-5 space-y-2 pb-2">
              {socialContacts.map(contact => (
                <div key={contact.id} className="flex items-center justify-between bg-slate-50 rounded-xl px-4 py-3">
                  <span className="text-sm font-medium text-navy">{contact.name}</span>
                  <button
                    type="button"
                    onClick={() => handleDeleteContact(contact.id)}
                    className="w-8 h-8 flex items-center justify-center rounded-full text-slate-400 hover:text-red-500 transition-colors text-xl leading-none"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>

            {/* Count + add row */}
            <div className="px-5 pb-8 pt-3 flex-shrink-0 border-t border-slate-100">
              <p className="text-xs text-slate-400 mb-3">{socialContacts.length} of 20 contacts</p>
              {socialContacts.length < 20 ? (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newContactName}
                    onChange={e => setNewContactName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); handleAddContact(); } }}
                    placeholder="Add a contact..."
                    className="flex-1 px-4 py-3 rounded-xl border border-slate-200 text-navy text-sm focus:outline-none bg-white"
                  />
                  <button
                    type="button"
                    onClick={handleAddContact}
                    disabled={!newContactName.trim() || addingContact}
                    className="px-5 py-3 rounded-xl text-sm font-semibold text-white transition-all"
                    style={{ background: newContactName.trim() ? "#4a7c59" : "#CBD5E1" }}
                  >
                    {addingContact ? "…" : "+ Add"}
                  </button>
                </div>
              ) : (
                <p className="text-sm font-medium text-center" style={{ color: "#D97706" }}>Contact limit reached</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Queued detail prompt ── */}
      {queuedDetailPrompt.length > 0 && saved && (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end"
          style={{ background: "rgba(0,0,0,0.45)" }}
        >
          <div className="bg-white rounded-t-3xl px-5 pt-6 pb-10 space-y-4 max-w-lg mx-auto w-full">
            <p className="text-xl font-bold text-navy">Fill in a queued day?</p>
            <p className="text-base text-slate-600">
              You queued {queuedDetailPrompt.length} {queuedDetailPrompt.length === 1 ? "day" : "days"} for detailed entry.
              {" "}Start with{" "}
              {(() => {
                const [yr, mo, dy] = queuedDetailPrompt[0].split("-").map(Number);
                return new Date(yr, mo - 1, dy).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
              })()}?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  const [first, ...rest] = queuedDetailPrompt;
                  if (rest.length > 0) {
                    sessionStorage.setItem("truefit_queued_days", JSON.stringify(rest));
                  } else {
                    sessionStorage.removeItem("truefit_queued_days");
                  }
                  router.push(`/log?date=${first}`);
                }}
                className="flex-1 py-4 rounded-2xl font-bold text-white text-base"
                style={{ background: "linear-gradient(135deg, #4a7c59, #2d4f38)" }}
              >
                Yes, fill in now
              </button>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.removeItem("truefit_queued_days");
                  setQueuedDetailPrompt([]);
                  router.push("/dashboard");
                }}
                className="flex-1 py-4 rounded-2xl font-bold border-2 text-base"
                style={{ borderColor: "#CBD5E1", color: "#64748B" }}
              >
                Maybe later
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Sticky save bar ── */}
      <div className="fixed bottom-0 left-0 right-0 z-30">
        <div className="max-w-lg mx-auto px-4 pb-[72px] pt-3"
          style={{ background: "linear-gradient(to top, rgba(248,250,252,1) 70%, transparent)" }}>
          {saving ? (
            <div className="flex items-center justify-center py-5">
              <StepLoader
                steps={["Saving your log...", "Updating your streak...", "Done."]}
                intervalMs={1000}
              />
            </div>
          ) : saved ? (
            <div className="flex items-center justify-center py-5">
              <p style={{ color: "#94a3b8", fontSize: "0.95rem", fontWeight: 400 }}>Done.</p>
            </div>
          ) : (
            <>
              {lastAutoSaved && (
                <p className="text-center text-xs mb-2" style={{ color: "#94a3b8" }}>
                  Auto-saved at {lastAutoSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
              <button
                onClick={handleSubmit}
                className="w-full py-3 rounded-xl font-semibold text-white text-base shadow-md transition-all active:scale-[0.98]"
                style={{ background: "linear-gradient(135deg, #4a7c59, #2d4f38)" }}
              >
                {isHistorical ? "Save Entry" : "Save Log"}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function LogPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#faf9f6" }}>
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#4a7c59", borderTopColor: "transparent" }} />
      </div>
    }>
      <LogPageInner />
    </Suspense>
  );
}
