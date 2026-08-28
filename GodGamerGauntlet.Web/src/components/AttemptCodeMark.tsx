"use client";

/** XK4M2P → XK4-M2P so it is easy to read off a stream and a phone. */
export function formatAttemptCode(code: string): string {
  const compact = code.replace(/[^0-9A-Za-z]/g, "").toUpperCase();
  if (compact.length === 6) return `${compact.slice(0, 3)}-${compact.slice(3)}`;
  return compact || code;
}

export default function AttemptCodeMark({
  code,
  tone = "site",
}: {
  code?: string | null;
  tone?: "site" | "overlay";
}) {
  if (!code) return null;
  const label = formatAttemptCode(code);
  if (tone === "overlay") {
    return (
      <span className="font-mono text-[13px] font-semibold tracking-[0.18em] text-white">
        {label}
      </span>
    );
  }
  return (
    <span className="font-mono text-sm tabular-nums tracking-[0.16em] text-gold">
      {label}
    </span>
  );
}
