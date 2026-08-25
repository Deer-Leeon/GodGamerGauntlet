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

  // Overlay is chrome-free for OBS. The control dock hides this via CSS
  // when .obs-control-root is present; the wide control room keeps the nav.
  if (pathname?.startsWith("/overlay/")) return null;

  return (
    <header className="site-nav sticky top-0 z-40 border-b border-white/12 bg-dark">
      <nav className="mx-auto flex w-full max-w-6xl items-center gap-6 px-6 py-3">
        <Link href="/" className="text-sm font-semibold text-ink">
          GGG
        </Link>

        <div className="flex items-center gap-5 text-sm">
          {links.map((link) => {
            const active = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  active
                    ? "-mb-px border-b-2 border-ink pb-0.5 text-ink"
                    : "text-gray-500 transition hover:text-gray-300"
                }
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-3 text-sm">
          {loading ? null : user ? (
            <>
              <span className="text-gray-500">{user.username}</span>
              <button
                onClick={logout}
                className="border border-white/20 px-3 py-1.5 text-gray-400 transition hover:border-white/40 hover:text-ink"
              >
                Log out
              </button>
            </>
          ) : (
            <Link
              href="/login"
              className="border border-white/20 px-3 py-1.5 text-ink transition hover:border-white/40 hover:bg-white/5"
            >
              Sign in
            </Link>
          )}
        </div>
      </nav>
    </header>
  );
}
