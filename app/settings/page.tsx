"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../components/AuthProvider";
import { NavBar } from "../components/NavBar";
import { api } from "../lib/api";
import type { Patient } from "../lib/types";

// Plain grouped lists: a heading, then rows separated by hairlines. No icon
// tiles; the words carry the meaning.

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-2">
      <h2 className="text-sm font-semibold text-slate-500 px-1">{title}</h2>
      <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
        {children}
      </div>
    </section>
  );
}

function Row({ href, title, subtitle }: { href: string; title: string; subtitle?: string }) {
  return (
    <Link href={href} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-slate-50 active:bg-slate-100">
      <div className="flex-1 min-w-0">
        <p className="text-base font-medium text-navy">{title}</p>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
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

  const initials = user.name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="min-h-screen pb-28" style={{ background: "#faf9f6" }}>
      <NavBar />

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-6">
        <div className="flex items-center gap-3">
          <div
            className="w-11 h-11 rounded-full flex items-center justify-center flex-shrink-0 font-semibold text-base"
            style={{ background: "#e8f0eb", color: "#2d4f38" }}
            aria-hidden="true"
          >
            {initials}
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-navy leading-tight">Settings</h1>
            <p className="text-sm text-slate-500 truncate">Signed in as {user.name} · {user.email}</p>
          </div>
        </div>

        <Group title={patient ? `Caring for ${patient.name}` : "Your patient"}>
          <Row
            href="/settings/patient"
            title="Profile"
            subtitle={patient?.diagnosis ? patient.diagnosis : "Name, date of birth and diagnosis"}
          />
          <Row
            href="/settings/customize"
            title="Medications & daily log"
            subtitle="Meds and their schedules, symptoms, vitals and what you track each day"
          />
          <Row
            href="/settings/treatment-plan"
            title="Treatment plan"
            subtitle="Therapy, care team, sleep, goals and appointments"
          />
          <Row
            href="/assessments"
            title="Monthly check-ins"
            subtitle="Daily living, mood and caregiver strain questionnaires"
          />
        </Group>

        <Group title="Sharing">
          <Row
            href="/settings/sharing"
            title="Share with a clinician"
            subtitle="Give your doctor read-only access with a code"
          />
        </Group>

        <Group title="Your account">
          <Row href="/forgot-password" title="Change password" subtitle="We'll email you a reset link" />
          <button
            type="button"
            onClick={() => logout()}
            className="w-full text-left px-4 py-3.5 text-base font-medium transition-colors hover:bg-red-50"
            style={{ color: "#B91C1C" }}
          >
            Sign out
          </button>
        </Group>
      </div>
    </div>
  );
}
