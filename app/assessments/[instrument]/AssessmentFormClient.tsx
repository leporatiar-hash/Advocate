"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { api } from "../../lib/api";
import { useAuth } from "../../components/AuthProvider";
import { NavBar } from "../../components/NavBar";
import type { Patient, InstrumentDefinition } from "../../lib/types";

// Descriptive-only score bands. No diagnostic language, no condition names,
// no "at risk" framing — scores and trends only, per instrument scope rules.
function describeScore(instrumentKey: string, score: number, maxScore: number): string {
  const pct = score / maxScore;
  if (instrumentKey === "lawton_iadl") {
    if (score === maxScore) return "Full independence across daily activities.";
    if (pct >= 0.75) return "High independence with some support needed.";
    if (pct >= 0.5) return "Moderate support needed with daily activities.";
    return "Substantial support needed with daily activities.";
  }
  if (instrumentKey === "phq9") {
    if (pct < 5 / 27) return "Minimal range this check-in.";
    if (pct < 10 / 27) return "Mild range this check-in.";
    if (pct < 15 / 27) return "Moderate range this check-in.";
    if (pct < 20 / 27) return "Moderately elevated range this check-in.";
    return "Elevated range this check-in.";
  }
  // csi
  if (pct < 3 / 26) return "Few strain indicators this check-in.";
  if (pct < 9 / 26) return "Some strain indicators present. This is common among caregivers.";
  return "Several strain indicators present. Many caregivers find it helpful to talk this through with someone they trust.";
}

type Phase = "intro" | "question" | "mode" | "complete";

