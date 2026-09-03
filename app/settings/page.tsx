"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuth } from "../components/AuthProvider";
import { NavBar } from "../components/NavBar";
import { api } from "../lib/api";
import type { Patient } from "../lib/types";

function SectionLabel({ label }: { label: string }) {
  return (
    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest px-1 pb-1 pt-2">
      {label}
    </p>
  );
}

function SettingsRow({
  href,
  icon,
  iconBg,
  title,
  subtitle,
}: {
  href: string;
  icon: React.ReactNode;
  iconBg: string;
  title: string;
  subtitle: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center gap-4 w-full bg-white rounded-2xl border border-slate-100 px-4 py-4 transition-all active:scale-[0.98] hover:border-slate-200"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
        style={{ background: iconBg }}
      >
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-base font-semibold text-navy leading-tight">{title}</p>
        <p className="text-sm text-slate-400 mt-0.5 truncate">{subtitle}</p>
      </div>
      <svg className="w-4 h-4 text-slate-300 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
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

      <div className="max-w-lg mx-auto px-4 pt-6 space-y-1">
        <div className="pb-4">
          <h1 className="text-3xl font-bold text-navy">Settings</h1>
          <p className="text-base text-slate-500 mt-1">Account and preferences</p>
        </div>

        {/* ── Account ── */}
        <SectionLabel label="Account" />
        <div className="bg-white rounded-2xl border border-slate-100 px-4 py-4 flex items-center gap-4">
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 text-white font-bold text-base"
            style={{ background: "linear-gradient(135deg, #4a7c59, #2d4f38)" }}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <p className="text-base font-bold text-navy leading-tight">{user.name}</p>
            <p className="text-sm text-slate-400 truncate">{user.email}</p>
          </div>
        </div>

        <SettingsRow
          href="/forgot-password"
          iconBg="#EEF2FF"
          title="Change Password"
          subtitle={`Send a reset link to ${user.email}`}
          icon={
            <svg className="w-5 h-5" style={{ color: "#4F46E5" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
          }
        />

        {/* ── Patient ── */}
        <SectionLabel label="Patient" />
        <SettingsRow
          href="/settings/patient"
          iconBg="#FFF7ED"
          title={patient?.name ?? "Patient Profile"}
          subtitle={patient?.diagnosis ? `Diagnosis: ${patient.diagnosis}` : "Name, date of birth, condition"}
          icon={
            <svg className="w-5 h-5" style={{ color: "#C2410C" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
          }
        />

        <SettingsRow
          href="/settings/sharing"
          iconBg="#F0FDF4"
          title="Share with a clinician"
          subtitle="Give your doctor read-only access with a code"
          icon={
            <svg className="w-5 h-5" style={{ color: "#15803D" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342a3 3 0 100-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684zm0-12.632a3 3 0 105.368-2.684 3 3 0 00-5.368 2.684z" />
            </svg>
          }
        />

        <SettingsRow
          href="/settings/treatment-plan"
          iconBg="#EFF6FF"
          title="Treatment Plan"
          subtitle="Therapy, clinicians, sleep, goals & appointments"
          icon={
            <svg className="w-5 h-5" style={{ color: "#2563EB" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
            </svg>
          }
        />

        <SettingsRow
          href="/assessments"
          iconBg="#f2f7f3"
          title="Assessments"
          subtitle="Monthly Lawton IADL, PHQ-9 & Caregiver Strain check-ins"
          icon={
            <svg className="w-5 h-5" style={{ color: "#2d4f38" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4" />
            </svg>
          }
        />

        {/* ── Preferences ── */}
        <SectionLabel label="Preferences" />
        <SettingsRow
          href="/settings/customize"
          iconBg="#f2f7f3"
          title="Customize Your Dashboard"
          subtitle="Medications, symptoms, tracking, activities & more"
          icon={
            <svg className="w-5 h-5" style={{ color: "#4a7c59" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          }
        />

        {/* ── Sign Out ── */}
        <div className="pt-3">
          <button
            type="button"
            onClick={() => logout()}
            className="flex items-center gap-4 w-full bg-white rounded-2xl border border-slate-100 px-4 py-4 transition-all active:scale-[0.98] hover:border-red-100"
          >
            <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: "#FEF2F2" }}>
              <svg className="w-5 h-5" style={{ color: "#DC2626" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
            </div>
            <p className="text-base font-semibold" style={{ color: "#DC2626" }}>Sign Out</p>
          </button>
        </div>
      </div>
    </div>
  );
}
