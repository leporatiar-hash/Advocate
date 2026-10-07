// Medication schedules: when is a dose actually due?
//
// Mirrors backend/services/med_schedule.py — keep the two in sync. Stored logs
// keep their legacy shape (a `taken: false` entry for every active med with no
// dose); readers filter at display time with removeFalseMisses.
//
// All date maths runs on YYYY-MM-DD strings at UTC midnight, so a caregiver's
// time zone can never shift which day a dose falls on.

import type { Medication, MedicationTaken, MedScheduleType } from "./types";

type ScheduledMed = Pick<Medication, "frequency"> & Partial<Pick<Medication,
  "schedule_type" | "schedule_interval_days" | "schedule_start_date" | "schedule_weekdays">>;

const AS_NEEDED_RE = /\b(as[\s-]*needed|prn|when[\s-]*needed|if[\s-]*needed|as[\s-]*required)\b/i;
const SCHEDULE_TYPES: MedScheduleType[] = ["daily", "every_n_days", "weekdays", "as_needed"];
export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const DAY_MS = 86_400_000;

function toUtc(dateStr: string): number {
  const [y, m, d] = dateStr.slice(0, 10).split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUtc(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

// Monday = 0 … Sunday = 6, matching Python's date.weekday().
function weekdayOf(dateStr: string): number {
  return (new Date(toUtc(dateStr)).getUTCDay() + 6) % 7;
}

export function scheduleTypeOf(med: ScheduledMed): MedScheduleType {
  if (med.schedule_type && SCHEDULE_TYPES.includes(med.schedule_type)) return med.schedule_type;
  return AS_NEEDED_RE.test(med.frequency ?? "") ? "as_needed" : "daily";
}

export function isAsNeeded(med: ScheduledMed): boolean {
  return scheduleTypeOf(med) === "as_needed";
}

// As-needed meds are never due. An incomplete schedule falls back to daily
// rather than hiding the med.
export function isDue(med: ScheduledMed, dateStr: string): boolean {
  const type = scheduleTypeOf(med);
  if (type === "as_needed") return false;
  if (type === "every_n_days") {
    const n = med.schedule_interval_days;
    if (!n || n < 1 || !med.schedule_start_date) return true;
    const diff = Math.round((toUtc(dateStr) - toUtc(med.schedule_start_date)) / DAY_MS);
    return ((diff % n) + n) % n === 0;
  }
  if (type === "weekdays") {
    const days = med.schedule_weekdays ?? [];
    return days.length === 0 || days.includes(weekdayOf(dateStr));
  }
  return true;
}

// The first date strictly after `dateStr` on which the med is due, or null
// for as-needed meds.
export function nextDueDate(med: ScheduledMed, dateStr: string): string | null {
  if (isAsNeeded(med)) return null;
  const start = toUtc(dateStr);
  for (let i = 1; i <= 366; i++) {
    const d = fromUtc(start + i * DAY_MS);
    if (isDue(med, d)) return d;
  }
  return null;
}

// "Thu, Oct 8" — formatted in UTC so it matches the date string exactly.
export function formatShortDate(dateStr: string): string {
  return new Date(toUtc(dateStr)).toLocaleDateString("en-US", {
    weekday: "short", month: "short", day: "numeric", timeZone: "UTC",
  });
}

export function scheduleLabel(med: ScheduledMed): string {
  const type = scheduleTypeOf(med);
  if (type === "as_needed") return "As needed";
  if (type === "every_n_days") {
    const n = med.schedule_interval_days;
    if (!n || n <= 1) return "Every day";
    return n === 2 ? "Every other day" : `Every ${n} days`;
  }
  if (type === "weekdays") {
    const days = [...(med.schedule_weekdays ?? [])].sort((a, b) => a - b);
    if (days.length === 0 || days.length === 7) return "Every day";
    return days.map(d => WEEKDAY_SHORT[d]).join(", ");
  }
  return "Every day";
}

// Drop `taken: false` entries that were never real misses: as-needed meds, and
// scheduled meds on a day they weren't due. Given doses always stay, as do
// entries for meds we can't look up.
export function removeFalseMisses<T extends Pick<MedicationTaken, "medication_id" | "taken">>(
  entries: T[] | null | undefined,
  meds: Array<ScheduledMed & { id: number }>,
  dateStr: string,
): T[] {
  const byId = new Map(meds.map(m => [m.id, m]));
  return (entries ?? []).filter(e => {
    if (e.taken) return true;
    const med = byId.get(e.medication_id);
    return !med || isDue(med, dateStr);
  });
}

// Stricter, for adherence numbers: as-needed meds are removed entirely.
export function adherenceEntries<T extends Pick<MedicationTaken, "medication_id" | "taken">>(
  entries: T[] | null | undefined,
  meds: Array<ScheduledMed & { id: number }>,
  dateStr: string,
): T[] {
  const byId = new Map(meds.map(m => [m.id, m]));
  return removeFalseMisses(entries, meds, dateStr).filter(e => {
    const med = byId.get(e.medication_id);
    return !med || !isAsNeeded(med);
  });
}

// Logs with medications_taken reduced to scheduled doses, for pages whose
// charts compute adherence client-side (Insights).
export function withAdherenceDoses<L extends { date: string; medications_taken: MedicationTaken[] | null }>(
  logs: L[],
  meds: Array<ScheduledMed & { id: number }>,
): L[] {
  return logs.map(l => ({ ...l, medications_taken: adherenceEntries(l.medications_taken, meds, l.date) }));
}

// ── Usual dose times ─────────────────────────────────────────────────────────
// Stored in Medication.time_of_day as a comma list, e.g. "morning,night,after_meals".
// Older meds hold a single word ("Morning", "noon", "evening"), which parses the same way.

export const DOSE_SLOTS = [
  { key: "morning", label: "Morning", time: "08:00" },
  { key: "afternoon", label: "Afternoon", time: "13:00" },
  { key: "evening", label: "Evening", time: "18:00" },
  { key: "night", label: "Night", time: "21:00" },
] as const;
export type DoseSlot = (typeof DOSE_SLOTS)[number];
export const AFTER_MEALS = "after_meals";

const SLOT_ALIASES: Record<string, string> = { noon: "afternoon", midday: "afternoon", bedtime: "night" };

export function parseDoseTimes(timeOfDay: string | null | undefined): { slots: DoseSlot[]; afterMeals: boolean } {
  const parts = (timeOfDay ?? "").split(",").map(p => p.trim().toLowerCase()).filter(Boolean);
  const keys = new Set(parts.map(p => SLOT_ALIASES[p] ?? p));
  return {
    slots: DOSE_SLOTS.filter(s => keys.has(s.key)),
    afterMeals: keys.has(AFTER_MEALS) || keys.has("after meals") || keys.has("with meals"),
  };
}

export function serializeDoseTimes(slotKeys: string[], afterMeals: boolean): string {
  const ordered = DOSE_SLOTS.filter(s => slotKeys.includes(s.key)).map(s => s.key);
  return [...ordered, ...(afterMeals ? [AFTER_MEALS] : [])].join(",");
}

// "Morning & Night · after meals"
export function doseTimesLabel(timeOfDay: string | null | undefined): string {
  const { slots, afterMeals } = parseDoseTimes(timeOfDay);
  const names = slots.map(s => s.label);
  const when = names.length <= 2 ? names.join(" & ") : `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}`;
  return [when, afterMeals ? (when ? "after meals" : "After meals") : ""].filter(Boolean).join(" · ");
}
