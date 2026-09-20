"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "@/lib/auth";

function hideOn(pathname: string | null): boolean {
  if (!pathname) return true;
  return pathname.startsWith("/overlay") || pathname.startsWith("/control");
}

export default function SiteFooter() {
  const pathname = usePathname();
  const { user } = useAuth();

  if (hideOn(pathname)) return null;

  return (
    <footer className="site-footer mt-auto border-t border-ink/10">
      <div className="site-content flex flex-col gap-3 px-5 py-6 sm:px-7">
        <p className="text-sm text-muted">A solo speedrun club. 19 games.</p>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-faint">
          <Link href="/how" className="hover:text-ink">
            How it works
          </Link>
          <Link href="/records" className="hover:text-ink">
            Games
          </Link>
          <Link href="/leaderboard" className="hover:text-ink">
            Boards
          </Link>
          <Link href="/timer" className="hover:text-ink">
            Timer
          </Link>
          {user ? (
            <Link href="/draft" className="hover:text-ink">
              Draft
            </Link>
          ) : (
            <Link href="/login" className="hover:text-ink">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </footer>
  );
}
