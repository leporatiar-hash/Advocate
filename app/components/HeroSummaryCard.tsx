const COLORS = {
  ink: "#1a2420",
  navy: "#1a2420",
  inkMid: "#3d4f47",
  forest: "#2d4f38",
  sage: "#4a7c59",
  cream: "#faf9f6",
  sageMist: "#f2f7f3",
  rule: "#d4e0d7",
  white: "#ffffff",
  slate700: "#334155",
  slate500: "#64748b",
  slate400: "#94a3b8",
  good: "#16a34a",
  goodBg: "#dcfce7",
  watch: "#b45309",
  watchBg: "#fef3c7",
  alert: "#b91c1c",
  alertBg: "#fee2e2",
  steady: "#64748b",
  steadyBg: "#f1f5f9",
  bezel: "#111418",
};

import { Sparkline } from "./Sparkline";
import type { MetricPoint } from "../lib/insights";

function trend(values: number[]): MetricPoint[] {
  return values.map((value, i) => ({ date: `d${i}`, value }));
}

// Design-time constants: content is authored at real in-app proportions
// (as if a 390px-wide phone screen) then the whole screen is scaled down
// with a CSS transform so it reads as a dense, realistic mockup at hero size.
const DESIGN_WIDTH = 390;
const SCALE = 0.85;
// Measured natural (pre-scale) height of the screen content below, times SCALE.
// Hardcoded (not measured at runtime) to keep this component static.
const SCREEN_HEIGHT = 877;
const BEZEL = 10;

function InsightCard({
  title, accentColor, bgColor, children,
}: {
  title: string; accentColor: string; bgColor: string; children: React.ReactNode;
}) {
  return (
    <div style={{ borderRadius: 16, overflow: "hidden", border: `1px solid ${COLORS.rule}`, boxShadow: "0 1px 2px rgba(26,36,32,0.04)" }}>
      <div style={{ background: accentColor, padding: "12px 20px" }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: COLORS.white }}>{title}</h2>
      </div>
      <div style={{ background: bgColor, padding: "16px 20px", display: "flex", flexDirection: "column", gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

function TrendRow({
  name, direction, color, bg, points,
}: {
  name: string; direction: string; color: string; bg: string; points: MetricPoint[];
}) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 16, fontWeight: 600, color: COLORS.navy }}>{name}</span>
          <span style={{ fontSize: 12, fontWeight: 600, padding: "2px 8px", borderRadius: 999, background: bg, color }}>
            {direction}
          </span>
        </div>
      </div>
      <Sparkline points={points} color={color} />
    </div>
  );
}

function StatusBar() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px 4px", background: COLORS.cream }}>
      <span style={{ fontSize: 15, fontWeight: 600, color: COLORS.ink }}>9:41</span>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <svg width="18" height="12" viewBox="0 0 18 12" fill="none"><rect x="0" y="7" width="3" height="5" rx="0.5" fill={COLORS.ink} /><rect x="5" y="5" width="3" height="7" rx="0.5" fill={COLORS.ink} /><rect x="10" y="3" width="3" height="9" rx="0.5" fill={COLORS.ink} /><rect x="15" y="0" width="3" height="12" rx="0.5" fill={COLORS.ink} /></svg>
        <svg width="16" height="12" viewBox="0 0 16 12" fill="none"><path d="M8 10.5a1.2 1.2 0 100-2.4 1.2 1.2 0 000 2.4z" fill={COLORS.ink} /><path d="M8 6.2c1.4 0 2.7.5 3.7 1.4l-1.1 1.2A3.9 3.9 0 008 7.7c-1 0-1.9.3-2.6.9L4.3 7.6A5.4 5.4 0 018 6.2z" fill={COLORS.ink} /><path d="M8 2.2c2.5 0 4.8 1 6.5 2.6l-1.1 1.2A7.4 7.4 0 008 4c-2 0-3.8.8-5.4 2l-1.1-1.2A9.4 9.4 0 018 2.2z" fill={COLORS.ink} /></svg>
        <svg width="24" height="12" viewBox="0 0 24 12" fill="none"><rect x="0.5" y="0.5" width="20" height="11" rx="2.5" stroke={COLORS.ink} /><rect x="2" y="2" width="15" height="8" rx="1" fill={COLORS.ink} /><rect x="21.5" y="4" width="1.5" height="4" rx="0.5" fill={COLORS.ink} /></svg>
      </div>
    </div>
  );
}

