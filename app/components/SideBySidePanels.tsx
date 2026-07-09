import { PhoneFrame } from "./HeroSummaryCard";

const C = {
  forest: "#2d4f38",
  sage: "#4a7c59",
  sageMist: "#f2f7f3",
  ink: "#1a2420",
  inkMid: "#3d4f47",
  inkSoft: "#6b7d74",
  cream: "#faf9f6",
  white: "#ffffff",
  rule: "#d4e0d7",
  watch: "#b45309",
  watchBg: "#fef3c7",
  alert: "#b91c1c",
  alertBg: "#fee2e2",
  good: "#16a34a",
  goodBg: "#dcfce7",
};

function SliderRow({ label, value }: { label: string; value: number }) {
  const pct = (value / 10) * 100;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.inkMid }}>{label}</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: C.sage }}>{value}</span>
      </div>
      <div style={{ position: "relative", height: 6, borderRadius: 3, background: C.rule }}>
        <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: `${pct}%`, borderRadius: 3, background: C.sage }} />
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: `${pct}%`,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: C.sage,
            border: `2px solid ${C.white}`,
            boxShadow: "0 1px 4px rgba(0,0,0,0.2)",
            transform: "translate(-50%, -50%)",
          }}
        />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#94a3b8" }}>
        <span>None</span>
        <span>10</span>
      </div>
    </div>
  );
}

const TAB_ICON_PROPS = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const TABS = [
  { label: "Home", active: false, icon: (stroke: string) => <svg {...TAB_ICON_PROPS} stroke={stroke}><path d="M3 11l9-7 9 7M5 10v9a1 1 0 001 1h4v-6h4v6h4a1 1 0 001-1v-9" /></svg> },
  { label: "Log", active: true, icon: (stroke: string) => <svg {...TAB_ICON_PROPS} stroke={stroke}><path d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5M17.5 3.5a2 2 0 112.8 2.8L11 15h-3v-3l9.5-8.5z" /></svg> },
  { label: "Insights", active: false, icon: (stroke: string) => <svg {...TAB_ICON_PROPS} stroke={stroke}><path d="M4 19V9m6 10V5m6 14v-7m6 7V11" /></svg> },
  { label: "Summary", active: false, icon: (stroke: string) => <svg {...TAB_ICON_PROPS} stroke={stroke}><path d="M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1z" /><path d="M9 12h6M9 16h6" /></svg> },
  { label: "History", active: false, icon: (stroke: string) => <svg {...TAB_ICON_PROPS} stroke={stroke}><circle cx="12" cy="13" r="8" /><path d="M12 9v4l3 2M9 2h6" /></svg> },
];

export function LogInputPanel() {
  return (
    <PhoneFrame width={320}>
      <div style={{ background: C.ink, padding: "14px 16px" }}>
        <span style={{ color: C.white, fontWeight: 700, fontSize: 15, letterSpacing: "-0.01em" }}>Advocate</span>
      </div>

      <div style={{ padding: "16px 16px 0" }}>
        <div style={{ fontFamily: "var(--font-lora), serif", fontSize: "1.2rem", fontWeight: 500, color: C.forest }}>Daily Log</div>
        <div style={{ fontSize: 13, color: C.inkSoft, marginTop: 2 }}>Wednesday, July 8</div>
      </div>

      <div style={{ padding: "14px 16px 0", display: "flex", gap: 8 }}>
        <div style={{ flex: 1, textAlign: "center", padding: "8px 6px", borderRadius: 999, border: `1.5px solid ${C.sage}`, color: C.sage, fontSize: 12, fontWeight: 700 }}>
          Same as yesterday
        </div>
        <div style={{ flex: 1, textAlign: "center", padding: "8px 6px", borderRadius: 999, border: "1.5px solid #94a3b8", color: "#64748b", fontSize: 12, fontWeight: 700 }}>
          Nothing notable
        </div>
      </div>

      <div style={{ padding: "16px 16px 0", display: "flex", flexDirection: "column", gap: 16 }}>
        <div style={{ background: C.white, border: `1px solid ${C.rule}`, borderRadius: 14, padding: "14px 16px", display: "flex", flexDirection: "column", gap: 16 }}>
          <SliderRow label="Appetite" value={2} />
          <SliderRow label="Agitation" value={4} />
          <SliderRow label="Sleep Issues" value={6} />
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: C.inkMid }}>Notes</span>
          <p style={{ margin: 0, fontSize: "0.9rem", color: C.inkSoft, lineHeight: 1.6, background: C.sageMist, borderRadius: 10, padding: "12px 14px" }}>
            Skipped breakfast again. Seemed more on edge by evening, snapped at his sister over something small.
          </p>
        </div>

        <div style={{ textAlign: "center", padding: "12px", borderRadius: 14, background: "linear-gradient(135deg, #4a7c59, #2d4f38)", color: C.white, fontWeight: 700, fontSize: 14 }}>
          Save Log
        </div>
      </div>

      <div style={{ display: "flex", borderTop: `1px solid ${C.rule}`, padding: "8px 4px 10px", background: C.white, marginTop: 16 }}>
        {TABS.map((tab) => {
          const stroke = tab.active ? C.sage : "#94a3b8";
          return (
            <div key={tab.label} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
              {tab.icon(stroke)}
              <span style={{ fontSize: 9, fontWeight: 600, color: stroke }}>{tab.label}</span>
            </div>
          );
        })}
      </div>
    </PhoneFrame>
  );
}

