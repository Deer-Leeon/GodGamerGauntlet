"use client";

import Link from "next/link";
import { useEffect } from "react";
import { usePathname } from "next/navigation";
import ControlBoard from "@/components/ControlBoard";
import {
  unpinControlRun,
  usePinnedControlRunId,
} from "@/lib/controlSession";

/**
 * Sticky right rail so the owner can browse Feed / Draft / the run page
 * without losing Play, Split, and the timer.
 */
export default function ControlRail() {
  const pathname = usePathname();
  const runId = usePinnedControlRunId();

  const hidden =
    !runId ||
    pathname?.startsWith("/overlay/") ||
    pathname?.startsWith("/control/");

  useEffect(() => {
    if (hidden) {
      document.documentElement.classList.remove("ggg-has-control-rail");
      return;
    }
    document.documentElement.classList.add("ggg-has-control-rail");
    return () => {
      document.documentElement.classList.remove("ggg-has-control-rail");
    };
  }, [hidden]);

  if (hidden || !runId) return null;

  return (
    <aside className="fixed top-0 right-0 z-30 hidden h-dvh w-80 flex-col border-l border-gold/20 bg-surface pt-14 lg:flex">
      <div className="flex items-center justify-between gap-2 border-b border-gold/20 px-3 py-2">
        <Link
          href={`/control/${runId}`}
          className="text-[12px] text-muted hover:text-gold"
        >
          Open control room
        </Link>
        <button
          type="button"
          onClick={unpinControlRun}
          className="px-2 py-1 text-[12px] text-muted hover:text-gold"
        >
          Hide
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        <ControlBoard
          runId={runId}
          variant="panel"
          showSetup={false}
          hotkeys="local"
        />
      </div>
    </aside>
  );
}
