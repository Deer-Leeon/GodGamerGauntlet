import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "GGG Timer",
  description:
    "Download the desktop gauntlet timer. Local clock, global hotkeys, website as the ledger.",
};

const RELEASES = "https://github.com/Deer-Leeon/GodGamerGauntlet/releases";
const LATEST_API =
  "https://api.github.com/repos/Deer-Leeon/GodGamerGauntlet/releases/latest";

interface GitHubAsset {
  name: string;
  browser_download_url: string;
}

interface GitHubRelease {
  html_url: string;
  tag_name: string;
  assets: GitHubAsset[];
}

async function latestDownloads(): Promise<{
  mac: string | null;
  windows: string | null;
  releaseUrl: string;
  tag: string | null;
} | null> {
  try {
    const response = await fetch(LATEST_API, {
      next: { revalidate: 120 },
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) return null;
    const release = (await response.json()) as GitHubRelease;
    if (!release.tag_name?.startsWith("timer-v")) {
      return { mac: null, windows: null, releaseUrl: RELEASES, tag: null };
    }
    const assets = release.assets ?? [];
    const mac =
      assets.find(
        (asset) =>
          asset.name.endsWith(".dmg") &&
          /aarch64|darwin-arm|apple-silicon/i.test(asset.name),
      )?.browser_download_url ??
      assets.find((asset) => asset.name.endsWith(".dmg"))
        ?.browser_download_url ??
      null;
    const windows =
      assets.find(
        (asset) =>
          /\.exe$/i.test(asset.name) || /setup\.exe$/i.test(asset.name),
      )?.browser_download_url ?? null;
    return {
      mac,
      windows,
      releaseUrl: release.html_url || RELEASES,
      tag: release.tag_name,
    };
  } catch {
    return null;
  }
}

export default async function TimerDownloadPage() {
  const downloads = await latestDownloads();
  const macUrl = downloads?.mac ?? null;
  const windowsUrl = downloads?.windows ?? null;
  const releaseUrl = downloads?.releaseUrl ?? RELEASES;

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
          href={macUrl ?? releaseUrl}
          className="bg-gold px-4 py-2 text-sm text-dark transition hover:bg-gold/90"
        >
          Download for Mac (Apple Silicon)
        </a>
        <a
          href={windowsUrl ?? releaseUrl}
          className="border border-gold/35 px-4 py-2 text-sm text-gold transition hover:bg-gold/10"
        >
          Download for Windows
        </a>
      </div>
      <p className="mt-3 max-w-2xl text-xs leading-relaxed text-faint">
        {downloads?.tag
          ? `Latest build: ${downloads.tag}. `
          : "Builds appear here after a timer-v* GitHub Release. "}
        Unsigned v1. On a Mac, right-click the app → Open the first time.
        Windows SmartScreen may warn until we code-sign. Intel Macs are not a
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
            Keep the window always on top (default). Global hotkeys work while
            the game is fullscreen: Space start/pause, Enter split, R twice to
            reset. On macOS, grant Accessibility to GGG Timer when prompted, or
            hotkeys will not fire over another app.
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
