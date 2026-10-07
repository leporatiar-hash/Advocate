"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Lora } from "next/font/google";
import { useAuth } from "../components/AuthProvider";
import { NavBar } from "../components/NavBar";
import { api } from "../lib/api";
import type { Patient } from "../lib/types";

// Same serif and palette as the login page, so Settings feels like the same
// app rather than a generic admin screen.
const lora = Lora({ subsets: ["latin"], variable: "--font-lora", weight: ["400", "500", "600"], display: "swap" });
const C = { sage: "#4a7c59", forest: "#2d4f38", ink: "#1a2420", inkSoft: "#6b7d74", rule: "#e3ebe5", sagePale: "#e8f0eb", warm: "#f4efe6" };
const serif = { fontFamily: "var(--font-lora), Georgia, serif" };

// Thin line icons in the brand green, no tinted tiles behind them.
const ICONS: Record<string, string> = {
  meds: "M10.5 20.5l10-10a4.95 4.95 0 10-7-7l-10 10a4.95 4.95 0 107 7zM8.5 8.5l7 7",
  plan: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M9 12h6M9 16h4",
  checkin: "M8 7V3m8 4V3M5 11h14M5 5h14a2 2 0 012 2v12a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2zm4 10l2 2 4-4",
  share: "M17 20h5v-2a3 3 0 00-5.36-1.86M17 20H7m10 0v-2c0-.66-.13-1.28-.36-1.86M7 20H2v-2a3 3 0 015.36-1.86M7 20v-2c0-.66.13-1.28.36-1.86m0 0a5 5 0 019.28 0M15 7a3 3 0 11-6 0 3 3 0 016 0z",
  key: "M15 7a2 2 0 012 2m4 0a6 6 0 01-7.74 5.74L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.59a1 1 0 01.29-.7l5.97-5.97A6 6 0 1121 9z",
};

function Icon({ name }: { name: keyof typeof ICONS }) {
  return (
    <svg className="w-5 h-5 flex-shrink-0" style={{ color: C.sage }} fill="none" stroke="currentColor" strokeWidth={1.6} viewBox="0 0 24 24" aria-hidden="true">
      <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[name]} />
    </svg>
  );
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base px-1" style={{ ...serif, color: C.forest, fontWeight: 500 }}>{title}</h2>
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm" style={{ border: `1px solid ${C.rule}` }}>
        {children}
      </div>
    </section>
  );
}

function Row({ href, icon, title, subtitle, last }: {
  href: string; icon: keyof typeof ICONS; title: string; subtitle?: string; last?: boolean;
}) {
  return (
    <Link href={href} className="flex items-center gap-3.5 px-4 py-4 transition-colors hover:bg-[#f7faf8] active:bg-[#eef4f0]"
      style={last ? undefined : { borderBottom: `1px solid ${C.rule}` }}>
      <Icon name={icon} />
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold" style={{ color: C.ink }}>{title}</p>
        {subtitle && <p className="text-sm mt-0.5" style={{ color: C.inkSoft }}>{subtitle}</p>}
      </div>
      <svg className="w-4 h-4 flex-shrink-0" style={{ color: "#b8c7bd" }} fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </Link>
  );
}

export default function SettingsPage() {
  const { user, isLoading, logout } = useAuth();
  const router = useRouter();
  const [patient, setPatient] = useState<Patient | null>(null);

  useEffect(() => {
    if (!isLoading && !user) { router.push("/login"); return; }
    if (!isLoading && user) {
      api.getPatients().then(pts => {
        const list = pts as Patient[];
        if (list.length > 0) setPatient(list[0]);
      }).catch(() => {});
    }
  }, [user, isLoading, router]);

  if (isLoading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "#faf9f6" }}>
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "#4a7c59", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className={`${lora.variable} min-h-screen pb-28`} style={{ background: "#faf9f6" }}>
      <NavBar />

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-7">
        <h1 className="text-3xl" style={{ ...serif, color: C.ink, fontWeight: 500 }}>Settings</h1>

        {/* Who this is all for */}
        <Link href="/settings/patient" className="block rounded-3xl px-5 py-5 transition-transform active:scale-[0.99]"
          style={{ background: C.warm, border: "1px solid #e9e0d0" }}>
          <p className="text-sm" style={{ color: C.inkSoft }}>You&apos;re caring for</p>
          <div className="flex items-end justify-between gap-3 mt-0.5">
            <div className="min-w-0">
              <p className="text-2xl truncate" style={{ ...serif, color: C.forest, fontWeight: 500 }}>
                {patient?.name ?? "Your patient"}
              </p>
              {patient?.diagnosis && <p className="text-sm mt-0.5" style={{ color: C.inkSoft }}>{patient.diagnosis}</p>}
            </div>
            <span className="text-sm font-semibold flex-shrink-0" style={{ color: C.sage }}>Edit profile ›</span>
          </div>
        </Link>

        <Group title="Day to day">
          <Row href="/settings/customize" icon="meds" title="Medications & daily log"
            subtitle="Meds and when they're taken, symptoms, vitals" />
          <Row href="/settings/treatment-plan" icon="plan" title="Treatment plan"
            subtitle="Therapy, care team, goals and appointments" />
          <Row href="/assessments" icon="checkin" title="Monthly check-ins"
            subtitle="A few short questions about daily life, mood and how you're doing" last />
        </Group>

        <Group title="Sharing">
          <Row href="/settings/sharing" icon="share" title="Share with a clinician"
            subtitle="Let their doctor see the log, read-only" last />
        </Group>

        <Group title="Your account">
          <Row href="/forgot-password" icon="key" title="Change password" subtitle={`Signed in as ${user.email}`} last />
        </Group>

        <button type="button" onClick={() => logout()}
          className="w-full py-3 rounded-2xl text-base font-semibold transition-colors hover:bg-red-50"
          style={{ color: "#B91C1C", border: "1px solid #f1d4d4", background: "white" }}>
          Sign out
        </button>
      </div>
    </div>
  );
}
