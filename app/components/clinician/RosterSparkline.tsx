import { SINGLE_SERIES_COLOR, STATUS_COLORS } from "../../lib/chartTheme";

/**
 * Tiny severity trace for a roster row.
 *
 * Hand-drawn SVG rather than Chart.js: a roster can hold dozens of these, and
 * spinning up a canvas chart per row would cost far more than the marks are
 * worth. Unlogged days break the line instead of being interpolated — a gap in
 * caregiver logging is information, and bridging it would invent data.
 */
export function RosterSparkline({
  values,
  width = 96,
  height = 28,
}: {
  values: (number | null)[];
  width?: number;
  height?: number;
}) {
  const pad = 3;
  const scored = values.filter((v): v is number => v != null);

  if (scored.length === 0) {
    return (
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-label="No severity data" className="flex-shrink-0">
        <line
          x1={pad} y1={height / 2} x2={width - pad} y2={height / 2}
          stroke={STATUS_COLORS.neutral} strokeWidth={1.5} strokeDasharray="2 3" strokeLinecap="round"
        />
      </svg>
    );
  }

  // Fixed 0–10 domain so one patient's trace is directly comparable to the
  // next. A per-row auto-scale would make a mild patient look identical to a
  // severe one, which on a triage screen is actively misleading.
  const toX = (i: number) =>
    values.length === 1 ? width / 2 : pad + (i / (values.length - 1)) * (width - pad * 2);
  const toY = (v: number) => height - pad - (Math.max(0, Math.min(10, v)) / 10) * (height - pad * 2);

  // Split into runs of consecutive logged days so gaps stay gaps.
  const runs: { i: number; v: number }[][] = [];
  let current: { i: number; v: number }[] = [];
  values.forEach((v, i) => {
    if (v == null) {
      if (current.length) runs.push(current);
      current = [];
    } else {
      current.push({ i, v });
    }
  });
  if (current.length) runs.push(current);

  const latest = scored[scored.length - 1];
  // Explicit <number>: without it TS resolves the same-type reduce overload
  // (T = number | null, since 0 is assignable to it) and the index comes back
  // nullable, which then fails to satisfy toX().
  const latestIndex = values.reduce<number>((acc, v, i) => (v != null ? i : acc), 0);

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="flex-shrink-0"
      role="img"
      aria-label={`Symptom severity trend, most recent ${latest} out of 10`}
    >
      {runs.map((run, ri) =>
        run.length === 1 ? (
          <circle key={ri} cx={toX(run[0].i)} cy={toY(run[0].v)} r={1.75} fill={SINGLE_SERIES_COLOR} />
        ) : (
          <path
            key={ri}
            d={run.map((p, k) => `${k === 0 ? "M" : "L"}${toX(p.i).toFixed(1)} ${toY(p.v).toFixed(1)}`).join(" ")}
            fill="none"
            stroke={SINGLE_SERIES_COLOR}
            strokeWidth={1.75}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      )}
      <circle cx={toX(latestIndex)} cy={toY(latest)} r={2.5} fill={SINGLE_SERIES_COLOR} stroke="#fff" strokeWidth={1.5} />
    </svg>
  );
}
