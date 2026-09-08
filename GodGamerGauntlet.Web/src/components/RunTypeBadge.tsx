import { RUN_TYPE_SLOTS, type RunType } from "@/lib/api";

/** Labels Sprint / Marathon / Endurance (and legacy Standard / Lite). */
export function RunTypeBadge({
  runType,
}: {
  runType: RunType | undefined | null;
}) {
  if (!runType) return null;
  const slots = RUN_TYPE_SLOTS[runType];
  return (
    <span
      title={`${runType} — a ${slots}-game gauntlet`}
      className="text-sm text-faint"
    >
      {runType}
    </span>
  );
}
