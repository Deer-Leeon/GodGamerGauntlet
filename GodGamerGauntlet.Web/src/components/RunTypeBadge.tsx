import type { RunType } from "@/lib/api";

const SIZES = {
  sm: "px-2 py-0.5 text-[10px]",
  md: "px-2.5 py-0.5 text-xs",
} as const;

/**
 * Marks a run as the 5-game Lite variant. Standard runs render nothing —
 * the full gauntlet is the default and needs no label.
 */
export function RunTypeBadge({
  runType,
  size = "md",
}: {
  runType: RunType | undefined | null;
  size?: keyof typeof SIZES;
}) {
  if (runType !== "Lite") return null;
  return (
    <span
      title="Gauntlet Lite — a 5-game run"
      className={`shrink-0 rounded-full bg-accent-win/15 font-heading font-bold uppercase tracking-wider text-accent-win ${SIZES[size]}`}
    >
      Lite Mode
    </span>
  );
}
