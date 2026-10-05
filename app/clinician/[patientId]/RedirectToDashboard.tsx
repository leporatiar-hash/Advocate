"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// The standalone timeline view is retired — this route now only forwards
// old links and bookmarks to the patient's regular clinician dashboard.
export default function RedirectToDashboard({ patientId }: { patientId: number }) {
  const router = useRouter();
  useEffect(() => {
    router.replace(`/clinician/dashboard/?patient_id=${patientId}`);
  }, [patientId, router]);
  return null;
}
