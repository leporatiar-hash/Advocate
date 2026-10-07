"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { api, localDateStr } from "../lib/api";
import { DOSE_SLOTS, WEEKDAY_SHORT, doseTimesLabel, parseDoseTimes, scheduleLabel, scheduleTypeOf, serializeDoseTimes } from "../lib/medSchedule";
import type { Medication, MedScheduleType } from "../lib/types";

// Add or edit a medication, including how often it's taken. Shared by
// Settings → Customize and the daily log's "Manage medications" panel.
// Editing goes through PUT so the med keeps one record and its history.

export interface MedicationFormValues {
  name: string;
  dose: string;
  frequency: string; // legacy free text — filled with the schedule label
  time_of_day: string;
  schedule_type: MedScheduleType;
  schedule_interval_days: number | null;
  schedule_start_date: string | null;
  schedule_weekdays: number[] | null;
}

// "Every other day" is every_n_days with an interval of 2 — split out because
// it's by far the most common interval and shouldn't need a number field.
type HowOften = "daily" | "every_other_day" | "weekdays" | "every_n_days" | "as_needed";
const HOW_OFTEN: { key: HowOften; label: string }[] = [
  { key: "daily", label: "Every day" },
  { key: "every_other_day", label: "Every other day" },
  { key: "weekdays", label: "Certain days" },
  { key: "every_n_days", label: "Every few days" },
  { key: "as_needed", label: "As needed" },
];

function howOftenOf(med: Medication | undefined): HowOften {
  if (!med) return "daily";
  const type = scheduleTypeOf(med);
  if (type === "every_n_days" && (med.schedule_interval_days ?? 2) === 2) return "every_other_day";
  return type;
}

const GREEN = "#4a7c59";

