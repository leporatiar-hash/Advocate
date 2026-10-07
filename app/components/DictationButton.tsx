"use client";

import { useEffect, useRef, useState } from "react";

// Speak-to-type for free-text fields, using the browser's built-in speech
// recognition (no dependency). Hidden where unsupported (e.g. Firefox).
// Chrome sends audio to Google to transcribe and Safari to Apple, so the
// first use shows a one-time note saying so.

interface RecognitionResult { isFinal: boolean; 0: { transcript: string } }
interface RecognitionEvent { resultIndex: number; results: ArrayLike<RecognitionResult> }
interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onresult: ((e: RecognitionEvent) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  start: () => void;
  stop: () => void;
}
type RecognitionCtor = new () => Recognition;

const NOTICE_KEY = "advocate_dictation_notice_seen";

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function DictationButton({ onText }: { onText: (text: string) => void }) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [showNotice, setShowNotice] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const onTextRef = useRef(onText);
  useEffect(() => { onTextRef.current = onText; }, [onText]);

  // Feature detection has to wait for the client — the server render has no window.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setSupported(!!getRecognitionCtor()); }, []);
  useEffect(() => () => recRef.current?.stop(), []);

  if (!supported) return null;

  function start() {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;
    let seen = false;
    try { seen = localStorage.getItem(NOTICE_KEY) === "1"; } catch { /* storage blocked */ }
    if (!seen) { setShowNotice(true); return; }
    const rec = new Ctor();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = false;
    rec.onresult = e => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal && r[0].transcript.trim()) onTextRef.current(r[0].transcript.trim());
      }
    };
    rec.onerror = e => {
      setError(e.error === "not-allowed" ? "Microphone access is blocked. Allow it in your browser settings." : "Couldn't hear that. Try again.");
    };
    rec.onend = () => setListening(false);
    recRef.current = rec;
    setError(null);
    setListening(true);
    rec.start();
  }

  function stop() {
    recRef.current?.stop();
    setListening(false);
  }

  function acceptNotice() {
    try { localStorage.setItem(NOTICE_KEY, "1"); } catch { /* storage blocked */ }
    setShowNotice(false);
    start();
  }

  return (
    <div className="space-y-2">
      <button
        type="button"
        onClick={listening ? stop : start}
        aria-pressed={listening}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold border transition-all"
        style={listening
          ? { background: "#FEF2F2", borderColor: "#FCA5A5", color: "#B91C1C" }
          : { background: "white", borderColor: "#d4e0d7", color: "#4a7c59" }}
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18.75a6 6 0 006-6v-1.5m-6 7.5a6 6 0 01-6-6v-1.5m6 7.5v3.75m-3.75 0h7.5M12 15.75a3 3 0 01-3-3V4.5a3 3 0 116 0v8.25a3 3 0 01-3 3z" />
        </svg>
        {listening ? "Stop" : "Speak"}
      </button>
      {listening && <p className="text-xs text-slate-500" aria-live="polite">Listening… tap Stop when you&apos;re done.</p>}
      {error && <p className="text-xs" style={{ color: "#B91C1C" }}>{error}</p>}
      {showNotice && (
        <div className="rounded-xl p-3 space-y-2 text-sm" style={{ background: "#f8fcf9", border: "1px solid #d4e0d7" }}>
          <p className="text-slate-600">
            Your browser turns speech into text. Chrome sends the audio to Google, and Safari sends it to Apple. Nothing is recorded or kept by Advocate.
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setShowNotice(false)}
              className="flex-1 py-2 rounded-lg border border-slate-200 text-slate-500 font-semibold bg-white">Not now</button>
            <button type="button" onClick={acceptNotice}
              className="flex-1 py-2 rounded-lg text-white font-semibold" style={{ background: "#4a7c59" }}>OK, start</button>
          </div>
        </div>
      )}
    </div>
  );
}
