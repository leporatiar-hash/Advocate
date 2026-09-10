"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { api } from "../../lib/api";
import { useAuth } from "../../components/AuthProvider";
import { NavBar } from "../../components/NavBar";
import { DEFAULT_SYMPTOM_NAMES, DEFAULT_ACTIVITY_OPTIONS } from "../../lib/constants";
import type { User, Patient, Medication, SocialContact } from "../../lib/types";

// ── Constants ─────────────────────────────────────────────────────────────────

const PRESET_TRACKING = [
  { key: "sleep",     label: "Sleep",     sub: "Log nightly hours of sleep" },
  { key: "hydration", label: "Hydration", sub: "Log daily hydration level" },
  { key: "vitals",    label: "Vitals",    sub: "Heart rate and blood pressure" },
];
const DEFAULT_TRACKING = ["sleep", "hydration", "vitals"];

// ── UI primitives ─────────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <div className="px-5 pt-5 pb-3">
        <p className="text-lg font-bold text-navy">{title}</p>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <div className="px-5 pb-5 space-y-4">{children}</div>
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!value)}
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

function Chip({ label, onRemove, color = "green" }: { label: string; onRemove: () => void; color?: "green" | "orange" | "blue" }) {
  const styles = {
    green:  { background: "#f2f7f3", color: "#166534", border: "1px solid #d4e0d7", hover: "hover:bg-green-200" },
    orange: { background: "#f2f7f3", color: "#9A3412", border: "1px solid #d4e0d7", hover: "hover:bg-orange-200" },
    blue:   { background: "#EFF6FF", color: "#1D4ED8", border: "1px solid #93C5FD", hover: "hover:bg-blue-200" },
  }[color];

  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold"
      style={{ background: styles.background, color: styles.color, border: styles.border }}
    >
      {label}
      <button
        type="button"
        onClick={onRemove}
        className={`w-4 h-4 rounded-full flex items-center justify-center ${styles.hover} transition-colors`}
        style={{ color: styles.color }}
        aria-label={`Remove ${label}`}
      >
        ×
      </button>
    </span>
  );
}

function AddInput({
  placeholder, onAdd, borderColor = "#d4e0d7", buttonColor = "#166534",
}: {
  placeholder: string;
  onAdd: (val: string) => void;
  borderColor?: string;
  buttonColor?: string;
}) {
  const [val, setVal] = useState("");
  function submit() {
    const trimmed = val.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setVal("");
  }
  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => e.key === "Enter" && submit()}
        placeholder={placeholder}
        className="flex-1 px-4 py-2.5 rounded-xl border text-base text-navy focus:outline-none bg-white"
        style={{ borderColor }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={!val.trim()}
        className="px-4 py-2.5 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-40"
        style={{ background: buttonColor }}
      >
        Add
      </button>
    </div>
  );
}

