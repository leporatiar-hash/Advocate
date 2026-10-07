"use client";

import { useState } from "react";
import toast from "react-hot-toast";
import { api, localDateStr } from "../lib/api";
import { WEEKDAY_SHORT, scheduleLabel, scheduleTypeOf } from "../lib/medSchedule";
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

const HOW_OFTEN: { type: MedScheduleType; label: string }[] = [
  { type: "daily", label: "Every day" },
  { type: "every_n_days", label: "Every few days" },
  { type: "weekdays", label: "Certain days" },
  { type: "as_needed", label: "As needed" },
];

const TIMES = ["morning", "noon", "night"];
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
  const [type, setType] = useState<MedScheduleType>(initial ? scheduleTypeOf(initial) : "daily");
  const [interval, setIntervalDays] = useState(String(initial?.schedule_interval_days ?? 2));
  const [startDate, setStartDate] = useState(initial?.schedule_start_date ?? localDateStr());
  const [weekdays, setWeekdays] = useState<number[]>(initial?.schedule_weekdays ?? []);
  const [timeOfDay, setTimeOfDay] = useState(TIMES.includes(initial?.time_of_day ?? "") ? initial!.time_of_day : "");
  const [saving, setSaving] = useState(false);

  const intervalNum = Number(interval);
  const intervalValid = Number.isInteger(intervalNum) && intervalNum >= 2 && intervalNum <= 365;
  const valid = name.trim().length > 0
    && (type !== "every_n_days" || (intervalValid && !!startDate))
    && (type !== "weekdays" || weekdays.length > 0);

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
        time_of_day: timeOfDay,
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
          {HOW_OFTEN.map(o => (
            <button key={o.type} type="button" onClick={() => setType(o.type)}
              aria-pressed={type === o.type}
              className="py-2.5 rounded-xl border text-sm font-semibold transition-all"
              style={pill(type === o.type)}>
              {o.label}
            </button>
          ))}
        </div>

        {type === "every_n_days" && (
          <div className="rounded-xl p-3 space-y-2" style={{ background: "#f8fcf9", border: "1px solid #d4e0d7" }}>
            <label className="flex items-center gap-2 text-sm text-slate-600">
              Every
              <input
                type="number" inputMode="numeric" min={2} max={365} value={interval}
                onChange={e => setIntervalDays(e.target.value)}
                className="w-16 px-2 py-1.5 rounded-lg border border-slate-200 text-base text-navy text-center focus:outline-none bg-white"
              />
              days
            </label>
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

      <div className="space-y-2">
        <p className="text-sm font-semibold text-slate-600">Usual time <span className="font-normal text-slate-400">(optional)</span></p>
        <div className="flex gap-2">
          {TIMES.map(t => (
            <button key={t} type="button" onClick={() => setTimeOfDay(prev => prev === t ? "" : t)}
              aria-pressed={timeOfDay === t}
              className="flex-1 py-2 rounded-xl border text-sm font-medium capitalize transition-all"
              style={pill(timeOfDay === t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

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
          {saving ? "Saving…" : submitLabel ?? (initial ? "Save changes" : "Add medication")}
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
              {[med.dose, scheduleLabel(med), med.time_of_day].filter(Boolean).join(" · ")}
            </p>
            <p className="text-xs font-semibold" style={{ color: GREEN }}>Tap to edit</p>
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
