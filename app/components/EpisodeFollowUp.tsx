import type { Episode } from "../lib/types";
import { outcomeLabel } from "../lib/episodes";

/** "Result: … · Next: …" line for an episode, or nothing if neither is set. */
export function EpisodeFollowUp({ episode, className = "text-sm text-slate-600" }: { episode: Episode; className?: string }) {
  const outcome = outcomeLabel(episode.outcome);
  const steps = episode.next_steps ?? [];
  if (!outcome && !steps.length) return null;
  return (
    <p className={className}>
      {outcome && <><span className="font-semibold">Result:</span> {outcome}</>}
      {outcome && steps.length > 0 && " · "}
      {steps.length > 0 && <><span className="font-semibold">Next:</span> {steps.join(", ")}</>}
    </p>
  );
}
