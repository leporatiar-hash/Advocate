"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import toast from "react-hot-toast";
import { api } from "../lib/api";
import { useAuth } from "../components/AuthProvider";
import { ClinicianHeader } from "../components/clinician/ClinicianHeader";
import { CustomizeControl } from "../components/clinician/CustomizeControl";
import { RosterSparkline } from "../components/clinician/RosterSparkline";
import type { ClinicianPatientSummary } from "../lib/types";

type SortKey = "urgency" | "name" | "recent" | "severity";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "urgency", label: "Most urgent" },
  { key: "name", label: "Name" },
  { key: "recent", label: "Recently logged" },
  { key: "severity", label: "Symptom load" },
];

function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const then = new Date(`${iso}T00:00:00`).getTime();
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.round((now.getTime() - then) / 86400000);
}

function lastLoggedLabel(iso: string | null): { text: string; stale: boolean } {
  const d = daysSince(iso);
  if (d === null) return { text: "Never logged", stale: true };
  if (d <= 0) return { text: "Logged today", stale: false };
  if (d === 1) return { text: "Logged yesterday", stale: false };
  return { text: `${d} days since last log`, stale: d >= 4 };
}

/** Flag counts as a compact, labelled badge. Never colour alone — the number
 *  and the word "high" both carry the meaning for anyone who can't perceive
 *  the red. */
function FlagBadge({ high, moderate }: { high: number; moderate: number }) {
  if (high > 0) {
    return (
      <span
        className="text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded-full whitespace-nowrap"
        style={{ background: "var(--cp-red-light)", color: "var(--cp-red)" }}
      >
        {high} high
      </span>
    );
  }
  if (moderate > 0) {
    return (
      <span
        className="text-[11px] font-bold uppercase tracking-wide px-2 py-1 rounded-full whitespace-nowrap"
        style={{ background: "var(--cp-amber-light)", color: "var(--cp-amber)" }}
      >
        {moderate} moderate
      </span>
    );
  }
  return (
    <span
      className="text-[11px] font-semibold px-2 py-1 rounded-full whitespace-nowrap"
      style={{ background: "var(--cp-green-light)", color: "var(--cp-green)" }}
    >
      No flags
    </span>
  );
}

