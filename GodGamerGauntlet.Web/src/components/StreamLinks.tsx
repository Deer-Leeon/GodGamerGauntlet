"use client";

import { useState } from "react";
import {
  changeStreamLinks,
  type StreamLink,
  type StreamPlatform,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

export function StreamLinkList({
  links,
  live = false,
}: {
  links: StreamLink[] | null | undefined;
  live?: boolean;
}) {
  if (!links?.length) return null;

  return (
    <ul className="stream-links">
      {links.map((link) => {
        const platform = link.platform === "youtube" ? "youtube" : "twitch";
        const name = platform === "youtube" ? "YouTube" : "Twitch";
        return (
          <li key={link.url}>
            <a
              href={link.url}
              target="_blank"
              rel="noopener noreferrer"
              className={`stream-link stream-link-${platform}`}
            >
              <StreamPlatformIcon platform={platform} />
              {live ? `Watch on ${name}` : link.label}
            </a>
          </li>
        );
      })}
    </ul>
  );
}

export function StreamLinkEditor({
  initial,
  onSaved,
}: {
  initial: StreamLink[] | null | undefined;
  onSaved?: (links: StreamLink[]) => void;
}) {
  const { applyAuth } = useAuth();
  const [twitch, setTwitch] = useState(() => urlFor(initial, "twitch"));
  const [youtube, setYoutube] = useState(() => urlFor(initial, "youtube"));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);

    const links = [
      { platform: "twitch" as const, url: twitch.trim() },
      { platform: "youtube" as const, url: youtube.trim() },
    ].filter((row) => row.url.length > 0);

    const localError = links
      .map((row) => incompleteLinkMessage(row.platform, row.url))
      .find((message) => message != null);
    if (localError) {
      setError(localError);
      setSaving(false);
      return;
    }

    try {
      const result = await changeStreamLinks(links);
      const savedLinks = result.user.streamLinks ?? [];
      applyAuth(result);
      setTwitch(urlFor(savedLinks, "twitch"));
      setYoutube(urlFor(savedLinks, "youtube"));
      onSaved?.(savedLinks);
      setSaved(true);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't save stream links.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={save} className="stream-editor">
      <div className="stream-editor-fields">
        <label htmlFor="stream-twitch">
          Twitch
          <input
            id="stream-twitch"
            value={twitch}
            onChange={(e) => setTwitch(e.target.value)}
            placeholder="https://twitch.tv/you"
            autoComplete="off"
            spellCheck={false}
            className="panel w-full px-3.5 py-2.5 text-ink outline-none"
          />
        </label>
        <label htmlFor="stream-youtube">
          YouTube
          <input
            id="stream-youtube"
            value={youtube}
            onChange={(e) => setYoutube(e.target.value)}
            placeholder="https://youtube.com/@you"
            autoComplete="off"
            spellCheck={false}
            className="panel w-full px-3.5 py-2.5 text-ink outline-none"
          />
        </label>
      </div>
      {error && <p className="text-sm text-red-400/90">{error}</p>}
      {saved && <p className="text-sm text-gold">Stream links saved.</p>}
      <button
        type="submit"
        disabled={saving}
        className="self-start border border-gold/30 px-4 py-2.5 text-sm text-gold transition hover:bg-gold/10 disabled:opacity-50"
      >
        {saving ? "Saving…" : "Save stream links"}
      </button>
    </form>
  );
}

function urlFor(
  links: StreamLink[] | null | undefined,
  platform: StreamPlatform,
): string {
  return links?.find((link) => link.platform === platform)?.url ?? "";
}

function incompleteLinkMessage(
  platform: StreamPlatform,
  url: string,
): string | null {
  const value = url.toLowerCase();
  if (platform === "twitch" && !/twitch\.tv\/[a-z0-9_]{1,25}/i.test(value)) {
    return "Use a channel URL like twitch.tv/yourname.";
  }
  if (
    platform === "youtube" &&
    !/youtube\.com\//i.test(value) &&
    !/youtu\.be\//i.test(value)
  ) {
    return "Use a YouTube URL like youtube.com/@you.";
  }
  return null;
}

function StreamPlatformIcon({ platform }: { platform: StreamPlatform }) {
  if (platform === "youtube") {
    return (
      <svg viewBox="0 0 24 24" aria-hidden className="stream-link-icon">
        <path
          fill="currentColor"
          d="M23.5 6.2a3 3 0 0 0-2.1-2.2C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.5A3 3 0 0 0 .5 6.2 32 32 0 0 0 0 12a32 32 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.2c1.9.5 9.4.5 9.4.5s7.5 0 9.4-.5a3 3 0 0 0 2.1-2.2A32 32 0 0 0 24 12a32 32 0 0 0-.5-5.8zM9.8 15.5v-7l6.2 3.5-6.2 3.5z"
        />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 24 24" aria-hidden className="stream-link-icon">
      <path
        fill="currentColor"
        d="M11.6 1 4.7 7.9v8.2H1.3V16h5.1l4.8 4.8h2.1v-4.8h5.6L22.7 12V1zm9.4 10.2-3.4 3.4h-6v4.8H9.8l-4.8-4.8H6.4V3h14.6z"
      />
      <path fill="currentColor" d="M16.4 6.4h1.7v5.1h-1.7zm-4.6 0h1.7v5.1h-1.7z" />
    </svg>
  );
}
