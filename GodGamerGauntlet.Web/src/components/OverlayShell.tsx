"use client";

import type { ReactNode } from "react";
import { OverlayRunProvider } from "@/lib/useOverlayRun";
import { usePinnedControlRunId } from "@/lib/controlSession";

/** Pins one overlay poller to the live-controls run for the whole site shell. */
export default function OverlayShell({ children }: { children: ReactNode }) {
  const runId = usePinnedControlRunId() ?? "";
  return <OverlayRunProvider runId={runId}>{children}</OverlayRunProvider>;
}
