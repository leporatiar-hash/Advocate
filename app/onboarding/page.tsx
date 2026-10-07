"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { useAuth } from "../components/AuthProvider";
import { StepLoader } from "../components/StepLoader";
import type { User } from "../lib/types";

interface MedForm {
  name: string;
  dose: string;
  frequency: string;
  time_of_day: string;
}

const emptyMed = (): MedForm => ({ name: "", dose: "", frequency: "", time_of_day: "Morning" });
const TIME_OPTIONS = ["Morning", "Afternoon", "Evening", "Bedtime", "With meals", "As needed"];

const RELATIONSHIP_OPTIONS = ["Parent", "Child", "Partner", "Sibling", "Other"];

const CONDITION_SUGGESTIONS = [
  "Mental health",
  "Dementia / Alzheimer's",
  "Chronic illness",
  "Physical disability",
  "Aging / general care",
  "Other",
];

const MODULE_OPTIONS = [
  { value: "symptoms", label: "Symptoms" },
  { value: "medications", label: "Medications" },
  { value: "mood", label: "Mood" },
  { value: "sleep", label: "Sleep" },
  { value: "water", label: "Water Intake" },
  { value: "activities", label: "Activities" },
  { value: "vitals", label: "Vitals" },
  { value: "episode", label: "Behavioral Episodes" },
  { value: "side_effects", label: "Medication Side Effects" },
];

