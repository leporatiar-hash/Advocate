"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { api } from "../../lib/api";
import { useAuth } from "../../components/AuthProvider";
import { NavBar } from "../../components/NavBar";
import type { Patient, ShareCode, LinkedClinician } from "../../lib/types";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

/**
 * Share with a clinician.
 *
 * Two separate controls that the UI deliberately keeps apart, because they do
 * different things and conflating them is how people think they've revoked
 * access when they haven't:
 *
 *   • The CODE is an invitation. Revoking it stops new clinicians redeeming it.
 *   • The LIST below is who actually has access. Removing someone there is what
 *     cuts off a clinician who already redeemed.
 */
export default function SharingPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [patient, setPatient] = useState<Patient | null>(null);
  const [code, setCode] = useState<ShareCode | null>(null);
  const [clinicians, setClinicians] = useState<LinkedClinician[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async (patientId: number) => {
    const [existing, linked] = await Promise.all([
      api.getShareCode(patientId).catch(() => null) as Promise<ShareCode | null>,
      api.getLinkedClinicians(patientId).catch(() => []) as Promise<LinkedClinician[]>,
    ]);
    setCode(existing);
    setClinicians(linked);
  }, []);

  useEffect(() => {
    if (!isLoading && !user) { router.push("/login"); return; }
    if (!isLoading && user) {
      api.getPatients()
        .then(async (pts) => {
          const list = pts as Patient[];
          if (list.length > 0) {
            setPatient(list[0]);
            await load(list[0].id);
          }
        })
        .catch(() => toast.error("Couldn't load your patient"))
        .finally(() => setLoading(false));
    }
  }, [user, isLoading, router, load]);

  async function handleGenerate() {
    if (!patient) return;
    setWorking(true);
    try {
      const created = (await api.createShareCode(patient.id)) as ShareCode;
      setCode(created);
      toast.success("New code ready");
    } catch {
      toast.error("Couldn't create a code");
    } finally {
      setWorking(false);
    }
  }

  async function handleRevokeCode() {
    if (!patient) return;
    setWorking(true);
    try {
      await api.revokeShareCode(patient.id);
      setCode(null);
      toast.success("Code turned off");
    } catch {
      toast.error("Couldn't turn off the code");
    } finally {
      setWorking(false);
    }
  }

  async function handleRemoveClinician(clinicianId: number, name: string) {
    if (!patient) return;
    setWorking(true);
    try {
      await api.revokeClinicianAccess(patient.id, clinicianId);
      setClinicians((prev) => prev.filter((c) => c.clinician_id !== clinicianId));
      toast.success(`${name} no longer has access`);
    } catch {
      toast.error("Couldn't remove access");
    } finally {
      setWorking(false);
    }
  }

  function handleCopy() {
    if (!code) return;
    navigator.clipboard.writeText(code.code).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => toast.error("Couldn't copy — read it out instead")
    );
  }

  if (isLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--canvas)" }}>
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--accent)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-24" style={{ background: "var(--canvas)" }}>
      <NavBar />
      <div className="max-w-xl mx-auto px-4 pt-6">
        <Link href="/settings" className="text-sm" style={{ color: "var(--ink-muted)" }}>← Settings</Link>
        <h1 className="text-2xl font-bold mt-2" style={{ color: "var(--ink)" }}>Share with a clinician</h1>
        <p className="text-sm mt-1" style={{ color: "var(--ink-muted)" }}>
          Give your clinician a code and they can read {patient ? patient.name : "your loved one"}&apos;s
          summaries before an appointment. They see a read-only view — they can never edit anything, and
          they can&apos;t find you without a code.
        </p>

        {!patient && (
          <div className="rounded-2xl border p-6 mt-6 text-center" style={{ background: "#fff", borderColor: "var(--line-strong)" }}>
            <p className="text-sm" style={{ color: "var(--ink-muted)" }}>Add a patient first, then you can share.</p>
          </div>
        )}

        {patient && (
          <>
            {/* The invitation */}
            <div className="rounded-2xl border p-5 mt-6" style={{ background: "#fff", borderColor: "var(--line-strong)" }}>
              <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
                Your sharing code
              </h2>

              {code ? (
                <>
                  <p
                    className="mt-3 font-mono font-bold tracking-[0.2em] text-center py-4 rounded-xl select-all"
                    style={{ background: "var(--accent-wash)", color: "var(--accent-strong)", fontSize: "1.75rem" }}
                  >
                    {code.code}
                  </p>
                  <p className="text-xs mt-2 text-center" style={{ color: "var(--ink-muted)" }}>
                    Works until {formatDate(code.expires_at)}
                    {code.redemption_count > 0 &&
                      ` · used ${code.redemption_count} time${code.redemption_count === 1 ? "" : "s"}`}
                  </p>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={handleCopy}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-opacity hover:opacity-90"
                      style={{ background: "var(--accent)" }}
                    >
                      {copied ? "Copied" : "Copy code"}
                    </button>
                    <button
                      onClick={handleGenerate}
                      disabled={working}
                      className="flex-1 py-2.5 rounded-xl text-sm font-semibold border disabled:opacity-50"
                      style={{ borderColor: "var(--line-strong)", color: "var(--ink-body)", background: "#fff" }}
                    >
                      New code
                    </button>
                  </div>
                  <button
                    onClick={handleRevokeCode}
                    disabled={working}
                    className="w-full mt-2 py-2 text-sm font-semibold disabled:opacity-50"
                    style={{ color: "#B91C1C" }}
                  >
                    Turn this code off
                  </button>
                  <p className="text-xs mt-3 pt-3" style={{ color: "var(--ink-muted)", borderTop: "1px solid #eef2ef" }}>
                    Turning the code off stops anyone new using it. Clinicians who already have access keep
                    it until you remove them below.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm mt-2" style={{ color: "var(--ink-muted)" }}>
                    No active code. Create one when you&apos;re ready to share.
                  </p>
                  <button
                    onClick={handleGenerate}
                    disabled={working}
                    className="w-full mt-4 py-3 rounded-xl text-sm font-semibold text-white disabled:opacity-50"
                    style={{ background: "var(--accent)" }}
                  >
                    Create a sharing code
                  </button>
                </>
              )}
            </div>

            {/* Who actually has access */}
            <div className="rounded-2xl border p-5 mt-4" style={{ background: "#fff", borderColor: "var(--line-strong)" }}>
              <h2 className="text-sm font-bold uppercase tracking-wide" style={{ color: "var(--ink-muted)" }}>
                Who can see {patient.name}
              </h2>
              {clinicians.length === 0 ? (
                <p className="text-sm mt-2" style={{ color: "var(--ink-muted)" }}>
                  Nobody yet. Only you can see this.
                </p>
              ) : (
                <ul className="mt-3 divide-y" style={{ borderColor: "#eef2ef" }}>
                  {clinicians.map((c) => (
                    <li key={c.clinician_id} className="py-3 flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-sm font-semibold truncate" style={{ color: "var(--ink)" }}>
                          {c.name || c.email}
                        </p>
                        <p className="text-xs truncate" style={{ color: "var(--ink-muted)" }}>
                          {c.name ? `${c.email} · ` : ""}since {formatDate(c.linked_at)}
                        </p>
                      </div>
                      <button
                        onClick={() => handleRemoveClinician(c.clinician_id, c.name || c.email)}
                        disabled={working}
                        className="text-sm font-semibold flex-shrink-0 disabled:opacity-50"
                        style={{ color: "#B91C1C" }}
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
