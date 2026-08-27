"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import {
  getSidebar,
  type LiveRun,
  type Sidebar,
  type SidebarFollowed,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { FOLLOWS_CHANGED } from "@/components/FollowButton";

const POLL_MS = 20_000;

function showOn(pathname: string | null): boolean {
  if (!pathname) return false;
  if (
    pathname.startsWith("/overlay") ||
    pathname.startsWith("/control") ||
    pathname === "/login" ||
    pathname === "/settings"
  ) {
    return false;
  }
  return (
    pathname === "/" ||
    pathname.startsWith("/draft") ||
    pathname.startsWith("/leaderboard") ||
    pathname.startsWith("/players") ||
    pathname.startsWith("/u/")
  );
}

export default function BrowseRail() {
  const pathname = usePathname();
  const { user } = useAuth();
  const visible = showOn(pathname);
  const [sidebar, setSidebar] = useState<Sidebar | null>(null);

  useEffect(() => {
    if (visible) {
      document.documentElement.classList.add("ggg-has-browse-rail");
    } else {
      document.documentElement.classList.remove("ggg-has-browse-rail");
    }
    return () => document.documentElement.classList.remove("ggg-has-browse-rail");
  }, [visible]);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;

    const load = () => {
      getSidebar()
        .then((data) => {
          if (!cancelled) setSidebar(data);
        })
        .catch(() => {
          if (!cancelled) setSidebar({ followed: [], live: [], bestRuns: [] });
        });
    };

    load();
    const timer = window.setInterval(load, POLL_MS);
    window.addEventListener(FOLLOWS_CHANGED, load);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener(FOLLOWS_CHANGED, load);
    };
  }, [visible, user?.id]);

  if (!visible) return null;

  const followed = sidebar?.followed ?? [];
  const live = sidebar?.live ?? [];
  const bestRuns = sidebar?.bestRuns ?? [];

  return (
    <aside className="browse-rail">
      <div className="browse-rail-inner">
        <section>
          <h2>Followed</h2>
          {!user ? (
            <p className="browse-rail-empty">
              <Link href="/login" className="text-gold hover:text-ink">
                Sign in
              </Link>{" "}
              to follow players.
            </p>
          ) : followed.length === 0 ? (
            <p className="browse-rail-empty">
              Follow someone from their profile.
            </p>
          ) : (
            <ul>
              {followed.map((row) => (
                <FollowedRow key={row.username} row={row} />
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2>Live</h2>
          {live.length === 0 ? (
            <p className="browse-rail-empty">No other live gauntlets.</p>
          ) : (
            <ul>
              {live.map((row) => (
                <LiveRow key={row.runId} run={row} />
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2>Best runs</h2>
          <p className="browse-rail-blurb">Almost at a Clear — 8/10 or 4/5.</p>
          {bestRuns.length === 0 ? (
            <p className="browse-rail-empty">Nobody that far along yet.</p>
          ) : (
            <ul>
              {bestRuns.map((row) => (
                <LiveRow key={row.runId} run={row} emphasize />
              ))}
            </ul>
          )}
        </section>
      </div>
    </aside>
  );
}

function FollowedRow({ row }: { row: SidebarFollowed }) {
  if (row.live) {
    return <LiveRow run={row.live} />;
  }

  return (
    <li>
      <Link href={`/u/${encodeURIComponent(row.username)}`} className="browse-rail-row">
        <Initial name={row.username} />
        <span className="browse-rail-copy">
          <span className="browse-rail-name">{row.username}</span>
          <span className="browse-rail-meta">Offline</span>
        </span>
      </Link>
    </li>
  );
}

function LiveRow({ run, emphasize = false }: { run: LiveRun; emphasize?: boolean }) {
  return (
    <li>
      <Link href={`/run/${run.runId}`} className="browse-rail-row">
        <Initial name={run.streamerName} live />
        <span className="browse-rail-copy">
          <span className="browse-rail-name">{run.streamerName}</span>
          <span className={`browse-rail-meta${emphasize ? " is-best" : ""}`}>
            {run.currentTitle ?? "Gauntlet"}
          </span>
        </span>
        <span className="browse-rail-progress">
          <span className="browse-rail-pip" aria-hidden />
          {run.currentSlot}/{run.totalSlots}
        </span>
      </Link>
    </li>
  );
}

function Initial({ name, live = false }: { name: string; live?: boolean }) {
  const letter = (name.trim().slice(0, 1) || "?").toUpperCase();
  return (
    <span className={`browse-rail-avatar ${live ? "is-live" : ""}`} aria-hidden>
      {letter}
    </span>
  );
}
