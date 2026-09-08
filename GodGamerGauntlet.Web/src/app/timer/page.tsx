import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "GGG Timer",
  description:
    "Download the desktop gauntlet timer. Local clock, global hotkeys, website as the ledger.",
};

const REPO = "Deer-Leeon/GodGamerGauntlet";
const LATEST_API = `https://api.github.com/repos/${REPO}/releases/latest`;
const LIST_API = `https://api.github.com/repos/${REPO}/releases?per_page=10`;

// Direct asset URLs — GitHub starts the download immediately. The API is only
// used to stay current; if it fails (common from Vercel without a token), these
// still ship the files instead of dumping people on the releases page.
const FALLBACK_TAG = "timer-v0.1.1";
const FALLBACK_MAC = assetDownloadUrl(
  FALLBACK_TAG,
  "GGG.Timer_0.1.1_aarch64.dmg",
);
const FALLBACK_WINDOWS = assetDownloadUrl(
  FALLBACK_TAG,
  "GGG.Timer_0.1.1_x64-setup.exe",
);

function assetDownloadUrl(tag: string, filename: string): string {
  return `https://github.com/${REPO}/releases/download/${encodeURIComponent(tag)}/${encodeURIComponent(filename)}`;
}

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  html_url: string;
  tag_name: string;
  assets: GitHubAsset[];
}

const GITHUB_HEADERS = {
  Accept: "application/vnd.github+json",
  "User-Agent": "godgamergauntlet.com",
  "X-GitHub-Api-Version": "2022-11-28",
};

function pickAssets(release: GitHubRelease): {
  mac: string | null;
  windows: string | null;
} {
  const assets = release.assets ?? [];
  const mac =
    assets.find(
      (asset) =>
        asset.name.endsWith(".dmg") &&
        /aarch64|darwin-arm|apple-silicon/i.test(asset.name),
    )?.browser_download_url ??
    assets.find((asset) => asset.name.endsWith(".dmg"))?.browser_download_url ??
    null;
  const windows =
    assets.find((asset) => /setup\.exe$/i.test(asset.name))
      ?.browser_download_url ??
    assets.find((asset) => /\.exe$/i.test(asset.name))?.browser_download_url ??
    null;
  return { mac, windows };
}

async function fetchJson(url: string): Promise<unknown | null> {
  try {
    const response = await fetch(url, {
      next: { revalidate: 60 },
      headers: GITHUB_HEADERS,
    });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

async function latestDownloads(): Promise<{
  mac: string;
  windows: string;
  tag: string;
}> {
  const latest = (await fetchJson(LATEST_API)) as GitHubRelease | null;
  let release =
    latest?.tag_name?.startsWith("timer-v") ? latest : null;

  if (!release) {
    const list = (await fetchJson(LIST_API)) as GitHubRelease[] | null;
    release =
      list?.find((item) => item.tag_name?.startsWith("timer-v")) ?? null;
  }

  const picked = release ? pickAssets(release) : { mac: null, windows: null };
  return {
    mac: picked.mac ?? FALLBACK_MAC,
    windows: picked.windows ?? FALLBACK_WINDOWS,
    tag: release?.tag_name ?? FALLBACK_TAG,
  };
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
