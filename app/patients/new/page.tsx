"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { api } from "../../lib/api";
import { useAuth } from "../../components/AuthProvider";
import { NavBar } from "../../components/NavBar";

interface MedForm {
  name: string;
  dose: string;
  frequency: string;
  time_of_day: string;
}

const emptyMed = (): MedForm => ({ name: "", dose: "", frequency: "", time_of_day: "Morning" });
const TIME_OPTIONS = ["Morning", "Afternoon", "Evening", "Bedtime", "With meals", "As needed"];

export default function NewPatientPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);

  const [patientName, setPatientName] = useState("");
  const [dob, setDob] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [meds, setMeds] = useState<MedForm[]>([emptyMed()]);

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
  }, [user, isLoading, router]);

  function updateMed(idx: number, field: keyof MedForm, value: string) {
    setMeds((prev) => prev.map((m, i) => (i === idx ? { ...m, [field]: value } : m)));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const validMeds = meds.filter((m) => m.name.trim());
      await api.createPatient({
        name: patientName,
        date_of_birth: dob || null,
        diagnosis,
        notes: notes || null,
        medications: validMeds,
      });
      toast.success("Patient profile created!");
      router.push("/dashboard");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create patient");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) return null;

  return (
    <div className="min-h-screen pb-24" style={{ background: "#faf9f6" }}>
      <NavBar />

      <div className="max-w-lg mx-auto px-4 pt-6">
        <div className="mb-6">
          <h1 className="warm-h1 text-3xl">New Patient</h1>
          <p className="text-slate-500 text-sm mt-1">Create a patient profile and add their medications.</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Patient details */}
          <div className="warm-card p-5 space-y-4">
            <h2 className="font-semibold text-navy">Patient Details</h2>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Patient name *</label>
              <input
                required
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                placeholder="Full name"
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-navy text-sm focus:outline-none focus:ring-2 focus:border-transparent"
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
              <label className="block text-sm font-medium text-slate-700 mb-1.5">Notes</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Additional context for the doctor..."
                className="w-full px-4 py-3 rounded-xl border border-slate-200 text-navy text-sm focus:outline-none focus:ring-2 focus:border-transparent resize-none"
              />
            </div>
          </div>

          {/* Medications */}
          <div className="space-y-3">
            <h2 className="font-semibold text-navy px-1">Medications</h2>
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
                  className="w-full px-3 py-2.5 rounded-lg border border-slate-200 text-navy text-sm focus:outline-none"
                />
                <div className="grid grid-cols-2 gap-2">
                  <input
                    value={med.dose}
                    onChange={(e) => updateMed(idx, "dose", e.target.value)}
                    placeholder="Dose (e.g. 10mg)"
                    className="px-3 py-2.5 rounded-lg border border-slate-200 text-navy text-sm focus:outline-none"
                  />
                  <input
                    value={med.frequency}
                    onChange={(e) => updateMed(idx, "frequency", e.target.value)}
                    placeholder="Frequency"
                    className="px-3 py-2.5 rounded-lg border border-slate-200 text-navy text-sm focus:outline-none"
                  />
                </div>
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
              className="w-full py-3 rounded-xl border-2 border-dashed border-slate-300 text-slate-500 text-sm font-medium"
            >
              + Add another medication
            </button>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-4 rounded-2xl font-bold text-white text-base shadow-lg disabled:opacity-60"
            style={{ background: "#4a7c59" }}
          >
            {submitting ? "Creating…" : "Create Patient Profile"}
          </button>
        </form>
      </div>
    </div>
  );
}
