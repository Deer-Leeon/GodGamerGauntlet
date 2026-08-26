"use client";

import { Suspense, useLayoutEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import ControlBoard from "@/components/ControlBoard";
import { RunTypeBadge } from "@/components/RunTypeBadge";
import { useOverlayRun } from "@/lib/useOverlayRun";
import SpeedrunTimer, { formatSpeedrunTime } from "@/components/SpeedrunTimer";

export default function ControlDeckPage() {
  return (
    <Suspense fallback={null}>
      <ControlDeckView />
    </Suspense>
  );
}

function ControlDeckView() {
  const { runId } = useParams<{ runId: string }>();
  const dockParam = useSearchParams().get("dock") === "1";
  const [autoDock, setAutoDock] = useState(false);

  useLayoutEffect(() => {
    const mq = window.matchMedia("(max-width: 700px)");
    const update = () => {
      setAutoDock(/OBS/i.test(navigator.userAgent) || mq.matches);
    };
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);

  if (dockParam || autoDock) {
    return <ControlBoard runId={runId} variant="dock" />;
  }

  return <ControlStudio runId={runId} />;
}

function ControlStudio({ runId }: { runId: string }) {
  const { state, syncedAt } = useOverlayRun(runId);

  return (
    <main className="site-content flex flex-1 gap-8 px-6 py-8">
      <aside className="w-80 shrink-0">
        <div className="sticky top-20">
          <ControlBoard runId={runId} variant="panel" showSetup={false} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <p className="text-sm text-muted">Control room</p>
        <div className="flex flex-wrap items-baseline gap-2">
          <h1 className="text-2xl font-semibold">
            {state?.streamerName ?? "Gauntlet"}
          </h1>
          <RunTypeBadge runType={state?.runType} />
        </div>
        <p className="mt-1 text-sm text-muted">
          Play, split, and reset from the sidebar — or keep those controls
          while you browse the rest of the site. The OBS popup uses a compact
          dock URL so it still fits on one panel.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={`/run/${runId}`}
            className="border border-gold/35 px-4 py-2 text-sm text-gold transition hover:bg-gold/10"
          >
            Open run tracker
          </Link>
        </div>

        {state && (
          <section className="mt-8 border-t border-gold/20 pt-5">
            <h2 className="mb-3 text-sm text-muted">
              Lineup ({state.games.length} games)
            </h2>
            <div className="flex flex-col">
              {state.games.map((game, index) => {
                const now = index === state.currentSlotIndex;
                return (
                  <div
                    key={game.gameId}
                    className="flex items-center gap-3 border-b border-gold/15 py-3"
                  >
                    <span className="w-6 shrink-0 font-mono text-xs tabular-nums text-faint">
                      {game.slotNumber}
                    </span>
                    {game.thumb ? (
                      <Image
                        src={game.thumb}
                        alt=""
                        width={40}
                        height={40}
                        unoptimized
                        className="h-10 w-10 shrink-0 object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 shrink-0 bg-white/10" />
                    )}
                    <p
                      className={`min-w-0 flex-1 truncate text-sm ${
                        now ? "text-ink" : "text-muted"
                      }`}
                    >
                      {game.title}
                    </p>
                    {game.completed ? (
                      <span className="shrink-0 font-mono text-xs tabular-nums text-gold">
                        {game.splitTimeMs !== null
                          ? formatSpeedrunTime(game.splitTimeMs)
                          : "cleared"}
                      </span>
                    ) : now ? (
                      <SpeedrunTimer
                        elapsedMs={state.elapsedMs}
                        timerStatus={state.timerStatus}
                        syncedAt={syncedAt}
                        tone="site"
                        className="shrink-0 text-xs"
                      />
                    ) : (
                      <span className="shrink-0 font-mono text-xs tabular-nums text-faint">
                        —
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <ObsSetup runId={runId} overlayKey={state?.overlayKey ?? null} />
      </div>
    </main>
  );
}

function ObsSetup({
  runId,
  overlayKey,
}: {
  runId: string;
  overlayKey: string | null;
}) {
  const [copied, setCopied] = useState<"overlay" | "dock" | null>(null);

  if (!overlayKey) return null;

  const copy = async (which: "overlay" | "dock") => {
    const origin = window.location.origin;
    const url =
      which === "overlay"
        ? `${origin}/overlay/${runId}?key=${overlayKey}`
        : `${origin}/control/${runId}?dock=1`;
    await navigator.clipboard.writeText(url);
    setCopied(which);
    window.setTimeout(() => setCopied(null), 2000);
  };

  return (
    <section className="mt-8 border-t border-gold/20 pt-5 text-sm text-muted">
      <h2 className="mb-3 text-sm text-muted">OBS setup</h2>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          On the stream: Sources → Browser. Paste the overlay URL. Width{" "}
          <span className="font-mono text-ink">840</span> × Height{" "}
          <span className="font-mono text-ink">680</span>, then Transform →
          Reset Transform.
        </li>
        <li>
          For buttons inside OBS: Docks → Custom Browser Docks. Paste the{" "}
          <span className="text-ink">dock URL</span> (it ends with{" "}
          <span className="font-mono">?dock=1</span>). That panel stays
          compact; this page stays the full control room.
        </li>
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copy("overlay")}
          className="border border-gold/35 px-4 py-2 text-sm text-gold hover:bg-gold/10"
        >
          {copied === "overlay" ? "Copied" : "Copy overlay URL"}
        </button>
        <button
          type="button"
          onClick={() => void copy("dock")}
          className="border border-gold/25 px-4 py-2 text-sm text-faint hover:text-ink"
        >
          {copied === "dock" ? "Copied" : "Copy OBS dock URL"}
        </button>
      </div>
    </section>
  );
}
