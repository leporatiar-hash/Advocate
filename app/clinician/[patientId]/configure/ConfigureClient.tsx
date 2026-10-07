"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { api } from "../../../lib/api";
import { useAuth } from "../../../components/AuthProvider";
import { ClinicianHeader } from "../../../components/clinician/ClinicianHeader";
import {
  DEFAULT_SYMPTOM_NAMES,
  DEFAULT_ACTIVITY_OPTIONS,
  PRESET_TRACKING,
  DEFAULT_TRACKING,
} from "../../../lib/constants";
import { normalizeCustomVitals, vitalLabel } from "../../../lib/customVitals";
import type { CustomVital, DashboardConfig, Medication, SocialContact } from "../../../lib/types";

type DemoConfig = {
  patient_id: number;
  patient_name: string;
  user_config: Partial<DashboardConfig>;
  medications: Medication[];
  contacts: SocialContact[];
};

// ── UI primitives (clinician palette) ─────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border p-4" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
      <h2 className="text-base font-bold" style={{ color: "var(--cp-text)" }}>{title}</h2>
      {subtitle && <p className="text-xs mt-0.5" style={{ color: "var(--cp-text-muted)" }}>{subtitle}</p>}
      <div className="mt-3 space-y-3">{children}</div>
    </section>
  );
}

function Switch({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={() => onChange(!on)}
      className="relative flex-shrink-0 rounded-full transition-colors"
      style={{ width: 42, height: 24, background: on ? "var(--cp-teal)" : "#D1D5DB" }}
    >
      <span
        className="absolute top-0.5 rounded-full bg-white transition-all"
        style={{ width: 20, height: 20, left: on ? 20 : 2 }}
      />
    </button>
  );
}

function SwitchRow({ label, sub, on, onChange }: { label: string; sub: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-semibold" style={{ color: "var(--cp-text)" }}>{label}</p>
        <p className="text-xs" style={{ color: "var(--cp-text-muted)" }}>{sub}</p>
      </div>
      <Switch on={on} onChange={onChange} label={`${on ? "Turn off" : "Turn on"} ${label}`} />
    </div>
  );
}

function RadioList<T extends string>({
  value, onChange, options, label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string; sub: string }[];
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="rounded-lg border divide-y" style={{ borderColor: "var(--cp-border)" }}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          role="radio"
          aria-checked={value === o.id}
          onClick={() => onChange(o.id)}
          className="w-full flex items-center gap-3 p-3 text-left"
          style={{ borderColor: "var(--cp-border)" }}
        >
          <span
            className="flex-shrink-0 rounded-full border-2"
            style={{
              width: 18,
              height: 18,
              borderColor: value === o.id ? "var(--cp-teal)" : "var(--cp-border)",
              background: value === o.id ? "radial-gradient(circle, var(--cp-teal) 0 40%, transparent 44%)" : "transparent",
            }}
          />
          <div className="min-w-0">
            <p className="text-sm font-semibold" style={{ color: "var(--cp-text)" }}>{o.label}</p>
            <p className="text-xs" style={{ color: "var(--cp-text-muted)" }}>{o.sub}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

function Chips({ items, labelFor = (s) => s, onRemove }: {
  items: string[];
  labelFor?: (s: string) => string;
  onRemove: (s: string) => void;
}) {
  if (items.length === 0) return <p className="text-xs" style={{ color: "var(--cp-text-muted)" }}>None yet.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((s) => (
        <span
          key={s}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
          style={{ background: "var(--cp-teal-light)", color: "var(--cp-teal)" }}
        >
          {labelFor(s)}
          <button type="button" onClick={() => onRemove(s)} aria-label={`Remove ${labelFor(s)}`} className="hover:opacity-70">
            ×
          </button>
        </span>
      ))}
    </div>
  );
}

const inputClass = "px-3 py-2 rounded-lg border text-sm focus:outline-none bg-white min-w-0";
const inputStyle = { borderColor: "var(--cp-border)", color: "var(--cp-text)" };

function AddInput({ placeholder, onAdd, busy = false }: { placeholder: string; onAdd: (v: string) => void; busy?: boolean }) {
  const [val, setVal] = useState("");
  function submit() {
    const v = val.trim();
    if (!v) return;
    onAdd(v);
    setVal("");
  }
  return (
    <div className="flex gap-2">
      <input
        type="text"
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        placeholder={placeholder}
        className={`flex-1 ${inputClass}`}
        style={inputStyle}
      />
      <button
        type="button"
        onClick={submit}
        disabled={!val.trim() || busy}
        className="px-3 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
        style={{ background: "var(--cp-teal)" }}
      >
        Add
      </button>
    </div>
  );
}

