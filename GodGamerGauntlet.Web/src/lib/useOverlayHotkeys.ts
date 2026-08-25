"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** How long a first R-press stays armed before reset confirmation expires. */
const RESET_ARM_WINDOW_MS = 1500;

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

interface OverlayHotkeys {
  enabled?: boolean;
  togglePlayPause: () => void | Promise<void>;
  split: () => void | Promise<void>;
  resetGauntlet: () => void | Promise<void>;
  /** Overlay: toggle helper chips. Control deck: undo previous game. */
  onKeyP?: () => void | Promise<void>;
}

/**
 * Space / Enter / R / P, shared by the OBS overlay and the control deck.
 * Listens in capture phase and preventDefault so a focused button cannot
 * swallow Space/Enter (which would look like "keys do nothing").
 */
export function useOverlayHotkeys({
  enabled = true,
  togglePlayPause,
  split,
  resetGauntlet,
  onKeyP,
}: OverlayHotkeys): { resetArmed: boolean; requestReset: () => void } {
  const [resetArmed, setResetArmed] = useState(false);
  const resetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const enabledRef = useRef(enabled);
  const actionsRef = useRef({ togglePlayPause, split, resetGauntlet, onKeyP });

  useEffect(() => {
    enabledRef.current = enabled;
    actionsRef.current = { togglePlayPause, split, resetGauntlet, onKeyP };
  }, [enabled, togglePlayPause, split, resetGauntlet, onKeyP]);

  const requestReset = useCallback(() => {
    setResetArmed((armed) => {
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
      if (armed) {
        void actionsRef.current.resetGauntlet();
        return false;
      }
      resetTimerRef.current = setTimeout(() => {
        setResetArmed(false);
        resetTimerRef.current = null;
      }, RESET_ARM_WINDOW_MS);
      return true;
    });
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!enabledRef.current) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingTarget(event.target)) return;
      if (event.repeat) return;

      switch (event.code) {
        case "Space":
          event.preventDefault();
          event.stopPropagation();
          void actionsRef.current.togglePlayPause();
          break;
        case "Enter":
        case "NumpadEnter":
          event.preventDefault();
          event.stopPropagation();
          void actionsRef.current.split();
          break;
        case "KeyR":
          event.preventDefault();
          event.stopPropagation();
          requestReset();
          break;
        case "KeyP":
          event.preventDefault();
          event.stopPropagation();
          void actionsRef.current.onKeyP?.();
          break;
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      if (resetTimerRef.current) {
        clearTimeout(resetTimerRef.current);
        resetTimerRef.current = null;
      }
    };
  }, [requestReset]);

  return { resetArmed, requestReset };
}
