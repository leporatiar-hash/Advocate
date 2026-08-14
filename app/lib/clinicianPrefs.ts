// Demo-local clinician view preferences.
//
// There is no clinician login yet, so there is no account to persist these
// to — this is a client-only store scoped to one browser, not a real
// preferences system. Once clinician accounts exist, this MUST be replaced
// with per-clinician server-persisted config; do not extend this localStorage
// approach into a permanent feature.
const STORAGE_KEY = "advocate.clinicianPrefs.v1";

export interface ClinicianPrefs {
  showTrajectory: boolean;
  showSymptomFrequency: boolean;
  showMedAdherence: boolean;
  showRawNotes: boolean;
}

export const DEFAULT_CLINICIAN_PREFS: ClinicianPrefs = {
  showTrajectory: true,
  showSymptomFrequency: true,
  showMedAdherence: true,
  showRawNotes: true,
};

export function loadClinicianPrefs(): ClinicianPrefs {
  if (typeof window === "undefined") return DEFAULT_CLINICIAN_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_CLINICIAN_PREFS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CLINICIAN_PREFS, ...parsed };
  } catch {
    // Storage unavailable (private mode, disabled storage, quota, corrupt
    // JSON, etc.) — fall back to in-memory defaults, never throw.
    return DEFAULT_CLINICIAN_PREFS;
  }
}

export function saveClinicianPrefs(prefs: ClinicianPrefs): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // Same fallback as above — a failed write just means this session's
    // choice won't survive reload, not a crash.
  }
}
