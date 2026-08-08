"use client";

import { useState, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { api } from "../../lib/api";
import { useAuth } from "../../components/AuthProvider";
import { ClinicianHeader } from "../../components/clinician/ClinicianHeader";
import { LogDrillDown } from "../../components/clinician/LogDrillDown";
import type { DailyLog } from "../../lib/types";

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function LogDrillDownContent() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const patientId = Number(searchParams.get("patient_id"));
  const date = searchParams.get("date") ?? "";

  const [log, setLog] = useState<DailyLog | null>(null);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState(false);

  const loadData = useCallback(async () => {
    try {
      const result = (await api.getClinicianLog(patientId, date)) as DailyLog | null;
      setLog(result);
    } catch {
      setError(true);
    } finally {
      setDataLoading(false);
    }
  }, [patientId, date]);

  useEffect(() => {
    if (!isLoading && !user) { router.push("/login"); return; }
    if (!patientId || !date) { router.push("/clinician"); return; }
    if (!isLoading && user) loadData();
  }, [user, isLoading, patientId, date, loadData, router]);

  const backHref = `/clinician/dashboard/?patient_id=${patientId}`;

  if (isLoading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--cp-bg)" }}>
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--cp-teal)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-10">
      <ClinicianHeader backHref={backHref} />
      <div className="max-w-lg mx-auto px-4 pt-6 space-y-4">
        <h1 className="text-xl font-bold" style={{ color: "var(--cp-text)" }}>{fmtDate(date)}</h1>

        {error || !log ? (
          <div className="rounded-xl border p-6 text-center" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
            <p className="text-sm" style={{ color: "var(--cp-text-muted)" }}>No log found for this day.</p>
          </div>
        ) : (
          <LogDrillDown log={log} />
        )}
      </div>
    </div>
  );
}

export default function ClinicianLogPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--cp-bg)" }}>
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--cp-teal)", borderTopColor: "transparent" }} />
        </div>
      }
    >
      <LogDrillDownContent />
    </Suspense>
  );
}
