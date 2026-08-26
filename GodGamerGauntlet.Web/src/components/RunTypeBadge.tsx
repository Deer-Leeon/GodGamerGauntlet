import type { RunType } from "@/lib/api";

/**
 * Marks a run as the 5-game Lite variant. Standard runs render nothing —
 * the full gauntlet is the default and needs no label.
 */
export function RunTypeBadge({
  runType,
}: {
  runType: RunType | undefined | null;
}) {
  if (runType !== "Lite") return null;
  return (
    <span title="Gauntlet Lite — a 5-game run" className="text-sm text-faint">
      Lite
    </span>
  );
}