export function BrowserFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ border: `1px solid ${C.rule}`, borderRadius: 12, overflow: "hidden", boxShadow: "0 24px 60px rgba(26,36,32,0.12)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, padding: "10px 14px", background: "#e9ece9", borderBottom: `1px solid ${C.rule}` }}>
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#ec6a5e" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#f4bf4f" }} />
        <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#61c454" }} />
      </div>
      <div style={{ background: C.white, padding: 28 }}>{children}</div>
    </div>
  );
}

// ── Laptop frame: a new device chrome, distinct from PhoneFrame/BrowserFrame,
// used only for the clinician portal mockup below. Bezel color matches
// PhoneFrame's bezel so the two devices visually pair side by side. ──
function LaptopFrame({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ width: "100%", maxWidth: 560, margin: "0 auto", filter: "drop-shadow(0 20px 40px rgba(15,23,42,0.12))" }}>
      <div style={{ background: "#111418", borderRadius: "14px 14px 4px 4px", padding: "8px 9px 9px" }}>
        <div style={{ display: "flex", justifyContent: "center", marginBottom: 5 }}>
          <span style={{ width: 4, height: 4, borderRadius: "50%", background: "#565b58" }} />
        </div>
        <div style={{ background: C.white, borderRadius: 8, overflow: "hidden" }}>{children}</div>
      </div>
      <div
        style={{
          height: 12,
          margin: "0 -7%",
          background: "linear-gradient(180deg, #e5e5e3, #c9cbc7)",
          borderRadius: "0 0 4px 4px",
          boxShadow: "0 6px 12px rgba(15,23,42,0.15)",
        }}
      />
    </div>
  );
}

function ClinicianChromeBar() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "6px 10px", background: "#eef1ee", borderBottom: `1px solid ${C.rule}` }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div style={{ display: "flex", gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#ec6a5e" }} />
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#f4bf4f" }} />
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: "#61c454" }} />
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 9, fontWeight: 600, color: C.inkMid }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: C.sage, display: "inline-block", flexShrink: 0 }} />
          Advocate · Clinician View
        </div>
      </div>
      <span style={{ fontSize: 7.5, fontWeight: 700, letterSpacing: "0.04em", color: C.inkSoft, background: C.white, border: `1px solid ${C.rule}`, padding: "2px 7px", borderRadius: 999, flexShrink: 0 }}>
        READ-ONLY
      </span>
    </div>
  );
}

const ICON_PROPS = { width: "100%", height: "100%", viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };

