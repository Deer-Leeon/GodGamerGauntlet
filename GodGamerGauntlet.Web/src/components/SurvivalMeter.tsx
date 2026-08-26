export default function SurvivalMeter({
  label,
  survived,
  total,
}: {
  label: string;
  survived: number;
  total: number;
}) {
  const safeTotal = Math.max(total, 1);
  const filled = Math.min(survived, safeTotal);
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-sm text-faint">{label}</p>
        <p className="font-mono text-sm tabular-nums text-muted">
          {filled}/{safeTotal}
        </p>
      </div>
      <div className="mt-2 flex gap-0.5" aria-hidden>
        {Array.from({ length: safeTotal }, (_, i) => (
          <span
            key={i}
            className={`h-2 flex-1 ${
              i < filled ? "bg-gold" : "bg-gold/15"
            }`}
          />
        ))}
      </div>
    </div>
  );
}
