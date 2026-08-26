"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
      <nav className="site-content flex items-center gap-5 px-5 py-3 sm:px-7">
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
              <Link
                href={`/u/${encodeURIComponent(user.username)}`}
                className="text-muted hover:text-gold"
              >
                {user.username}
              </Link>
              <AccountMenu
                needsUsername={user.needsUsername}
                settingsActive={pathname === "/settings"}
                onLogout={logout}
              />
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

function AccountMenu({
  needsUsername,
  settingsActive,
  onLogout,
}: {
  needsUsername: boolean;
  settingsActive: boolean;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;

    function onPointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }

    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        type="button"
        className={`account-menu-trigger ${
          open || settingsActive || needsUsername
            ? "text-gold"
            : "text-faint hover:text-ink"
        }`}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={() => setOpen((value) => !value)}
      >
        {needsUsername ? "Set username" : "Settings"}
      </button>
      {open ? (
        <div className="account-menu-panel" role="menu">
          <Link
            role="menuitem"
            href="/settings"
            onClick={() => setOpen(false)}
          >
            Account settings
          </Link>
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onLogout();
            }}
          >
            Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
