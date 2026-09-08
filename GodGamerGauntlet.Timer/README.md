# GGG Timer

Desktop gauntlet clock. The website is the ledger: this window ticks locally and posts start / split / undo / reset to the existing overlay API.

## Why a download

A browser overlay cannot steal Space or Enter from a fullscreen game. LiveSplit is instant because the clock never waits on a server. GGG Timer does the same: `performance.now()` on this machine, then an async POST to `/api/runs/{id}/overlay/...`.

## Run from source

Needs [Rust](https://rustup.rs/) and Node.

```bash
cd GodGamerGauntlet.Timer
npm install
npm run tauri:dev
```

Production zip / installer (this Mac, Apple Silicon only):

```bash
npm run tauri:build
```

Installers land in `src-tauri/target/release/bundle/` (`dmg` here, `nsis` on Windows).

## Website downloads

`godgamergauntlet.com/timer` reads the latest GitHub Release. To publish both Mac (Apple Silicon) and Windows:

1. Commit the timer app to `main` and push.
2. Tag and push:

```bash
git tag timer-v0.1.5
git push origin timer-v0.1.5
```

3. GitHub Actions builds a `.dmg` on `macos-14` and an NSIS `.exe` on `windows-latest`, then attaches them to that release.
4. `/timer` picks up the assets within a couple of minutes.

v1 is unsigned. `bundle.macOS.signingIdentity` is `"-"` so the Mac bundle is
ad-hoc sealed (Gatekeeper should say unidentified developer, not damaged).
First open: right-click → Open, or Privacy & Security → Open Anyway. Fallback:
`xattr -cr "/Applications/GGG Timer.app"`. Windows SmartScreen may warn.

## Sign in

- GGG username + password (same JWT as the site), then the app loads your live gauntlet.
- Or paste the OBS overlay URL (`/overlay/{runId}?key=`).

API preset: production Railway host, or `http://127.0.0.1:5000` for local.

## OBS

Sources → **Window Capture** → `GGG Timer`. Do not wrap this UI in a Browser Source.

Defaults: Space start/pause, Enter split, R twice reset, P undo. **Pause hotkeys** unregisters them so the game keeps the keys; this window still accepts the binds. Click a shortcut to reassign, Esc to cancel. Always on top is on. macOS may prompt for Accessibility so global hotkeys work over a fullscreen game.

## Out of scope

LiveSplit Server (TCP 16834), autosplitters, Linux, auto-update, EV code signing.
