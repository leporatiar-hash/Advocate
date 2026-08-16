import type { WhatWentWellItem } from "../../lib/types";

function fmtDate(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

// Mirrors RankedFlag's shape (rounded-2xl, bordered, same padding, no
// internal heading — the page's SectionTitle supplies that) in the green
// tone reserved for positives, so the two cards read as a matched pair side
// by side rather than two unrelated widgets.
export function WhatWentWell({ items }: { items: WhatWentWellItem[] }) {
  if (!items.length) {
    return (
      <div className="rounded-2xl p-5 h-full" style={{ background: "var(--cp-green-light)", border: "1px solid var(--cp-green)" }}>
        <p className="text-sm" style={{ color: "var(--cp-text-muted)" }}>
          No standout positives logged this period.
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl p-5 h-full flex flex-col" style={{ background: "var(--cp-green-light)", border: "1px solid var(--cp-green)" }}>
      <ul className="space-y-2.5 flex-1">
        {items.map((item, i) => (
          <li key={i} className="text-sm leading-snug" style={{ color: "var(--cp-text)" }}>
            <span className="font-semibold cp-tabular" style={{ color: "var(--cp-green)" }}>
              {fmtDate(item.date)}
            </span>{" "}
            {item.observation}
          </li>
        ))}
      </ul>
      <p
        className="text-xs italic pt-3 mt-3"
        style={{ color: "var(--cp-text-muted)", borderTop: "1px solid rgba(21,128,61,0.15)" }}
      >
        Attributed observations. Not a diagnosis.
      </p>
    </div>
  );
}
