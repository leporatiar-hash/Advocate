"use client";

import { useState } from "react";

export interface Choice { value: string; label: string; custom?: boolean }

/** Tap-to-select chips with an "+ Add your own" field. Single-select taps
 * again to clear; custom choices can be removed with ×. */
export function ChoiceChips({ choices, selected, multi, onToggle, onAdd, onRemove, addPlaceholder }: {
  choices: Choice[];
  selected: string[];
  multi?: boolean;
  onToggle: (value: string) => void;
  onAdd: (label: string) => void;
  onRemove: (value: string) => void;
  addPlaceholder: string;
}) {
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState("");
  const submit = () => {
    const t = text.trim();
    if (t) onAdd(t);
    setText(""); setAdding(false);
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2" role={multi ? "group" : "radiogroup"}>
        {choices.map(c => {
          const on = selected.includes(c.value);
          return (
            <span key={c.value} className="inline-flex items-center rounded-xl border-2 transition-all"
              style={{ borderColor: on ? "#4a7c59" : "#E2E8F0", background: on ? "#4a7c59" : "white" }}>
              <button type="button" onClick={() => onToggle(c.value)} aria-pressed={on}
                className="px-3 py-2 text-sm font-semibold" style={{ color: on ? "white" : "#475569" }}>
                {c.label}
              </button>
              {c.custom && !on && (
                <button type="button" onClick={() => onRemove(c.value)} aria-label={`Remove ${c.label}`}
                  className="pr-2.5 text-slate-300 hover:text-red-500 leading-none">×</button>
              )}
            </span>
          );
        })}
        {!adding && (
          <button type="button" onClick={() => setAdding(true)}
            className="px-3 py-2 rounded-xl border-2 border-dashed text-sm font-semibold" style={{ borderColor: "#d4e0d7", color: "#4a7c59" }}>
            + Add your own
          </button>
        )}
      </div>
      {adding && (
        <div className="flex gap-2">
          <input autoFocus type="text" value={text} maxLength={60} placeholder={addPlaceholder}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); submit(); } if (e.key === "Escape") setAdding(false); }}
            className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-200 text-base text-navy focus:outline-none bg-white" />
          <button type="button" onClick={submit} disabled={!text.trim()}
            className="px-4 py-2 rounded-xl text-white text-sm font-semibold disabled:opacity-40" style={{ background: "#4a7c59" }}>Add</button>
        </div>
      )}
    </div>
  );
}
