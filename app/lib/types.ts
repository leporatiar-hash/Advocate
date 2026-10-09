export interface User {
  id: number;
  email: string;
  name: string;
  role: "caregiver" | "patient" | "clinician";
  created_at: string;
  user_config: DashboardConfig | null;
}

export interface AuthResponse {
  user: User;
  access_token: string;
  token_type: "bearer";
}

export interface Medication {
  id: number;
  patient_id: number;
  name: string;
  dose: string;
  frequency: string;
  time_of_day: string;
  active: boolean;
  // Dosing schedule — see app/lib/medSchedule.ts. Null on meds created before
  // schedules existed; those are inferred from `frequency`.
  schedule_type?: MedScheduleType | null;
  schedule_interval_days?: number | null;
  schedule_start_date?: string | null; // YYYY-MM-DD, any day a dose was due
  schedule_weekdays?: number[] | null;  // Monday = 0 … Sunday = 6
}

export type MedScheduleType = "daily" | "every_n_days" | "weekdays" | "as_needed";

// A caregiver-defined vital or lab value. Older configs stored bare names;
// normalize with normalizeCustomVitals (app/lib/customVitals.ts).
export interface CustomVital {
  name: string;
  type: "number" | "text";
  unit?: string;
}

// One reading, stored in DailyLog.vitals.custom keyed by vital name. The unit
// is saved with the reading so a later unit change doesn't relabel old data.
export interface CustomVitalReading {
  value: string;
  unit?: string | null;
}

export interface DashboardConfig {
  symptoms: string[];
  activities: string[];
  modules: string[];
  symptom_label?: string;
  episode_label?: string;
  greeting?: string;
  lifestyle_flags?: Array<"smoked" | "alcohol" | "stressed" | "ate_well">;
  substance_fields?: string[]; // "cigarettes", "alcohol", or any custom substance name
  condition_context?: string;
  summary_style?: "compassionate" | "clinical" | "adaptive";
  dose_timing_mode?: "quick" | "simple" | "exact";
  tracking_modules?: string[]; // "sleep" | "hydration" | "vitals" | custom names
  custom_vitals?: Array<CustomVital | string>; // legacy entries are bare names
  progress_areas?: ProgressArea[];
  track_progress?: boolean; // opt-in; off unless the caregiver turns it on
  show_socialization?: boolean;
  // Display only — the underlying value logged is still 0-10 either way (no
  // schema change, same DailyLog.symptoms shape). "words" shows a four-tile
  // None/Low/Medium/High picker instead of the numeric slider, using the
  // same band thresholds the clinician-facing views already bucket by.
  symptom_scale?: "numeric" | "words";
}

export interface TherapyEntry {
  modality: "individual" | "group";
  name: string;
}

export interface ClinicianEntry {
  role: string;
  name: string;
  specialty: string | null;
  contact: string | null;
}

