"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../lib/api";
import { useAuth } from "../components/AuthProvider";
import { ClinicianHeader } from "../components/clinician/ClinicianHeader";
import type { ClinicianPatientSummary } from "../lib/types";

export default function ClinicianPatientPickerPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [patients, setPatients] = useState<ClinicianPatientSummary[]>([]);
  const [dataLoading, setDataLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const list = (await api.getClinicianPatients()) as ClinicianPatientSummary[];
      setPatients(list);
      if (list.length === 1) {
        router.replace(`/clinician/dashboard/?patient_id=${list[0].id}`);
        return;
      }
    } catch {
      /* silent — empty state below covers it */
    } finally {
      setDataLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!isLoading && !user) { router.push("/login"); return; }
    if (!isLoading && user) loadData();
  }, [user, isLoading, loadData, router]);

  if (isLoading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--cp-bg)" }}>
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--cp-teal)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <ClinicianHeader />
      <div className="max-w-lg mx-auto px-4 pt-8 space-y-4">
        <h1 className="text-2xl font-bold" style={{ color: "var(--cp-text)" }}>Select a patient</h1>

        {patients.length === 0 && (
          <div className="rounded-xl border p-6 text-center" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
            <p className="text-sm" style={{ color: "var(--cp-text-muted)" }}>
              No patients are linked to your account yet.
            </p>
          </div>
        )}

        {patients.map((p) => (
          <Link
            key={p.id}
            href={`/clinician/dashboard/?patient_id=${p.id}`}
            className="block rounded-xl border p-4 font-semibold transition-colors hover:border-[var(--cp-teal)]"
            style={{ background: "#fff", borderColor: "var(--cp-border)", color: "var(--cp-text)" }}
          >
            {p.name}
          </Link>
        ))}
      </div>
    </div>
  );
}
