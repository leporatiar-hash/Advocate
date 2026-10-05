import RedirectToDashboard from "./RedirectToDashboard";

// Retired demo timeline route: now redirects to the patient's regular
// clinician dashboard. Kept (rather than deleted) so old links still land.
// A true dynamic segment works under this app's `output: "export"` only because the demo is single-patient by
// design (see the spec this was built from: no patient list, no linking
// flow — the association is hardcoded). MARCUS_PATIENT_ID here must match
// backend/scripts/seed_demo_patient.py's reserved ID exactly, or the
// statically-generated page for that ID won't exist.
const MARCUS_PATIENT_ID = 999999;

export function generateStaticParams() {
  return [{ patientId: String(MARCUS_PATIENT_ID) }];
}

export default async function ClinicianTimelinePage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  return <RedirectToDashboard patientId={Number(patientId)} />;
}
