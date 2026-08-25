"use client";

import { Suspense, useLayoutEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import ControlBoard from "@/components/ControlBoard";
import { useOverlayRun } from "@/lib/useOverlayRun";
import { formatSpeedrunTime } from "@/components/SpeedrunTimer";

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
  const { state } = useOverlayRun(runId);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 gap-8 px-6 py-8">
      <aside className="w-80 shrink-0">
        <div className="sticky top-20">
          <ControlBoard runId={runId} variant="panel" showSetup={false} />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <p className="text-xs uppercase tracking-widest text-gray-500">
          Control room
        </p>
        <h1 className="font-heading text-3xl font-bold">
          {state?.streamerName ?? "Gauntlet"}
        </h1>
        <p className="mt-1 text-sm text-gray-400">
          Play, split, and reset from the sidebar — or keep those controls
          while you browse the rest of the site. The OBS popup uses a compact
          dock URL so it still fits on one panel.
        </p>

        <div className="mt-4 flex flex-wrap gap-3">
          <Link
            href={`/run/${runId}`}
            className="rounded-lg border border-white/15 px-3 py-1.5 text-sm text-gray-300 transition hover:border-accent-win/50 hover:text-accent-win"
          >
            Open run tracker
          </Link>
        </div>

        {state && (
          <section className="panel mt-8 rounded-2xl p-5">
            <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-widest text-gray-400">
              Lineup
            </h2>
            <div className="flex flex-col gap-2">
              {state.games.map((game, index) => {
                const now = index === state.currentSlotIndex;
                return (
                  <div
                    key={game.gameId}
                    className={`flex items-center gap-3 rounded-xl px-2 py-1.5 ${
                      now ? "bg-accent-win/10" : ""
                    }`}
                  >
                    <span className="w-6 shrink-0 font-mono text-xs text-gray-500">
                      {game.slotNumber}
                    </span>
                    {game.thumb ? (
                      <Image
                        src={game.thumb}
                        alt=""
                        width={40}
                        height={40}
                        unoptimized
                        className="h-10 w-10 shrink-0 rounded-lg object-cover"
                      />
                    ) : (
                      <div className="h-10 w-10 shrink-0 rounded-lg bg-white/10" />
                    )}
                    <p
                      className={`min-w-0 flex-1 truncate font-heading font-bold ${
                        now ? "text-accent-win" : "text-gray-200"
                      }`}
                    >
                      {game.title}
                    </p>
                    <span className="shrink-0 font-mono text-xs text-gray-500">
                      {game.completed
                        ? game.splitTimeMs !== null
                          ? formatSpeedrunTime(game.splitTimeMs)
                          : "cleared"
                        : now
                          ? "now"
                          : "queued"}
                    </span>
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
    <section className="panel mt-8 rounded-2xl p-5 text-sm text-gray-300">
      <h2 className="mb-3 font-heading text-sm font-bold uppercase tracking-widest text-accent-streak">
        OBS setup
      </h2>
      <ol className="list-decimal space-y-2 pl-5">
        <li>
          On the stream: Sources → Browser. Paste the overlay URL. Width{" "}
          <span className="font-mono text-accent-win">840</span> × Height{" "}
          <span className="font-mono text-accent-win">680</span>, then
          Transform → Reset Transform.
        </li>
        <li>
          For buttons inside OBS: Docks → Custom Browser Docks. Paste the{" "}
          <span className="font-semibold text-white">dock URL</span> (it ends
          with <span className="font-mono">?dock=1</span>). That panel stays
          compact; this page stays the full control room.
        </li>
      </ol>
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void copy("overlay")}
          className="rounded-xl border border-accent-streak/50 bg-accent-streak/10 px-4 py-2 font-heading text-xs font-bold uppercase tracking-wider text-accent-streak hover:bg-accent-streak/20"
        >
          {copied === "overlay" ? "Copied!" : "Copy overlay URL"}
        </button>
        <button
          type="button"
          onClick={() => void copy("dock")}
          className="rounded-xl border border-white/15 bg-white/5 px-4 py-2 font-heading text-xs font-bold uppercase tracking-wider text-gray-300 hover:bg-white/10"
        >
          {copied === "dock" ? "Copied!" : "Copy OBS dock URL"}
        </button>
      </div>
    </section>
  );
}
