"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import toast from "react-hot-toast";
import { Lora, DM_Sans } from "next/font/google";
import { api } from "../lib/api";
import { isDemoTimelineClinician, DEMO_TIMELINE_PATIENT_ID } from "../lib/demoTimeline";
import { useAuth } from "../components/AuthProvider";
import type { AuthResponse } from "../lib/types";

const lora = Lora({ subsets: ["latin"], variable: "--font-lora", weight: ["400", "500", "600"], style: ["normal", "italic"], display: "swap" });
const dmSans = DM_Sans({ subsets: ["latin"], variable: "--font-dm-sans", weight: ["300", "400", "500"], display: "swap" });

const C = { sage: "#4a7c59", forest: "#2d4f38", ink: "#1a2420", inkSoft: "#6b7d74", cream: "#faf9f6", white: "#ffffff", rule: "#d4e0d7", sagePale: "#e8f0eb" };

const inputStyle = (focused: boolean): React.CSSProperties => ({
  width: "100%", padding: "0.75rem 1rem", borderRadius: 12,
  border: `1.5px solid ${focused ? C.sage : C.rule}`, fontSize: "0.9rem",
  color: C.ink, background: C.cream, outline: "none", boxSizing: "border-box", transition: "border-color 0.15s",
});

export default function RegisterPage() {
  const router = useRouter();
  const { login } = useAuth();

  // Clinician accounts are created through /register?role=clinician rather than
  // a visible role picker. Registering as a clinician grants access to nothing
  // on its own — a clinician only ever sees patients whose caregiver handed
  // them a share code — but there's no reason to advertise the path either.
  //
  // Read at submit time from window.location rather than useSearchParams():
  // under `output: "export"` that hook forces the page into a Suspense boundary
  // or the build fails outright. At submit we are definitively on the client,
  // so this needs no hook, no boundary, and no SSR guard. Anything other than
  // the exact string "clinician" falls through to caregiver, so a mistyped URL
  // cannot create an account with the wrong role.
  function requestedRole(): "caregiver" | "clinician" {
    if (typeof window === "undefined") return "caregiver";
    return new URLSearchParams(window.location.search).get("role") === "clinician"
      ? "clinician"
      : "caregiver";
  }
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [focused, setFocused] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) {
      toast.error("Password must be at least 8 characters");
      return;
    }
    if (!agreedToTerms) {
      toast.error("Please agree to the Terms of Service to continue");
      return;
    }
    setLoading(true);
    try {
      const role = requestedRole();
      const res = await api.register({ name, email, password, role }) as AuthResponse;
      login(res.user, res.access_token);
      toast.success(`Welcome, ${res.user.name}!`);
      // Caregiver onboarding sets up a patient, which makes no sense for a
      // clinician — they get patients only by redeeming a share code.
      const clinicianDestination = isDemoTimelineClinician(res.user.email)
        ? `/clinician/${DEMO_TIMELINE_PATIENT_ID}/`
        : "/clinician";
      router.push(role === "clinician" ? clinicianDestination : "/onboarding");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={`${lora.variable} ${dmSans.variable} min-h-screen flex flex-col items-center justify-center px-4 py-12`} style={{ background: C.cream, fontFamily: "var(--font-dm-sans), sans-serif" }}>

      {/* Back to landing */}
      <Link href="/" className="absolute top-6 left-6 text-sm font-medium flex items-center gap-1.5" style={{ color: C.inkSoft }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 19l-7-7 7-7"/></svg>
        Back
      </Link>

      <div className="w-full max-w-sm">

        {/* Logo */}
        <div className="text-center mb-8">
          <Image src="/advocate-icon.png" alt="Advocate" width={56} height={56} unoptimized className="mx-auto mb-4 rounded-2xl" style={{ boxShadow: "0 2px 12px rgba(45,79,56,0.10)" }} />
          <h1 style={{ fontFamily: "var(--font-lora), serif", fontStyle: "italic", fontWeight: 500, fontSize: "1.75rem", color: C.forest, letterSpacing: "-0.01em" }}>
            Advocate
          </h1>
          <p style={{ color: C.inkSoft, fontSize: "0.9rem", marginTop: 4 }}>Free for caregivers</p>
        </div>

        {/* Card */}
        <div style={{ background: C.white, borderRadius: 20, border: `1px solid ${C.rule}`, boxShadow: "0 4px 24px rgba(45,79,56,0.08)", padding: "2rem" }}>
          <h2 style={{ fontFamily: "var(--font-lora), serif", fontWeight: 500, fontSize: "1.2rem", color: C.ink, marginBottom: "1.5rem" }}>
            Create your account
          </h2>

          <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div>
              <label htmlFor="reg-name" style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: C.ink, marginBottom: 6 }}>Your name</label>
              <input
                id="reg-name" name="name" type="text" autoComplete="name" required
                value={name} onChange={(e) => setName(e.target.value)}
                placeholder="Jane Smith"
                style={inputStyle(focused === "name")}
                onFocus={() => setFocused("name")} onBlur={() => setFocused(null)}
              />
            </div>

            <div>
              <label htmlFor="reg-email" style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: C.ink, marginBottom: 6 }}>Email</label>
              <input
                id="reg-email" name="email" type="email" autoComplete="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                style={inputStyle(focused === "email")}
                onFocus={() => setFocused("email")} onBlur={() => setFocused(null)}
              />
            </div>

            <div>
              <label htmlFor="reg-password" style={{ display: "block", fontSize: "0.85rem", fontWeight: 500, color: C.ink, marginBottom: 6 }}>Password</label>
              <input
                id="reg-password" name="password" type="password" autoComplete="new-password" required minLength={8}
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="Min. 8 characters"
                style={inputStyle(focused === "password")}
                onFocus={() => setFocused("password")} onBlur={() => setFocused(null)}
              />
            </div>

            {/* ToS checkbox */}
            <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", userSelect: "none" }}>
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                style={{ marginTop: 2, width: 16, height: 16, accentColor: C.sage, flexShrink: 0, cursor: "pointer" }}
              />
              <span style={{ fontSize: "0.83rem", color: C.inkSoft, lineHeight: 1.5 }}>
                I agree to the{" "}
                <Link href="/terms" target="_blank" style={{ color: C.sage, fontWeight: 500, textDecoration: "none" }}>Terms of Service</Link>
                {" "}and{" "}
                <Link href="/privacy" target="_blank" style={{ color: C.sage, fontWeight: 500, textDecoration: "none" }}>Privacy Policy</Link>
              </span>
            </label>

            <button
              type="submit"
              disabled={loading}
              style={{ marginTop: 4, width: "100%", padding: "0.85rem", borderRadius: 50, border: "none", background: loading ? "#6a9f78" : C.sage, color: C.white, fontWeight: 600, fontSize: "0.95rem", cursor: loading ? "not-allowed" : "pointer", transition: "background 0.2s", fontFamily: "var(--font-dm-sans), sans-serif" }}
            >
              {loading ? "Creating account…" : "Get started free"}
            </button>
          </form>

          <p style={{ textAlign: "center", fontSize: "0.875rem", color: C.inkSoft, marginTop: "1.25rem" }}>
            Already have an account?{" "}
            <Link href="/login" style={{ color: C.sage, fontWeight: 600, textDecoration: "none" }}>
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
