export const DEFAULT_SYMPTOM_NAMES = [
  "Anxiety", "Aggression", "Confusion", "Fatigue",
  "Pain", "Nausea", "Crying", "Mood Changes",
  "Sleep Issues", "Appetite Changes",
];

export const DEFAULT_ACTIVITY_OPTIONS: { type: string; label: string }[] = [
  { type: "walking", label: "Walking" },
  { type: "running", label: "Running" },
  { type: "music", label: "Music" },
  { type: "drawing", label: "Drawing" },
  { type: "reading", label: "Reading" },
  { type: "cooking", label: "Cooking" },
  { type: "socializing", label: "Socializing" },
  { type: "physical_therapy", label: "Physical Therapy" },
  { type: "meditation", label: "Meditation" },
  { type: "journaling", label: "Journaling" },
  { type: "other", label: "Other" },
];

// Daily-log tracking modules, shared by the caregiver Customize page and the
// clinician's demo-patient configure page.
export const PRESET_TRACKING = [
  { key: "sleep",     label: "Sleep",     sub: "Log nightly hours of sleep" },
  { key: "hydration", label: "Hydration", sub: "Log daily hydration level" },
  { key: "vitals",    label: "Vitals",    sub: "Heart rate and blood pressure" },
];
export const DEFAULT_TRACKING = ["sleep", "hydration", "vitals"];