export default function OnboardingPage() {
  const { user, isLoading, login } = useAuth();
  const router = useRouter();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [submitting, setSubmitting] = useState(false);

  // Patient form (step 1)
  const [patientName, setPatientName] = useState("");
  const [dob, setDob] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [patientId, setPatientId] = useState<number | null>(null);

  // Intake survey (step 2)
  const [relationship, setRelationship] = useState("");
  const [condition, setCondition] = useState("");
  const [trackModules, setTrackModules] = useState<string[]>(["symptoms", "medications", "mood", "sleep"]);
  const [medicationsDaily, setMedicationsDaily] = useState<boolean | null>(null);
  const [goodDay, setGoodDay] = useState("");

  // Medication form (step 4)
  const [meds, setMeds] = useState<MedForm[]>([emptyMed()]);

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
  }, [user, isLoading, router]);

  function updateMed(idx: number, field: keyof MedForm, value: string) {
    setMeds((prev) => prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m)));
  }

  function toggleModule(val: string) {
    setTrackModules(prev => prev.includes(val) ? prev.filter(m => m !== val) : [...prev, val]);
  }

  async function handlePatientSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const res = await api.createPatient({
        name: patientName,
        date_of_birth: dob || null,
        diagnosis,
        notes: notes || null,
        medications: [],
      }) as { id: number };
      setPatientId(res.id);
      setStep(2);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create patient");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSurveySubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId) return;
    setStep(3);
    try {
      // Generate user-level config via Claude and save to users table
      const updatedUser = await api.completeOnboardingSurvey({
        relationship: relationship || "other",
        condition: condition || "general care",
        track_modules: trackModules.length ? trackModules : ["symptoms", "medications"],
        medications_daily: medicationsDaily ?? false,
        good_day: goodDay || null,
      }) as User;
      login(updatedUser);

      // Also keep patient.dashboard_config in sync
      await api.generateConfig(patientId, {
        relationship: relationship || "other",
        conditions: condition ? [condition] : ["other"],
        track_modules: trackModules.length ? trackModules : ["symptoms", "medications"],
        other_notes: goodDay || null,
      });
    } catch {
      toast.error("Couldn't personalize your dashboard. Using defaults.");
    }
    setStep(4);
  }

  async function handleMedsSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!patientId) return;
    setSubmitting(true);
    try {
      const validMeds = meds.filter((m) => m.name.trim());
      for (const med of validMeds) {
        await api.addMedication(patientId, med);
      }
      toast.success("All set! Welcome to Advocate.");
      router.push("/dashboard");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save medications");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) return null;

  // Progress bar: 4 segments
  const progressSteps = [1, 2, 3, 4] as const;

  return (
    <div className="min-h-screen px-4 py-8 max-w-lg mx-auto" style={{ background: "#faf9f6" }}>
      {/* Progress indicator */}
      {step !== 3 && (
        <div className="flex items-center gap-2 mb-8">
          {progressSteps.map((s) => (
            <div
              key={s}
              className="flex-1 h-1.5 rounded-full"
              style={{ background: step >= s ? "#4a7c59" : "#E2E8F0" }}
            />
          ))}
        </div>
      )}

      {/* ── Step 1: Patient profile ── */}
      {step === 1 && (
        <>
          <div className="mb-6">
            <h1 className="warm-h1 text-3xl">Who are you caring for?</h1>
            <p className="text-slate-500 text-sm mt-1">Set up the patient profile you&apos;ll be tracking.</p>
          </div>

          <form onSubmit={handlePatientSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Patient name *</label>
              <input
                required
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="Full name"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-navy text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                style={{ "--tw-ring-color": "#4a7c59" } as React.CSSProperties}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Date of birth</label>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-navy text-sm focus:outline-none focus:ring-2 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Diagnosis / Condition *</label>
              <input
                required
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                placeholder="e.g. Alzheimer's, Parkinson's, Diabetes"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-navy text-sm focus:outline-none focus:ring-2 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes (optional)</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Any additional context for the doctor..."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-navy text-sm focus:outline-none focus:ring-2 focus:border-transparent resize-none"
              />
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3.5 rounded-xl font-semibold text-white text-sm mt-2 disabled:opacity-60"
              style={{ background: "#4a7c59" }}
            >
              {submitting ? "Saving…" : "Continue →"}
            </button>
          </form>
        </>
      )}

      {/* ── Step 2: Personalization survey ── */}
      {step === 2 && (
        <>
          <div className="mb-6">
            <h1 className="warm-h1 text-3xl">Personalize your dashboard</h1>
            <p className="text-slate-500 text-sm mt-1">
              A few quick questions so we can set up the right tracking for {patientName}.
            </p>
          </div>

          <form onSubmit={handleSurveySubmit} className="space-y-6">

            {/* Q1: Relationship */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-3">
                Your relationship to {patientName}
              </label>
              <div className="flex flex-wrap gap-2">
                {RELATIONSHIP_OPTIONS.map(r => (
                  <button
                    key={r} type="button"
                    onClick={() => setRelationship(r.toLowerCase())}
                    className="px-4 py-2.5 rounded-xl border-2 text-sm font-medium transition-all"
                    style={{
                      borderColor: relationship === r.toLowerCase() ? "#4a7c59" : "#CBD5E1",
                      background: relationship === r.toLowerCase() ? "#4a7c59" : "white",
                      color: relationship === r.toLowerCase() ? "white" : "#334155",
                    }}
                  >{r}</button>
                ))}
              </div>
            </div>

            {/* Q2: Primary condition (free text + suggestion chips) */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                What&apos;s their primary condition?
                <span className="font-normal text-slate-400"> (or situation)</span>
              </label>
              <input
                value={condition}
                onChange={(e) => setCondition(e.target.value)}
                placeholder="e.g. Parkinson&apos;s, anxiety disorder, recovering from surgery…"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-navy text-sm focus:outline-none focus:ring-2 focus:border-transparent mb-2"
                style={{ "--tw-ring-color": "#4a7c59" } as React.CSSProperties}
              />
              <div className="flex flex-wrap gap-2">
                {CONDITION_SUGGESTIONS.map(s => (
                  <button
                    key={s} type="button"
                    onClick={() => setCondition(s)}
                    className="px-3 py-1.5 rounded-lg border text-xs font-medium transition-all"
                    style={{
                      borderColor: condition === s ? "#4a7c59" : "#E2E8F0",
                      background: condition === s ? "#e8f0eb" : "#faf9f6",
                      color: condition === s ? "#4a7c59" : "#64748B",
                    }}
                  >{s}</button>
                ))}
              </div>
            </div>

            {/* Q3: Track modules */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-3">
                What do you want to track? <span className="font-normal text-slate-400">(pick what&apos;s relevant)</span>
              </label>
              <div className="grid grid-cols-2 gap-2">
                {MODULE_OPTIONS.map(m => {
                  const active = trackModules.includes(m.value);
                  return (
                    <button
                      key={m.value} type="button"
                      onClick={() => toggleModule(m.value)}
                      className="flex items-center gap-2 px-3 py-2.5 rounded-xl border-2 text-sm font-medium text-left transition-all"
                      style={{
                        borderColor: active ? "#4a7c59" : "#CBD5E1",
                        background: active ? "#e8f0eb" : "white",
                        color: active ? "#4a7c59" : "#334155",
                      }}
                    >
                      <div
                        className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0"
                        style={{ background: active ? "#4a7c59" : "#E2E8F0" }}
                      >
                        {active && (
                          <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </div>
                      {m.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Q4: Medications daily concern */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-3">
                Are medications a daily concern?
              </label>
              <div className="grid grid-cols-2 gap-3">
                {([{ label: "Yes", value: true }, { label: "No", value: false }] as const).map(opt => (
                  <button
                    key={opt.label} type="button"
                    onClick={() => setMedicationsDaily(opt.value)}
                    className="py-4 rounded-xl border-2 text-base font-semibold transition-all"
                    style={{
                      borderColor: medicationsDaily === opt.value ? "#4a7c59" : "#CBD5E1",
                      background: medicationsDaily === opt.value ? "#4a7c59" : "white",
                      color: medicationsDaily === opt.value ? "white" : "#334155",
                    }}
                  >{opt.label}</button>
                ))}
              </div>
            </div>

            {/* Q5: Good day description */}
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                What does a good day look like for them?
                <span className="font-normal text-slate-400"> (optional)</span>
              </label>
              <textarea
                value={goodDay}
                onChange={(e) => setGoodDay(e.target.value)}
                rows={3}
                placeholder="e.g. They went for a short walk and recognized family members…"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-navy text-sm focus:outline-none resize-none"
              />
            </div>

            <button
              type="submit"
              className="w-full py-3.5 rounded-xl font-semibold text-white text-sm"
              style={{ background: "#4a7c59" }}
            >
              Personalize Dashboard →
            </button>
          </form>
        </>
      )}

      {/* ── Step 3: Loading / AI generating ── */}
      {step === 3 && (
        <div className="flex items-center justify-center min-h-[60vh]">
          <StepLoader
            steps={["Reading your setup...", "Building your tracking plan...", "Almost ready..."]}
            intervalMs={3000}
          />
        </div>
      )}

      {/* ── Step 4: Add medications ── */}
      {step === 4 && (
        <>
          <div className="mb-6">
            <h1 className="warm-h1 text-3xl">Add medications</h1>
            <p className="text-slate-500 text-sm mt-1">List every medication. You can always add more later.</p>
          </div>

          <form onSubmit={handleMedsSubmit} className="space-y-4">
            {meds.map((med, idx) => (
              <div key={idx} className="warm-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-navy">Medication {idx + 1}</span>
                  {meds.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setMeds((p) => p.filter((_, i) => i !== idx))}
                      className="text-red-400 text-xs font-medium"
                    >
                      Remove
                    </button>
                  )}
                </div>
                <input
                  value={med.name}
                  onChange={(e) => updateMed(idx, "name", e.target.value)}
                  placeholder="Medication name"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-navy text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                />
                <input
                  value={med.dose}
                  onChange={(e) => updateMed(idx, "dose", e.target.value)}
                  placeholder="Dose (e.g. 10mg)"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-navy text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                />
                <input
                  value={med.frequency}
                  onChange={(e) => updateMed(idx, "frequency", e.target.value)}
                  placeholder="Frequency (e.g. Once daily)"
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-navy text-sm focus:outline-none focus:ring-2 focus:border-transparent"
                />
                <select
                  value={med.time_of_day}
                  onChange={(e) => updateMed(idx, "time_of_day", e.target.value)}
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-navy text-sm focus:outline-none bg-white"
                >
                  {TIME_OPTIONS.map((t) => <option key={t}>{t}</option>)}
                </select>
              </div>
            ))}

            <button
              type="button"
              onClick={() => setMeds((p) => [...p, emptyMed()])}
              className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 text-sm font-medium hover:border-teal hover:text-teal transition-colors"
              style={{ "--tw-hover-border-color": "#4a7c59" } as React.CSSProperties}
            >
              + Add another medication
            </button>

            <div className="flex gap-3 mt-2">
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="flex-1 py-3.5 rounded-xl border border-slate-200 text-slate-500 font-medium text-sm"
              >
                Skip for now
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 py-3.5 rounded-xl font-semibold text-white text-sm disabled:opacity-60"
                style={{ background: "#4a7c59" }}
              >
                {submitting ? "Saving…" : "Go to Dashboard"}
              </button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