const CalendarIcon = () => (
  <svg {...ICON_PROPS}><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
);
const AlertIcon = () => (
  <svg {...ICON_PROPS}><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
);
const MoonIcon = () => (
  <svg {...ICON_PROPS}><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" /></svg>
);
const AdherenceIcon = () => (
  <svg {...ICON_PROPS}><path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" /><path d="m8.5 8.5 7 7" /></svg>
);

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub: string }) {
  return (
    <div style={{ background: "#fbfbfa", border: `1px solid ${C.rule}`, borderRadius: 8, padding: "9px 10px 8px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <div style={{ width: 13, height: 13, color: C.sage, flexShrink: 0 }}>{icon}</div>
        <div style={{ fontSize: 9.5, fontWeight: 700, letterSpacing: "0.04em", textTransform: "uppercase", color: C.inkSoft }}>{label}</div>
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: C.ink, lineHeight: 1.15 }}>{value}</div>
      <div style={{ fontSize: 12, color: C.inkMid, marginTop: 2 }}>{sub}</div>
    </div>
  );
}

const CORRELATION_DAYS = [
  { sev: 8, missed: false }, { sev: 12, missed: false }, { sev: 28, missed: true },
  { sev: 16, missed: false }, { sev: 8, missed: false }, { sev: 32, missed: true },
  { sev: 12, missed: false }, { sev: 8, missed: false }, { sev: 24, missed: true },
  { sev: 12, missed: false }, { sev: 8, missed: false }, { sev: 28, missed: true },
  { sev: 12, missed: false }, { sev: 8, missed: false },
];

function CorrelationStrip() {
  return (
    <div style={{ marginTop: 8, background: "rgba(255,255,255,0.6)", border: "1px solid rgba(185,28,28,0.15)", borderRadius: 6, padding: "8px 10px 6px" }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: C.inkMid, marginBottom: 6 }}>
        Last 14 days: morning Ativan dose vs. agitation severity
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 2, height: 26, marginBottom: 5 }}>
        {CORRELATION_DAYS.map((d, i) => (
          <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", gap: 3, flex: 1, height: "100%" }}>
            <div style={{ width: 5, borderRadius: "1px 1px 0 0", background: C.alert, height: d.sev * 0.55 }} />
            {d.missed ? (
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.white, border: `1.5px solid ${C.alert}`, flexShrink: 0 }} />
            ) : (
              <span style={{ width: 5, height: 5, borderRadius: "50%", background: C.sage, flexShrink: 0 }} />
            )}
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: C.inkSoft, marginBottom: 6 }}>
        <span>Jun 25</span>
        <span>Jul 8</span>
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", fontSize: 9, color: C.inkMid }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.sage, display: "inline-block" }} />
          dose taken
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: "50%", background: C.white, border: `1.5px solid ${C.alert}`, display: "inline-block" }} />
          dose missed
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
          <span style={{ width: 5, height: 7, background: C.alert, display: "inline-block", borderRadius: 1 }} />
          agitation severity, taller is worse
        </span>
      </div>
    </div>
  );
}

function PriorityFlag({
  level, title, sub, children,
}: {
  level: "high" | "moderate" | "positive"; title: string; sub: string; children?: React.ReactNode;
}) {
  const palette = {
    high: { bg: C.alertBg, accent: C.alert, label: "HIGH" },
    moderate: { bg: C.watchBg, accent: C.watch, label: "MODERATE" },
    positive: { bg: C.goodBg, accent: C.good, label: "POSITIVE" },
  }[level];
  return (
    <div style={{ display: "flex", gap: 10, padding: "10px 10px 10px 9px", borderRadius: 8, borderLeft: `3px solid ${palette.accent}`, background: palette.bg, marginBottom: 6 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 15, fontWeight: 600, color: C.ink }}>{title}</span>
          <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.04em", padding: "3px 7px", borderRadius: 999, background: palette.accent, color: C.white, flexShrink: 0 }}>
            {palette.label}
          </span>
        </div>
        <p style={{ margin: 0, fontSize: 14, lineHeight: 1.4, color: C.inkMid }}>{sub}</p>
        {children}
      </div>
    </div>
  );
}

