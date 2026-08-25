"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

const links = [
  { href: "/", label: "Feed" },
  { href: "/draft", label: "Draft Room" },
  { href: "/leaderboard", label: "Leaderboard" },
];

export default function SiteNav() {
  const pathname = usePathname();
  const { user, loading, logout } = useAuth();

  // Overlay is chrome-free for OBS; the control deck is a tight dock panel.
  if (pathname?.startsWith("/overlay/") || pathname?.startsWith("/control/")) {
    return null;
  }

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-surface/90 backdrop-blur">
      <nav className="mx-auto flex w-full max-w-5xl items-center gap-6 px-6 py-3">
        <Link
          href="/"
          className="font-heading text-sm font-bold uppercase tracking-[0.25em] text-accent-streak"
        >
          GGG
        </Link>

        <div className="flex items-center gap-4 text-sm">
          {links.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={
                pathname === link.href
                  ? "font-semibold text-accent-win"
                  : "text-gray-400 transition hover:text-gray-100"
              }
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="ml-auto flex items-center gap-3 text-sm">
          {loading ? null : user ? (
            <>
              <span className="font-mono text-accent-win">{user.username}</span>
              <button
                onClick={logout}
                className="rounded-lg border border-white/10 px-3 py-1.5 text-gray-400 transition hover:border-accent-death/50 hover:text-accent-death"
              >
                Log out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="rounded-lg bg-accent-streak px-4 py-1.5 font-heading font-bold text-dark transition hover:brightness-110"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
