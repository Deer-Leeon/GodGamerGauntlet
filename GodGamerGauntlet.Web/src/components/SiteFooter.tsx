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
    <footer className="site-footer mt-auto border-t border-gold/20">
      <div className="site-content flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-5 text-sm text-faint sm:px-7">
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
    </footer>
  );
}
