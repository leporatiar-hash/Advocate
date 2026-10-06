"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";
import { useAuth } from "../../components/AuthProvider";
import { ClinicianHeader } from "../../components/clinician/ClinicianHeader";
import {
  loadClinicianPrefs,
  saveClinicianPrefs,
  resetClinicianPrefs,
  moduleLabel,
  moduleDescription,
  DEFAULT_CLINICIAN_PREFS,
  CHANGE_METRICS,
  type ChangesPrefs,
  type ClinicianPrefs,
  type ViewMode,
} from "../../lib/clinicianPrefs";

const COMPARE_OPTIONS: { id: ChangesPrefs["compare"]; label: string }[] = [
  { id: "visit", label: "Last appointment" },
  { id: "14", label: "Last 2 weeks" },
  { id: "30", label: "Last 30 days" },
  { id: "60", label: "Last 60 days" },
];

function Pill({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors"
      style={{
        background: active ? "var(--cp-teal)" : "#fff",
        color: active ? "#fff" : "var(--cp-text)",
        borderColor: "var(--cp-border)",
      }}
    >
      {children}
    </button>
  );
}

const VIEW_MODES: { id: ViewMode; label: string; description: string }[] = [
  { id: "detailed", label: "Detailed", description: "The full module dashboard configured below" },
  { id: "quick", label: "Quick View", description: "Sleep, anxiety and medication trends with the AI notes summary" },
];

/**
 * Build your view — the clinician's dashboard layout editor.
 *
 * Reordering supports both pointer drag and explicit move buttons. The buttons
 * are not a fallback afterthought: HTML5 drag-and-drop does not fire on touch
 * devices at all, and it is invisible to keyboard and screen-reader users, so
 * the buttons are the primary mechanism and drag is the enhancement.
 */