export default function ClinicianRosterPage() {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  const [patients, setPatients] = useState<ClinicianPatientSummary[]>([]);
  const [diagnoses, setDiagnoses] = useState<string[]>([]);
  const [dataLoading, setDataLoading] = useState(true);
  const [error, setError] = useState(false);

  const [redeeming, setRedeeming] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState<string | null>(null);
  const [submittingCode, setSubmittingCode] = useState(false);

  const [query, setQuery] = useState("");
  const [diagnosisFilter, setDiagnosisFilter] = useState<string>("all");
  const [sort, setSort] = useState<SortKey>("urgency");

  const loadData = useCallback(async () => {
    try {
      const [list, dx] = await Promise.all([
        api.getClinicianPatients(30) as Promise<ClinicianPatientSummary[]>,
        api.getClinicianDiagnoses().catch(() => []) as Promise<string[]>,
      ]);
      setPatients(list);
      setDiagnoses(dx);
    } catch {
      setError(true);
    } finally {
      setDataLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isLoading && !user) { router.push("/login"); return; }
    if (!isLoading && user) loadData();
  }, [user, isLoading, loadData, router]);

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    const code = codeInput.trim();
    if (!code) return;
    setSubmittingCode(true);
    setCodeError(null);
    try {
      const result = (await api.redeemShareCode(code)) as { patient_name: string };
      setCodeInput("");
      setRedeeming(false);
      await loadData();
      toast.success(`${result.patient_name} added to your patients`);
    } catch (err: unknown) {
      // The API answers identically for unknown, expired and revoked codes, so
      // this can't be used to probe which codes exist. Surface it inline rather
      // than as a toast — the field is where the fix happens.
      setCodeError(err instanceof Error ? err.message : "That code didn't work.");
    } finally {
      setSubmittingCode(false);
    }
  }

  // Filtering is client-side on purpose: a pilot panel arrives in one response,
  // so search stays instant with no request per keystroke.
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = patients.filter((p) => {
      const matchesQuery =
        !q ||
        p.name.toLowerCase().includes(q) ||
        (p.diagnosis ?? "").toLowerCase().includes(q);
      const matchesDx = diagnosisFilter === "all" || (p.diagnosis ?? "") === diagnosisFilter;
      return matchesQuery && matchesDx;
    });

    const sorted = [...filtered];
    if (sort === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (sort === "recent") {
      sorted.sort((a, b) => (b.last_log_date ?? "").localeCompare(a.last_log_date ?? ""));
    } else if (sort === "severity") {
      sorted.sort((a, b) => (b.avg_symptom_severity ?? -1) - (a.avg_symptom_severity ?? -1));
    } else {
      sorted.sort(
        (a, b) =>
          b.high_flags - a.high_flags ||
          b.moderate_flags - a.moderate_flags ||
          a.name.localeCompare(b.name)
      );
    }
    return sorted;
  }, [patients, query, diagnosisFilter, sort]);

  const highCount = patients.filter((p) => p.high_flags > 0).length;

  if (isLoading || dataLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--cp-bg)" }}>
        <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin" style={{ borderColor: "var(--cp-teal)", borderTopColor: "transparent" }} />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-12">
      <ClinicianHeader actions={<CustomizeControl />} />

      <div className="max-w-5xl mx-auto px-4 pt-6">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <h1 className="text-2xl font-bold" style={{ color: "var(--cp-text)" }}>Your patients</h1>
          <p className="text-sm" style={{ color: "var(--cp-text-muted)" }}>
            {patients.length} total
            {highCount > 0 && (
              <>
                {" · "}
                <span className="font-semibold" style={{ color: "var(--cp-red)" }}>
                  {highCount} needing attention
                </span>
              </>
            )}
          </p>
        </div>
        <p className="text-sm mt-1" style={{ color: "var(--cp-text-muted)" }}>
          Read-only summaries built from caregiver-logged observations. Last 30 days.
        </p>

        {/* Add a patient by code. The only way a clinician gains access to
            anyone — there is deliberately no search, no directory, no request
            flow. Access always originates with the caregiver. */}
        <div className="mt-5">
          {redeeming ? (
            <form
              onSubmit={handleRedeem}
              className="rounded-xl border p-4"
              style={{ background: "#fff", borderColor: "var(--cp-border)" }}
            >
              <label htmlFor="share-code" className="block text-sm font-semibold" style={{ color: "var(--cp-text)" }}>
                Enter the code your patient&apos;s caregiver gave you
              </label>
              <div className="flex gap-2 mt-2">
                <input
                  id="share-code"
                  value={codeInput}
                  onChange={(e) => { setCodeInput(e.target.value.toUpperCase()); setCodeError(null); }}
                  placeholder="ABCD-2345"
                  autoFocus
                  autoCapitalize="characters"
                  autoCorrect="off"
                  spellCheck={false}
                  className="flex-1 rounded-lg border px-3 py-2 font-mono tracking-widest uppercase outline-none"
                  style={{ borderColor: "var(--cp-border)", color: "var(--cp-text)" }}
                />
                <button
                  type="submit"
                  disabled={submittingCode || !codeInput.trim()}
                  className="px-4 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
                  style={{ background: "var(--cp-teal)" }}
                >
                  {submittingCode ? "Checking…" : "Add"}
                </button>
                <button
                  type="button"
                  onClick={() => { setRedeeming(false); setCodeError(null); }}
                  className="px-3 py-2 rounded-lg text-sm font-semibold border"
                  style={{ borderColor: "var(--cp-border)", color: "var(--cp-text-muted)" }}
                >
                  Cancel
                </button>
              </div>
              {codeError && (
                <p className="text-sm mt-2" style={{ color: "var(--cp-red)" }}>{codeError}</p>
              )}
              <p className="text-xs mt-2" style={{ color: "var(--cp-text-muted)" }}>
                Codes look like ABCD-2345. Case and the dash don&apos;t matter.
              </p>
            </form>
          ) : (
            <button
              onClick={() => setRedeeming(true)}
              className="w-full rounded-xl border border-dashed py-3 text-sm font-semibold transition-colors hover:border-[var(--cp-teal)]"
              style={{ borderColor: "var(--cp-border)", color: "var(--cp-teal)", background: "#fff" }}
            >
              + Add a patient with a code
            </button>
          )}
        </div>

        {/* Filters, in one row above the list. */}
        <div className="flex flex-wrap gap-2 mt-5">
          <div className="relative flex-1 min-w-[200px]">
            <svg
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
              style={{ color: "var(--cp-text-muted)" }}
              fill="none" stroke="currentColor" viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-4.35-4.35M17 11a6 6 0 11-12 0 6 6 0 0112 0z" />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search by name or condition"
              aria-label="Search patients by name or condition"
              className="w-full rounded-lg border pl-9 pr-3 py-2 text-sm outline-none focus:ring-2"
              style={{ background: "#fff", borderColor: "var(--cp-border)", color: "var(--cp-text)" }}
            />
          </div>

          <select
            value={diagnosisFilter}
            onChange={(e) => setDiagnosisFilter(e.target.value)}
            aria-label="Filter by condition"
            className="rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ background: "#fff", borderColor: "var(--cp-border)", color: "var(--cp-text)" }}
          >
            <option value="all">All conditions</option>
            {diagnoses.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            aria-label="Sort patients"
            className="rounded-lg border px-3 py-2 text-sm outline-none"
            style={{ background: "#fff", borderColor: "var(--cp-border)", color: "var(--cp-text)" }}
          >
            {SORTS.map((s) => (
              <option key={s.key} value={s.key}>Sort: {s.label}</option>
            ))}
          </select>
        </div>

        {error && (
          <div className="rounded-xl border p-6 text-center mt-5" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
            <p className="text-sm" style={{ color: "var(--cp-text-muted)" }}>Could not load your patient list.</p>
          </div>
        )}

        {!error && patients.length === 0 && (
          <div className="rounded-xl border p-6 text-center mt-5" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
            <p className="text-sm" style={{ color: "var(--cp-text-muted)" }}>No patients are linked to your account yet.</p>
          </div>
        )}

        {!error && patients.length > 0 && visible.length === 0 && (
          <div className="rounded-xl border p-6 text-center mt-5" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
            <p className="text-sm" style={{ color: "var(--cp-text-muted)" }}>
              No patients match {query ? `“${query}”` : "this filter"}.
            </p>
            <button
              onClick={() => { setQuery(""); setDiagnosisFilter("all"); }}
              className="text-sm font-semibold mt-2 hover:underline"
              style={{ color: "var(--cp-teal)" }}
            >
              Clear filters
            </button>
          </div>
        )}

        <div className="space-y-2.5 mt-4">
          {visible.map((p) => {
            const logged = lastLoggedLabel(p.last_log_date);
            return (
              <Link
                key={p.id}
                href={`/clinician/dashboard/?patient_id=${p.id}`}
                className="block rounded-xl border p-4 transition-colors hover:border-[var(--cp-teal)]"
                style={{ background: "#fff", borderColor: "var(--cp-border)" }}
              >
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h2 className="text-base font-bold" style={{ color: "var(--cp-text)" }}>{p.name}</h2>
                      <FlagBadge high={p.high_flags} moderate={p.moderate_flags} />
                    </div>
                    <p className="text-xs mt-0.5" style={{ color: "var(--cp-text-muted)" }}>
                      {p.age !== null ? `Age ${p.age}` : "Age unknown"}
                      {p.diagnosis ? ` · ${p.diagnosis}` : ""}
                    </p>
                  </div>

                  <div className="flex items-center gap-4 flex-shrink-0">
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wide" style={{ color: "var(--cp-text-muted)" }}>
                        Severity
                      </p>
                      <RosterSparkline values={p.severity_series} />
                    </div>
                    <svg className="w-4 h-4" style={{ color: "var(--cp-text-muted)" }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2.5 text-xs" style={{ color: "var(--cp-text-muted)" }}>
                  <span className={logged.stale ? "font-semibold" : ""} style={logged.stale ? { color: "var(--cp-amber)" } : undefined}>
                    {logged.text}
                  </span>
                  <span className="cp-tabular">{p.days_logged}/{p.days_in_window} days logged</span>
                  {p.adherence_pct !== null && <span className="cp-tabular">{p.adherence_pct}% adherence</span>}
                  {p.avg_symptom_severity !== null && <span className="cp-tabular">Avg severity {p.avg_symptom_severity}/10</span>}
                </div>

                {p.top_concern && (
                  <p
                    className="text-xs mt-2.5 pt-2.5"
                    style={{ color: "var(--cp-text)", borderTop: "1px solid var(--cp-border)" }}
                  >
                    <span className="font-semibold" style={{ color: p.high_flags > 0 ? "var(--cp-red)" : "var(--cp-amber)" }}>
                      Top concern:{" "}
                    </span>
                    {p.top_concern}
                  </p>
                )}
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
