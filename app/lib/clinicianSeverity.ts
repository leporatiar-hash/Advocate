// Shared severity color scale for the clinician portal's Temporal Data
// section. Thresholds mirror backend/services/aggregation.py
// (SEV_GREEN_MAX / SEV_AMBER_MAX) so a bin's color always means the same
// thing on both sides — components must import these, never hardcode a hex
// value per marker.
export const SEVERITY_COLORS = {
  green: "#15803D",
  amber: "#D97706",
  red: "#B91C1C",
  neutral: "#9CA3AF",
} as const;

export type SeverityColorName = keyof typeof SEVERITY_COLORS;

export const SEV_GREEN_MAX = 2.9;
export const SEV_AMBER_MAX = 5.9;

export function severityToColorName(sev: number | null): SeverityColorName {
  if (sev == null) return "neutral";
  if (sev <= SEV_GREEN_MAX) return "green";
  if (sev <= SEV_AMBER_MAX) return "amber";
  return "red";
}

export function severityToColor(sev: number | null): string {
  return SEVERITY_COLORS[severityToColorName(sev)];
}
