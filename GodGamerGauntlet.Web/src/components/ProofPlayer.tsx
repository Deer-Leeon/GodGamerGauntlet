"use client";

import { useEffect } from "react";

/**
 * Turns a YouTube/Twitch proof link into an embeddable player URL.
 * Returns null when the link has no iframe form (we link out instead).
 */
export function toEmbedUrl(
  videoUrl: string,
  startSeconds?: number | null,
): string | null {
  let url: URL;
  try {
    url = new URL(videoUrl);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, "");
  const parent =
    typeof window === "undefined" ? "localhost" : window.location.hostname;
  const start =
    startSeconds && startSeconds > 0
      ? startSeconds
      : Number.parseInt(url.searchParams.get("t") ?? "", 10) || null;

  function withStart(embed: string, youtube: boolean): string {
    if (!start) return embed;
    const join = embed.includes("?") ? "&" : "?";
    return youtube ? `${embed}${join}start=${start}` : `${embed}${join}t=${start}`;
  }

  if (host === "youtu.be") {
    return withStart(
      `https://www.youtube.com/embed/${url.pathname.slice(1)}`,
      true,
    );
  }
  if (host === "youtube.com") {
    const watchId = url.searchParams.get("v");
    if (watchId) {
      return withStart(`https://www.youtube.com/embed/${watchId}`, true);
    }
    const path = /^\/(live|shorts)\/([\w-]+)/.exec(url.pathname);
    if (path) {
      return withStart(`https://www.youtube.com/embed/${path[2]}`, true);
    }
    return null;
  }
  if (host === "clips.twitch.tv") {
    const slug = url.pathname.slice(1).split("/")[0];
    return withStart(
      `https://clips.twitch.tv/embed?clip=${slug}&parent=${parent}&autoplay=false`,
      false,
    );
  }
  if (host === "twitch.tv") {
    const video = /^\/(?:videos|\w+\/(?:v|video))\/(\d+)/.exec(url.pathname);
    if (video) {
      return withStart(
        `https://player.twitch.tv/?video=${video[1]}&parent=${parent}&autoplay=false`,
        false,
      );
    }
    const clip = /^\/\w+\/clip\/([\w-]+)/.exec(url.pathname);
    if (clip) {
      return withStart(
        `https://clips.twitch.tv/embed?clip=${clip[1]}&parent=${parent}&autoplay=false`,
        false,
      );
    }
  }
  return null;
}

/** Inline iframe player with a link-out fallback for unembeddable URLs. */
export function ProofPlayer({
  videoUrl,
  startSeconds,
}: {
  videoUrl: string;
  startSeconds?: number | null;
}) {
  const embed = toEmbedUrl(videoUrl, startSeconds);
  if (!embed) {
    return (
      <div className="flex aspect-video items-center justify-center border border-gold/20 bg-black/40">
        <a
          href={videoUrl}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-gold underline underline-offset-4 hover:text-gold/80"
        >
          Open proof video ↗
        </a>
      </div>
    );
  }
  return (
    <iframe
      src={embed}
      className="aspect-video w-full border border-gold/20 bg-black"
      allow="autoplay; fullscreen; picture-in-picture"
      allowFullScreen
      title="Run proof video"
    />
  );
}

/** Full-screen overlay around ProofPlayer. Escape or backdrop click closes. */
export function ProofModal({
  videoUrl,
  label,
  onClose,
}: {
  videoUrl: string;
  label: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={label}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-4xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="truncate text-sm text-muted">{label}</p>
          <div className="flex shrink-0 items-center gap-4 text-sm">
            <a
              href={videoUrl}
              target="_blank"
              rel="noreferrer"
              className="text-faint hover:text-gold"
            >
              Open on site ↗
            </a>
            <button
              onClick={onClose}
              autoFocus
              className="text-faint hover:text-ink"
            >
              Close (Esc)
            </button>
          </div>
        </div>
        <ProofPlayer videoUrl={videoUrl} />
      </div>
    </div>
  );
}
