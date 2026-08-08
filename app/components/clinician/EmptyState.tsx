export function EmptyState({ text }: { text: string }) {
  return (
    <div
      className="rounded-xl border p-4 text-sm text-center"
      style={{ background: "#fff", borderColor: "var(--cp-border)", color: "var(--cp-text-muted)" }}
    >
      {text}
    </div>
  );
}
