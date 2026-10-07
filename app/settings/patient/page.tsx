"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { api } from "../../lib/api";
import { useAuth } from "../../components/AuthProvider";
import { NavBar } from "../../components/NavBar";
import type { Patient } from "../../lib/types";

export default function PatientProfilePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [name, setName] = useState("");
  const [dob, setDob] = useState("");
  const [diagnosis, setDiagnosis] = useState("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isLoading && !user) { router.push("/login"); return; }
    if (!isLoading && user) {
      api.getPatients().then(pts => {
        const list = pts as Patient[];
        if (list.length > 0) {
          const p = list[0];
          setPatient(p);
          setName(p.name);
          setDob(p.date_of_birth ?? "");
          setDiagnosis(p.diagnosis);
          setNotes(p.notes ?? "");
        }
      }).catch(() => toast.error("Failed to load patient")).finally(() => setLoading(false));
    }
  }, [user, isLoading, router]);

  async function handleSave() {
    if (!patient) return;
    setSaving(true);
    try {
      const updated = await api.updatePatient(patient.id, {
        name: name.trim(),
        date_of_birth: dob || null,
        diagnosis: diagnosis.trim(),
        notes: notes.trim() || null,
      }) as Patient;
      setPatient(updated);
      toast.success("Patient profile saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  if (isLoading || loading) {
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

        {/* Back + title */}
        <div className="flex items-center gap-3">
          <Link
            href="/settings"
            className="w-9 h-9 rounded-full flex items-center justify-center bg-white border border-slate-200 text-slate-500 hover:text-navy transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
          <div>
            <h1 className="warm-h1 text-3xl">Profile</h1>
            <p className="text-sm warm-soft">Update your patient&apos;s basic information</p>
          </div>
        </div>

        {!patient ? (
          <div className="warm-card px-5 py-8 text-center">
            <p className="text-slate-400">No patient found. Complete onboarding first.</p>
          </div>
        ) : (
          <>
            <div className="warm-card overflow-hidden">
              <div className="px-5 pt-5 pb-3">
                <h2 className="warm-h2 text-lg">Basic info</h2>
              </div>
              <div className="px-5 pb-5 space-y-4">

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-600">Patient Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Full name"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-base text-navy focus:outline-none bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-600">Date of Birth</label>
                  <input
                    type="date"
                    value={dob}
                    onChange={e => setDob(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-base text-navy focus:outline-none bg-white"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-600">Diagnosis / Condition</label>
                  <input
                    type="text"
                    value={diagnosis}
                    onChange={e => setDiagnosis(e.target.value)}
                    placeholder="e.g. Alzheimer's, Parkinson's, MS…"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-base text-navy focus:outline-none bg-white"
                  />
                  <p className="text-xs text-slate-400">This is used to personalize AI summaries and dashboard suggestions.</p>
                </div>

                <div className="space-y-1.5">
                  <label className="text-sm font-semibold text-slate-600">Additional Notes</label>
                  <textarea
                    value={notes}
                    onChange={e => setNotes(e.target.value)}
                    rows={3}
                    placeholder="Any other context about your patient's situation…"
                    className="w-full px-4 py-3 rounded-xl border border-slate-200 text-base text-navy focus:outline-none bg-white resize-none"
                  />
                </div>
              </div>
            </div>

            <button
              onClick={handleSave}
              disabled={saving || !name.trim() || !diagnosis.trim()}
              className="w-full py-5 rounded-2xl font-bold text-white text-xl shadow-xl transition-all active:scale-[0.98] disabled:opacity-50"
              style={{ background: saving ? "#2d4f38" : "#4a7c59" }}
            >
              {saving ? "Saving…" : "Save Changes"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
