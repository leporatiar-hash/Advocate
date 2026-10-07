"use client";

import type { Timeframe } from "../lib/insights";
import { WARM } from "../lib/warmTheme";

const OPTIONS: { tf: Timeframe; label: string }[] = [
  { tf: "1W", label: "Week" },
  { tf: "1M", label: "Month" },
  { tf: "3M", label: "3 months" },
  { tf: "1Y", label: "Year" },
];

// The one period picker for Insights and its detail pages.
export function TimeframeToggle({ current, onChange }: { current: Timeframe; onChange: (tf: Timeframe) => void }) {
  return (
    <div className="flex gap-1 rounded-2xl p-1" style={{ background: WARM.warm, border: `1px solid ${WARM.warmBorder}` }}
      role="group" aria-label="Time period">
      {OPTIONS.map(({ tf, label }) => (
        <button
          key={tf}
          type="button"
          onClick={() => onChange(tf)}
          aria-pressed={current === tf}
          className="flex-1 py-2 rounded-xl text-sm font-semibold transition-all"
          style={current === tf
            ? { background: "white", color: WARM.forest, boxShadow: "0 1px 2px rgba(26,36,32,0.08)" }
            : { background: "transparent", color: WARM.inkSoft }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

export function periodLabel(tf: Timeframe): string {
  return tf === "1W" ? "This week" : tf === "1M" ? "This month" : tf === "3M" ? "Last 3 months" : "This year";
}
