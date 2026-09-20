/** Same-origin path only. Blocks protocol-relative and login loops. */
export function safeNextPath(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  if (raw.includes("\\") || raw.includes("://")) return null;
  if (raw.startsWith("/login")) return null;
  return raw;
}
