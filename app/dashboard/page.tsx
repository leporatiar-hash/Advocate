"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { api, calculateStreak, localDateStr } from "../lib/api";
import { useAuth } from "../components/AuthProvider";
import { NavBar } from "../components/NavBar";
import type { Patient, DailyLog } from "../lib/types";

// ── Photo compression (shared with log page) ─────────────────────────────────

async function compressPhoto(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const MAX = 900;
      const ratio = Math.min(MAX / img.width, MAX / img.height, 1);
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * ratio);
      canvas.height = Math.round(img.height * ratio);
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas")); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("load")); };
    img.src = url;
  });
}

// ── Quick photo card ──────────────────────────────────────────────────────────

function QuickPhotoCard({
  patient,
  todayLog,
  onSaved,
}: {
  patient: Patient;
  todayLog: DailyLog | null;
  onSaved: () => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [loading, setLoading] = useState(false);

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setLoading(true);
    try {
      const compressed = await compressPhoto(file);
      const today = localDateStr();
      // Merge with existing log so we don't wipe symptoms/meds/etc.
      await api.createLog({
        patient_id: patient.id,
        date: today,
        medications_taken: (todayLog?.medications_taken as object[]) ?? [],
        symptoms: (todayLog?.symptoms as object[]) ?? [],
        medication_side_effects: (todayLog?.medication_side_effects as object[]) ?? [],
        sleep_hours: todayLog?.sleep_hours ?? null,
        mood_score: null,
        water_intake_oz: null,
        activities: (todayLog?.activities as object[]) ?? [],
        lifestyle: todayLog?.lifestyle ?? null,
        notes: todayLog?.notes ?? null,
        episode: todayLog?.episode ?? null,
        vitals: todayLog?.vitals ?? null,
        photo: compressed,
      });
      toast.success("Photo saved!");
      onSaved();
    } catch {
      toast.error("Could not save photo");
    } finally {
      setLoading(false);
      e.target.value = "";
    }
  }

  const hasPhoto = !!(todayLog?.photo);

  return (
    <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFile} />
      <input ref={libraryRef} type="file" accept="image/*" className="hidden" onChange={handleFile} />

      {hasPhoto ? (
        <div className="flex items-center gap-4 px-5 py-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={todayLog!.photo!}
            alt="Today's photo"
            className="w-16 h-16 rounded-xl object-cover flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-base font-semibold text-navy">Today&apos;s Photo</p>
            <p className="text-sm font-medium mt-0.5" style={{ color: "#4a7c59" }}>Saved</p>
          </div>
          <button
            type="button"
            onClick={() => libraryRef.current?.click()}
            className="text-sm font-semibold px-4 py-2 rounded-xl border border-slate-200 text-slate-600 bg-slate-50 active:bg-slate-100 transition-colors flex-shrink-0"
          >
            Replace
          </button>
        </div>
      ) : (
        <div className="px-5 py-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <p className="text-base font-semibold text-navy">Today&apos;s Photo</p>
              <p className="text-sm text-slate-400 mt-0.5">Add a daily photo for the timeline</p>
            </div>
            {loading && (
              <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin flex-shrink-0" style={{ borderColor: "#4a7c59", borderTopColor: "transparent" }} />
            )}
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={loading}
              onClick={() => cameraRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-white transition-colors active:opacity-90 disabled:opacity-50"
              style={{ background: "#4a7c59" }}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
              Take Photo
            </button>
            <button
              type="button"
              disabled={loading}
              onClick={() => libraryRef.current?.click()}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold text-slate-600 border border-slate-200 bg-slate-50 active:bg-slate-100 transition-colors disabled:opacity-50"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
              Add Photo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function getTimeOfDay(): string {
  const h = new Date().getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

// ── Today checklist row ───────────────────────────────────────────────────────

function TodayRow({
  label,
  summary,
  done,
  href,
}: {
  label: string;
  summary: string;
  done: boolean;
  href: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 px-5 py-4 transition-colors active:bg-slate-50"
      style={{ borderBottom: "1px solid #F1F5F9" }}
    >
      {/* Status icon */}
      <div
        className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0"
        style={{ background: done ? "#e8f0eb" : "#F1F5F9" }}
      >
        {done ? (
          <svg className="w-4 h-4" style={{ color: "#4a7c59" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <div className="w-3.5 h-3.5 rounded-full border-2" style={{ borderColor: "#CBD5E1" }} />
        )}
      </div>

      {/* Label + summary */}
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold" style={{ color: done ? "#1a2420" : "#334155" }}>{label}</p>
        <p className="text-sm mt-0.5" style={{ color: done ? "#2d4f38" : "#94A3B8" }}>{summary}</p>
      </div>

      {/* Chevron */}
      <svg className="w-5 h-5 flex-shrink-0" style={{ color: "#CBD5E1" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [logs, setLogs] = useState<DailyLog[]>([]);
  const [todayLog, setTodayLog] = useState<DailyLog | null>(null);
  const [dataLoading, setDataLoading] = useState(true);

  const loadData = useCallback(async () => {
    try {
      const patients = await api.getPatients() as Patient[];
      if (!patients.length) { router.push("/onboarding"); return; }
      const p = patients[0];
      setPatient(p);

      const [logsData, todayData] = await Promise.all([
        api.getLogs(p.id, { days: 400 }) as Promise<DailyLog[]>,
        api.getTodayLog(p.id) as Promise<DailyLog | null>,
      ]);
      setLogs(logsData);
      setTodayLog(todayData);
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

  // Re-fetch whenever user returns to the app (tab/PWA resume)
  useEffect(() => {
    function onVisible() {
      if (document.visibilityState === "visible") loadData();
    }
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, [loadData]);

  // Evening reminders at 7pm and 8pm if log not done
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Request notification permission on first load
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    const checkReminder = () => {
      const now = new Date();
      const hour = now.getHours();
      const minute = now.getMinutes();
      if ((hour === 19 || hour === 20) && minute === 0) {
        const todayStr = localDateStr(now);
        const key = `advocate_reminder_${todayStr}_h${hour}`;
        if (localStorage.getItem(key)) return; // already fired today
        localStorage.setItem(key, "1");

        if ("Notification" in window && Notification.permission === "granted") {
          new Notification("Advocate: Evening reminder", {
            body: "Don't forget to complete today's log.",
            icon: "/favicon.ico",
          });
        } else {
          toast("Evening reminder: don't forget to complete today's log.", { icon: "⏰", duration: 8000 });
        }
      }
    };

    const interval = setInterval(checkReminder, 60_000);
    return () => clearInterval(interval);
  }, []);

  const calcStreak = calculateStreak(logs);

  // This month stats
  const thisMonth = (() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return logs.filter((l) => l.date >= localDateStr(start));
  })();

  const monthAdherence = (() => {
    let taken = 0, total = 0;
    thisMonth.forEach((l) => {
      (l.medications_taken || []).forEach((m) => { total++; if (m.taken) taken++; });
    });
    return total > 0 ? Math.round((taken / total) * 100) : null;
  })();

  // Today checklist items
  const medsDone = !!(todayLog?.medications_taken?.some(m => m.taken));
  const medsSummary = todayLog?.medications_taken
    ? `${todayLog.medications_taken.filter(m => m.taken).length} of ${todayLog.medications_taken.length} taken`
    : "Not recorded";

  const symptomsDone = !!(todayLog?.symptoms?.length);
  const symptomsSummary = symptomsDone ? "Recorded" : "Not recorded";

  const sleepDone = todayLog?.sleep_hours != null;
  const sleepSummary = sleepDone
    ? `${todayLog!.sleep_hours}hrs sleep${todayLog!.water_intake_oz != null ? ` · ${todayLog!.water_intake_oz >= 70 ? "Good" : todayLog!.water_intake_oz >= 40 ? "Fair" : "Poor"} hydration` : ""}`
    : "Not recorded";

  const notesDone = !!(todayLog?.notes?.trim());
  const notesSummary = notesDone ? "Added" : "Optional";

  const completedCount = [medsDone, symptomsDone, sleepDone, notesDone].filter(Boolean).length;
  const totalRequired = 4;
  const allDone = completedCount === totalRequired;

  const ctaLabel = !todayLog ? "Start Today's Log" : allDone ? "Review Today's Log" : "Continue Today";
  const ctaHref = !todayLog ? "/log" : allDone ? "/log" : "/log";

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

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-5">

        {/* Greeting */}
        <div>
          <h1 className="text-3xl font-bold text-navy">
            Good {getTimeOfDay()}, {user?.name?.split(" ")[0]}.
          </h1>
          <p className="text-base text-slate-500 mt-1">
            {patient ? `Here's how ${patient.name} is doing.` : "Welcome back."}
          </p>
          {user?.user_config?.greeting && (
            <p className="text-sm font-medium mt-1" style={{ color: "#4a7c59" }}>
              {user.user_config.greeting}
            </p>
          )}
        </div>

        {patient ? (
          <>
            {/* Patient card — compact */}
            <div className="rounded-2xl px-5 py-4 flex items-center justify-between text-white" style={{ background: "#1a2420" }}>
              <div>
                <p className="text-slate-400 text-sm font-medium">{patient.diagnosis}</p>
                <p className="text-xl font-bold mt-0.5">{patient.name}</p>
              </div>
              <div className="text-right">
                <p className="text-slate-400 text-sm">Streak</p>
                <p className="text-3xl font-bold" style={{ color: "#4a7c59" }}>{calcStreak}<span className="text-base font-normal text-slate-400 ml-1">{calcStreak === 1 ? "day" : "days"}</span></p>
              </div>
            </div>

            {/* Streak = 0 nudge */}
            {calcStreak === 0 && (
              <div className="rounded-2xl px-5 py-4 border" style={{ background: "#FFF8EC", borderColor: "#d4e0d7" }}>
                <p className="text-base font-medium" style={{ color: "#92400E" }}>
                  Start logging today. Every entry helps {patient.name}&apos;s doctor understand them better.
                </p>
              </div>
            )}

            {/* Today checklist card */}
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden">
              <div className="px-5 pt-4 pb-3 flex items-center justify-between">
                <h2 className="text-lg font-bold text-navy">Today</h2>
                <span className="text-sm font-semibold" style={{ color: completedCount === totalRequired ? "#4a7c59" : "#94A3B8" }}>
                  {completedCount}/{totalRequired} done
                </span>
              </div>

              <div>
                <TodayRow label="Medications" summary={medsSummary} done={medsDone} href="/log#medications" />
                <TodayRow label="Symptoms" summary={symptomsSummary} done={symptomsDone} href="/log#symptoms" />
                <TodayRow label="Sleep & Hydration" summary={sleepSummary} done={sleepDone} href="/log#sleep" />
                <TodayRow label="Notes" summary={notesSummary} done={notesDone} href="/log#notes" />
              </div>

              {/* Progress bar inside card */}
              <div className="mx-5 mb-5 mt-3">
                <div className="w-full h-2 rounded-full" style={{ background: "#E2E8F0" }}>
                  <div
                    className="h-2 rounded-full transition-all duration-500"
                    style={{ width: `${(completedCount / totalRequired) * 100}%`, background: "#4a7c59" }}
                  />
                </div>
              </div>
            </div>

            {/* Quick photo */}
            <QuickPhotoCard patient={patient} todayLog={todayLog} onSaved={loadData} />

            {/* Primary CTA */}
            <Link
              href={ctaHref}
              className="block w-full py-5 rounded-3xl text-center text-white font-bold text-xl shadow-lg transition-transform active:scale-[0.98]"
              style={{ background: allDone ? "#2d4f38" : "linear-gradient(135deg, #4a7c59, #2d4f38)" }}
            >
              {ctaLabel}
            </Link>

            {/* Stats row */}
            <div className="flex gap-3">
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex-1 text-center">
                <p className="text-3xl font-bold text-navy">{monthAdherence !== null ? `${monthAdherence}%` : "—"}</p>
                <p className="text-sm text-slate-500 mt-1">Adherence this month</p>
              </div>
              <div className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100 flex-1 text-center">
                <p className="text-3xl font-bold text-navy">{thisMonth.length}</p>
                <p className="text-sm text-slate-500 mt-1">Days logged</p>
              </div>
            </div>

            {/* Quick actions */}
            <Link
              href="/summary"
              className="flex items-center justify-between bg-white rounded-2xl px-5 py-4 shadow-sm border border-slate-100 transition-colors active:bg-slate-50"
            >
              <div>
                <p className="text-base font-semibold text-navy">AI Insights</p>
                <p className="text-sm text-slate-500 mt-0.5">Generate a doctor-ready summary</p>
              </div>
              <svg className="w-5 h-5" style={{ color: "#4a7c59" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>

            <Link
              href="/print"
              className="flex items-center justify-between bg-white rounded-2xl px-5 py-4 shadow-sm border border-slate-100 transition-colors active:bg-slate-50"
            >
              <div>
                <p className="text-base font-semibold text-navy">Print Report</p>
                <p className="text-sm text-slate-500 mt-0.5">Last 7 or 30 days, formatted for the doctor</p>
              </div>
              <svg className="w-5 h-5" style={{ color: "#4a7c59" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
              </svg>
            </Link>

            <Link
              href="/photos"
              className="flex items-center justify-between bg-white rounded-2xl px-5 py-4 shadow-sm border border-slate-100 transition-colors active:bg-slate-50"
            >
              <div>
                <p className="text-base font-semibold text-navy">Photo Timeline</p>
                <p className="text-sm text-slate-500 mt-0.5">Scroll through photos by date</p>
              </div>
              <svg className="w-5 h-5" style={{ color: "#4a7c59" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          </>
        ) : (
          <div className="text-center py-16">
            <p className="text-slate-500 text-base mb-4">No patient profile yet.</p>
            <Link href="/onboarding" className="inline-block px-6 py-3 rounded-xl text-white font-semibold text-base" style={{ background: "#4a7c59" }}>
              Set up patient
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
