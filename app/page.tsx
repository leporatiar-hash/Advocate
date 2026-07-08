"use client";

import { useEffect, useState } from "react";
import { Lora, DM_Sans } from "next/font/google";
import Link from "next/link";
import { HeroSummaryCard } from "./components/HeroSummaryCard";
import { LogInputPanel, ClinicianViewPanel, BrowserFrame } from "./components/SideBySidePanels";

const lora = Lora({
  subsets: ["latin"],
  variable: "--font-lora",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  variable: "--font-dm-sans",
  weight: ["300", "400", "500"],
  display: "swap",
});

const C = {
  sage:      "#4a7c59",
  sageLight: "#6a9f78",
  sagePale:  "#e8f0eb",
  sageMist:  "#f2f7f3",
  forest:    "#2d4f38",
  ink:       "#1a2420",
  inkMid:    "#3d4f47",
  inkSoft:   "#6b7d74",
  cream:     "#faf9f6",
  white:     "#ffffff",
  rule:      "#d4e0d7",
};

const SITE_URL = "https://advocatetrack.com";

export default function LandingPage() {
  const [copied, setCopied] = useState(false);
  const [isScrolledPastHero, setIsScrolledPastHero] = useState(false);

  useEffect(() => {
    function onScroll() {
      setIsScrolledPastHero(window.scrollY > window.innerHeight * 0.85);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry, i) => {
          if (entry.isIntersecting) {
            const el = entry.target as HTMLElement;
            setTimeout(() => {
              el.style.opacity = "1";
              el.style.transform = "translateY(0)";
            }, i * 80);
          }
        });
      },
      { threshold: 0.1 }
    );
    document.querySelectorAll(".lp-reveal").forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  function handleCopy() {
    navigator.clipboard.writeText(SITE_URL).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    });
  }

  function handleShare() {
    if (navigator.share) {
      navigator.share({
        title: "Advocate: Care, Documented",
        text: "A free tool that turns daily caregiver notes into doctor-ready summaries.",
        url: SITE_URL,
      });
    } else {
      handleCopy();
    }
  }

  return (
    <div
      className={`${lora.variable} ${dmSans.variable}`}
      style={{ fontFamily: "var(--font-dm-sans), sans-serif", background: C.cream, color: C.ink, lineHeight: "1.6", overflowX: "hidden" }}
    >
      <style>{`
        html { scroll-behavior: smooth; }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .lp-reveal {
          opacity: 0;
          transform: translateY(24px);
          transition: opacity 0.7s ease, transform 0.7s ease;
        }
        .lp-nav-links { display: flex; align-items: center; gap: 28px; list-style: none; }
        .lp-nav-link { font-size: 0.875rem; color: ${C.inkSoft}; text-decoration: none; transition: color 0.2s; }
        .lp-nav-link:hover { color: ${C.sage}; }
        .lp-nav-login { font-size: 0.875rem; font-weight: 500; color: ${C.inkMid}; text-decoration: none; padding: 8px 16px; border-radius: 100px; border: 1px solid ${C.rule}; transition: border-color 0.2s, color 0.2s; }
        .lp-nav-login:hover { border-color: ${C.sage}; color: ${C.sage}; }
        .lp-nav-cta { font-size: 0.875rem; font-weight: 500; color: ${C.white} !important; background: ${C.sage}; padding: 8px 20px; border-radius: 100px; text-decoration: none; transition: background 0.2s; }
        .lp-nav-cta:hover { background: ${C.forest} !important; }
        .lp-btn-primary { display: inline-flex; align-items: center; gap: 8px; background: ${C.sage}; color: ${C.white}; font-size: 1rem; font-weight: 500; padding: 14px 32px; border-radius: 100px; text-decoration: none; transition: background 0.2s, transform 0.15s; }
        .lp-btn-primary:hover { background: ${C.forest}; transform: translateY(-1px); }
        .lp-btn-ghost { display: inline-flex; align-items: center; gap: 8px; background: transparent; color: ${C.inkMid}; font-size: 1rem; padding: 14px 28px; border-radius: 100px; border: 1px solid ${C.rule}; text-decoration: none; transition: border-color 0.2s, color 0.2s; }
        .lp-btn-ghost:hover { border-color: ${C.sage}; color: ${C.sage}; }
        .lp-feature-card { padding: 36px; border: 1px solid ${C.rule}; border-radius: 16px; background: ${C.white}; transition: border-color 0.2s, box-shadow 0.2s; }
        .lp-feature-card:hover { border-color: ${C.sage}; box-shadow: 0 8px 32px rgba(74,124,89,0.08); }
        .lp-share-btn { display: inline-flex; align-items: center; gap: 8px; padding: 14px 28px; background: ${C.sage}; color: ${C.white}; font-family: inherit; font-size: 0.95rem; font-weight: 500; border: none; border-radius: 100px; cursor: pointer; transition: background 0.2s; }
        .lp-share-btn:hover { background: ${C.forest}; }
        .lp-copy-btn { display: inline-flex; align-items: center; gap: 8px; padding: 14px 24px; background: transparent; color: ${C.inkMid}; font-family: inherit; font-size: 0.95rem; border: 1px solid ${C.rule}; border-radius: 100px; cursor: pointer; transition: border-color 0.2s, color 0.2s; }
        .lp-copy-btn:hover { border-color: ${C.sage}; color: ${C.sage}; }
        .lp-trust-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 32px; }
        .lp-trust-card { background: ${C.white}; border-radius: 16px; padding: 40px 32px; border: 1px solid ${C.rule}; transition: transform 0.2s, box-shadow 0.2s; }
        .lp-trust-card:hover { transform: translateY(-4px); box-shadow: 0 12px 40px rgba(45,79,56,0.08); }
        .lp-nav-sticky-cta { display: inline-flex; align-items: center; font-size: 0.875rem; font-weight: 500; color: ${C.white}; background: ${C.sage}; padding: 8px 20px; border-radius: 100px; text-decoration: none; transition: background 0.2s, opacity 0.3s, transform 0.3s; white-space: nowrap; }
        .lp-nav-sticky-cta:hover { background: ${C.forest}; }
        .lp-hero-grid { display: grid; grid-template-columns: 1.05fr 0.95fr; gap: 56px; align-items: center; max-width: 1180px; width: 100%; margin: 0 auto; text-align: left; }
        .lp-hero-copy { display: flex; flex-direction: column; align-items: flex-start; }
        .lp-hero-card-col { display: flex; justify-content: center; }
        .lp-hero-card-wrapper { width: 100%; max-width: 460px; }
        .lp-sidebyside-grid { display: grid; grid-template-columns: 2fr 3fr; gap: 40px; }
        @media (max-width: 768px) {
          .lp-nav-links { display: none; }
          .lp-problem { grid-template-columns: 1fr !important; gap: 40px !important; }
          .lp-sidebyside-grid { grid-template-columns: 1fr !important; }
          .lp-features-grid { grid-template-columns: 1fr !important; }
          .lp-featured-card { grid-column: span 1 !important; grid-template-columns: 1fr !important; }
          .lp-who-cards { grid-template-columns: 1fr !important; }
          .lp-footer { flex-direction: column !important; gap: 12px !important; text-align: center !important; }
          .lp-nav { padding: 0 20px !important; }
          .lp-trust-grid { grid-template-columns: 1fr !important; }
          .lp-nav-sticky-cta { font-size: 0.8rem; padding: 7px 14px; }
          .lp-hero-section { justify-content: flex-start !important; min-height: 1300px !important; }
          .lp-hero-grid { grid-template-columns: 1fr !important; text-align: center !important; }
          .lp-hero-copy { align-items: center !important; }
          .lp-hero-card-col {
            position: absolute !important;
            left: 50% !important;
            top: 428px !important;
            transform: translateX(-50%) !important;
            width: 85% !important;
            max-width: 420px !important;
          }
          .lp-hero-card-wrapper { max-width: 420px !important; }
        }
        h1, h2, h3 { text-wrap: balance; }
        .lp-hero-break { display: inline; }
        .lp-phone-frame { --phone-scale: 0.85; }
        @media (max-width: 399px) {
          .lp-hero-break { display: none; }
        }
        @media (max-width: 344px) {
          .lp-phone-frame { --phone-scale: 0.72; }
        }
        @media (max-width: 305px) {
          .lp-phone-frame { --phone-scale: 0.65; }
        }
      `}</style>

      {/* ── NAV ── */}
      <nav className="lp-nav" style={{ position: "fixed", top: 0, left: 0, right: 0, zIndex: 100, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 48px", height: 64, background: "rgba(250,249,246,0.88)", backdropFilter: "blur(12px)", borderBottom: `1px solid ${C.rule}`, transition: "box-shadow 0.3s", boxShadow: isScrolledPastHero ? "0 2px 20px rgba(45,79,56,0.1)" : "none" }}>
        <a href="#" style={{ fontFamily: "var(--font-lora), serif", fontSize: "1.2rem", fontWeight: 500, color: C.forest, letterSpacing: "0.02em", textDecoration: "none" }}>
          Advocate
        </a>
        <ul className="lp-nav-links">
          <li><a href="#how" className="lp-nav-link">How it works</a></li>
          <li><a href="#features" className="lp-nav-link">Features</a></li>
          <li><a href="#story" className="lp-nav-link">Our story</a></li>
          <li><Link href="/login" className="lp-nav-login">Log in</Link></li>
        </ul>
        <Link
          href="/signup"
          className="lp-nav-sticky-cta"
          style={{ opacity: isScrolledPastHero ? 1 : 0, transform: isScrolledPastHero ? "translateY(0)" : "translateY(-6px)", pointerEvents: isScrolledPastHero ? "auto" : "none" }}
        >
          Get Started Free →
        </Link>
      </nav>

      {/* ── HERO ── */}
      <section id="hero" className="lp-hero-section" style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "120px 24px 0px", position: "relative", overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 70% 60% at 50% 30%, rgba(74,124,89,0.08) 0%, transparent 70%), radial-gradient(ellipse 40% 40% at 80% 70%, rgba(106,159,120,0.06) 0%, transparent 60%)", pointerEvents: "none" }} />

        <div className="lp-hero-grid">
          <div className="lp-hero-copy">
            <h1 style={{ fontFamily: "var(--font-lora), serif", fontSize: "clamp(1.4rem, 4.5vw, 3.6rem)", fontWeight: 500, lineHeight: 1.25, color: C.forest, marginBottom: 12, animation: "fadeUp 0.8s 0.35s both" }}>
              <span style={{ display: "block" }}>You see what the<br className="lp-hero-break" /> doctor can&apos;t.</span>
            </h1>

            <p style={{ fontSize: "1.05rem", color: C.inkMid, maxWidth: 540, lineHeight: 1.7, marginBottom: 40, animation: "fadeUp 0.8s 0.65s both" }}>
              Between appointments, clinicians are blind. Families are not. Advocate turns what you observe every day into a clear record your clinician reads before the visit. This is where those observations&nbsp;go.
            </p>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap", justifyContent: "flex-start", animation: "fadeUp 0.8s 0.8s both" }}>
              <Link href="/signup" className="lp-btn-primary">Get Started Free →</Link>
            </div>
          </div>

          <div className="lp-hero-card-col" style={{ animation: "fadeUp 0.8s 0.9s both" }}>
            <div className="lp-hero-card-wrapper">
              <HeroSummaryCard />
            </div>
          </div>
        </div>
      </section>

      <div style={{ height: 1, background: C.rule }} />

      {/* ── HOW IT WORKS: SIDE BY SIDE ── */}
      <section id="how" style={{ background: C.sageMist, padding: "100px 24px" }}>
        <div className="lp-reveal" style={{ textAlign: "center", maxWidth: 640, margin: "0 auto 48px" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: C.sage, marginBottom: 16 }}>The platform</div>
          <h2 style={{ fontFamily: "var(--font-lora), serif", fontSize: "clamp(1.5rem, 2.9vw, 2.15rem)", fontWeight: 500, lineHeight: 1.2, color: C.forest }}>
            Logged at home. Ready for the appointment.
          </h2>
        </div>
        <div className="lp-sidebyside-grid" style={{ maxWidth: 1040, margin: "0 auto" }}>
          <div className="lp-reveal">
            <div style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.sage, marginBottom: 16, textAlign: "center" }}>
              What the family logs
            </div>
            <LogInputPanel />
          </div>
          <div className="lp-reveal">
            <div style={{ fontSize: "0.75rem", fontWeight: 600, letterSpacing: "0.1em", textTransform: "uppercase", color: C.sage, marginBottom: 16, textAlign: "center" }}>
              What the clinician sees
            </div>
            <ClinicianViewPanel />
          </div>
        </div>
      </section>

      <div style={{ height: 1, background: C.rule }} />

      {/* ── FEATURES ── */}
      <section id="features" style={{ padding: "100px 24px", maxWidth: 1000, margin: "0 auto" }}>
        <div className="lp-reveal" style={{ textAlign: "center", maxWidth: 600, margin: "0 auto" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: C.sage, marginBottom: 16 }}>Features</div>
          <h2 style={{ fontFamily: "var(--font-lora), serif", fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", fontWeight: 500, lineHeight: 1.2, color: C.forest }}>
            What caregivers observe.<br />What doctors need to know.
          </h2>
        </div>
        <div className="lp-features-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 24, marginTop: 64 }}>
          <div className="lp-featured-card lp-reveal" style={{ gridColumn: "span 2", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 40, alignItems: "center", padding: 36, borderRadius: 16, background: C.forest, border: `1px solid ${C.forest}` }}>
            <div>
              <div style={{ width: 48, height: 48, background: "rgba(255,255,255,0.1)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 20 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.8)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
                </svg>
              </div>
              <div style={{ fontFamily: "var(--font-lora), serif", fontSize: "1.15rem", fontWeight: 500, color: C.white, marginBottom: 10 }}>Doctor-ready clinical summaries</div>
              <div style={{ fontSize: "0.95rem", color: "rgba(255,255,255,0.7)", lineHeight: 1.7 }}>
                Everything you&apos;ve logged becomes a structured summary organized by symptom category, medication history, and trend analysis. Formatted the way clinicians actually read patient information.
              </div>
            </div>
            <BrowserFrame>
              <div style={{ fontSize: "0.7rem", fontWeight: 500, letterSpacing: "0.1em", textTransform: "uppercase", color: C.sage, marginBottom: 8 }}>Visit Summary · March 2026</div>
              {[
                "Fatigue frequency increased 3× over 14 days",
                "Metformin: 92% adherence, one missed dose",
                "Sleep avg. 5.2 hrs/night (down from 6.8)",
                "Appetite: mild decline noted since Feb 22",
                "Fatigue flagged for discussion",
              ].map((line, i, arr) => (
                <div key={i} style={{ fontSize: "0.85rem", color: C.inkMid, lineHeight: 1.8, padding: "6px 0", borderBottom: i < arr.length - 1 ? `1px solid ${C.rule}` : "none" }}>
                  {line}
                </div>
              ))}
            </BrowserFrame>
          </div>
          {[
            { title: "Built for your routine", body: "No long forms. No medical jargon. Just a simple, focused daily entry you can fill out whenever you have a moment." },
            { title: "Trend detection", body: "Changes in symptom patterns, medication adherence, and wellbeing surface automatically. Things that are hard to see day-to-day become clear across weeks." },
            { title: "Medication tracking", body: "Log each medication with dosage and timing. Every entry builds a history you can bring to any appointment." },
            { title: "Private by default", body: "Your loved one's health data stays yours. Privacy isn't a feature added on top. It's how the platform was built from the start." },
          ].map((f) => (
            <div key={f.title} className="lp-feature-card lp-reveal">
              <div style={{ fontFamily: "var(--font-lora), serif", fontSize: "1.15rem", fontWeight: 500, color: C.forest, marginBottom: 10 }}>{f.title}</div>
              <div style={{ fontSize: "0.95rem", color: C.inkSoft, lineHeight: 1.7 }}>{f.body}</div>
            </div>
          ))}
        </div>
      </section>

      <div style={{ height: 1, background: C.rule }} />

      {/* ── PROBLEM ── */}
      <section id="problem" className="lp-problem" style={{ padding: "100px 24px", maxWidth: 960, margin: "0 auto", display: "grid", gridTemplateColumns: "1fr 1fr", gap: 80, alignItems: "center" }}>
        <div className="lp-reveal">
          <div style={{ fontSize: "0.75rem", fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: C.sage, marginBottom: 20 }}>The problem</div>
          <h2 style={{ fontFamily: "var(--font-lora), serif", fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", fontWeight: 500, lineHeight: 1.2, color: C.forest, marginBottom: 24 }}>
            The things you notice disappear between visits
          </h2>
          <p style={{ fontSize: "1rem", color: C.inkMid, lineHeight: 1.75, marginBottom: 16 }}>
            When someone you love is living with a serious mental health condition, you become the expert. You track the medication changes, notice the early warning signs, and spot the patterns that don't show up in a clinical setting. That knowledge rarely makes it into the chart.
          </p>
          <p style={{ fontSize: "1rem", color: C.inkMid, lineHeight: 1.75 }}>
            Psychiatrists see patients for 15 minutes at a time. Without structured input from the people closest to them, critical observations like a shift in sleep, a new side effect, or a pattern tied to a specific trigger get lost between appointments.
          </p>
        </div>
        <div className="lp-reveal" style={{ padding: 40, background: C.sageMist, borderRadius: 16, borderLeft: `3px solid ${C.sage}` }}>
          <blockquote style={{ fontFamily: "var(--font-lora), serif", fontSize: "1.35rem", lineHeight: 1.5, color: C.forest }}>
            "Looking back through my logs, I realized his symptoms were consistently worse on days he smoked more. His psychiatrist told me cigarettes can actually reduce how well antipsychotics work. I never would have made that connection without writing it down."
          </blockquote>
          <cite style={{ display: "block", marginTop: 16, fontSize: "0.85rem", fontStyle: "normal", color: C.inkSoft }}>
            Caregiver, supporting a loved one with schizophrenia
          </cite>
        </div>
      </section>

      <div style={{ height: 1, background: C.rule }} />

      {/* ── TRUST & SECURITY ── */}
      <section id="trust" style={{ background: C.sagePale, padding: "100px 24px" }}>
        <div style={{ maxWidth: 960, margin: "0 auto" }}>
          <div className="lp-reveal" style={{ textAlign: "center", maxWidth: 680, margin: "0 auto 72px" }}>
            <h2 style={{ fontFamily: "var(--font-lora), serif", fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", fontWeight: 500, lineHeight: 1.2, color: C.forest }}>
              Built for privacy.
            </h2>
          </div>
          <div className="lp-trust-grid">
            {[
              {
                label: "Security",
                headline: "HIPAA-Ready Standards.",
                body: "We protect your loved one's data with the same encryption and privacy protocols used by leading health providers.",
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.sage} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                  </svg>
                ),
              },
              {
                label: "Privacy",
                headline: "No Data Selling.",
                body: "Your logs are private. We never sell health history or personal information to third parties. Period.",
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.sage} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0110 0v4" />
                  </svg>
                ),
              },
              {
                label: "Clinical Value",
                headline: "Doctor-Approved Format.",
                body: "Our summaries are built based on physician feedback to ensure your observations are heard in a 15-minute visit.",
                icon: (
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke={C.sage} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M9 11l3 3L22 4" />
                    <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
                  </svg>
                ),
              },
            ].map((item) => (
              <div key={item.label} className="lp-trust-card lp-reveal">
                <div style={{ width: 56, height: 56, background: C.sageMist, borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 24 }}>
                  {item.icon}
                </div>
                <div style={{ fontSize: "0.7rem", fontWeight: 600, letterSpacing: "0.12em", textTransform: "uppercase", color: C.sage, marginBottom: 10 }}>{item.label}</div>
                <h3 style={{ fontFamily: "var(--font-lora), serif", fontSize: "1.15rem", fontWeight: 500, color: C.forest, marginBottom: 12 }}>{item.headline}</h3>
                <p style={{ fontSize: "0.95rem", color: C.inkSoft, lineHeight: 1.75 }}>{item.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <div style={{ height: 1, background: C.rule }} />

      {/* ── STORY ── */}
      <section id="story" style={{ background: C.forest, padding: "100px 24px", textAlign: "center" }}>
        <div style={{ fontSize: "0.75rem", fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: C.sageLight, marginBottom: 48 }}>Why we built this</div>
        <div className="lp-reveal" style={{ maxWidth: 600, margin: "0 auto", fontSize: "1rem", color: "rgba(255,255,255,0.65)", lineHeight: 1.85, textAlign: "left" }}>
          <p>My brother Jack has been fighting mental illness for almost ten years. Schizophrenia. Bipolar disorder. Excited catatonia. Psychosis. The diagnoses stacked up over years of hospitals, psychiatric wards, and more therapists than I can count.</p>
          <p style={{ marginTop: 20 }}>When he&apos;s properly diagnosed and medicated, he&apos;s the same brother I grew up with, just with a few battle scars. When he&apos;s not, he can be unrecognizable.</p>
          <p style={{ marginTop: 20 }}>My mother became his primary advocate almost overnight. She learned to read him better than any doctor could. She could see the episodes coming before they arrived: every symptom shift, every pattern, every small change that meant something was wrong. But when the appointment finally came and the doctor had fifteen minutes, she didn&apos;t know how to say any of it. She had years of observations and nowhere to put them.</p>
          <p style={{ marginTop: 20 }}>When I left for college, she was doing it alone. That bothered me more than I let on.</p>
          <p style={{ marginTop: 20 }}>So I built Advocate for her. A simple way to log what she sees every day and surface it in a format a doctor could actually use. What I didn&apos;t expect was what happened next: she started finding the patterns herself. She started walking into appointments with confidence. She could prevent more episodes before they escalated.</p>
          <p style={{ marginTop: 20 }}>She stopped feeling like a bystander in her own son&apos;s care.</p>
          <p style={{ marginTop: 20, color: "rgba(255,255,255,0.9)", fontFamily: "var(--font-lora), serif", fontSize: "1.1rem" }}>That&apos;s when I knew this wasn&apos;t just a tool. It was a shift in who gets to understand the patient.</p>
        </div>
      </section>

      <div style={{ height: 1, background: C.rule }} />

      {/* ── WHO ── */}
      <section id="who" style={{ padding: "100px 24px", maxWidth: 900, margin: "0 auto" }}>
        <div className="lp-reveal" style={{ textAlign: "center", maxWidth: 600, margin: "0 auto 56px" }}>
          <div style={{ fontSize: "0.75rem", fontWeight: 500, letterSpacing: "0.12em", textTransform: "uppercase", color: C.sage, marginBottom: 16 }}>Who it&apos;s for</div>
          <h2 style={{ fontFamily: "var(--font-lora), serif", fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", fontWeight: 500, lineHeight: 1.2, color: C.forest }}>
            Built for caregivers.
          </h2>
        </div>
        <div className="lp-who-cards" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 24 }}>
          {[
            { title: "Parents & family members", body: "Caring for a loved one with a chronic illness or mental health condition, navigating medication regimens, unpredictable symptoms, and appointments that never feel long enough." },
            { title: "Long-term caregivers", body: "People who have been doing this for years, largely alone, with deep knowledge of their loved one that rarely makes it into the medical record." },
            { title: "Anyone who advocates", body: "If you're the person who tracks, remembers, notices, and speaks up, this was made for you." },
          ].map((card) => (
            <div key={card.title} className="lp-reveal" style={{ background: C.sageMist, borderRadius: 16, padding: "36px 28px", border: `1px solid ${C.rule}` }}>
              <h3 style={{ fontFamily: "var(--font-lora), serif", fontSize: "1.05rem", fontWeight: 500, color: C.forest, marginBottom: 10 }}>{card.title}</h3>
              <p style={{ fontSize: "0.92rem", color: C.inkSoft, lineHeight: 1.7 }}>{card.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── SHARE CTA ── */}
      <section id="cta" style={{ padding: "100px 24px", textAlign: "center", background: C.sageMist, borderTop: `1px solid ${C.rule}` }}>
        <div className="lp-reveal" style={{ maxWidth: 560, margin: "0 auto 48px" }}>
          <h2 style={{ fontFamily: "var(--font-lora), serif", fontSize: "clamp(1.8rem, 3.5vw, 2.6rem)", fontWeight: 500, lineHeight: 1.2, color: C.forest, marginBottom: 16 }}>
            Know a caregiver<br />who needs this?
          </h2>
          <p style={{ fontSize: "1.05rem", color: C.inkSoft, lineHeight: 1.7 }}>
            Advocate is free. If someone you know is carrying another person&apos;s health, a parent, a sibling, a partner, send them this.
          </p>
        </div>

        <div className="lp-reveal" style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", marginBottom: 24 }}>
          <button onClick={handleShare} className="lp-share-btn">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8M16 6l-4-4-4 4M12 2v13" />
            </svg>
            Send Advocate
          </button>
          <button onClick={handleCopy} className="lp-copy-btn">
            {copied ? (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                Copied!
              </>
            ) : (
              <>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
                </svg>
                Copy link
              </>
            )}
          </button>
        </div>

        <div className="lp-reveal" style={{ display: "inline-flex", alignItems: "center", gap: 10, padding: "10px 20px", background: C.white, borderRadius: 100, border: `1px solid ${C.rule}` }}>
          <span style={{ fontSize: "0.85rem", color: C.inkSoft, fontFamily: "monospace" }}>{SITE_URL}</span>
        </div>

        <div className="lp-reveal" style={{ marginTop: 64, paddingTop: 64, borderTop: `1px solid ${C.rule}` }}>
          <p style={{ fontSize: "0.95rem", color: C.inkSoft, marginBottom: 24 }}>Ready to start yourself?</p>
          <Link href="/signup" className="lp-btn-primary">Get Started Free →</Link>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="lp-footer" style={{ padding: "40px 48px", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: `1px solid ${C.rule}` }}>
        <div style={{ fontFamily: "var(--font-lora), serif", fontSize: "1rem", fontWeight: 500, color: C.forest }}>Advocate</div>
        <div style={{ display: "flex", gap: 24, fontSize: "0.83rem" }}>
          <Link href="/privacy" style={{ color: C.inkSoft, textDecoration: "none" }}>Privacy Policy</Link>
          <Link href="/terms" style={{ color: C.inkSoft, textDecoration: "none" }}>Terms of Service</Link>
        </div>
        <div style={{ fontSize: "0.83rem", color: C.inkSoft }}>© 2026 Advocate. Built in Charleston, SC.</div>
      </footer>
    </div>
  );
}