// Shared device chrome: the same phone bezel used by the hero mockup,
// reused anywhere else a "logged on a phone" visual is needed.
export function PhoneFrame({ width = DESIGN_WIDTH, children }: { width?: number; children: React.ReactNode }) {
  return (
    <div
      style={{
        width: "100%",
        maxWidth: width + BEZEL * 2,
        margin: "0 auto",
        boxSizing: "border-box",
        background: COLORS.bezel,
        borderRadius: 44,
        padding: BEZEL,
        boxShadow: "0 24px 60px rgba(26,36,32,0.22)",
      }}
    >
      <div style={{ width: "100%", background: COLORS.cream, borderRadius: 34, overflow: "hidden" }}>
        <StatusBar />
        {children}
      </div>
    </div>
  );
}

/**
 * Static marketing mockup of the doctor-ready summary screen, for the landing page hero only.
 * Hard-coded demo content authored at real in-app scale, then shrunk with a CSS transform —
 * no props, no state, no data fetching, no ties to the real summary UI.
 */
export function HeroSummaryCard() {
  return (
    <div
      aria-hidden="false"
      className="lp-phone-frame"
      style={{
        position: "relative",
        width: `calc(${DESIGN_WIDTH}px * var(--phone-scale, ${SCALE}))`,
        height: `calc(${SCREEN_HEIGHT}px * var(--phone-scale, ${SCALE}))`,
        margin: "0 auto",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 0,
          left: "50%",
          width: DESIGN_WIDTH + BEZEL * 2,
          transform: "translateX(-50%) scale(var(--phone-scale, " + SCALE + "))",
          transformOrigin: "top center",
        }}
      >
        <PhoneFrame width={DESIGN_WIDTH}>
          {/* Header — plain on screen background, matches real app (not a card) */}
          <div style={{ padding: "8px 16px 0", display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
            <div>
              <p style={{ margin: 0, fontSize: 30, fontWeight: 700, color: COLORS.navy, lineHeight: 1.2 }}>Summary</p>
              <p style={{ margin: "4px 0 0", fontSize: 16, color: COLORS.slate500 }}>Daniel M. · Last 30 days</p>
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, color: COLORS.slate400, whiteSpace: "nowrap", marginTop: 6 }}>
              Sample summary
            </span>
          </div>

          <div style={{ padding: "20px 16px 32px", display: "flex", flexDirection: "column", gap: 18 }}>
            <InsightCard title="Executive Summary" accentColor={COLORS.ink} bgColor={COLORS.white}>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.5, color: COLORS.slate700 }}>
                Appetite declining over the past two weeks, with agitation spiking on low-sleep nights. Socialization improving since the schedule change.
              </p>
            </InsightCard>

            <InsightCard title="Symptom Trends" accentColor={COLORS.ink} bgColor={COLORS.white}>
              <TrendRow
                name="Appetite"
                direction="Declining"
                color={COLORS.watch}
                bg={COLORS.watchBg}
                points={trend([7, 7, 6, 6, 5, 5, 4, 4, 4, 3])}
              />
              <TrendRow
                name="Fatigue"
                direction="Steady"
                color={COLORS.steady}
                bg={COLORS.steadyBg}
                points={trend([5, 6, 5, 5, 6, 5, 4, 5, 5, 5])}
              />
              <TrendRow
                name="Socialization"
                direction="Improving"
                color={COLORS.good}
                bg={COLORS.goodBg}
                points={trend([2, 2, 3, 3, 4, 4, 5, 5, 6, 6])}
              />
              <TrendRow
                name="Agitation"
                direction="Spiking"
                color={COLORS.alert}
                bg={COLORS.alertBg}
                points={trend([2, 2, 2, 6, 2, 2, 7, 2, 2, 3])}
              />
            </InsightCard>

            <InsightCard title="Bring Up at the Appointment" accentColor={COLORS.forest} bgColor={COLORS.sageMist}>
              {[
                "Sleep: averaging 4 hours, with agitation higher on those nights.",
                "Appetite: declining since late June.",
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 12, background: COLORS.white, borderRadius: 12, padding: 14 }}>
                  <span
                    style={{
                      flexShrink: 0,
                      width: 22,
                      height: 22,
                      borderRadius: "50%",
                      background: COLORS.sage,
                      color: COLORS.white,
                      fontSize: 13,
                      fontWeight: 700,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    {i + 1}
                  </span>
                  <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: COLORS.slate700 }}>{item}</p>
                </div>
              ))}
            </InsightCard>

            <p style={{ margin: 0, fontSize: 13, color: COLORS.slate500 }}>
              Adherence · Clozapine 91% · Ativan 84%
            </p>
          </div>
        </PhoneFrame>
      </div>
    </div>
  );
}
