import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "GGG Timer",
  description:
    "Download the desktop gauntlet timer. Local clock, global hotkeys, website as the ledger.",
};

const REPO = "Deer-Leeon/GodGamerGauntlet";
const LIST_API = `https://api.github.com/repos/${REPO}/releases?per_page=10`;

// Baked into the page so a private GitHub repo (releases API 404s from Vercel
// without a token) still ships the current files.
const CURRENT_TAG = "timer-v0.1.2";

function assetDownloadUrl(tag: string, filename: string): string {
  return `https://github.com/${REPO}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(filename)}`;
}

function downloadsForTag(tag: string): {
  mac: string;
  windows: string;
  tag: string;
} {
  const version = tag.replace(/^timer-v/, "");
  return {
    tag,
    mac: assetDownloadUrl(tag, `GGG.Timer_${version}_aarch64.dmg`),
    windows: assetDownloadUrl(tag, `GGG.Timer_${version}_x64-setup.exe`),
  };
}

function newerTimerTag(a: string, b: string): string {
  const pa = a.replace(/^timer-v/, "").split(".").map(Number);
  const pb = b.replace(/^timer-v/, "").split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const da = pa[i] ?? 0;
    const db = pb[i] ?? 0;
    if (da > db) return a;
    if (da < db) return b;
  }
  return a;
}

interface GitHubRelease {
  tag_name: string;
}

async function latestDownloads(): Promise<{
  mac: string;
  windows: string;
  tag: string;
}> {
  let tag = CURRENT_TAG;
  try {
    const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    const headers: Record<string, string> = {
      Accept: "application/vnd.github+json",
      "User-Agent": "godgamergauntlet.com",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch(LIST_API, {
      next: { revalidate: 60 },
      headers,
    });
    if (response.ok) {
      const list = (await response.json()) as GitHubRelease[];
      const newest = list.find((item) => item.tag_name?.startsWith("timer-v"))
        ?.tag_name;
      if (newest) tag = newerTimerTag(CURRENT_TAG, newest);
    }
  } catch {
    // Private repo / no token: keep CURRENT_TAG.
  }
  return downloadsForTag(tag);
}

export default async function TimerDownloadPage() {
  const downloads = await latestDownloads();

  return (
    <main className="site-content flex-1 px-6 py-12">
      <p className="text-sm text-muted">Desktop app</p>
      <h1 className="mt-1 text-3xl font-semibold text-ink">GGG Timer</h1>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        The clock lives on your PC, like LiveSplit. Start, pause, and split
        update on your monitor immediately. The website stores the run — it is
        the ledger, not the tick. Twitch viewers still see stream delay; this
        app is for you and OBS preview.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <a
          href={downloads.mac}
          className="bg-gold px-4 py-2 text-sm text-dark transition hover:bg-gold/90"
        >
          Download for Mac (Apple Silicon)
        </a>
        <a
          href={downloads.windows}
          className="border border-gold/35 px-4 py-2 text-sm text-gold transition hover:bg-gold/10"
        >
          Download for Windows
        </a>
      </div>
      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-faint">
        Latest build: {downloads.tag}. Unsigned v1; Mac builds from 0.1.1 on
        are ad-hoc signed so Gatekeeper should not call the app damaged. First
        open: right-click the app → Open, or Settings → Privacy & Security →
        Open Anyway. If it still says damaged, drag it to Applications and run{" "}
        <code className="text-ink">xattr -cr &quot;/Applications/GGG Timer.app&quot;</code>
        . Windows SmartScreen may warn until we code-sign. Intel Macs are not a
        v1 target.
      </p>

      <section className="mt-12 max-w-2xl">
        <h2 className="text-lg font-semibold text-ink">OBS: Window Capture</h2>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-muted">
          <li>Sign in with your GGG account, or paste the overlay key from the control room.</li>
          <li>
            Sources → <span className="text-ink">Window Capture</span> → capture{" "}
            <span className="text-ink">GGG Timer</span>. Do not use Browser
            Source for this window — that would add CEF lag.
          </li>
          <li>
            Keep the window always on top (default). Pause hotkeys when the
            game needs Space/Enter; click a shortcut in the app to reassign.
            Defaults are Space start/pause, Enter split, R twice to reset, P
            undo. On macOS, grant Accessibility to GGG Timer when prompted, or
            global hotkeys will not fire over another app.
          </li>
        </ol>
      </section>

      <section className="mt-10 max-w-2xl">
        <h2 className="text-lg font-semibold text-ink">Browser overlay (fallback)</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          If you cannot install the app, OBS Browser Source still works. Copy the
          overlay URL from the{" "}
          <Link href="/draft" className="text-gold hover:underline">
            control room
          </Link>{" "}
          after you initialize a run. Start/split on that page is now
          optimistic (the digits move before the server answers), but a
          fullscreen game still owns the keyboard — only the desktop timer
          steals Space and Enter.
        </p>
      </section>

      <section className="mt-10 max-w-2xl text-sm text-muted">
        <h2 className="text-lg font-semibold text-ink">What this is not</h2>
        <p className="mt-3 leading-relaxed">
          Not LiveSplit autosplitters. Not a new clock server. GGG is a 3 / 5
          / 7 game gauntlet: start, split per game, undo, reset. The site
          leaderboards and feed trail by a moment on purpose.
        </p>
      </section>
    </main>
  );
}
