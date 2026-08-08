export function StatCard({ label, value, sublabel }: { label: string; value: string; sublabel?: string }) {
  return (
    <div className="rounded-xl border p-4" style={{ background: "#fff", borderColor: "var(--cp-border)" }}>
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--cp-text-muted)" }}>
        {label}
      </p>
      <p className="cp-tabular text-2xl font-bold mt-1 leading-tight" style={{ color: "var(--cp-text)" }}>
        {value}
      </p>
      {sublabel && (
        <p className="text-xs mt-1" style={{ color: "var(--cp-text-muted)" }}>
          {sublabel}
        </p>
      )}
    </div>
  );
}
