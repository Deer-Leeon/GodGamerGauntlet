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
const COLLAPSED_KEY = "ggg-browse-rail-collapsed";

function hideOn(pathname: string | null): boolean {
  if (!pathname) return true;
  // OBS surfaces stay chrome-free. Everything else keeps the rail unless
  // the viewer collapses it.
  return (
    pathname.startsWith("/overlay") ||
    pathname.startsWith("/control") ||
    pathname === "/login"
  );
}

export default function BrowseRail() {
  const pathname = usePathname();
  const { user } = useAuth();
  const allowed = !hideOn(pathname);
  const [collapsed, setCollapsed] = useState(false);
  const [sidebar, setSidebar] = useState<Sidebar | null>(null);

  useEffect(() => {
    setCollapsed(window.localStorage.getItem(COLLAPSED_KEY) === "1");
  }, []);

  const open = allowed && !collapsed;

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem(COLLAPSED_KEY, next ? "1" : "0");
      return next;
    });
  }

  useEffect(() => {
    if (open) {
      document.documentElement.classList.add("ggg-has-browse-rail");
    } else {
      document.documentElement.classList.remove("ggg-has-browse-rail");
    }
    return () => document.documentElement.classList.remove("ggg-has-browse-rail");
  }, [open]);

  useEffect(() => {
    if (!allowed) return;
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
  }, [allowed, user?.id]);

  if (!allowed) return null;

  if (collapsed) {
    return (
      <button
        type="button"
        className="browse-rail-expand"
        aria-label="Expand sidebar"
        title="Expand sidebar"
        onClick={toggleCollapsed}
      >
        <RailChevron direction="right" />
      </button>
    );
  }

  const followed = sidebar?.followed ?? [];
  const live = sidebar?.live ?? [];
  const bestRuns = sidebar?.bestRuns ?? [];

  return (
    <aside className="browse-rail">
      <div className="browse-rail-toolbar">
        <button
          type="button"
          className="browse-rail-collapse"
          aria-label="Collapse sidebar"
          title="Collapse sidebar"
          onClick={toggleCollapsed}
        >
          <RailChevron direction="left" />
        </button>
      </div>
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

function RailChevron({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-4 w-4"
    >
      {direction === "left" ? (
        <path d="M15 6 9 12l6 6" />
      ) : (
        <path d="m9 6 6 6-6 6" />
      )}
    </svg>
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
