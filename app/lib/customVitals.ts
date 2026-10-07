// Caregiver-defined vitals and lab values (Settings → Customize). Readings
// live in DailyLog.vitals.custom as { [name]: { value, unit } }.

import type { CustomVital, CustomVitalReading } from "./types";

// Older configs stored bare names; treat those as number vitals with no unit.
export function normalizeCustomVitals(raw: Array<CustomVital | string> | null | undefined): CustomVital[] {
  const seen = new Set<string>();
  const out: CustomVital[] = [];
  for (const v of raw ?? []) {
    const vital: CustomVital = typeof v === "string"
      ? { name: v, type: "number" }
      : { name: v.name, type: v.type === "text" ? "text" : "number", ...(v.unit?.trim() ? { unit: v.unit.trim() } : {}) };
    const key = vital.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push({ ...vital, name: vital.name.trim() });
  }
  return out;
}

// "Clozapine plasma (ng/mL)"
export function vitalLabel(name: string, unit?: string | null): string {
  return unit ? `${name} (${unit})` : name;
}

// "410 ng/mL"
export function formatReading(r: CustomVitalReading): string {
  return r.unit ? `${r.value} ${r.unit}` : r.value;
}

// Non-blank custom readings from a stored log's vitals object.
export function customReadings(vitals: unknown): Record<string, CustomVitalReading> {
  const custom = (vitals as { custom?: Record<string, unknown> } | null | undefined)?.custom;
  const out: Record<string, CustomVitalReading> = {};
  if (!custom || typeof custom !== "object") return out;
  for (const [name, raw] of Object.entries(custom)) {
    const r = raw && typeof raw === "object" ? raw as { value?: unknown; unit?: unknown } : { value: raw };
    const value = r.value == null ? "" : String(r.value).trim();
    if (!value) continue;
    out[name] = { value, unit: typeof r.unit === "string" && r.unit ? r.unit : null };
  }
  return out;
}
