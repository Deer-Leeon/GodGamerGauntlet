"use client";

import { useEffect } from "react";

/**
 * Turns a YouTube/Twitch proof link into an embeddable player URL.
 * Returns null when the link has no iframe form (we link out instead).
 */
export function toEmbedUrl(videoUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(videoUrl);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m)\./, "");
  const parent =
    typeof window === "undefined" ? "localhost" : window.location.hostname;

  if (host === "youtu.be") {
    return `https://www.youtube.com/embed/${url.pathname.slice(1)}`;
  }
  if (host === "youtube.com") {
    const watchId = url.searchParams.get("v");
    if (watchId) return `https://www.youtube.com/embed/${watchId}`;
    const path = /^\/(live|shorts)\/([\w-]+)/.exec(url.pathname);
    if (path) return `https://www.youtube.com/embed/${path[2]}`;
    return null;
  }
  if (host === "clips.twitch.tv") {
    const slug = url.pathname.slice(1).split("/")[0];
    return `https://clips.twitch.tv/embed?clip=${slug}&parent=${parent}&autoplay=false`;
  }
  if (host === "twitch.tv") {
    const video = /^\/(?:videos|\w+\/(?:v|video))\/(\d+)/.exec(url.pathname);
    if (video) {
      return `https://player.twitch.tv/?video=${video[1]}&parent=${parent}&autoplay=false`;
    }
    const clip = /^\/\w+\/clip\/([\w-]+)/.exec(url.pathname);
    if (clip) {
      return `https://clips.twitch.tv/embed?clip=${clip[1]}&parent=${parent}&autoplay=false`;
    }
  }
  return null;
}

/** Inline iframe player with a link-out fallback for unembeddable URLs. */
export function ProofPlayer({ videoUrl }: { videoUrl: string }) {
  const embed = toEmbedUrl(videoUrl);
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