export default function ClinicianConfigurePage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [prefs, setPrefs] = useState<ClinicianPrefs>(DEFAULT_CLINICIAN_PREFS);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!isLoading && !user) router.push("/login");
  }, [user, isLoading, router]);

  // Starts at defaults so the prerendered shell is stable, then picks up the
  // real stored value on mount — localStorage doesn't exist during `output:
  // "export"`, so this genuinely cannot be read during render. This page holds
  // an editable draft of the prefs, so useSyncExternalStore is the wrong shape:
  // the store seeds local state, it doesn't own it. Same pattern as the
  // dashboard; the one extra render on mount is the intended cost.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPrefs(loadClinicianPrefs());
  }, []);

  const move = useCallback((from: number, to: number) => {
    setPrefs((prev) => {
      if (to < 0 || to >= prev.modules.length || from === to) return prev;
      const modules = [...prev.modules];
      const [moved] = modules.splice(from, 1);
      modules.splice(to, 0, moved);
      return { ...prev, modules };
    });
    setDirty(true);
  }, []);

  const toggle = useCallback((index: number) => {
    setPrefs((prev) => ({
      ...prev,
      modules: prev.modules.map((m, i) => (i === index ? { ...m, on: !m.on } : m)),
    }));
    setDirty(true);
  }, []);

  const setViewMode = useCallback((viewMode: ViewMode) => {
    setPrefs((prev) => ({ ...prev, viewMode }));
    setDirty(true);
  }, []);

  const setChanges = useCallback((patch: Partial<ChangesPrefs>) => {
    setPrefs((prev) => ({ ...prev, changes: { ...prev.changes, ...patch } }));
    setDirty(true);
  }, []);

  function toggleMetric(key: string) {
    const on = prefs.changes.metrics.includes(key);
    setChanges({ metrics: on ? prefs.changes.metrics.filter((m) => m !== key) : [...prefs.changes.metrics, key] });
  }

  function handleSave() {
    saveClinicianPrefs(prefs);
    setDirty(false);
    toast.success("Layout saved");
  }

  function handleReset() {
    setPrefs(resetClinicianPrefs());
    setDirty(false);
    toast.success("Reset to default");
  }

  const enabledCount = prefs.modules.filter((m) => m.on).length;

  return (
    <div className="min-h-screen pb-24">
      <ClinicianHeader backHref="/clinician" />

      <div className="max-w-2xl mx-auto px-4 pt-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--cp-text)" }}>Build your view</h1>
        <p className="text-sm mt-1" style={{ color: "var(--cp-text-muted)" }}>
          Turn sections on or off and reorder them. Every patient dashboard uses this layout.
          Saved to this browser.
        </p>

        <h2 className="text-sm font-bold uppercase tracking-wide mt-6" style={{ color: "var(--cp-text-muted)" }}>
          View mode
        </h2>
        <div
          role="radiogroup"
          aria-label="Dashboard view mode"
          className="rounded-xl border mt-2 divide-y"
          style={{ background: "#fff", borderColor: "var(--cp-border)" }}
        >
          {VIEW_MODES.map((vm) => (
            <button
              key={vm.id}
              role="radio"
              aria-checked={prefs.viewMode === vm.id}
              onClick={() => setViewMode(vm.id)}
              className="w-full flex items-center gap-3 p-3 text-left"
              style={{ borderColor: "var(--cp-border)" }}
            >
              <span
                className="flex-shrink-0 rounded-full border-2"
                style={{
                  width: 18,
                  height: 18,
                  borderColor: prefs.viewMode === vm.id ? "var(--cp-teal)" : "var(--cp-border)",
                  background: prefs.viewMode === vm.id
                    ? "radial-gradient(circle, var(--cp-teal) 0 40%, transparent 44%)"
                    : "transparent",
                }}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "var(--cp-text)" }}>{vm.label}</p>
                <p className="text-xs" style={{ color: "var(--cp-text-muted)" }}>{vm.description}</p>
              </div>
            </button>
          ))}
        </div>

        <h2 className="text-sm font-bold uppercase tracking-wide mt-6" style={{ color: "var(--cp-text-muted)" }}>
          What changed (top of Detailed view)
        </h2>
        <div
          className="rounded-xl border mt-2 p-4 space-y-4"
          style={{ background: "#fff", borderColor: "var(--cp-border)", opacity: prefs.viewMode === "quick" ? 0.5 : 1 }}
        >
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--cp-text)" }}>Compare to</p>
            <p className="text-xs" style={{ color: "var(--cp-text-muted)" }}>
              Last appointment falls back to the last 30 days when there is no visit on record or it was under a week ago.
            </p>
            <div className="flex flex-wrap gap-2 mt-2">
              {COMPARE_OPTIONS.map((o) => (
                <Pill key={o.id} active={prefs.changes.compare === o.id} onClick={() => setChanges({ compare: o.id })}>
                  {o.label}
                </Pill>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--cp-text)" }}>How many changes</p>
            <div className="flex gap-2 mt-2">
              {([3, 5] as const).map((n) => (
                <Pill key={n} active={prefs.changes.count === n} onClick={() => setChanges({ count: n })}>
                  Top {n}
                </Pill>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: "var(--cp-text)" }}>Which metrics count</p>
            <div className="flex flex-wrap gap-2 mt-2">
              {CHANGE_METRICS.map((m) => (
                <Pill key={m.key} active={prefs.changes.metrics.includes(m.key)} onClick={() => toggleMetric(m.key)}>
                  {m.label}
                </Pill>
              ))}
            </div>
          </div>
        </div>

        <h2 className="text-sm font-bold uppercase tracking-wide mt-6" style={{ color: "var(--cp-text-muted)" }}>
          Detailed view layout
        </h2>
        <div
          className="rounded-xl border mt-2 divide-y"
          style={{
            background: "#fff",
            borderColor: "var(--cp-border)",
            opacity: prefs.viewMode === "quick" ? 0.5 : 1,
          }}
        >
          {prefs.modules.map((m, i) => (
            <div
              key={m.id}
              draggable
              onDragStart={() => setDragIndex(i)}
              onDragEnd={() => setDragIndex(null)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => {
                e.preventDefault();
                if (dragIndex !== null) move(dragIndex, i);
                setDragIndex(null);
              }}
              className="flex items-center gap-3 p-3 transition-opacity"
              style={{
                borderColor: "var(--cp-border)",
                opacity: dragIndex === i ? 0.4 : 1,
                cursor: "grab",
              }}
            >
              <div className="flex flex-col flex-shrink-0">
                <button
                  onClick={() => move(i, i - 1)}
                  disabled={i === 0}
                  aria-label={`Move ${moduleLabel(m.id)} up`}
                  className="p-0.5 disabled:opacity-25 hover:opacity-70"
                  style={{ color: "var(--cp-text-muted)" }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 15l7-7 7 7" />
                  </svg>
                </button>
                <button
                  onClick={() => move(i, i + 1)}
                  disabled={i === prefs.modules.length - 1}
                  aria-label={`Move ${moduleLabel(m.id)} down`}
                  className="p-0.5 disabled:opacity-25 hover:opacity-70"
                  style={{ color: "var(--cp-text-muted)" }}
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold" style={{ color: "var(--cp-text)" }}>
                  {moduleLabel(m.id)}
                </p>
                <p className="text-xs" style={{ color: "var(--cp-text-muted)" }}>
                  {moduleDescription(m.id)}
                </p>
              </div>

              <button
                role="switch"
                aria-checked={m.on}
                aria-label={`${m.on ? "Hide" : "Show"} ${moduleLabel(m.id)}`}
                onClick={() => toggle(i)}
                className="relative flex-shrink-0 rounded-full transition-colors"
                style={{
                  width: 42,
                  height: 24,
                  background: m.on ? "var(--cp-teal)" : "#D1D5DB",
                }}
              >
                <span
                  className="absolute top-0.5 rounded-full bg-white transition-all"
                  style={{ width: 20, height: 20, left: m.on ? 20 : 2 }}
                />
              </button>
            </div>
          ))}
        </div>

        {enabledCount === 0 && (
          <p className="text-xs mt-3" style={{ color: "var(--cp-amber)" }}>
            Every section is hidden — the dashboard will show only What changed.
          </p>
        )}
      </div>

      {/* Sticky action bar so Save is reachable without scrolling back up. */}
      <div
        className="fixed bottom-0 left-0 right-0 border-t px-4 py-3"
        style={{ background: "#fff", borderColor: "var(--cp-border)" }}
      >
        <div className="max-w-2xl mx-auto flex items-center gap-3">
          <button
            onClick={handleSave}
            className="px-4 py-2 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
            style={{ background: "var(--cp-teal)" }}
          >
            Save layout
          </button>
          <button
            onClick={handleReset}
            className="px-4 py-2 rounded-lg text-sm font-semibold border transition-colors"
            style={{ borderColor: "var(--cp-border)", color: "var(--cp-text-muted)", background: "#fff" }}
          >
            Reset to default
          </button>
          {dirty && (
            <span className="text-xs" style={{ color: "var(--cp-text-muted)" }}>
              Unsaved changes
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
