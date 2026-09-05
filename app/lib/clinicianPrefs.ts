// Demo-local clinician view preferences.
//
// There is still no per-clinician server-side config, so this remains a
// client-only store scoped to one browser. Once clinician accounts carry
// preferences, this MUST move server-side — do not extend the localStorage
// approach into a permanent feature.
//
// v2 replaces v1's four fixed booleans with an ordered, toggleable module list,
// so a clinician can reorder the dashboard as well as hide parts of it. v1
// values are migrated on first read rather than discarded, so anyone who
// customised the old build keeps their choices.

const STORAGE_KEY = "advocate.clinicianPrefs.v2";
const LEGACY_KEY = "advocate.clinicianPrefs.v1";

export type ModuleId =
  | "summary"
  | "alerts"
  | "symptomCharts"
  | "smallMultiples"
  | "adherenceChart"
  | "trajectory"
  | "symptomFrequency"
  | "medAdherence"
  | "rawNotes";

export interface ClinicianModule {
  id: ModuleId;
  on: boolean;
}

export type ViewMode = "detailed" | "quick";

export interface ClinicianPrefs {
  modules: ClinicianModule[];
  viewMode: ViewMode;
}

/** Display metadata, kept out of storage so labels can change without a
 *  migration. Order here is the default dashboard order. */
export const MODULE_META: { id: ModuleId; label: string; description: string }[] = [
  { id: "summary", label: "AI Summary", description: "Notes synthesis with source-linked insights" },
  { id: "alerts", label: "Alerts & Positives", description: "Caregiver alert beside what went well" },
  { id: "symptomCharts", label: "Symptom Trends", description: "All symptoms on one severity chart" },
  { id: "smallMultiples", label: "Per-Symptom Charts", description: "One mini chart per symptom" },
  { id: "adherenceChart", label: "Adherence Trend", description: "Daily medication adherence over time" },
  { id: "trajectory", label: "Temporal Strip", description: "Multi-month adaptive trajectory" },
  { id: "symptomFrequency", label: "Symptom Frequency", description: "Days present and average severity" },
  { id: "medAdherence", label: "Adherence by Medication", description: "Per-drug taken vs expected" },
  { id: "rawNotes", label: "Raw Notes", description: "Caregiver notes, chronological" },
];

export const DEFAULT_CLINICIAN_PREFS: ClinicianPrefs = {
  modules: MODULE_META.map((m) => ({ id: m.id, on: true })),
  viewMode: "detailed",
};

export function moduleLabel(id: ModuleId): string {
  return MODULE_META.find((m) => m.id === id)?.label ?? id;
}

export function moduleDescription(id: ModuleId): string {
  return MODULE_META.find((m) => m.id === id)?.description ?? "";
}

/**
 * Reconcile a stored prefs object against the known module set: drop entries
 * that no longer exist, and append modules added since the prefs were saved
 * (on by default, so a new section is never invisible to someone with saved
 * prefs). Also backfills `viewMode` for prefs saved before it existed.
 */
function reconcile(stored: { modules: ClinicianModule[]; viewMode?: string }): ClinicianPrefs {
  const known = new Set(MODULE_META.map((m) => m.id));
  const seen = new Set<ModuleId>();
  const modules: ClinicianModule[] = [];

  for (const m of stored.modules) {
    if (!known.has(m.id) || seen.has(m.id)) continue;
    seen.add(m.id);
    modules.push({ id: m.id, on: m.on !== false });
  }
  for (const meta of MODULE_META) {
    if (!seen.has(meta.id)) modules.push({ id: meta.id, on: true });
  }
  const viewMode: ViewMode = stored.viewMode === "quick" ? "quick" : "detailed";
  return { modules, viewMode };
}

/** v1 stored four booleans and no ordering. Map them onto the new list. */
function migrateLegacy(raw: string): ClinicianPrefs | null {
  try {
    const old = JSON.parse(raw) as Record<string, boolean>;
    const map: Partial<Record<ModuleId, string>> = {
      trajectory: "showTrajectory",
      symptomFrequency: "showSymptomFrequency",
      medAdherence: "showMedAdherence",
      rawNotes: "showRawNotes",
    };
    return reconcile({
      modules: MODULE_META.map((meta) => {
        const legacyKey = map[meta.id];
        return { id: meta.id, on: legacyKey ? old[legacyKey] !== false : true };
      }),
    });
  } catch {
    return null;
  }
}

export function loadClinicianPrefs(): ClinicianPrefs {
  if (typeof window === "undefined") return DEFAULT_CLINICIAN_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ClinicianPrefs>;
      if (Array.isArray(parsed?.modules)) return reconcile({ modules: parsed.modules, viewMode: parsed.viewMode });
      return DEFAULT_CLINICIAN_PREFS;
    }
    const legacy = window.localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const migrated = migrateLegacy(legacy);
      if (migrated) {
        saveClinicianPrefs(migrated);
        return migrated;
      }
    }
    return DEFAULT_CLINICIAN_PREFS;
  } catch {
    // Storage unavailable (private mode, disabled storage, quota, corrupt
    // JSON) — fall back to in-memory defaults, never throw.
    return DEFAULT_CLINICIAN_PREFS;
  }
}

export function saveClinicianPrefs(prefs: ClinicianPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // A failed write just means this session's choice won't survive reload.
  }
}

export function resetClinicianPrefs(): ClinicianPrefs {
  if (typeof window !== "undefined") {
    try {
      window.localStorage.removeItem(STORAGE_KEY);
      window.localStorage.removeItem(LEGACY_KEY);
    } catch {
      /* ignore */
    }
  }
  return DEFAULT_CLINICIAN_PREFS;
}

/** True when a module is present and enabled. */
export function isOn(prefs: ClinicianPrefs, id: ModuleId): boolean {
  return prefs.modules.find((m) => m.id === id)?.on ?? true;
}

/** Enabled modules in the clinician's chosen order. */
export function orderedEnabled(prefs: ClinicianPrefs): ModuleId[] {
  return prefs.modules.filter((m) => m.on).map((m) => m.id);
}
