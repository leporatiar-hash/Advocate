"use client";

import { useState } from "react";
import type { ClinicianPrefs } from "../../lib/clinicianPrefs";

const TOGGLES: { key: keyof ClinicianPrefs; label: string }[] = [
  { key: "showTrajectory", label: "How the month moved" },
  { key: "showSymptomFrequency", label: "Symptom frequency" },
  { key: "showMedAdherence", label: "Medication adherence" },
  { key: "showRawNotes", label: "Raw notes" },
];

function GearIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// Demo-local only — see app/lib/clinicianPrefs.ts. Toggles the four optional
// sections; the glance layer, insights, and the ranked flag are never
// hideable from here by design.
export function CustomizeControl({
  prefs,
  onChange,
  onReset,
}: {
  prefs: ClinicianPrefs;
  onChange: (next: ClinicianPrefs) => void;
  onReset: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 text-white/80 hover:text-white text-sm flex-shrink-0 transition-colors"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <GearIcon />
        Customize
      </button>

      {open && (
        <>
          {/* Click-outside catcher */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 top-full mt-2 w-64 rounded-xl border p-4 z-50"
            style={{ background: "#fff", borderColor: "var(--cp-border)", boxShadow: "0 8px 24px rgba(15,23,42,0.15)" }}
          >
            <p className="text-xs font-bold uppercase tracking-wide mb-3" style={{ color: "var(--cp-text-muted)" }}>
              Customize this view
            </p>
            <div className="space-y-2.5">
              {TOGGLES.map((t) => (
                <label
                  key={t.key}
                  className="flex items-center justify-between gap-3 text-sm cursor-pointer"
                  style={{ color: "var(--cp-text)" }}
                >
                  <span>{t.label}</span>
                  <input
                    type="checkbox"
                    checked={prefs[t.key]}
                    onChange={(e) => onChange({ ...prefs, [t.key]: e.target.checked })}
                    className="h-4 w-4 flex-shrink-0"
                    style={{ accentColor: "var(--cp-teal)" }}
                  />
                </label>
              ))}
            </div>
            <button
              type="button"
              onClick={onReset}
              className="text-xs font-semibold mt-4 hover:underline"
              style={{ color: "var(--cp-teal)" }}
            >
              Reset to defaults
            </button>
            <p className="text-[11px] mt-3 pt-3" style={{ color: "var(--cp-text-muted)", borderTop: "1px solid var(--cp-border)" }}>
              Saved to this browser only.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
