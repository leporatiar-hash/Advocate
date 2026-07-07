"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { api } from "../lib/api";
import { useAuth } from "../components/AuthProvider";
import { NavBar } from "../components/NavBar";
import type { Patient, DailyLog } from "../lib/types";

function fmt(dateStr: string) {
  return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
    weekday: "short", month: "long", day: "numeric", year: "numeric",
  });
}

export default function PhotosPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [selected, setSelected] = useState<DailyLog | null>(null);

  const loadData = useCallback(async () => {
    try {
      const patients = await api.getPatients() as Patient[];
      if (!patients.length) { router.push("/onboarding"); return; }
      const p = patients[0];
      setPatient(p);
      const logsData = await api.getLogs(p.id, { includePhoto: true }) as DailyLog[];
      setLogs(logsData);
    } catch {
      // silent
    } finally {
      setDataLoading(false);
    }
  }, [router]);

  useEffect(() => {
    if (!isLoading && !user) { router.push("/login"); return; }
    if (!isLoading && user) loadData();
  }, [user, isLoading, loadData, router]);

  const photosLogs = logs
    .filter(l => l.photo)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (isLoading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#faf9f6" }}>
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#4a7c59", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: "#faf9f6" }}>
      <NavBar />

      <div className="max-w-lg mx-auto px-4 pt-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-navy">Photo Timeline</h1>
          <p className="text-base text-slate-500 mt-1">
            {patient ? `${patient.name}'s photos over time` : "Photos over time"}
          </p>
        </div>

        {photosLogs.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-10 text-center">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: "#F1F5F9" }}>
              <svg className="w-8 h-8 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
            <p className="text-slate-500 text-base">No photos yet.</p>
            <p className="text-slate-400 text-sm mt-1">Add a photo when logging each day.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {photosLogs.map(log => (
              <button
                key={log.id}
                type="button"
                onClick={() => setSelected(log)}
                className="relative rounded-2xl overflow-hidden shadow-sm border border-slate-100 aspect-square bg-slate-100 transition-transform active:scale-[0.97]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={log.photo!}
                  alt={fmt(log.date)}
                  className="w-full h-full object-cover"
                />
                <div className="absolute bottom-0 left-0 right-0 px-2 py-1.5" style={{ background: "linear-gradient(to top, rgba(13,27,42,0.75), transparent)" }}>
                  <p className="text-white text-xs font-semibold">{fmt(log.date)}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {selected && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center"
          style={{ background: "rgba(13,27,42,0.92)" }}
          onClick={() => setSelected(null)}
        >
          <div className="w-full max-w-lg px-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-3">
              <p className="text-white font-semibold text-base">{fmt(selected.date)}</p>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="text-slate-400 hover:text-white transition-colors p-1"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={selected.photo!}
              alt={fmt(selected.date)}
              className="w-full rounded-2xl object-contain max-h-[70vh]"
            />
            {selected.notes?.trim() && (
              <p className="text-slate-300 text-sm mt-3 text-center">{selected.notes}</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
