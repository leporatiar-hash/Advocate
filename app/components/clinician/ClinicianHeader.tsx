"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "../AuthProvider";

export function ClinicianHeader({ patientName, backHref }: { patientName?: string; backHref?: string }) {
  const router = useRouter();
  const { logout } = useAuth();

  async function handleLogout() {
    await logout();
    router.push("/login");
  }

  return (
    <header
      className="sticky top-0 z-50 px-4 py-3 flex items-center justify-between shadow-sm"
      style={{ background: "var(--cp-teal)" }}
    >
      <div className="flex items-center gap-3 min-w-0">
        {backHref && (
          <Link href={backHref} aria-label="Back" className="text-white/80 hover:text-white flex-shrink-0">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 19l-7-7 7-7" />
            </svg>
          </Link>
        )}
        <div className="min-w-0">
          <p className="text-white font-semibold text-sm leading-tight truncate">Advocate · Clinician View</p>
          {patientName && <p className="text-white/70 text-xs truncate">{patientName}</p>}
        </div>
      </div>
      <button onClick={handleLogout} className="text-white/80 hover:text-white text-sm flex-shrink-0 transition-colors">
        Sign out
      </button>
    </header>
  );
}
