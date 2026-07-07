function normalizeApiBase(rawValue: string | undefined): string {
  const fallback = "http://localhost:8000";
  if (!rawValue) return fallback;

  let value = rawValue.trim().replace(/^["'`]|["'`]$/g, "").replace(/\/+$/, "");
  if (!value) return fallback;
  if (value.startsWith("/")) return value;

  // Common env typo in dashboards: "ttps://..." (missing leading "h")
  if (value.startsWith("ttps://")) value = `h${value}`;
  if (value.startsWith("//")) value = `https:${value}`;
  if (!/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value)) value = `https://${value}`;

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error(
      `Invalid NEXT_PUBLIC_API_URL: "${rawValue}". Use a full URL like https://truefit-meds-production.up.railway.app`
    );
  }

  if (!["http:", "https:"].includes(parsed.protocol)) {
    throw new Error(
      `Invalid NEXT_PUBLIC_API_URL protocol: "${parsed.protocol}". Only http:// or https:// are supported`
    );
  }

  return parsed.origin;
}

const API_BASE = normalizeApiBase(process.env.NEXT_PUBLIC_API_URL);

const ACCESS_TOKEN_KEY = "access_token";
const USER_KEY = "user";
export const AUTH_EXPIRED_EVENT = "auth-expired";

export function getStoredAccessToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setStoredAccessToken(token: string | null): void {
  if (typeof window === "undefined") return;
  if (token) {
    window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
  } else {
    window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  }
}

export function clearStoredAuth(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ACCESS_TOKEN_KEY);
  window.localStorage.removeItem(USER_KEY);
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  const token = getStoredAccessToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
    credentials: "include",
    // Never serve stale API data from the browser cache
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 401) {
      clearStoredAuth();
    }
    const err = await res.json().catch(() => ({ detail: `HTTP ${res.status}` }));
    throw new Error(err.detail || `HTTP ${res.status}`);
  }

  // 204 No Content
  if (res.status === 204) return undefined as T;

  return res.json();
}

export const api = {
  // Auth
  register: (data: object) =>
    request("/auth/register", { method: "POST", body: JSON.stringify(data) }),
  login: (data: object) =>
    request("/auth/login", { method: "POST", body: JSON.stringify(data) }),
  logout: () =>
    request("/auth/logout", { method: "POST" }),
  me: () => request("/auth/me"),

  // Patients
  createPatient: (data: object) =>
    request("/patients/", { method: "POST", body: JSON.stringify(data) }),
  getPatients: () => request("/patients/"),
  getPatient: (id: number) => request(`/patients/${id}`),
  updatePatient: (id: number, data: object) =>
    request(`/patients/${id}`, { method: "PATCH", body: JSON.stringify(data) }),
  generateConfig: (patientId: number, data: object) =>
    request(`/patients/${patientId}/generate-config`, { method: "POST", body: JSON.stringify(data) }),
  completeOnboardingSurvey: (data: object) =>
    request("/onboarding/config", { method: "POST", body: JSON.stringify(data) }),

  // Medications
  addMedication: (patientId: number, data: object) =>
    request(`/patients/${patientId}/medications`, { method: "POST", body: JSON.stringify(data) }),
  updateMedication: (id: number, data: object) =>
    request(`/medications/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteMedication: (id: number) =>
    request(`/medications/${id}`, { method: "DELETE" }),
  getKnownSideEffects: (medId: number) =>
    request(`/medications/${medId}/known-side-effects`),

  // Treatment Plan
  getTreatmentPlan: (patientId: number) =>
    request(`/patients/${patientId}/treatment-plan`),
  saveTreatmentPlan: (patientId: number, data: object) =>
    request(`/patients/${patientId}/treatment-plan`, { method: "POST", body: JSON.stringify(data) }),

  // Logs
  createLog: (data: object) =>
    request("/logs/", { method: "POST", body: JSON.stringify(data) }),
  getLogs: (patientId: number, opts?: { days?: number; includePhoto?: boolean }) => {
    const params = new URLSearchParams();
    if (opts?.days) params.set("days", String(opts.days));
    if (opts?.includePhoto) params.set("include_photo", "true");
    const qs = params.toString();
    return request(`/logs/${patientId}${qs ? `?${qs}` : ""}`);
  },
  getTodayLog: (patientId: number) => request(`/logs/${patientId}/today?date=${localDateStr()}`),
  getLogByDate: (patientId: number, date: string) => request(`/logs/${patientId}/date/${date}`),
  getMissedDays: (patientId: number) => request(`/logs/${patientId}/missed-days`),
  quickLog: (patientId: number, date: string, type: string, note?: string) =>
    request(`/logs/${patientId}/quick`, { method: "POST", body: JSON.stringify({ date, type, note }) }),

  // User config
  updateUserConfig: (updates: object) =>
    request("/auth/config", { method: "PATCH", body: JSON.stringify({ updates }) }),

  // Summary
  generateSummary: (patientId: number, startDate?: string, endDate?: string) => {
    const params = new URLSearchParams();
    if (startDate) params.set("start_date", startDate);
    if (endDate) params.set("end_date", endDate);
    const qs = params.toString();
    return request(`/summary/${patientId}${qs ? `?${qs}` : ""}`, { method: "POST" });
  },
  saveSummary: (data: object) =>
    request("/summaries/save", { method: "POST", body: JSON.stringify(data) }),
  getSavedSummaries: () =>
    request("/summaries/"),
  deleteSavedSummary: (id: number) =>
    request(`/summaries/${id}`, { method: "DELETE" }),

  // Social contacts
  getSocialContacts: () => request("/api/social-contacts/"),
  createSocialContact: (name: string) =>
    request("/api/social-contacts/", { method: "POST", body: JSON.stringify({ name }) }),
  deleteSocialContact: (id: number) =>
    request(`/api/social-contacts/${id}`, { method: "DELETE" }),

  // Assessments
  getInstrumentDefinitions: () => request("/assessments/instruments"),
  getAssessmentStatus: (patientId: number) => request(`/assessments/${patientId}/status`),
  getAssessments: (patientId: number, instrumentKey?: string) =>
    request(`/assessments/${patientId}${instrumentKey ? `?instrument_key=${instrumentKey}` : ""}`),
  createAssessment: (data: object) =>
    request("/assessments/", { method: "POST", body: JSON.stringify(data) }),

  // Password reset
  forgotPassword: (email: string) =>
    request("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) }),
  resetPassword: (token: string, new_password: string) =>
    request("/auth/reset-password", { method: "POST", body: JSON.stringify({ token, new_password }) }),
};

// Utility: get local date string (YYYY-MM-DD) — avoids UTC offset shifting the date
export function localDateStr(d: Date = new Date()): string {
  return [
    d.getFullYear(),
    String(d.getMonth() + 1).padStart(2, "0"),
    String(d.getDate()).padStart(2, "0"),
  ].join("-");
}

// Utility: calculate streak from log array
export function calculateStreak(logs: Array<{ date: string }>): number {
  if (!logs.length) return 0;
  const dateSet = new Set(logs.map((l) => l.date));
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  let streak = 0;
  const cur = new Date(today);

  // Allow today to not be logged yet (check from yesterday in that case)
  const todayStr = localDateStr(cur);
  if (!dateSet.has(todayStr)) {
    cur.setDate(cur.getDate() - 1);
  }

  while (true) {
    const s = localDateStr(cur);
    if (dateSet.has(s)) {
      streak++;
      cur.setDate(cur.getDate() - 1);
    } else {
      break;
    }
  }
  return streak;
}
