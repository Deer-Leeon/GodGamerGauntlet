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
      {links.map((link) => (
        <li key={link.url}>
          <a href={link.url} target="_blank" rel="noopener noreferrer">
            {live
              ? `Watch on ${link.platform === "youtube" ? "YouTube" : "Twitch"}`
              : link.label}
          </a>
        </li>
      ))}
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