function MedRow({ med, onRemove }: { med: Medication; onRemove: (id: number) => void }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-base font-semibold text-navy">{med.name}</p>
        <p className="text-sm text-slate-400">
          {[med.dose, med.frequency].filter(Boolean).join(" · ")}
        </p>
      </div>
      <button
        type="button"
        onClick={() => onRemove(med.id)}
        className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors text-lg leading-none"
        aria-label={`Remove ${med.name}`}
      >
        ×
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function CustomizePage() {
  const { user, isLoading, updateUser } = useAuth();
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Patient + medications
  const [patient, setPatient] = useState<Patient | null>(null);
  const [newMedName, setNewMedName] = useState("");
  const [newMedDose, setNewMedDose] = useState("");
  const [newMedFreq, setNewMedFreq] = useState("");
  const [addingMed, setAddingMed] = useState(false);

  // Symptoms
  const [symptoms, setSymptoms] = useState<string[]>([]);

  // Tracking modules
  const [trackingModules, setTrackingModules] = useState<Set<string>>(new Set(DEFAULT_TRACKING));
  const [customVitals, setCustomVitals] = useState<string[]>([]);

  // Activities
  const [activities, setActivities] = useState<string[]>([]);

  // Substances
  const [showCigarettes, setShowCigarettes] = useState(true);
  const [showAlcohol, setShowAlcohol] = useState(true);
  const [customSubstances, setCustomSubstances] = useState<string[]>([]);

  // Dose timing
  const [doseTimingMode, setDoseTimingMode] = useState<"quick" | "simple" | "exact">("quick");

  // Symptom scale — display only, the logged value is still 0-10 either way
  const [symptomScale, setSymptomScale] = useState<"numeric" | "words">("numeric");

  // Socialization
  const [showSocialization, setShowSocialization] = useState(true);
  const [contacts, setContacts] = useState<SocialContact[]>([]);
  const [newContactName, setNewContactName] = useState("");
  const [addingContact, setAddingContact] = useState(false);

  const loadFromUser = useCallback((u: User) => {
    const cfg = u.user_config;

    setSymptoms(cfg?.symptoms?.length ? cfg.symptoms : [...DEFAULT_SYMPTOM_NAMES]);
    setActivities(cfg?.activities?.length ? cfg.activities : DEFAULT_ACTIVITY_OPTIONS.map(a => a.type));

    const tm = cfg?.tracking_modules;
    setTrackingModules(new Set(tm?.length ? tm : DEFAULT_TRACKING));
    setCustomVitals(cfg?.custom_vitals ?? []);

    if (!cfg) return;
    const sf: string[] = cfg.substance_fields ?? ["cigarettes", "alcohol"];
    setShowCigarettes(sf.includes("cigarettes"));
    setShowAlcohol(sf.includes("alcohol"));
    setCustomSubstances(sf.filter((s: string) => s !== "cigarettes" && s !== "alcohol"));
    setDoseTimingMode(cfg.dose_timing_mode ?? "quick");
    setSymptomScale(cfg.symptom_scale ?? "numeric");
    setShowSocialization(cfg.show_socialization !== false);
  }, []);

  useEffect(() => {
    if (!isLoading && !user) { router.push("/login"); return; }
    if (!isLoading && user) {
      loadFromUser(user);
      api.getPatients().then(pts => {
        const list = pts as Patient[];
        if (list.length > 0) setPatient(list[0]);
      }).catch(() => {});
      api.getSocialContacts().then(c => setContacts(c as SocialContact[])).catch(() => {});
    }
  }, [user, isLoading, loadFromUser, router]);

  // ── Medications ───────────────────────────────────────────────────────────

  async function handleAddMed() {
    if (!newMedName.trim() || !patient) return;
    setAddingMed(true);
    try {
      const added = await api.addMedication(patient.id, {
        name: newMedName.trim(),
        dose: newMedDose.trim(),
        frequency: newMedFreq.trim() || "daily",
        time_of_day: "morning",
      }) as Medication;
      setPatient({ ...patient, medications: [...patient.medications, added] });
      setNewMedName(""); setNewMedDose(""); setNewMedFreq("");
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
      toast.success("Medication removed");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove medication");
    }
  }

  // ── Symptoms ──────────────────────────────────────────────────────────────

  async function handleAddSymptom(name: string) {
    const n = name.charAt(0).toUpperCase() + name.slice(1);
    if (symptoms.includes(n)) return;
    const next = [...symptoms, n];
    setSymptoms(next);
    try {
      await api.updateUserConfig({ symptoms: next });
      if (user) updateUser({ ...user, user_config: { ...(user.user_config || {}), symptoms: next } as typeof user.user_config });
      toast.success(`${n} added`);
    } catch {
      setSymptoms(prev => prev.filter(s => s !== n));
      toast.error("Failed to save symptom");
    }
  }

  async function handleRemoveSymptom(name: string) {
    const next = symptoms.filter(s => s !== name);
    setSymptoms(next);
    try {
      await api.updateUserConfig({ symptoms: next });
      if (user) updateUser({ ...user, user_config: { ...(user.user_config || {}), symptoms: next } as typeof user.user_config });
    } catch {
      setSymptoms(prev => [...prev, name]);
      toast.error("Failed to remove symptom");
    }
  }

  // ── Tracking ──────────────────────────────────────────────────────────────

  function toggleModule(key: string) {
    setTrackingModules(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function addCustomVital(name: string) {
    const n = name.charAt(0).toUpperCase() + name.slice(1);
    if (!customVitals.includes(n)) setCustomVitals(prev => [...prev, n]);
  }
  function removeCustomVital(name: string) { setCustomVitals(prev => prev.filter(v => v !== name)); }

  // ── Activities ────────────────────────────────────────────────────────────

  function activityLabel(type: string): string {
    const found = DEFAULT_ACTIVITY_OPTIONS.find(a => a.type === type);
    return found ? found.label : type.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
  }
  function addActivity(name: string) {
    const slug = name.trim().toLowerCase().replace(/\s+/g, "_");
    if (slug && !activities.includes(slug)) setActivities(prev => [...prev, slug]);
  }
  function removeActivity(slug: string) { setActivities(prev => prev.filter(a => a !== slug)); }

  // ── Substances ────────────────────────────────────────────────────────────

  function addCustomSubstance(name: string) {
    const n = name.charAt(0).toUpperCase() + name.slice(1);
    if (!customSubstances.includes(n)) setCustomSubstances(prev => [...prev, n]);
  }
  function removeCustomSubstance(name: string) { setCustomSubstances(prev => prev.filter(s => s !== name)); }

  // ── Social Contacts ────────────────────────────────────────────────────────

  async function handleAddContact() {
    const name = newContactName.trim();
    if (!name) return;
    setAddingContact(true);
    try {
      const added = await api.createSocialContact(name) as SocialContact;
      setContacts(prev => [...prev, added]);
      setNewContactName("");
      toast.success(`${added.name} added`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add contact");
    } finally {
      setAddingContact(false);
    }
  }

  async function handleRemoveContact(id: number, name: string) {
    try {
      await api.deleteSocialContact(id);
      setContacts(prev => prev.filter(c => c.id !== id));
      toast.success(`${name} removed`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove contact");
    }
  }

  // ── Save ──────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!user) return;
    setSaving(true);
    try {
      const updates = {
        symptoms,
        activities,
        tracking_modules: Array.from(trackingModules),
        custom_vitals: customVitals,
        substance_fields: [
          ...(showCigarettes ? ["cigarettes"] : []),
          ...(showAlcohol ? ["alcohol"] : []),
          ...customSubstances,
        ],
        dose_timing_mode: doseTimingMode,
        symptom_scale: symptomScale,
        show_socialization: showSocialization,
      };
      const updated = await api.updateUserConfig(updates) as User;
      updateUser(updated);
      toast.success("Saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#faf9f6" }}>
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#4a7c59", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const activeMeds = patient?.medications.filter(m => m.active) ?? [];

  return (
    <div className="min-h-screen pb-28" style={{ background: "#faf9f6" }}>
      <NavBar />

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">

        {/* Back + title */}
        <div className="flex items-center gap-3">
          <Link href="/settings" className="w-9 h-9 rounded-full flex items-center justify-center bg-white border border-slate-200 text-slate-500 hover:text-navy transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-navy">Customize Dashboard</h1>
            <p className="text-sm text-slate-500">Everything logged daily is configured here</p>
          </div>
        </div>

        {/* ── Medications ── */}
        <Section title="Medications" subtitle="Add or remove medications tracked in the daily log">
          {patient ? (
            <>
              {activeMeds.length > 0 && (
                <div className="-mt-1">
                  {activeMeds.map(med => (
                    <MedRow key={med.id} med={med} onRemove={handleRemoveMed} />
                  ))}
                </div>
              )}
              {activeMeds.length === 0 && (
                <p className="text-sm text-slate-400">No medications added yet.</p>
              )}
              <div className="space-y-2">
                <input
                  type="text"
                  value={newMedName}
                  onChange={e => setNewMedName(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && handleAddMed()}
                  placeholder="Medication name (e.g. Metformin)"
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-base text-navy focus:outline-none bg-white"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newMedDose}
                    onChange={e => setNewMedDose(e.target.value)}
                    placeholder="Dose (e.g. 500mg)"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-base text-navy focus:outline-none bg-white"
                  />
                  <input
                    type="text"
                    value={newMedFreq}
                    onChange={e => setNewMedFreq(e.target.value)}
                    placeholder="Frequency (e.g. twice daily)"
                    className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 text-base text-navy focus:outline-none bg-white"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleAddMed}
                  disabled={!newMedName.trim() || addingMed}
                  className="w-full py-2.5 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-40"
                  style={{ background: "#4a7c59" }}
                >
                  {addingMed ? "Adding…" : "Add Medication"}
                </button>
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-400">Loading…</p>
          )}
        </Section>

        {/* ── Dose Timing ── */}
        <Section title="Dose Timing" subtitle="How do you want to log when medications are taken?">
          <div className="space-y-3">
            {(["quick", "simple", "exact"] as const).map(mode => (
              <button
                key={mode}
                type="button"
                onClick={() => setDoseTimingMode(mode)}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all"
                style={{
                  borderColor: doseTimingMode === mode ? "#4a7c59" : "#CBD5E1",
                  background: doseTimingMode === mode ? "#f2f7f3" : "white",
                }}
              >
                <div
                  className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={{ borderColor: doseTimingMode === mode ? "#4a7c59" : "#CBD5E1" }}
                >
                  {doseTimingMode === mode && <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#4a7c59" }} />}
                </div>
                <div>
                  <p className="text-base font-semibold text-navy">
                    {mode === "quick" ? "Quick" : mode === "simple" ? "Simple" : "Exact Time"}
                  </p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {mode === "quick"
                      ? "“Took all meds today” · Yes or No"
                      : mode === "simple"
                      ? "Morning · Afternoon · Evening · Night"
                      : "Pick the precise time for each dose"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </Section>

        {/* ── Symptom Scale ── */}
        <Section title="Symptom Scale" subtitle="How severity is shown when logging symptoms — the value saved is the same either way">
          <div className="space-y-3">
            {(["numeric", "words"] as const).map(scale => (
              <button
                key={scale}
                type="button"
                onClick={() => setSymptomScale(scale)}
                className="w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all"
                style={{
                  borderColor: symptomScale === scale ? "#4a7c59" : "#CBD5E1",
                  background: symptomScale === scale ? "#f2f7f3" : "white",
                }}
              >
                <div
                  className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                  style={{ borderColor: symptomScale === scale ? "#4a7c59" : "#CBD5E1" }}
                >
                  {symptomScale === scale && <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#4a7c59" }} />}
                </div>
                <div>
                  <p className="text-base font-semibold text-navy">
                    {scale === "numeric" ? "Numbers" : "Words"}
                  </p>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {scale === "numeric" ? "A slider from 0 to 10" : "None · Low · Medium · High"}
                  </p>
                </div>
              </button>
            ))}
          </div>
        </Section>

        {/* ── Symptoms ── */}
        <Section title="Symptoms" subtitle="Choose exactly which symptoms to track every day">
          {symptoms.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {symptoms.map(s => (
                <Chip key={s} label={s} onRemove={() => handleRemoveSymptom(s)} color="green" />
              ))}
            </div>
          )}
          {symptoms.length === 0 && <p className="text-sm text-slate-400">No symptoms added yet.</p>}
          <AddInput placeholder="e.g. Spasticity, Tremor, Vision Issues…" onAdd={handleAddSymptom} />
        </Section>

        {/* ── Tracking ── */}
        <Section title="Tracking" subtitle="Choose what to log each day. Toggle presets or add your own.">
          {/* Preset modules */}
          <div className="space-y-3">
            {PRESET_TRACKING.map(t => (
              <div key={t.key} className="flex items-center justify-between">
                <div>
                  <p className="text-base font-semibold text-slate-700">{t.label}</p>
                  <p className="text-sm text-slate-400">{t.sub}</p>
                </div>
                <Toggle value={trackingModules.has(t.key)} onChange={() => toggleModule(t.key)} />
              </div>
            ))}
          </div>

          {/* Custom vitals */}
          <div className="pt-1 space-y-3">
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Custom Vitals</p>
            {customVitals.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {customVitals.map(v => (
                  <Chip key={v} label={v} onRemove={() => removeCustomVital(v)} color="blue" />
                ))}
              </div>
            )}
            <AddInput
              placeholder="e.g. Weight, Blood Sugar, Temperature…"
              onAdd={addCustomVital}
              borderColor="#93C5FD"
              buttonColor="#1D4ED8"
            />
          </div>
        </Section>

        {/* ── Activities ── */}
        <Section title="Activities" subtitle="Choose which activities to track in the daily log">
          {activities.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {activities.map(slug => (
                <Chip key={slug} label={activityLabel(slug)} onRemove={() => removeActivity(slug)} color="green" />
              ))}
            </div>
          )}
          {activities.length === 0 && <p className="text-sm text-slate-400">No activities added yet.</p>}
          <AddInput placeholder="e.g. Swimming, Yoga, Board Games…" onAdd={addActivity} />
        </Section>

        {/* ── Substances ── */}
        <Section title="Substances" subtitle="Track what's relevant and turn off what isn't.">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-semibold text-slate-700">Cigarettes / Tobacco</p>
                <p className="text-sm text-slate-400">Track daily cigarette count</p>
              </div>
              <Toggle value={showCigarettes} onChange={setShowCigarettes} />
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-base font-semibold text-slate-700">Alcohol</p>
                <p className="text-sm text-slate-400">Track alcohol use and drinks</p>
              </div>
              <Toggle value={showAlcohol} onChange={setShowAlcohol} />
            </div>
          </div>
          {customSubstances.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-1">
              {customSubstances.map(s => (
                <Chip key={s} label={s} onRemove={() => removeCustomSubstance(s)} color="orange" />
              ))}
            </div>
          )}
          <AddInput
            placeholder="Add custom substance (e.g. Cannabis, Opioids…)"
            onAdd={addCustomSubstance}
            borderColor="#d4e0d7"
            buttonColor="#9A3412"
          />
        </Section>

        {/* ── Socialization ── */}
        <Section title="Socialization" subtitle="Track how your patient is engaging socially each day">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-semibold text-slate-700">Show Socialization</p>
              <p className="text-sm text-slate-400">Display this section on the daily log</p>
            </div>
            <Toggle value={showSocialization} onChange={setShowSocialization} />
          </div>

          <div className="pt-1 space-y-3">
            <p className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Social Contacts</p>
            <p className="text-sm text-slate-400">People who appear as contact options in the log</p>
            {contacts.length > 0 && (
              <div className="-mt-1">
                {contacts.map(c => (
                  <div key={c.id} className="flex items-center justify-between py-3 border-b border-slate-100 last:border-0">
                    <p className="text-base font-semibold text-navy">{c.name}</p>
                    <button
                      type="button"
                      onClick={() => handleRemoveContact(c.id, c.name)}
                      className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors text-lg leading-none"
                      aria-label={`Remove ${c.name}`}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
            {contacts.length === 0 && <p className="text-sm text-slate-400">No contacts added yet.</p>}
            <div className="flex gap-2">
              <input
                type="text"
                value={newContactName}
                onChange={e => setNewContactName(e.target.value)}
                onKeyDown={e => e.key === "Enter" && handleAddContact()}
                placeholder="e.g. Mom, Dr. Smith, Neighbor…"
                className="flex-1 px-4 py-2.5 rounded-xl border text-base text-navy focus:outline-none bg-white"
                style={{ borderColor: "#d4e0d7" }}
              />
              <button
                type="button"
                onClick={handleAddContact}
                disabled={!newContactName.trim() || addingContact}
                className="px-4 py-2.5 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-40"
                style={{ background: "#4a7c59" }}
              >
                {addingContact ? "Adding…" : "Add"}
              </button>
            </div>
          </div>
        </Section>

        {/* ── Save ── */}
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full py-5 rounded-2xl font-bold text-white text-xl shadow-xl transition-all active:scale-[0.98]"
          style={{ background: saving ? "#2d4f38" : "linear-gradient(135deg, #4a7c59, #2d4f38)", opacity: saving ? 0.9 : 1 }}
        >
          {saving ? "Saving…" : "Save Changes"}
        </button>
      </div>
    </div>
  );
}
