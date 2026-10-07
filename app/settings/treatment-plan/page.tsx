"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { api } from "../../lib/api";
import { useAuth } from "../../components/AuthProvider";
import { NavBar } from "../../components/NavBar";
import type { Patient, TreatmentPlan, TherapyEntry, ClinicianEntry } from "../../lib/types";

type PlanDraft = {
  therapies: TherapyEntry[];
  clinicians: ClinicianEntry[];
  bedtime: string;
  wake_time: string;
  sleep_notes: string;
  substances_to_avoid: string;
  care_goals: string;
  next_appointment_date: string;
  next_appointment_with: string;
};

function emptyDraft(): PlanDraft {
  return {
    therapies: [],
    clinicians: [],
    bedtime: "",
    wake_time: "",
    sleep_notes: "",
    substances_to_avoid: "",
    care_goals: "",
    next_appointment_date: "",
    next_appointment_with: "",
  };
}

function SectionCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="warm-card overflow-hidden">
      <div className="px-5 pt-4 pb-2">
        <h2 className="warm-h2 text-lg">{title}</h2>
        {subtitle && <p className="text-sm warm-soft mt-0.5">{subtitle}</p>}
      </div>
      <div className="px-5 pb-5 space-y-3">{children}</div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label className="text-sm font-semibold text-slate-600">{label}</label>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

const inputClass = "w-full px-4 py-3 rounded-xl border border-slate-200 text-base text-navy focus:outline-none bg-white";
const textareaClass = `${inputClass} resize-none`;

// ── Therapy entry card ────────────────────────────────────────────────────────

function TherapyCard({
  entry, index, onChange, onRemove,
}: {
  entry: TherapyEntry;
  index: number;
  onChange: (updated: TherapyEntry) => void;
  onRemove: () => void;
}) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
      {/* Modality toggle */}
      <div className="flex items-center gap-2">
        {(["individual", "group"] as const).map(m => (
          <button
            key={m}
            type="button"
            onClick={() => onChange({ ...entry, modality: m })}
            className="flex-1 py-2 rounded-lg border-2 text-sm font-semibold transition-all capitalize"
            style={{
              borderColor: entry.modality === m ? "#4a7c59" : "#E2E8F0",
              background: entry.modality === m ? "#4a7c59" : "white",
              color: entry.modality === m ? "white" : "#64748B",
            }}
          >
            {m === "individual" ? "Individual" : "Group"}
          </button>
        ))}
      </div>

      {/* Name */}
      <input
        type="text"
        value={entry.name}
        onChange={e => onChange({ ...entry, name: e.target.value })}
        placeholder={entry.modality === "individual" ? "e.g. CBT with Dr. Smith" : "e.g. IOP at Memorial Clinic"}
        className={inputClass}
      />

      <button
        type="button"
        onClick={onRemove}
        className="text-sm font-medium text-red-400 hover:text-red-600 transition-colors"
      >
        Remove
      </button>
    </div>
  );
}

// ── Clinician entry card ──────────────────────────────────────────────────────

const COMMON_ROLES = ["Therapist", "Psychiatrist", "Primary Doctor", "Case Manager", "Social Worker", "Nurse Practitioner"];