function BarRow({
  label, sub, pct, value, color,
}: {
  label: string; sub?: string; pct: number; value: string; color: string;
}) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "84px 1fr 34px", alignItems: "center", gap: 8, marginBottom: 6 }}>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: C.ink }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: C.inkSoft, marginTop: -1 }}>{sub}</div>}
      </div>
      <div style={{ height: 6, background: "#efefed", borderRadius: 3, overflow: "hidden" }}>
        <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: 3 }} />
      </div>
      <div style={{ fontSize: 12, color: C.inkSoft, textAlign: "right" }}>{value}</div>
    </div>
  );
}

function NoteRow({
  badge, badgeColor, badgeBg, date, text,
}: {
  badge: string; badgeColor: string; badgeBg: string; date: string; text: string;
}) {
  return (
    <div style={{ padding: "10px 12px", border: `1px solid ${C.rule}`, borderRadius: 8, background: "#fbfbfa" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.02em", padding: "2px 8px", borderRadius: 999, background: badgeBg, color: badgeColor }}>{badge}</span>
        <span style={{ fontSize: 10, color: C.inkSoft }}>{date}</span>
      </div>
      <p style={{ margin: 0, fontSize: 14, color: C.ink, lineHeight: 1.45 }}>{text}</p>
    </div>
  );
}

const sectionLabelStyle: React.CSSProperties = {
  margin: "0 0 6px", fontSize: 8, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.inkSoft,
};

export function ClinicianViewPanel() {
  return (
    <LaptopFrame>
      <ClinicianChromeBar />
      <div style={{ padding: "13px 14px 14px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 8, paddingBottom: 9, borderBottom: `1px solid ${C.rule}`, marginBottom: 11 }}>
          <div>
            <div style={{ fontFamily: "var(--font-lora), serif", fontSize: 18, fontWeight: 600, color: C.ink }}>Daniel M.</div>
            <div style={{ fontSize: 14, color: C.inkSoft, marginTop: 2 }}>Age 22 · Logged by primary caregiver (Mother)</div>
          </div>
          <div style={{ textAlign: "right", flexShrink: 0 }}>
            <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.inkSoft, marginBottom: 2 }}>Prepared for</div>
            <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>July 14 appointment</div>
          </div>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 7, marginBottom: 12 }}>
          <StatCard icon={<CalendarIcon />} label="Days Logged" value="26/30" sub="87% of days" />
          <StatCard icon={<AlertIcon />} label="Active Flags" value="3" sub="1 high priority" />
          <StatCard icon={<MoonIcon />} label="Avg Sleep" value="5.8 hrs" sub="down from 6.6 hrs" />
          <StatCard icon={<AdherenceIcon />} label="Med Adherence" value="88%" sub="combined, 2 meds" />
        </div>

        <div style={{ marginBottom: 12 }}>
          <p style={sectionLabelStyle}>Key Observations, Ranked by Priority</p>
          <PriorityFlag level="high" title="Agitation spikes align with missed Ativan doses" sub="8 of 9 agitation spikes in the past 30 days followed a missed morning dose within 24 hours.">
            <CorrelationStrip />
          </PriorityFlag>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: C.inkSoft }}>+2 more observations flagged for this visit.</p>
        </div>

        <div style={{ marginBottom: 12 }}>
          <p style={sectionLabelStyle}>Medication Adherence</p>
          <BarRow label="Clozapine" sub="200mg, daily" pct={91} value="91%" color={C.sage} />
          <BarRow label="Ativan" sub="1mg, PRN" pct={84} value="84%" color={C.watch} />
        </div>

        <div style={{ marginBottom: 11 }}>
          <p style={sectionLabelStyle}>Recent Caregiver Notes</p>
          <NoteRow badge="MEDICATION" badgeColor={C.watch} badgeBg={C.watchBg} date="Jul 4" text="Skipped the morning Ativan today. Said he felt fine, but he was on edge by afternoon." />
        </div>

        <p style={{ margin: 0, textAlign: "center", fontSize: 10.5, color: C.inkSoft, paddingTop: 8, borderTop: `1px solid ${C.rule}` }}>
          Generated by Advocate from caregiver-logged observations. Not a diagnostic tool.
        </p>
      </div>
    </LaptopFrame>
  );
}