export default function AssessmentFormClient({ instrumentKey }: { instrumentKey: string }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [definitions, setDefinitions] = useState<Record<string, InstrumentDefinition> | null>(null);
  const [pageLoading, setPageLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("question");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [completionMode, setCompletionMode] = useState<"self" | "assisted">("self");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ score: number; maxScore: number } | null>(null);

  const load = useCallback(async () => {
    try {
      const [patients, defs] = await Promise.all([
        api.getPatients() as Promise<Patient[]>,
        api.getInstrumentDefinitions() as Promise<Record<string, InstrumentDefinition>>,
      ]);
      if (!patients.length) { router.push("/onboarding"); return; }
      setPatient(patients[0]);
      setDefinitions(defs);
      setPhase(instrumentKey === "phq9" ? "intro" : "question");
    } catch {
      toast.error("Failed to load assessment");
    } finally {
      setPageLoading(false);
    }
  }, [router, instrumentKey]);

  useEffect(() => {
    if (!isLoading && !user) { router.push("/login"); return; }
    if (!isLoading && user) load();
  }, [user, isLoading, load, router]);

  if (isLoading || pageLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#faf9f6" }}>
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#4a7c59", borderTopColor: "transparent" }} />
      </div>
    );
  }

  const instrument = definitions?.[instrumentKey];
  if (!instrument || !patient) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#faf9f6" }}>
        <p className="text-base text-slate-500">Assessment not found.</p>
      </div>
    );
  }

  const isPhq9 = instrumentKey === "phq9";
  const questions = instrument.questions;
  const question = questions[questionIndex];
  const questionFontClass = isPhq9 ? "text-2xl" : "text-xl";

  function goBack() {
    if (phase === "mode") { setPhase("question"); setQuestionIndex(questions.length - 1); return; }
    if (phase === "question" && questionIndex > 0) { setQuestionIndex((i) => i - 1); return; }
    if (phase === "question" && questionIndex === 0) {
      if (isPhq9) { setPhase("intro"); return; }
      router.push("/assessments");
      return;
    }
    if (phase === "intro") { router.push("/assessments"); return; }
  }

  function selectAnswer(value: number) {
    setAnswers((prev) => ({ ...prev, [question.id]: value }));
    if (questionIndex < questions.length - 1) {
      setQuestionIndex((i) => i + 1);
    } else if (isPhq9) {
      setPhase("mode");
    } else {
      submit({ ...answers, [question.id]: value }, null);
    }
  }

  async function submit(finalAnswers: Record<string, number>, mode: "self" | "assisted" | null) {
    if (!patient) return;
    setSubmitting(true);
    try {
      const created = await api.createAssessment({
        patient_id: patient.id,
        instrument_key: instrumentKey,
        responses: finalAnswers,
        completion_mode: mode,
      }) as { computed_score: number; max_score: number };
      setResult({ score: created.computed_score, maxScore: created.max_score });
      setPhase("complete");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to submit assessment");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen pb-28" style={{ background: "#faf9f6" }}>
      <NavBar />

      <div className="max-w-lg mx-auto pt-6 px-4 space-y-5">

        {phase !== "complete" && (
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={goBack}
              className="w-9 h-9 rounded-full flex items-center justify-center bg-white border border-slate-200 text-slate-500 hover:text-navy transition-colors flex-shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <div className="flex-1">
              <p className="text-base font-bold text-navy">{instrument.name}</p>
              {phase === "question" && (
                <p className="text-sm text-slate-400">Question {questionIndex + 1} of {questions.length}</p>
              )}
            </div>
          </div>
        )}

        {phase === "question" && (
          <div className="w-full h-1.5 rounded-full bg-slate-100 overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${((questionIndex + 1) / questions.length) * 100}%`, background: "#4a7c59" }}
            />
          </div>
        )}

        {/* Intro screen — PHQ-9 hand-to-patient */}
        {phase === "intro" && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-5 text-center">
            <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center" style={{ background: "#e8f0eb" }}>
              <svg className="w-7 h-7" style={{ color: "#4a7c59" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <p className="text-lg text-navy leading-relaxed">
              This check-in is for {patient.name} to answer in their own words. Hand them the device, or read the questions aloud and enter their answers.
            </p>
            <button
              type="button"
              onClick={() => setPhase("question")}
              className="w-full py-4 rounded-2xl font-bold text-white text-base"
              style={{ background: "linear-gradient(135deg, #4a7c59, #2d4f38)" }}
            >
              Begin
            </button>
          </div>
        )}

        {/* Question screen */}
        {phase === "question" && question && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-6">
            {instrument.stem && (
              <p className="text-sm text-slate-500">{instrument.stem}</p>
            )}
            <p className={`${questionFontClass} font-bold text-navy leading-snug`}>{question.text}</p>
            <div className="space-y-3">
              {question.options.map((opt, i) => {
                const selected = answers[question.id] === opt.value;
                return (
                  <button
                    key={i}
                    type="button"
                    onClick={() => selectAnswer(opt.value)}
                    disabled={submitting}
                    className="w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all disabled:opacity-50"
                    style={{
                      borderColor: selected ? "#4a7c59" : "#CBD5E1",
                      background: selected ? "#f2f7f3" : "white",
                    }}
                  >
                    <div
                      className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                      style={{ borderColor: selected ? "#4a7c59" : "#CBD5E1" }}
                    >
                      {selected && <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#4a7c59" }} />}
                    </div>
                    <p className="text-base font-medium text-navy">{opt.label}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* PHQ-9 completion mode toggle */}
        {phase === "mode" && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-5">
            <p className="text-lg font-bold text-navy">Who completed this check-in?</p>
            <div className="space-y-3">
              {([
                { key: "self" as const, label: `Completed by ${patient.name}` },
                { key: "assisted" as const, label: "Caregiver assisted" },
              ]).map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => setCompletionMode(opt.key)}
                  className="w-full flex items-center gap-4 p-4 rounded-xl border-2 text-left transition-all"
                  style={{
                    borderColor: completionMode === opt.key ? "#4a7c59" : "#CBD5E1",
                    background: completionMode === opt.key ? "#f2f7f3" : "white",
                  }}
                >
                  <div
                    className="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0"
                    style={{ borderColor: completionMode === opt.key ? "#4a7c59" : "#CBD5E1" }}
                  >
                    {completionMode === opt.key && <div className="w-2.5 h-2.5 rounded-full" style={{ background: "#4a7c59" }} />}
                  </div>
                  <p className="text-base font-medium text-navy">{opt.label}</p>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => submit(answers, completionMode)}
              disabled={submitting}
              className="w-full py-4 rounded-2xl font-bold text-white text-base disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, #4a7c59, #2d4f38)" }}
            >
              {submitting ? "Submitting…" : "Submit"}
            </button>
          </div>
        )}

        {/* Completion screen */}
        {phase === "complete" && result && (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100 space-y-5 text-center">
            <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center" style={{ background: "#e8f0eb" }}>
              <svg className="w-7 h-7" style={{ color: "#4a7c59" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-navy">{result.score} of {result.maxScore}</p>
              <p className="text-base text-slate-500 mt-2">{describeScore(instrumentKey, result.score, result.maxScore)}</p>
            </div>

            {isPhq9 && (answers["q9"] ?? 0) > 0 && (
              <div className="rounded-xl p-4 text-left" style={{ background: "#FFF7ED", border: "1px solid #FDBA74" }}>
                <p className="text-sm leading-relaxed" style={{ color: "#9A3412" }}>
                  One of these answers is worth mentioning to {patient.name}&rsquo;s care team soon. If they are in crisis, call or text 988.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => router.push("/assessments")}
              className="w-full py-4 rounded-2xl font-bold text-white text-base"
              style={{ background: "linear-gradient(135deg, #4a7c59, #2d4f38)" }}
            >
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
