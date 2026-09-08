"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";
import { useNotifications } from "@/lib/useNotifications";
import type { User } from "@/lib/api";
import { timeAgo } from "@/components/RunSocial";

const links = [
  { href: "/", label: "Feed" },
  { href: "/draft", label: "Draft Room" },
  { href: "/records", label: "Roster" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/players", label: "Players" },
  { href: "/timer", label: "Timer" },
];

function isActive(pathname: string | null, href: string): boolean {
  if (!pathname) return false;
  // Prefix match keeps Records lit inside /records/[gameId]/… subpages.
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

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
            const active = isActive(pathname, link.href);
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
              <NotificationBell />
              <Link
                href={`/u/${encodeURIComponent(user.username)}`}
                className="text-muted hover:text-gold"
              >
                {user.username}
              </Link>
              <AccountMenu
                user={user}
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

function NotificationBell() {
  // Rendered only for signed-in users, so polling is always enabled here.
  const { notifications, unreadCount, markRead, refresh } =
    useNotifications(true);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const router = useRouter();

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
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Notifications"
        }
        aria-expanded={open}
        aria-haspopup="menu"
        className={`relative px-0.5 transition ${
          open ? "text-gold" : "text-faint hover:text-ink"
        }`}
        onClick={() => {
          setOpen((value) => !value);
          if (!open) refresh();
        }}
      >
        <svg
          aria-hidden
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-4.5 w-4.5"
        >
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.7 21a2 2 0 0 1-3.4 0" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 font-mono text-[10px] leading-none text-white">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        )}
      </button>
      {open ? (
        <div
          role="menu"
          className="account-menu-panel max-h-96 w-80 overflow-y-auto"
        >
          {notifications.length === 0 ? (
            <p className="px-4 py-4 text-sm text-faint">
              Nothing yet. Verdicts on your runs will land here.
            </p>
          ) : (
            notifications.map((notification) => (
              <button
                key={notification.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  markRead(notification.id);
                  setOpen(false);
                  router.push(notification.actionUrl);
                }}
                className="border-b border-white/5 last:border-b-0"
              >
                <span className="flex items-start gap-2">
                  <span
                    aria-hidden
                    className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                      notification.isRead ? "bg-transparent" : "bg-gold"
                    }`}
                  />
                  <span className="min-w-0">
                    <span
                      className={`block text-sm leading-snug ${
                        notification.isRead ? "text-faint" : "text-ink"
                      }`}
                    >
                      {notification.message}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-faint/80">
                      {timeAgo(notification.createdAt)}
                    </span>
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}

function AccountMenu({
  user,
  settingsActive,
  onLogout,
}: {
  user: User;
  settingsActive: boolean;
  onLogout: () => void;
}) {
  const needsUsername = user.needsUsername;
  const canModerate = Boolean(user.isAdmin || user.isModerator);
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
            href={`/u/${encodeURIComponent(user.username)}`}
            onClick={() => setOpen(false)}
          >
            My profile & runs
          </Link>
          <Link
            role="menuitem"
            href="/settings"
            onClick={() => setOpen(false)}
          >
            Account settings
          </Link>
          {canModerate && (
            <Link
              role="menuitem"
              href="/mod/queue"
              onClick={() => setOpen(false)}
            >
              Mod queue
            </Link>
          )}
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
