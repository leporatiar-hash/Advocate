// Demo-only clinician timeline (Radial pilot conversation) — NOT the
// production clinician portal. This app already has a general, roster-based
// clinician portal (role === "clinician" -> /clinician, pick a patient from
// the list) built for a different feature; that keeps working for every
// other clinician account. This ONE seeded demo account is the exception:
// "A clinician has no dashboard, no patient list, no navigation. One
// patient, one view" (see backend/scripts/seed_demo_patient.py) describes
// this specific pilot login, not a change to clinician accounts generally.
// Matched by email rather than a real per-account flag because the whole
// build is explicitly hardcoded, no linking table — see the spec this was
// built from.
export const DEMO_CLINICIAN_EMAIL = "demo.clinician@advocate.health";
export const DEMO_TIMELINE_PATIENT_ID = 999999;

// The demo account opens straight onto Marcus in the regular clinician
// dashboard (Quick View + Configure). The standalone timeline view is retired;
// its old URL redirects here too.
export const DEMO_PATIENT_DASHBOARD = `/clinician/dashboard/?patient_id=${DEMO_TIMELINE_PATIENT_ID}`;

export function isDemoTimelineClinician(email: string | undefined | null): boolean {
  return (email ?? "").toLowerCase() === DEMO_CLINICIAN_EMAIL;
}

// caregiver -> /dashboard and patient -> /dashboard, both unchanged from
// before this feature existed — only the clinician branch is new.
export function postLoginDestination(role: string, email: string | undefined | null): string {
  if (role === "clinician") {
    return isDemoTimelineClinician(email) ? DEMO_PATIENT_DASHBOARD : "/clinician";
  }
  return "/dashboard";
}