function capitalize(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function activityLabel(type: string): string {
  const found = DEFAULT_ACTIVITY_OPTIONS.find((a) => a.type === type);
  return found ? found.label : type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Page ──────────────────────────────────────────────────────────────────────

/**
 * Clinician-side tracking setup for a demo patient: everything the caregiver's
 * Customize page can change. Writes go to the patient's caregiver account, so
 * the caregiver app's daily log picks them up on its next load.
 *
 * Medications and contacts save immediately (they're their own records);
 * everything else is a draft until "Save changes", same as the caregiver page.
 */
export default function ConfigureClient({ patientId }: { patientId: number }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [loaded, setLoaded] = useState<DemoConfig | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  const [meds, setMeds] = useState<Medication[]>([]);
  const [medName, setMedName] = useState("");
  const [medDose, setMedDose] = useState("");
  const [medFreq, setMedFreq] = useState("");
  const [addingMed, setAddingMed] = useState(false);

  const [contacts, setContacts] = useState<SocialContact[]>([]);
  const [addingContact, setAddingContact] = useState(false);

  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [activities, setActivities] = useState<string[]>([]);
  const [trackingModules, setTrackingModules] = useState<Set<string>>(new Set(DEFAULT_TRACKING));
  const [customVitals, setCustomVitals] = useState<CustomVital[]>([]);
  const [showCigarettes, setShowCigarettes] = useState(true);
  const [showAlcohol, setShowAlcohol] = useState(true);
  const [customSubstances, setCustomSubstances] = useState<string[]>([]);
  const [symptomScale, setSymptomScale] = useState<"numeric" | "words">("numeric");
  const [showSocialization, setShowSocialization] = useState(true);

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
  }, [user, isLoading, router]);

  useEffect(() => {
    if (isLoading || !user) return;
    api.getDemoPatientConfig(patientId)
      .then((raw) => {
        const data = raw as DemoConfig;
        const cfg = data.user_config;
        setLoaded(data);
        setMeds(data.medications);
        setContacts(data.contacts);
        // Same defaults the caregiver Customize page falls back to.
        setSymptoms(cfg.symptoms?.length ? cfg.symptoms : [...DEFAULT_SYMPTOM_NAMES]);
        setActivities(cfg.activities?.length ? cfg.activities : DEFAULT_ACTIVITY_OPTIONS.map((a) => a.type));
        setTrackingModules(new Set(cfg.tracking_modules?.length ? cfg.tracking_modules : DEFAULT_TRACKING));
        setCustomVitals(normalizeCustomVitals(cfg.custom_vitals));
        const sf = cfg.substance_fields ?? ["cigarettes", "alcohol"];
        setShowCigarettes(sf.includes("cigarettes"));
        setShowAlcohol(sf.includes("alcohol"));
        setCustomSubstances(sf.filter((s) => s !== "cigarettes" && s !== "alcohol"));
        setSymptomScale(cfg.symptom_scale ?? "numeric");
        setShowSocialization(cfg.show_socialization !== false);
      })
      .catch(() => setError(true));
  }, [patientId, user, isLoading]);

  // Wraps a draft setter so any edit marks the page unsaved.
  function edit<T>(setter: (v: T) => void) {
    return (v: T) => { setter(v); setDirty(true); };
  }
  function addUnique(list: string[], setter: (v: string[]) => void, value: string) {
    if (!list.includes(value)) { setter([...list, value]); setDirty(true); }
  }
  function removeFrom(list: string[], setter: (v: string[]) => void, value: string) {
    setter(list.filter((x) => x !== value));
    setDirty(true);
  }

  async function handleAddMed() {
    if (!medName.trim()) return;
    setAddingMed(true);
    try {
      const added = await api.addDemoPatientMedication(patientId, {
        name: medName.trim(),
        dose: medDose.trim(),
        frequency: medFreq.trim() || "daily",
        time_of_day: "morning",
      }) as Medication;
      setMeds((prev) => [...prev, added]);
      setMedName(""); setMedDose(""); setMedFreq("");
      toast.success(`${added.name} added`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add medication");
    } finally {
      setAddingMed(false);
    }
  }

  async function handleRemoveMed(med: Medication) {
    try {
      await api.removeDemoPatientMedication(patientId, med.id);
      setMeds((prev) => prev.filter((m) => m.id !== med.id));
      toast.success(`${med.name} removed`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove medication");
    }
  }

  async function handleAddContact(name: string) {
    setAddingContact(true);
    try {
      const added = await api.addDemoPatientContact(patientId, name) as SocialContact;
      setContacts((prev) => [...prev, added]);
      toast.success(`${added.name} added`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add contact");
    } finally {
      setAddingContact(false);
    }
  }

  async function handleRemoveContact(c: SocialContact) {
    try {
      await api.removeDemoPatientContact(patientId, c.id);
      setContacts((prev) => prev.filter((x) => x.id !== c.id));
      toast.success(`${c.name} removed`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove contact");
    }
  }

  async function handleSave() {
    setSaving(true);
    try {
      await api.updateDemoPatientConfig(patientId, {
        symptoms,
        activities,
        tracking_modules: Array.from(trackingModules),
        custom_vitals: customVitals,
        substance_fields: [
          ...(showCigarettes ? ["cigarettes"] : []),
          ...(showAlcohol ? ["alcohol"] : []),
          ...customSubstances,
        ],
        symptom_scale: symptomScale,
        show_socialization: showSocialization,
      });
      setDirty(false);
      toast.success("Saved. The family's daily log will use this setup.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  const backHref = `/clinician/${patientId}/`;

  if (error) {
    return (
      <div className="min-h-screen">
        <ClinicianHeader backHref={backHref} />
        <p className="text-sm text-center mt-12" style={{ color: "var(--cp-text-muted)" }}>
          Could not load this patient&apos;s setup.
        </p>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-4 rounded-full animate-spin" style={{ borderColor: "var(--cp-teal)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24">
      <ClinicianHeader backHref={backHref} patientName={loaded.patient_name} />

      <div className="max-w-2xl mx-auto px-4 pt-6 space-y-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--cp-text)" }}>Configure tracking</h1>
          <p className="text-sm mt-1" style={{ color: "var(--cp-text-muted)" }}>
            Choose what {loaded.patient_name}&apos;s family logs each day. Changes appear in their daily log.
          </p>
        </div>

        <Section title="Medications" subtitle="Saved as soon as you add or remove one">
          {meds.length === 0 && <p className="text-xs" style={{ color: "var(--cp-text-muted)" }}>No active medications.</p>}
          {meds.length > 0 && (
            <div className="divide-y" style={{ borderColor: "var(--cp-border)" }}>
              {meds.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-2" style={{ borderColor: "var(--cp-border)" }}>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold" style={{ color: "var(--cp-text)" }}>{m.name}</p>
                    <p className="text-xs" style={{ color: "var(--cp-text-muted)" }}>
                      {[m.dose, m.frequency].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveMed(m)}
                    aria-label={`Remove ${m.name}`}
                    className="w-8 h-8 rounded-full flex items-center justify-center text-lg hover:opacity-70"
                    style={{ color: "var(--cp-text-muted)" }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="space-y-2">
            <input
              type="text"
              value={medName}
              onChange={(e) => setMedName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleAddMed()}
              placeholder="Medication name (e.g. Aripiprazole)"
              className={`w-full ${inputClass}`}
              style={inputStyle}
            />
            <div className="flex gap-2">
              <input type="text" value={medDose} onChange={(e) => setMedDose(e.target.value)}
                placeholder="Dose (e.g. 5mg)" className={`flex-1 ${inputClass}`} style={inputStyle} />
              <input type="text" value={medFreq} onChange={(e) => setMedFreq(e.target.value)}
                placeholder="Frequency (e.g. daily)" className={`flex-1 ${inputClass}`} style={inputStyle} />
            </div>
            <button
              type="button"
              onClick={handleAddMed}
              disabled={!medName.trim() || addingMed}
              className="w-full py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-40"
              style={{ background: "var(--cp-teal)" }}
            >
              {addingMed ? "Adding…" : "Add medication"}
            </button>
          </div>
        </Section>

        <Section title="Symptom scale" subtitle="How severity is shown when logging. The saved value is 0–10 either way.">
          <RadioList
            label="Symptom scale"
            value={symptomScale}
            onChange={edit(setSymptomScale)}
            options={[
              { id: "numeric", label: "Numbers", sub: "A slider from 0 to 10" },
              { id: "words", label: "Words", sub: "None · Low · Medium · High" },
            ]}
          />
        </Section>

        <Section title="Symptoms" subtitle="Which symptoms are rated every day">
          <Chips items={symptoms} onRemove={(s) => removeFrom(symptoms, setSymptoms, s)} />
          <AddInput placeholder="e.g. Restlessness, Paranoia…" onAdd={(v) => addUnique(symptoms, setSymptoms, capitalize(v))} />
        </Section>

        <Section title="Tracking" subtitle="Daily measurements">
          {PRESET_TRACKING.map((t) => (
            <SwitchRow
              key={t.key}
              label={t.label}
              sub={t.sub}
              on={trackingModules.has(t.key)}
              onChange={(on) => {
                const next = new Set(trackingModules);
                if (on) next.add(t.key); else next.delete(t.key);
                setTrackingModules(next);
                setDirty(true);
              }}
            />
          ))}
          <p className="text-xs font-semibold uppercase tracking-wide pt-1" style={{ color: "var(--cp-text-muted)" }}>Custom vitals</p>
          <Chips
            items={customVitals.map(v => v.name)}
            labelFor={(name) => { const v = customVitals.find(c => c.name === name); return vitalLabel(name, v?.unit); }}
            onRemove={(name) => { setCustomVitals(customVitals.filter(v => v.name !== name)); setDirty(true); }}
          />
          <AddInput placeholder="e.g. Weight, Blood sugar…" onAdd={(v) => {
            // Name-only here; type and unit are set from the caregiver's Customize page.
            setCustomVitals(normalizeCustomVitals([...customVitals, { name: capitalize(v), type: "number" }]));
            setDirty(true);
          }} />
        </Section>

        <Section title="Activities" subtitle="Activity options in the daily log">
          <Chips items={activities} labelFor={activityLabel} onRemove={(a) => removeFrom(activities, setActivities, a)} />
          <AddInput
            placeholder="e.g. Swimming, Group therapy…"
            onAdd={(v) => addUnique(activities, setActivities, v.toLowerCase().replace(/\s+/g, "_"))}
          />
        </Section>

        <Section title="Substances" subtitle="Turn on what's relevant for this patient">
          <SwitchRow label="Cigarettes / tobacco" sub="Daily cigarette count" on={showCigarettes} onChange={edit(setShowCigarettes)} />
          <SwitchRow label="Alcohol" sub="Alcohol use and drinks" on={showAlcohol} onChange={edit(setShowAlcohol)} />
          <Chips items={customSubstances} onRemove={(s) => removeFrom(customSubstances, setCustomSubstances, s)} />
          <AddInput placeholder="Custom substance (e.g. Cannabis)" onAdd={(v) => addUnique(customSubstances, setCustomSubstances, capitalize(v))} />
        </Section>

        <Section title="Socialization" subtitle="Whether the patient left the house and who they saw">
          <SwitchRow label="Show socialization" sub="Include this section in the daily log" on={showSocialization} onChange={edit(setShowSocialization)} />
          <p className="text-xs font-semibold uppercase tracking-wide pt-1" style={{ color: "var(--cp-text-muted)" }}>
            Social contacts · saved immediately
          </p>
          {contacts.length === 0 && <p className="text-xs" style={{ color: "var(--cp-text-muted)" }}>No contacts yet.</p>}
          {contacts.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {contacts.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold"
                  style={{ background: "var(--cp-teal-light)", color: "var(--cp-teal)" }}
                >
                  {c.name}
                  <button type="button" onClick={() => handleRemoveContact(c)} aria-label={`Remove ${c.name}`} className="hover:opacity-70">
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <AddInput placeholder="e.g. Brother, Case manager…" onAdd={handleAddContact} busy={addingContact} />
        </Section>
      </div>

      {/* Sticky action bar, same as Build your view. */}
      <div className="fixed bottom-0 left-0 right-0 border-t px-4 py-3" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            style={{ background: "var(--cp-teal)" }}
          >
            {saving ? "Saving…" : "Save changes"}
          </button>
          {dirty && <span className="text-xs" style={{ color: "var(--cp-text-muted)" }}>Unsaved changes</span>}
        </div>
      </div>
    </div>
  );
}