export interface TreatmentPlan {
  id: number;
  patient_id: number;
  therapies: TherapyEntry[] | null;
  clinicians: ClinicianEntry[] | null;
  bedtime: string | null;
  wake_time: string | null;
  sleep_notes: string | null;
  substances_to_avoid: string | null;
  care_goals: string | null;
  next_appointment_date: string | null;
  next_appointment_with: string | null;
  last_appointment_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface Patient {
  id: number;
  name: string;
  date_of_birth: string | null;
  diagnosis: string;
  notes: string | null;
  caregiver_id: number;
  medications: Medication[];
  dashboard_config: DashboardConfig | null;
  treatment_plan: TreatmentPlan | null;
}

export interface MedicationTaken {
  medication_id: number;
  taken: boolean;
  time_taken: string | null; // "HH:MM"
  medication_name?: string; // present on clinician drill-down responses, resolved server-side
}

export interface Symptom {
  name: string;
  severity?: number | null;
  worse_than_usual?: boolean;
}

export type EpisodeOutcome = "held_at_home" | "crisis_line" | "ed_visit" | "admitted";

export interface Episode {
  occurred: boolean;
  time: string;
  description: string;
  outcome?: EpisodeOutcome | null;
  // Present only when backfilling an episode that spans days before today's
  // log date — start/end describe the episode itself, independent of which
  // day's entry this is filed under. Absent for a same-day episode (start/end
  // both default to this entry's own date on the backend).
  start?: string | null;
  end?: string | null;
}

export interface Vitals {
  heart_rate: string;
  blood_pressure: string;
  cigarettes: string;
  alcohol: boolean;
  alcohol_drinks: string;
  custom_substances?: Record<string, boolean>;
  custom?: Record<string, CustomVitalReading>;
}

export interface SideEffect {
  name: string;
  severity: number;
}

export interface MedicationSideEffect {
  medication_id: number;
  medication_name: string;
  side_effects: SideEffect[];
}

export interface Activity {
  type: string;
  duration_minutes?: number | null;
}

export interface Lifestyle {
  smoked: boolean;
  alcohol: boolean;
  stressed: boolean;
  ate_well: boolean;
}

// ── Progress / improvements (higher / "better" is good) ─────────────────────

export type ProgressScale = "numeric" | "compare";
export type CompareValue = "worse" | "same" | "better";

// Set up in Settings → Customize. medication_id optionally names the med
// this area is tracking the effect of (e.g. Motivation → Cariprazine).
export interface ProgressArea {
  name: string;
  scale: ProgressScale;
  medication_id?: number | null;
}

export type ProgressRating =
  | { scale: "numeric"; value: number }
  | { scale: "compare"; value: CompareValue };

// Stored on DailyLog.progress.
export interface LogProgress {
  ratings: Record<string, ProgressRating>;
  wins: string | null;
}

export interface ProgressAreaStat {
  scale: ProgressScale;
  count: number;
  readings: { date: string; value: number | CompareValue }[];
  latest: { date: string; value: number | CompareValue };
  linked_medication: string | null;
  avg?: number;
  trend?: "improving" | "steady" | "declining" | null;
  first_half_avg?: number;
  last_half_avg?: number;
  counts?: Record<CompareValue, number>;
}

export interface ProgressStats {
  areas: Record<string, ProgressAreaStat>;
  wins: { date: string; text: string }[];
}

export interface DailyLog {
  id: number;
  patient_id: number;
  logged_by: number;
  date: string;
  medications_taken: MedicationTaken[] | null;
  symptoms: Symptom[] | null;
  medication_side_effects: MedicationSideEffect[] | null;
  sleep_hours: number | null;
  mood_score: number | null;
  water_intake_oz: number | null;
  activities: Activity[] | null;
  lifestyle: Lifestyle | null;
  notes: string | null;
  episode: Episode | null;
  vitals: Vitals | null;
  progress?: LogProgress | null;
  photo: string | null;
  socialization: Socialization | null;
  log_type: "detailed" | "same_as_yesterday" | "nothing_notable" | "catch_up_note" | null;
  // Set when saved on a later day than `date`: first logged after the fact
  // ("added") or an on-time entry changed later ("edited").
  late_kind?: "added" | "edited" | null;
  late_saved_at?: string | null;
  created_at: string;
}

export interface SocialContact {
  id: number;
  user_id: number;
  name: string;
  created_at: string;
}

export interface Socialization {
  left_house: boolean | null;
  had_contact: boolean | null;
  contact_ids: number[];
  quality: "good" | "neutral" | "difficult" | null;
  initiated_by: "self" | "other" | null;
}

export interface KnownSideEffect {
  name: string;
  frequency: "common" | "uncommon" | "rare";
  category: string;
}

export interface AdherenceItem {
  medication: string;
  percentage: number;
  days_taken: number;
  days_logged: number;
  notes?: string;
}

export interface PatternItem {
  finding: string;
  significance: string;
}

export interface MedicationSideEffectSummary {
  known: string[];
  observed: string[];
  clinical_note: string;
}

export interface ReviewableFact {
  type: string;
  medication_id: number;
  medication_name: string;
  date: string;
  label: string;
}

export interface SummaryResponse {
  executive_summary: string;
  adherence: AdherenceItem[];
  medication_side_effects?: Record<string, MedicationSideEffectSummary>;
  patterns: PatternItem[];
  lifestyle_notes: string[];
  discussion_items: string[];
  adherence_data?: Record<string, { name: string; percentage: number; days_taken: number; days_logged: number }>;
  assessment_data?: Record<string, AssessmentDataEntry>;
  reviewable_facts?: ReviewableFact[];
  // Server-computed, never AI-generated.
  as_needed_usage?: Record<string, AsNeededUsage>;
  custom_vital_stats?: Record<string, CustomVitalStat>;
  progress_stats?: ProgressStats;
}

export interface AsNeededUsage {
  name: string;
  times_given: number;
  days_given: number;
  dates: string[];
}

export interface CustomVitalStat {
  readings: { date: string; value: string | number; unit: string | null }[];
  count: number;
  latest: { date: string; value: string | number; unit: string | null };
  numeric_count: number;
  min: number | null;
  max: number | null;
  avg: number | null;
}

export type InstrumentKey = "lawton_iadl" | "phq9" | "csi";

export interface InstrumentOption {
  value: number;
  label: string;
}

export interface InstrumentQuestion {
  id: string;
  text: string;
  options: InstrumentOption[];
}

export interface InstrumentDefinition {
  name: string;
  subject: "patient_observed" | "patient_self" | "caregiver_self";
  description: string;
  max_score: number;
  stem: string | null;
  questions: InstrumentQuestion[];
}

export interface AssessmentStatusItem {
  instrument_key: InstrumentKey;
  name: string;
  description: string;
  last_taken_at: string | null;
  due: boolean;
}

export interface Assessment {
  id: number;
  patient_id: number;
  caregiver_id: number;
  instrument_key: InstrumentKey;
  responses: Record<string, number>;
  computed_score: number;
  max_score: number;
  completion_mode: "self" | "assisted" | null;
  created_at: string;
}

export interface AssessmentScoreEntry {
  date: string;
  score: number;
  mode?: "self" | "assisted";
}

export interface AssessmentDataEntry {
  name: string;
  max_score: number;
  scores: AssessmentScoreEntry[];
  latest: number;
  delta: number | null;
}

// ── Clinician Portal ────────────────────────────────────────────────────────

export interface ShareCode {
  code: string;
  expires_at: string;
  redemption_count: number;
  revoked: boolean;
}

export interface LinkedClinician {
  clinician_id: number;
  name: string | null;
  email: string;
  linked_at: string;
}

export interface RedeemCodeResult {
  patient_id: number;
  patient_name: string;
}

export interface MedicationSuggestion {
  name: string;
  /** "local" = curated bundled list, "rxnorm" = NLM RxNav lookup. */
  source: string;
  /** True for spelling-tolerant matches, shown as "did you mean". */
  approximate: boolean;
}

export interface ClinicianPatientSummary {
  id: number;
  name: string;
  age: number | null;
  diagnosis: string | null;
  days_logged: number;
  days_in_window: number;
  last_log_date: string | null;
  high_flags: number;
  moderate_flags: number;
  low_flags: number;
  top_concern: string | null;
  adherence_pct: number | null;
  avg_symptom_severity: number | null;
  /** Per-day mean symptom severity, oldest first; null on unlogged days. */
  severity_series: (number | null)[];
}

export interface PortalWindow {
  days: number;
  start: string;
  end: string;
}

export interface PortalStats {
  log_frequency: { days_logged: number; days_in_window: number; pct: number };
  symptom_load: { avg_severity: number | null; distinct_symptoms: number };
  avg_sleep: { hours: number | null; days_logged: number };
  med_adherence: { pct: number };
}

export interface PortalFlag {
  severity: "high" | "moderate" | "low";
  metric: string;
  text: string;
}

export interface SymptomFrequencyEntry {
  symptom: string;
  days_present: number;
  avg_severity: number | null;
  prev_avg_severity: number | null;
  direction: "better" | "worse" | "steady";
  low_n: boolean;
}

export interface MedAdherenceEntry {
  medication: string;
  taken: number;
  expected: number;
  pct: number;
}

export interface RecentNote {
  date: string;
  text: string;
  badges: string[];
  reaffirmed_dates: string[];
}

export interface InsightUnit {
  category: string;
  observation: string;
  takeaway: string;
  chip: "watch" | "steady" | "low_data";
  source_note_ids: string[];
}

export interface WhatWentWellItem {
  observation: string;
  date: string;
}

export interface ClinicalSummary {
  insights: InsightUnit[];
  what_went_well: WhatWentWellItem[];
  /** Two-sentence prose version of what_went_well (Quick View). Empty or
   * missing on syntheses generated before it existed. */
  what_went_well_summary?: string;
  generated_at: string;
  window_days: number;
  validation_warnings: string[];
}

export interface TrendStat {
  value: number | null;
  prev: number | null;
  direction: "up" | "down" | "steady";
}

export interface GlanceStats {
  adherence: TrendStat;
  flagged_episodes: TrendStat;
  symptom_load: TrendStat;
  days_logged: { value: number; total: number };
}

export interface TrajectoryDay {
  date: string;
  severity: number | null;
  episode: boolean;
  smoked: boolean;
  logged: boolean;
}

export interface PortalTrajectory {
  days: TrajectoryDay[];
}

export interface TemporalBin {
  start: string;
  end: string;
  label: string;
  bin_size: "day" | "week" | "month";
  color: "green" | "amber" | "red" | "neutral";
  bin_sev: number | null;
  has_episode: boolean;
  readout: string | null;
  logged_days: number;
  scored_days: number;
  notes: string[];
}

export interface TemporalResponse {
  bins: TemporalBin[];
  bin_size: "day" | "week" | "month";
  total_logged_days: number;
  not_enough_history: boolean;
}

export interface SymptomSeries {
  symptom: string;
  /** One entry per date in the parent block; null where not scored that day. */
  values: (number | null)[];
  /** Stable palette slot keyed by symptom name — same slot on every chart. */
  color_index: number;
}

export interface SymptomSeriesBlock {
  dates: string[];
  series: SymptomSeries[];
  /** Symptoms present but not charted, so the UI can disclose the cap. */
  omitted: number;
}

export interface AdherenceSeriesBlock {
  dates: string[];
  values: (number | null)[];
}

export type SymptomTier = "red" | "amber" | "routine";
export type SymptomEvent = "emerged" | "resolved" | "persisting" | "worsening" | "improving" | "steady";

export interface SymptomDelta {
  symptom: string;
  tier: SymptomTier;
  event: SymptomEvent;
  /** Stable palette slot keyed by symptom name — never derived from rank order. */
  color_index: number;
  dates: string[];
  values: (number | null)[];
  baseline_date: string | null;
  baseline_value: number | null;
  current_date: string | null;
  current_value: number | null;
  delta: number | null;
  low_n: boolean;
}

export interface AdherenceDelta {
  dates: string[];
  values: (number | null)[];
  baseline_date: string | null;
  baseline_value: number | null;
  current_date: string | null;
  current_value: number | null;
  delta: number | null;
  low_n: boolean;
}

export interface SymptomTickerResponse {
  delta_window_days: number;
  chart_window_days: number;
  symptoms: SymptomDelta[];
  adherence: AdherenceDelta;
  /** Days logged within the *currently selected* range, not a stale fixed window. */
  days_logged: number;
  days_in_window: number;
  window_notes: RecentNote[];
  headline: string;
  headline_source: "llm" | "fallback";
  /** Null when no appointment has ever been recorded for this patient. */
  last_appointment_date: string | null;
}

export interface TopFlag {
  date: string;
  text: string;
  quote: string | null;
  /** One-sentence AI summary shown instead of the raw note (null until the
   * synthesis has been generated for this note). */
  summary?: string | null;
  note_id: string | null;
}

export interface ClinicianPortalResponse {
  window: PortalWindow;
  patient: { name: string; age: number | null; active_medications: string[] };
  clinical_summary: ClinicalSummary | null;
  stats: PortalStats;
  flags: PortalFlag[];
  glance_stats: GlanceStats;
  trajectory: PortalTrajectory;
  top_flag: TopFlag | null;
  symptom_frequency: SymptomFrequencyEntry[];
  symptom_series: SymptomSeriesBlock;
  adherence_series: AdherenceSeriesBlock;
  med_adherence: MedAdherenceEntry[];
  recent_notes: RecentNote[];
  progress_stats?: ProgressStats;
}

export interface SavedSummary {
  id: number;
  user_id: number;
  patient_id: number;
  title: string;
  content: string;
  date_range_start: string;
  date_range_end: string;
  created_at: string;
}

// ── Clinician timeline (demo build, NOT the production clinician portal) ────

export type TimelineWindow = "1m" | "2m" | "3m" | "12m";
export type TimelineBand = "none" | "low" | "medium" | "high";
export type TimelineAxis = "band" | "numeric";

export interface TimelineSeriesPoint {
  date: string;
  band: TimelineBand | null;
  value: number | null;
}

export interface TimelineNote {
  date: string;
  author: string;
  text: string;
}

export interface TimelineWeeklyPoint {
  week_start: string;
  week_end: string;
  band: TimelineBand | null;
  value: number | null;
  days_logged: number;
  days_in_week: number;
}

export interface TimelineExtremePoint {
  date: string;
  value: number | null;
  band: TimelineBand | null;
}

export interface TimelineMonthlyExtreme {
  month: string;
  high: TimelineExtremePoint;
  low: TimelineExtremePoint;
}

export interface TimelineDomain {
  key: string;
  label: string;
  axis: TimelineAxis;
  caption: string;
  series: TimelineSeriesPoint[];
  weekly_series: TimelineWeeklyPoint[];
  monthly_extremes: TimelineMonthlyExtreme[];
  /** Domain-specific wording for band levels (e.g. "Full adherence" instead
   * of a bare "High") — null for the numeric (Weight) domain, which has no
   * bands to label. */
  band_labels: Record<string, string> | null;
  summary: string | null;
  summary_generated_at: string | null;
  notes: TimelineNote[];
}

export interface TimelineEpisodeEvent {
  type: "episode";
  start: string;
  end: string;
  outcome: string | null;
  logged_at: string;
}

export interface TimelineMarkerEvent {
  type: "med_change";
  date: string;
  label: string;
}

export type TimelineEventItem = TimelineEpisodeEvent | TimelineMarkerEvent;

export interface TimelineResponse {
  patient: {
    name: string;
    range_start: string;
    range_end: string;
    days_in_range: number;
    days_logged: number;
    authors: string[];
  };
  headline: string;
  headline_generated_at: string | null;
  pending: boolean;
  available_windows: TimelineWindow[];
  events: TimelineEventItem[];
  domains: TimelineDomain[];
  other_notes: TimelineNote[];
}

/** Dashboard Quick View tiles — see GET /clinicians/patient/{id}/quick-tiles. */
export interface QuickTilesResponse {
  window_days: number;
  dates: string[];
  events: TimelineEventItem[];
  days_logged: number;
  doses_expected: number;
  doses_missed: number;
  domains: { key: "sleep" | "anxiety" | "medication"; label: string; series: TimelineSeriesPoint[] }[];
}

/** Detailed view "What changed" — see GET /clinicians/patient/{id}/changes. */
export interface ChangesResponse {
  kind: "visit" | "window";
  days: number;
  last_visit: string | null;
  after_start: string;
  changes: { metric: string; label: string; text: string; direction: "better" | "worse" | "neutral" }[];
  steady: string[];
}