function ClinicianCard({
  entry, onChange, onRemove,
}: {
  entry: ClinicianEntry;
  onChange: (updated: ClinicianEntry) => void;
  onRemove: () => void;
}) {
  const [customRole, setCustomRole] = useState(!COMMON_ROLES.includes(entry.role) && entry.role !== "");

  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
      {/* Role */}
      <div className="space-y-2">
        <label className="text-sm font-medium warm-soft">Role</label>
        <div className="flex flex-wrap gap-2">
          {COMMON_ROLES.map(r => (
            <button
              key={r}
              type="button"
              onClick={() => { onChange({ ...entry, role: r }); setCustomRole(false); }}
              className="px-3 py-1.5 rounded-lg border text-sm font-medium transition-all"
              style={{
                borderColor: entry.role === r && !customRole ? "#4a7c59" : "#E2E8F0",
                background: entry.role === r && !customRole ? "#4a7c59" : "white",
                color: entry.role === r && !customRole ? "white" : "#64748B",
              }}
            >
              {r}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setCustomRole(true)}
            className="px-3 py-1.5 rounded-lg border text-sm font-medium transition-all"
            style={{
              borderColor: customRole ? "#4a7c59" : "#E2E8F0",
              background: customRole ? "#4a7c59" : "white",
              color: customRole ? "white" : "#64748B",
            }}
          >
            Other
          </button>
        </div>
        {customRole && (
          <input
            type="text"
            value={COMMON_ROLES.includes(entry.role) ? "" : entry.role}
            onChange={e => onChange({ ...entry, role: e.target.value })}
            placeholder="Role title"
            className={inputClass}
            autoFocus
          />
        )}
      </div>

      {/* Name */}
      <input
        type="text"
        value={entry.name}
        onChange={e => onChange({ ...entry, name: e.target.value })}
        placeholder="Full name"
        className={inputClass}
      />

      {/* Specialty + Contact */}
      <div className="grid grid-cols-2 gap-2">
        <input
          type="text"
          value={entry.specialty ?? ""}
          onChange={e => onChange({ ...entry, specialty: e.target.value || null })}
          placeholder="Specialty"
          className={inputClass}
        />
        <input
          type="text"
          value={entry.contact ?? ""}
          onChange={e => onChange({ ...entry, contact: e.target.value || null })}
          placeholder="Phone / email"
          className={inputClass}
        />
      </div>

      <button
        type="button"
        onClick={onRemove}
        className="text-sm font-medium text-red-400 hover:text-red-600 transition-colors"
      >
        Remove
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function TreatmentPlanPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [draft, setDraft] = useState<PlanDraft>(emptyDraft());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) { router.push("/login"); return; }
    if (!isLoading && user) {
      api.getPatients().then(async (pts) => {
        const list = pts as Patient[];
        if (!list.length) { router.push("/onboarding"); return; }
        const p = list[0];
        setPatient(p);
        try {
          const plan = await api.getTreatmentPlan(p.id) as TreatmentPlan;
          setDraft({
            therapies: plan.therapies ?? [],
            clinicians: plan.clinicians ?? [],
            bedtime: plan.bedtime ?? "",
            wake_time: plan.wake_time ?? "",
            sleep_notes: plan.sleep_notes ?? "",
            substances_to_avoid: plan.substances_to_avoid ?? "",
            care_goals: plan.care_goals ?? "",
            next_appointment_date: plan.next_appointment_date ?? "",
            next_appointment_with: plan.next_appointment_with ?? "",
          });
        } catch {
          // 404 = no plan yet, start fresh
        }
      }).catch(() => toast.error("Failed to load patient"))
        .finally(() => setLoading(false));
    }
  }, [user, isLoading, router]);

  function set<K extends keyof PlanDraft>(field: K, value: PlanDraft[K]) {
    setDraft(d => ({ ...d, [field]: value }));
  }

  function addTherapy() {
    set("therapies", [...draft.therapies, { modality: "individual", name: "" }]);
  }

  function updateTherapy(i: number, updated: TherapyEntry) {
    const next = [...draft.therapies];
    next[i] = updated;
    set("therapies", next);
  }

  function removeTherapy(i: number) {
    set("therapies", draft.therapies.filter((_, idx) => idx !== i));
  }

  function addClinician() {
    set("clinicians", [...draft.clinicians, { role: "Therapist", name: "", specialty: null, contact: null }]);
  }

  function updateClinician(i: number, updated: ClinicianEntry) {
    const next = [...draft.clinicians];
    next[i] = updated;
    set("clinicians", next);
  }

  function removeClinician(i: number) {
    set("clinicians", draft.clinicians.filter((_, idx) => idx !== i));
  }

  async function handleSave() {
    if (!patient) return;
    setSaving(true);
    try {
      const payload = {
        therapies: draft.therapies.filter(t => t.name.trim()),
        clinicians: draft.clinicians.filter(c => c.name.trim()),
        bedtime: draft.bedtime.trim() || null,
        wake_time: draft.wake_time.trim() || null,
        sleep_notes: draft.sleep_notes.trim() || null,
        substances_to_avoid: draft.substances_to_avoid.trim() || null,
        care_goals: draft.care_goals.trim() || null,
        next_appointment_date: draft.next_appointment_date || null,
        next_appointment_with: draft.next_appointment_with.trim() || null,
      };
      await api.saveTreatmentPlan(patient.id, payload);
      toast.success("Treatment plan saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
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

  return (
    <div className="min-h-screen pb-28" style={{ background: "#faf9f6" }}>
      <NavBar />

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">

        {/* Header */}
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="w-9 h-9 rounded-full flex items-center justify-center bg-white border border-slate-200 text-slate-500 hover:text-navy transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="warm-h1 text-3xl">Treatment Plan</h1>
            {patient && <p className="text-sm text-slate-500">For {patient.name}</p>}
          </div>
        </div>

        <p className="text-sm text-slate-500">
          All fields optional. This context appears in AI summaries so clinicians see what was planned vs. what actually happened.
        </p>

        {/* ── Therapy ── */}
        <SectionCard title="Therapy" subtitle="Add as many as apply. List individual and group sessions separately.">
          {draft.therapies.map((entry, i) => (
            <TherapyCard
              key={i}
              entry={entry}
              index={i}
              onChange={updated => updateTherapy(i, updated)}
              onRemove={() => removeTherapy(i)}
            />
          ))}
          <button
            type="button"
            onClick={addTherapy}
            className="w-full py-3 rounded-xl border-2 border-dashed text-sm font-semibold transition-all"
            style={{ borderColor: "#CBD5E1", color: "#64748B" }}
          >
            + Add Therapy
          </button>
        </SectionCard>

        {/* ── Clinicians ── */}
        <SectionCard title="Clinicians" subtitle="Add therapists, doctors, case managers, and everyone else on the care team.">
          {draft.clinicians.map((entry, i) => (
            <ClinicianCard
              key={i}
              entry={entry}
              onChange={updated => updateClinician(i, updated)}
              onRemove={() => removeClinician(i)}
            />
          ))}
          <button
            type="button"
            onClick={addClinician}
            className="w-full py-3 rounded-xl border-2 border-dashed text-sm font-semibold transition-all"
            style={{ borderColor: "#CBD5E1", color: "#64748B" }}
          >
            + Add Clinician
          </button>
        </SectionCard>

        {/* ── Sleep ── */}
        <SectionCard title="Sleep Plan">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Bedtime">
              <input type="time" value={draft.bedtime} onChange={e => set("bedtime", e.target.value)} className={inputClass} />
            </Field>
            <Field label="Wake time">
              <input type="time" value={draft.wake_time} onChange={e => set("wake_time", e.target.value)} className={inputClass} />
            </Field>
          </div>
          <Field label="Sleep notes" hint='e.g. "No screens after 9pm", "Take melatonin at 9pm"'>
            <textarea rows={2} value={draft.sleep_notes} onChange={e => set("sleep_notes", e.target.value)}
              placeholder="Any sleep hygiene instructions…" className={textareaClass} />
          </Field>
        </SectionCard>

        {/* ── Substance Avoidance ── */}
        <SectionCard title="Substance Avoidance">
          <Field label="What should they avoid?" hint="Flagged in summaries if substances are logged on any day">
            <textarea rows={2} value={draft.substances_to_avoid} onChange={e => set("substances_to_avoid", e.target.value)}
              placeholder="e.g. alcohol, cannabis, stimulants" className={textareaClass} />
          </Field>
        </SectionCard>

        {/* ── Care Goals ── */}
        <SectionCard title="Care Goals">
          <Field label="Main treatment goals" hint="The AI will reference these when evaluating 30-day progress">
            <textarea rows={4} value={draft.care_goals} onChange={e => set("care_goals", e.target.value)}
              placeholder={"Increase social engagement\nReduce isolation\nStabilize mood\nMaintain medication adherence"}
              className={textareaClass} />
          </Field>
        </SectionCard>

        {/* ── Next Appointment ── */}
        <SectionCard title="Next Appointment">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Date">
              <input type="date" value={draft.next_appointment_date} onChange={e => set("next_appointment_date", e.target.value)} className={inputClass} />
            </Field>
            <Field label="With">
              <input type="text" value={draft.next_appointment_with} onChange={e => set("next_appointment_with", e.target.value)}
                placeholder="Clinician name" className={inputClass} />
            </Field>
          </div>
        </SectionCard>

        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-5 rounded-2xl font-bold text-white text-xl shadow-xl transition-all active:scale-[0.98] disabled:opacity-60"
          style={{ background: "#4a7c59" }}
        >
          {saving ? "Saving…" : "Save Treatment Plan"}
        </button>
      </div>
    </div>
  );
}
