import type { MetricPoint } from "../lib/insights";

export function Sparkline({ points, color }: { points: MetricPoint[]; color: string }) {
  const W = 56, H = 24, P = 2;
  if (points.length < 2) {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="flex-shrink-0">
        <line x1={P} y1={H / 2} x2={W - P} y2={H / 2} stroke="#E2E8F0" strokeWidth={1.5} strokeLinecap="round" />
      </svg>
    );
  }
  const vals = points.map((p) => p.value);
  const minV = Math.min(...vals), maxV = Math.max(...vals);
  const range = maxV - minV || 1;
  const xs = points.map((_, i) => P + (i / (points.length - 1)) * (W - P * 2));
  const ys = points.map((p) => H - P - ((p.value - minV) / range) * (H - P * 2));
  const d = xs.map((x, i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${ys[i].toFixed(1)}`).join(" ");
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="flex-shrink-0">
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