export function MedicationForm({
  initial, onSubmit, onCancel, submitLabel,
}: {
  initial?: Medication;
  onSubmit: (values: MedicationFormValues) => Promise<void>;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [dose, setDose] = useState(initial?.dose ?? "");
  const [howOften, setHowOften] = useState<HowOften>(howOftenOf(initial));
  const [interval, setIntervalDays] = useState(String(
    initial?.schedule_interval_days && initial.schedule_interval_days > 2 ? initial.schedule_interval_days : 3));
  const [startDate, setStartDate] = useState(initial?.schedule_start_date ?? localDateStr());
  const [weekdays, setWeekdays] = useState<number[]>(initial?.schedule_weekdays ?? []);
  const initialTimes = parseDoseTimes(initial?.time_of_day);
  const [slots, setSlots] = useState<string[]>(initialTimes.slots.map(s => s.key));
  const [afterMeals, setAfterMeals] = useState(initialTimes.afterMeals);
  const [saving, setSaving] = useState(false);

  const type: MedScheduleType = howOften === "every_other_day" ? "every_n_days" : howOften;
  const intervalNum = howOften === "every_other_day" ? 2 : Number(interval);
  const intervalValid = Number.isInteger(intervalNum) && intervalNum >= 2 && intervalNum <= 365;
  const valid = name.trim().length > 0
    && (type !== "every_n_days" || (intervalValid && !!startDate))
    && (type !== "weekdays" || weekdays.length > 0);

  function toggleSlot(key: string) {
    setSlots(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
  }

  function toggleWeekday(d: number) {
    setWeekdays(prev => prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d].sort((a, b) => a - b));
  }

  async function submit() {
    if (!valid || saving) return;
    const schedule = {
      schedule_type: type,
      schedule_interval_days: type === "every_n_days" ? intervalNum : null,
      schedule_start_date: type === "every_n_days" ? startDate : null,
      schedule_weekdays: type === "weekdays" ? weekdays : null,
    };
    setSaving(true);
    try {
      await onSubmit({
        name: name.trim(),
        dose: dose.trim(),
        frequency: scheduleLabel({ frequency: "", ...schedule }),
        // As-needed meds have no usual time; anything else keeps what was picked.
        time_of_day: type === "as_needed" ? serializeDoseTimes([], afterMeals) : serializeDoseTimes(slots, afterMeals),
        ...schedule,
      });
    } finally {
      setSaving(false);
    }
  }

  const pill = (active: boolean) => ({
    borderColor: active ? GREEN : "#CBD5E1",
    background: active ? GREEN : "white",
    color: active ? "white" : "#64748B",
  });

  return (
    <div className="space-y-3">
      <input
        type="text" value={name} onChange={e => setName(e.target.value)}
        placeholder="Medication name (e.g. Clozapine)"
        aria-label="Medication name"
        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-base text-navy focus:outline-none bg-white"
      />
      <input
        type="text" value={dose} onChange={e => setDose(e.target.value)}
        placeholder="Dose (e.g. 200mg)"
        aria-label="Dose"
        className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-base text-navy focus:outline-none bg-white"
      />

      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-600">How often?</p>
        <div className="grid grid-cols-2 gap-2">
          {HOW_OFTEN.map((o, i) => (
            <button key={o.key} type="button" onClick={() => setHowOften(o.key)}
              aria-pressed={howOften === o.key}
              className={`py-2.5 rounded-xl border text-sm font-semibold transition-all${i === HOW_OFTEN.length - 1 ? " col-span-2" : ""}`}
              style={pill(howOften === o.key)}>
              {o.label}
            </button>
          ))}
        </div>

        {type === "every_n_days" && (
          <div className="rounded-xl p-3 space-y-2" style={{ background: "#f8fcf9", border: "1px solid #d4e0d7" }}>
            {howOften === "every_n_days" && (
              <label className="flex items-center gap-2 text-sm text-slate-600">
                Every
                <input
                  type="number" inputMode="numeric" min={2} max={365} value={interval}
                  onChange={e => setIntervalDays(e.target.value)}
                  className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 text-base text-navy text-center focus:outline-none bg-white"
                />
                days
              </label>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-600 flex-wrap">
              A day it&apos;s taken
              <input
                type="date" value={startDate} onChange={e => setStartDate(e.target.value)}
                className="px-2 py-1.5 rounded-lg border border-slate-200 text-base text-navy focus:outline-none bg-white"
              />
            </label>
            {!intervalValid && <p className="text-xs" style={{ color: "#B91C1C" }}>Enter a number from 2 to 365.</p>}
            <p className="text-xs text-slate-400">If a dose is given a day late, move this date to keep the schedule in step.</p>
          </div>
        )}

        {type === "weekdays" && (
          <div className="grid grid-cols-7 gap-1">
            {WEEKDAY_SHORT.map((label, d) => (
              <button key={label} type="button" onClick={() => toggleWeekday(d)}
                aria-pressed={weekdays.includes(d)}
                className="py-2 rounded-lg border text-xs font-semibold transition-all"
                style={pill(weekdays.includes(d))}>
                {label}
              </button>
            ))}
          </div>
        )}

        {type === "as_needed" && (
          <p className="text-sm text-slate-500 rounded-xl px-3 py-2" style={{ background: "#f8fcf9", border: "1px solid #d4e0d7" }}>
            Only log it on days it&apos;s given. As-needed medications are never counted as missed.
          </p>
        )}
      </div>

      {type !== "as_needed" && (
        <div className="space-y-2">
          <p className="text-sm font-semibold text-slate-600">
            When is it taken? <span className="font-normal text-slate-400">(pick all that apply)</span>
          </p>
          <div className="grid grid-cols-4 gap-1.5">
            {DOSE_SLOTS.map(slot => (
              <button key={slot.key} type="button" onClick={() => toggleSlot(slot.key)}
                aria-pressed={slots.includes(slot.key)}
                className="py-2 rounded-xl border text-xs font-semibold transition-all"
                style={pill(slots.includes(slot.key))}>
                {slot.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setAfterMeals(v => !v)}
            aria-pressed={afterMeals}
            className="w-full py-2 rounded-xl border text-sm font-semibold transition-all"
            style={pill(afterMeals)}>
            {afterMeals ? "✓ " : ""}After meals
          </button>
          {slots.length > 1 && (
            <p className="text-xs text-slate-400">The daily log will show a button for each of these times.</p>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel}
            className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-500 bg-white">
            Cancel
          </button>
        )}
        <button type="button" onClick={submit} disabled={!valid || saving}
          className="flex-1 py-2.5 rounded-xl text-white font-semibold text-sm transition-all disabled:opacity-40"
          style={{ background: GREEN }}>
          {saving ? "Saving…" : submitLabel ?? (initial ? "Save medication" : "Add medication")}
        </button>
      </div>
    </div>
  );
}

// The list of active meds with tap-to-edit in place, a remove button and an
// add form. Edits are PUTs (never delete + re-add) so a med's history stays on
// one record.
export function MedicationManager({
  patientId, medications, onAdded, onUpdated, onRemoved,
}: {
  patientId: number;
  medications: Medication[];
  onAdded: (med: Medication) => void;
  onUpdated: (med: Medication) => void;
  onRemoved: (medId: number) => void;
}) {
  const [editingId, setEditingId] = useState<number | null>(null);
  const [adding, setAdding] = useState(false);
  const [formKey, setFormKey] = useState(0);
  const active = medications.filter(m => m.active);

  async function add(values: MedicationFormValues) {
    try {
      const added = await api.addMedication(patientId, values) as Medication;
      onAdded(added);
      setFormKey(k => k + 1); // reset the form
      setAdding(false);
      toast.success(`${added.name} added`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to add medication");
    }
  }

  async function save(med: Medication, values: MedicationFormValues) {
    try {
      const updated = await api.updateMedication(med.id, values) as Medication;
      onUpdated(updated);
      setEditingId(null);
      toast.success(`${updated.name} updated`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to update medication");
    }
  }

  async function remove(med: Medication) {
    if (!window.confirm(`Remove ${med.name}? Past logs keep its history.`)) return;
    try {
      await api.deleteMedication(med.id);
      onRemoved(med.id);
      toast.success(`${med.name} removed`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to remove medication");
    }
  }

  return (
    <div className="space-y-3">
      {active.length === 0 && <p className="text-sm text-slate-400">No medications added yet.</p>}
      {active.map(med => editingId === med.id ? (
        <div key={med.id} className="rounded-xl p-3 border-2" style={{ borderColor: "#d4e0d7", background: "white" }}>
          <MedicationForm initial={med} onSubmit={v => save(med, v)} onCancel={() => setEditingId(null)} />
        </div>
      ) : (
        <div key={med.id} className="flex items-center gap-2 bg-white rounded-xl px-3 py-2.5 border border-slate-100">
          <button type="button" onClick={() => setEditingId(med.id)} className="flex-1 text-left min-w-0"
            aria-label={`Edit ${med.name}`}>
            <p className="text-base font-semibold text-navy truncate">{med.name}</p>
            <p className="text-sm text-slate-500">
              {[med.dose, scheduleLabel(med), scheduleTypeOf(med) === "as_needed" ? "" : doseTimesLabel(med.time_of_day)].filter(Boolean).join(" · ")}
            </p>
          </button>
          <button type="button" onClick={() => setEditingId(med.id)}
            className="px-3 py-1.5 rounded-lg border text-sm font-semibold flex-shrink-0"
            style={{ borderColor: "#d4e0d7", color: GREEN }}>
            Edit
          </button>
          <button type="button" onClick={() => remove(med)}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors text-lg leading-none flex-shrink-0"
            aria-label={`Remove ${med.name}`}>
            ×
          </button>
        </div>
      ))}
      {adding ? (
        <div className="rounded-xl p-3 border-2" style={{ borderColor: "#d4e0d7", background: "white" }}>
          <MedicationForm key={formKey} onSubmit={add} onCancel={() => setAdding(false)} />
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className="w-full py-2.5 rounded-xl text-white font-semibold text-sm"
          style={{ background: GREEN }}>
          + Add medication
        </button>
      )}
    </div>
  );
}
