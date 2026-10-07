import ConfigureClient from "./ConfigureClient";

// Demo-only, like the timeline next door: the backend 404s for any patient
// that isn't is_demo. Must match MARCUS_PATIENT_ID in ../page.tsx and
// backend/scripts/seed_demo_patient.py, or this page won't be exported.
const MARCUS_PATIENT_ID = 999999;

export function generateStaticParams() {
  return [{ patientId: String(MARCUS_PATIENT_ID) }];
}

export default async function ClinicianConfigurePatientPage({
  params,
}: {
  params: Promise<{ patientId: string }>;
}) {
  const { patientId } = await params;
  return <ConfigureClient patientId={Number(patientId)} />;
}
