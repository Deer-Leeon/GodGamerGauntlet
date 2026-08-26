"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

const links = [
  { href: "/", label: "Feed" },
  { href: "/draft", label: "Draft Room" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/players", label: "Players" },
];

export default function SiteNav() {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();

  // Overlay is chrome-free for OBS. The control dock hides this via CSS
  // when .obs-control-root is present; the wide control room keeps the nav.
  if (pathname?.startsWith("/overlay/")) return null;

  return (
    <header className="site-nav sticky top-0 z-40 border-b border-gold/25 bg-surface/95">
      <nav className="mx-auto flex w-full max-w-6xl items-center gap-6 px-6 py-4 sm:px-8">
        <Link href="/" className="brand text-gold">
          GGG
        </Link>

        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  active
                    ? "-mb-px border-b-2 border-gold pb-1 text-gold"
                    : "text-faint transition hover:text-ink"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-4 text-sm">
          {loading ? null : user ? (
            <>
              <span className="text-muted">
                <Link
                  href={`/u/${encodeURIComponent(user.username)}`}
                  className="hover:text-gold"
                >
                  {user.username}
                </Link>
              </span>
              <Link
                href="/settings"
                className={
                  pathname === "/settings"
                    ? "text-gold"
                    : user.needsUsername
                      ? "text-gold hover:text-ink"
                      : "text-faint hover:text-ink"
                }
              >
                {user.needsUsername ? "Set username" : "Settings"}
              </Link>
              <button
                onClick={logout}
                className="border border-gold/25 px-4 py-2 text-muted transition hover:border-gold/50 hover:text-ink"
              >
                Log out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="bg-gold px-4 py-2 text-dark transition hover:bg-gold/90"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
