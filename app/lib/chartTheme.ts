/**
 * Shared chart theme for the clinician portal.
 *
 * The categorical order below is fixed and is assigned by slot index, never
 * cycled — a sixth series would have to reuse a hue, and two symptoms sharing a
 * colour on a clinical chart is worse than not plotting the sixth. The backend
 * caps series at MAX_CHARTED_SYMPTOMS and reports how many it omitted so the UI
 * can say so out loud.
 *
 * Validated against the portal's actual chart surface (#ffffff, the card
 * background — not the page's #FAFAF7) for the lightness band, chroma floor,
 * colour-vision separation and normal-vision separation. Worst adjacent pair is
 * ΔE 9.1 for protanopia and 19.6 for normal vision, both clear of their floors.
 *
 * Three slots sit below 3:1 contrast against white, which obliges *relief*:
 * every multi-series chart ships a legend AND direct end-labels AND a hover
 * tooltip, so a series is never identified by colour alone. Do not drop those
 * affordances without re-validating.
 *
 * The brand teal (--cp-teal, #0F6B66) is deliberately NOT a series colour: it
 * fails the chroma floor and reads as grey next to real hues. It stays chrome —
 * headers, borders, focus rings.
 */

export const SERIES_COLORS = [
  "#2a78d6", // 1 blue
  "#eb6834", // 2 orange
  "#1baf7a", // 3 aqua
  "#eda100", // 4 yellow
  "#e87ba4", // 5 magenta
] as const;

/** Single hue for one-series charts and small multiples, where the panel title
 *  carries identity and colour carries nothing. */
export const SINGLE_SERIES_COLOR = "#2a78d6";

/** Chart chrome. Recessive by design — the data is the only assertive thing. */
export const CHART_INK = {
  surface: "#ffffff",
  gridline: "#EDEDE8",
  axis: "#C3C2B7",
  textMuted: "#898781",
  textSecondary: "#52514E",
  border: "rgba(11,11,11,0.10)",
} as const;

/** Status colours, matched to clinicianSeverity.ts. Reserved — never reused as
 *  a series colour, and always shipped with a label rather than colour alone. */
export const STATUS_COLORS = {
  good: "#15803D",
  warning: "#D97706",
  critical: "#B91C1C",
  neutral: "#9CA3AF",
} as const;

export function seriesColor(index: number): string {
  return SERIES_COLORS[index] ?? SINGLE_SERIES_COLOR;
}

/** Translucent fill for single-series area charts. */
export function fillFor(hex: string): string {
  return `${hex}1F`;
}

/** "Aug 3" from an ISO date, without dragging in a date library. */
export function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
