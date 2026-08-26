"use client";

import { useState } from "react";
import {
  changeStreamLinks,
  type StreamLink,
  type StreamLinkInput,
  type StreamPlatform,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";

const PLATFORMS: { id: StreamPlatform; label: string }[] = [
  { id: "twitch", label: "Twitch" },
  { id: "youtube", label: "YouTube" },
];

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
  const [rows, setRows] = useState<StreamLinkInput[]>(() => toRows(initial));
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  function updateRow(index: number, patch: Partial<StreamLinkInput>) {
    setRows((current) =>
      current.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    );
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setSaved(false);
    setSaving(true);
    const links = rows
      .map((row) => ({
        platform: row.platform,
        url: row.url.trim(),
      }))
      .filter((row) => row.url.length > 0);
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
      setRows(toRows(savedLinks));
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
    <form onSubmit={save} className="flex flex-col gap-4">
      {rows.map((row, index) => (
        <div key={index} className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor={`stream-platform-${index}`}>
            Platform
          </label>
          <select
            id={`stream-platform-${index}`}
            value={row.platform}
            onChange={(e) =>
              updateRow(index, { platform: e.target.value as StreamPlatform })
            }
            className="panel px-3.5 py-2.5 text-ink outline-none sm:w-36"
          >
            {PLATFORMS.map((platform) => (
              <option key={platform.id} value={platform.id}>
                {platform.label}
              </option>
            ))}
          </select>
          <label className="sr-only" htmlFor={`stream-url-${index}`}>
            Stream URL
          </label>
          <input
            id={`stream-url-${index}`}
            value={row.url}
            onChange={(e) => updateRow(index, { url: e.target.value })}
            placeholder={
              row.platform === "youtube"
                ? "https://youtube.com/@you/live"
                : "https://twitch.tv/you"
            }
            className="panel min-w-0 flex-1 px-3.5 py-2.5 text-ink outline-none"
          />
          <button
            type="button"
            onClick={() =>
              setRows((current) => current.filter((_, i) => i !== index))
            }
            className="self-start text-sm text-faint hover:text-ink sm:px-2"
          >
            Remove
          </button>
        </div>
      ))}
      {rows.length < 6 && (
        <button
          type="button"
          onClick={() =>
            setRows((current) => [...current, { platform: "youtube", url: "" }])
          }
          className="self-start text-sm text-gold hover:text-ink"
        >
          Add another link
        </button>
      )}
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

function toRows(links: StreamLink[] | null | undefined): StreamLinkInput[] {
  if (!links?.length) return [{ platform: "twitch", url: "" }];
  return links.map((link) => ({
    platform: link.platform === "youtube" ? "youtube" : "twitch",
    url: link.url,
  }));
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
    return "Use a YouTube URL like youtube.com/@you/live.";
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
