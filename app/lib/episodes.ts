// Episode "what happened as a result" and "next step" choices. Presets plus
// whatever the caregiver adds (saved in user_config so they come back next
// time). Stored values: preset outcome keys stay as before; custom outcomes
// and all next steps are stored as their display text.

export const OUTCOME_PRESETS: { value: string; label: string }[] = [
  { value: "held_at_home", label: "Handled at home" },
  { value: "crisis_line", label: "Called the crisis line" },
  { value: "ed_visit", label: "ER visit" },
  { value: "admitted", label: "Admitted" },
];

export const NEXT_STEP_PRESETS = [
  "Contact the doctor",
  "Adjust medication",
  "Request a plasma level",
  "Watch and wait",
];

export function outcomeLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  return OUTCOME_PRESETS.find(o => o.value === value)?.label ?? value;
}
