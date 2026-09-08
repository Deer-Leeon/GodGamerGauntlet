import "./styles.css";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  register,
  unregisterAll,
} from "@tauri-apps/plugin-global-shortcut";

const PRODUCTION_API = "https://godgamergauntlet-production.up.railway.app";
const LOCAL_API = "http://127.0.0.1:5000";
const STALE_API_HOSTS = ["godgamergauntlet-api.up.railway.app"];
const RESET_ARM_MS = 1500;

const KEYS = {
  api: "ggg_timer_api",
  token: "ggg_timer_token",
  username: "ggg_timer_username",
  hotkeys: "ggg_timer_hotkeys",
  binds: "ggg_timer_binds",
};

const BIND_ACTIONS = ["toggle", "split", "undo", "reset"];
const DEFAULT_BINDS = {
  toggle: "Space",
  split: "Enter",
  undo: "P",
  reset: "R",
};
const BIND_LABELS = {
  toggle: "Start / Pause",
  split: "Split",
  undo: "Undo",
  reset: "Reset (twice)",
};

function loadBinds() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEYS.binds) || "null");
    if (!raw || typeof raw !== "object") return { ...DEFAULT_BINDS };
    const next = { ...DEFAULT_BINDS };
    for (const action of BIND_ACTIONS) {
      if (typeof raw[action] === "string" && raw[action].trim()) {
        next[action] = raw[action].trim();
      }
    }
    return next;
  } catch {
    return { ...DEFAULT_BINDS };
  }
}

function saveBinds() {
  localStorage.setItem(KEYS.binds, JSON.stringify(session.binds));
}

function keyFromCode(code) {
  if (code === "Space") return "Space";
  if (code === "Enter" || code === "NumpadEnter") return "Enter";
  if (code === "Escape") return "Esc";
  if (code === "Backspace") return "Backspace";
  if (code === "Tab") return "Tab";
  if (code === "Delete") return "Delete";
  if (code === "Home") return "Home";
  if (code === "End") return "End";
  if (code === "PageUp") return "PageUp";
  if (code === "PageDown") return "PageDown";
  if (code === "Insert") return "Insert";
  if (code.startsWith("Arrow")) return code.slice(5);
  if (/^F([1-9]|1[0-9]|2[0-4])$/.test(code)) return code;
  if (/^Key[A-Z]$/.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/.test(code)) return code;
  const extras = {
    Minus: "Minus",
    Equal: "Equal",
    BracketLeft: "LeftBracket",
    BracketRight: "RightBracket",
    Backslash: "Backslash",
    Semicolon: "Semicolon",
    Quote: "Quote",
    Comma: "Comma",
    Period: "Period",
    Slash: "Slash",
    Backquote: "Backquote",
    NumpadAdd: "Plus",
    NumpadSubtract: "Minus",
    NumpadMultiply: "NumpadMultiply",
    NumpadDivide: "NumpadDivide",
    NumpadDecimal: "NumpadDecimal",
  };
  return extras[code] || null;
}

function shortcutFromEvent(event) {
  const key = keyFromCode(event.code);
  if (!key) return null;
  if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) return null;
  const mods = [];
  if (event.ctrlKey) mods.push("Control");
  if (event.altKey) mods.push("Alt");
  if (event.shiftKey) mods.push("Shift");
  if (event.metaKey) mods.push("Command");
  return [...mods, key].join("+");
}

function isTypingTarget(target) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return target.isContentEditable;
}

function formatBind(shortcut) {
  return shortcut || "—";
}

function bindForAction(action) {
  return session.binds[action] || DEFAULT_BINDS[action];
}

function actionForShortcut(shortcut) {
  return BIND_ACTIONS.find((action) => bindForAction(action) === shortcut) || null;
}

const appEl = document.getElementById("app");

function storedApi() {
  const stored = localStorage.getItem(KEYS.api) || "";
  if (!stored || STALE_API_HOSTS.some((host) => stored.includes(host))) {
    localStorage.setItem(KEYS.api, PRODUCTION_API);
    return PRODUCTION_API;
  }
  return stored;
}

const session = {
  api: storedApi(),
  token: localStorage.getItem(KEYS.token) || "",
  username: localStorage.getItem(KEYS.username) || "",
  overlayKey: "",
  runId: "",
  overlay: null,
  syncedAt: 0,
  inflight: 0,
  error: "",
  hotkeys: localStorage.getItem(KEYS.hotkeys) !== "0",
  binds: loadBinds(),
  capturing: null,
  bindError: "",
  alwaysOnTop: true,
  resetArmed: false,
  tick: 0,
};

let resetTimer = null;
let tickTimer = null;
let lastFrameNow = 0;
let windowFocused = true;

function overlayFingerprint(state) {
  if (!state) return "";
  return JSON.stringify({
    runStatus: state.runStatus,
    timerStatus: state.timerStatus,
    currentSlotIndex: state.currentSlotIndex,
    attemptCode: state.attemptCode,
    games: state.games,
  });
}

function displayedElapsed(state, syncedAt, now = lastFrameNow || performance.now()) {
  if (state?.timerStatus === "running" && syncedAt > 0) {
    return Math.max(0, state.elapsedMs + (now - syncedAt));
  }
  return state?.elapsedMs ?? 0;
}

function elapsedWhenAdoptingRemote(local, remote, syncedAt, now) {
  if (!local) return remote.elapsedMs;
  if (
    local.timerStatus === "running" &&
    (remote.timerStatus === "paused" || remote.timerStatus === "finished")
  ) {
    return displayedElapsed(local, syncedAt, now);
  }
  if (
    (local.timerStatus === "paused" || local.timerStatus === "finished") &&
    (remote.timerStatus === "paused" || remote.timerStatus === "finished")
  ) {
    return local.elapsedMs;
  }
  if (local.timerStatus === "paused" && remote.timerStatus === "running") {
    return local.elapsedMs;
  }
  return remote.elapsedMs;
}

function predictOverlayState(state, action, syncedAt, now = lastFrameNow || performance.now()) {
  const elapsedMs = displayedElapsed(state, syncedAt, now);
  const games = state.games.map((game) => ({ ...game }));
  switch (action) {
    case "toggle":
      if (state.timerStatus === "finished") return null;
      if (state.timerStatus === "running") {
        return { ...state, timerStatus: "paused", elapsedMs };
      }
      return { ...state, timerStatus: "running", elapsedMs };
    case "split": {
      if (state.runStatus !== "Active") return null;
      const idx = games.findIndex((game) => !game.completed);
      if (idx < 0) return null;
      games[idx] = {
        ...games[idx],
        completed: true,
        splitTimeMs: elapsedMs,
        status: "Won",
      };
      const last = idx === games.length - 1;
      return {
        ...state,
        games,
        currentSlotIndex: last ? idx : idx + 1,
        elapsedMs: last ? elapsedMs : state.elapsedMs,
        timerStatus: last ? "finished" : state.timerStatus,
        runStatus: last ? "Completed" : state.runStatus,
      };
    }
    case "undo": {
      let lastIdx = -1;
      for (let i = games.length - 1; i >= 0; i--) {
        const slot = games[i];
        if (slot.completed || (slot.status && slot.status !== "Pending")) {
          lastIdx = i;
          break;
        }
      }
      if (lastIdx < 0) return null;
      games[lastIdx] = {
        ...games[lastIdx],
        completed: false,
        splitTimeMs: null,
        status: "Pending",
      };
      const reopen = state.timerStatus === "finished";
      return {
        ...state,
        games,
        currentSlotIndex: lastIdx,
        runStatus: "Active",
        timerStatus: reopen ? "paused" : state.timerStatus,
        elapsedMs: reopen ? elapsedMs : state.elapsedMs,
      };
    }
    case "reset":
      return {
        ...state,
        runStatus: "Active",
        timerStatus: "idle",
        elapsedMs: 0,
        currentSlotIndex: 0,
        games: games.map((game) => ({
          ...game,
          completed: false,
          splitTimeMs: null,
          status: "Pending",
        })),
      };
    default:
      return null;
  }
}

function formatSpeedrunTime(ms) {
  const clamped = Math.max(0, ms);
  const millis = Math.floor(clamped) % 1000;
  const seconds = Math.floor(clamped / 1000) % 60;
  const minutes = Math.floor(clamped / 60_000) % 60;
  const hours = Math.floor(clamped / 3_600_000);
  const pad = (n, width = 2) => String(n).padStart(width, "0");
  return `${hours}:${pad(minutes)}:${pad(seconds)}.${pad(millis, 3)}`;
}

function formatError(raw) {
  const text =
    typeof raw === "string"
      ? raw
      : raw?.message || (raw ? JSON.stringify(raw) : "Request failed");
  try {
    const parsed = JSON.parse(text);
    return parsed.detail || parsed.title || parsed.message || text;
  } catch {
    return text;
  }
}

function overlayQuery(elapsedMs) {
  const query = new URLSearchParams();
  if (session.overlayKey) query.set("key", session.overlayKey);
  if (elapsedMs != null && Number.isFinite(elapsedMs)) {
    query.set("elapsedMs", String(Math.max(0, Math.floor(elapsedMs))));
  }
  const encoded = query.toString();
  return encoded ? `?${encoded}` : "";
}

async function ledger(method, path, body) {
  const text = await invoke("ledger_request", {
    base: session.api,
    method,
    path,
    body: body ? JSON.stringify(body) : null,
    token: session.token || null,
  });
  return text ? JSON.parse(text) : null;
}

function keepRunningClock(local, remote) {
  return local?.timerStatus === "running" && remote?.timerStatus === "running";
}

function applyState(next, keepClock = false, silent = false) {
  if (keepClock && session.overlay) {
    next = {
      ...next,
      elapsedMs: session.overlay.elapsedMs,
      timerStatus: session.overlay.timerStatus,
      ...(silent
        ? {
            games: session.overlay.games,
            currentSlotIndex: session.overlay.currentSlotIndex,
            runStatus: session.overlay.runStatus,
          }
        : {}),
    };
  } else if (!keepClock) {
    next = {
      ...next,
      elapsedMs: elapsedWhenAdoptingRemote(
        session.overlay,
        next,
        session.syncedAt,
        lastFrameNow || performance.now(),
      ),
    };
    session.syncedAt = lastFrameNow || performance.now();
  }
  const skipRender =
    silent ||
    (session.overlay &&
      overlayFingerprint(next) === overlayFingerprint(session.overlay) &&
      next.elapsedMs === session.overlay.elapsedMs &&
      next.timerStatus === session.overlay.timerStatus);
  session.overlay = next;
  if (next?.overlayKey) session.overlayKey = next.overlayKey;
  session.error = "";
  if (skipRender) return;
  render({ preserveClock: keepClock || next.timerStatus === "running" });
}

function parseOverlayPaste(text) {
  const trimmed = text.trim();
  try {
    const url = new URL(trimmed);
    const match = url.pathname.match(/\/overlay\/([0-9a-f-]{36})/i);
    if (match) {
      return { runId: match[1], key: url.searchParams.get("key") || "" };
    }
  } catch {
    /* not a URL */
  }
  const parts = trimmed.split(/\s+/);
  if (parts.length >= 2 && /^[0-9a-f-]{36}$/i.test(parts[0])) {
    return { runId: parts[0], key: parts[1] };
  }
  return null;
}

async function loadOverlay(runId, key) {
  session.runId = runId;
  session.overlayKey = key || "";
  const next = await ledger(
    "GET",
    `/api/runs/${runId}/overlay${overlayQuery()}`,
  );
  applyState(next);
  startTick();
  await syncHotkeys();
}

async function act(action) {
  const snapshot = session.overlay;
  const stampAt = lastFrameNow || performance.now();
  const stamp = snapshot
    ? displayedElapsed(snapshot, session.syncedAt, stampAt)
    : undefined;
  const predicted = snapshot
    ? predictOverlayState(snapshot, action, session.syncedAt, stampAt)
    : null;
  session.inflight += 1;
  if (predicted) applyState(predicted, keepRunningClock(snapshot, predicted));
  try {
    const next = await ledger(
      "POST",
      `/api/runs/${session.runId}/overlay/${action}${overlayQuery(stamp)}`,
    );
    applyState(next, keepRunningClock(snapshot, next), Boolean(predicted));
  } catch (err) {
    if (snapshot) applyState(snapshot);
    session.error = formatError(err);
    render();
  } finally {
    session.inflight = Math.max(0, session.inflight - 1);
  }
}

function requestReset() {
  if (resetTimer) {
    clearTimeout(resetTimer);
    resetTimer = null;
  }
  if (session.resetArmed) {
    session.resetArmed = false;
    void act("reset");
    render();
    return;
  }
  session.resetArmed = true;
  render();
  resetTimer = setTimeout(() => {
    session.resetArmed = false;
    resetTimer = null;
    render();
  }, RESET_ARM_MS);
}

function paintClock() {
  const clock = document.querySelector("[data-clock]");
  if (!clock || !session.overlay) return;
  const [main, frac] = formatSpeedrunTime(
    displayedElapsed(session.overlay, session.syncedAt, lastFrameNow),
  ).split(".");
  clock.innerHTML = `<span>${main}</span><span class="centis">.${frac}</span>`;
}

function startTick() {
  if (tickTimer) return;
  const loop = (now) => {
    lastFrameNow = now;
    if (session.overlay?.timerStatus === "running") {
      paintClock();
    }
    tickTimer = requestAnimationFrame(loop);
  };
  tickTimer = requestAnimationFrame(loop);
}

setInterval(() => {
  if (!session.runId || session.inflight > 0) return;
  void ledger("GET", `/api/runs/${session.runId}/overlay${overlayQuery()}`)
    .then((next) => {
      if (session.inflight > 0 || !session.runId) return;
      if (overlayFingerprint(next) === overlayFingerprint(session.overlay)) return;
      applyState(next, keepRunningClock(session.overlay, next));
    })
    .catch(() => {});
}, 2000);

function dispatchAction(action) {
  if (action === "reset") requestReset();
  else void act(action);
}

async function startCapture(action) {
  session.capturing = action;
  session.bindError = "";
  await unregisterAll().catch(() => {});
  render();
}

function cancelCapture() {
  session.capturing = null;
  session.bindError = "";
  void syncHotkeys();
  render();
}

function applyCapturedShortcut(shortcut) {
  const action = session.capturing;
  if (!action) return;
  const taken = BIND_ACTIONS.find(
    (other) => other !== action && bindForAction(other) === shortcut,
  );
  if (taken) {
    session.bindError = `${shortcut} is already ${BIND_LABELS[taken]}.`;
    session.capturing = null;
    void syncHotkeys();
    render();
    return;
  }
  session.binds = { ...session.binds, [action]: shortcut };
  session.capturing = null;
  session.bindError = "";
  saveBinds();
  void syncHotkeys();
  render();
}

function restoreDefaultBinds() {
  session.binds = { ...DEFAULT_BINDS };
  session.capturing = null;
  session.bindError = "";
  saveBinds();
  void syncHotkeys();
  render();
}

async function setHotkeysEnabled(on) {
  session.hotkeys = on;
  localStorage.setItem(KEYS.hotkeys, on ? "1" : "0");
  if (!on) session.capturing = null;
  await syncHotkeys();
  render();
}

async function syncHotkeys() {
  await unregisterAll().catch(() => {});
  if (!session.hotkeys || !session.runId || session.capturing) return;
  for (const action of BIND_ACTIONS) {
    const shortcut = bindForAction(action);
    try {
      await register(shortcut, (event) => {
        if (event.state !== "Pressed") return;
        if (session.capturing) return;
        if (windowFocused) return;
        dispatchAction(action);
      });
    } catch (err) {
      session.bindError =
        `${shortcut} could not be bound globally (${formatError(err)}). ` +
        "It still works while this window is focused.";
    }
  }
}

async function setAlwaysOnTop(on) {
  session.alwaysOnTop = on;
  await getCurrentWindow().setAlwaysOnTop(on);
}

async function login(username, password) {
  const auth = await ledger("POST", "/api/auth/login", {
    username,
    password,
  });
  session.token = auth.token;
  session.username = auth.user?.username || username;
  localStorage.setItem(KEYS.token, session.token);
  localStorage.setItem(KEYS.username, session.username);
  const profile = await ledger(
    "GET",
    `/api/users/by-username/${encodeURIComponent(session.username)}`,
  );
  if (profile?.live?.runId) {
    await loadOverlay(profile.live.runId, "");
    return;
  }
  session.error = "No live gauntlet. Initialize one on the site, or paste an overlay URL.";
  session.overlay = null;
  render();
}

async function connectKey(paste, runId, key) {
  const parsed = parseOverlayPaste(paste) || {
    runId: runId.trim(),
    key: key.trim(),
  };
  if (!parsed.runId) {
    throw new Error("Need a run id and overlay key (or the overlay URL).");
  }
  session.token = "";
  localStorage.removeItem(KEYS.token);
  await loadOverlay(parsed.runId, parsed.key);
}

function disconnect() {
  session.overlay = null;
  session.runId = "";
  session.overlayKey = "";
  session.token = "";
  session.error = "";
  session.capturing = null;
  localStorage.removeItem(KEYS.token);
  void unregisterAll();
  render();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderConnect() {
  appEl.innerHTML = `
    <div class="app">
      <div class="brand">
        <h1>GGG Timer</h1>
        <span class="muted">Local clock · site ledger</span>
      </div>
      <p class="hint">
        Global hotkeys work while the game is fullscreen. OBS: Window Capture
        this window — not a Browser Source.
      </p>
      <label>
        API
        <select id="api">
          <option value="${PRODUCTION_API}">Production</option>
          <option value="${LOCAL_API}">Local (127.0.0.1:5000)</option>
        </select>
      </label>
      <form id="login-form">
        <label>
          Username or email
          <input id="username" autocomplete="username" value="${escapeHtml(session.username)}" />
        </label>
        <label>
          Password
          <input id="password" type="password" autocomplete="current-password" />
        </label>
        <div class="row" style="margin-top:8px">
          <button class="btn btn-gold" type="submit">Sign in</button>
        </div>
      </form>
      <p class="muted">Or paste the OBS overlay URL (includes ?key=).</p>
      <form id="key-form">
        <label>
          Overlay URL or run id
          <input id="paste" placeholder="https://godgamergauntlet.com/overlay/…?key=" />
        </label>
        <label>
          Overlay key (if you pasted only the run id)
          <input id="key" />
        </label>
        <div class="row" style="margin-top:8px">
          <button class="btn" type="submit">Connect with key</button>
        </div>
      </form>
      ${session.error ? `<p class="error">${escapeHtml(session.error)}</p>` : ""}
    </div>
  `;
  const api = document.getElementById("api");
  api.value = session.api === LOCAL_API ? LOCAL_API : PRODUCTION_API;
  api.addEventListener("change", () => {
    session.api = api.value;
    localStorage.setItem(KEYS.api, session.api);
  });
  document.getElementById("login-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    session.api = api.value;
    localStorage.setItem(KEYS.api, session.api);
    session.error = "";
    try {
      await login(
        document.getElementById("username").value.trim(),
        document.getElementById("password").value,
      );
    } catch (err) {
      session.error = formatError(err);
      render();
    }
  });
  document.getElementById("key-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    session.api = api.value;
    localStorage.setItem(KEYS.api, session.api);
    session.error = "";
    try {
      await connectKey(
        document.getElementById("paste").value,
        document.getElementById("paste").value,
        document.getElementById("key").value,
      );
    } catch (err) {
      session.error = formatError(err);
      render();
    }
  });
}

function renderRun(preserveClock = false) {
  const state = session.overlay;
  const games = state.games ?? [];
  const current = games[state.currentSlotIndex];
  const heldClock =
    preserveClock && state.timerStatus === "running"
      ? document.querySelector("[data-clock]")
      : null;
  if (heldClock) heldClock.remove();
  const [main, frac] = formatSpeedrunTime(
    displayedElapsed(state, session.syncedAt, lastFrameNow),
  ).split(".");
  const slotLabel = `${Math.min((state.currentSlotIndex ?? 0) + 1, games.length)}/${games.length}`;
  appEl.innerHTML = `
    <div class="app">
      <div class="brand">
        <h1>GGG Timer</h1>
        <span class="muted">${escapeHtml(state.runType)} · ${escapeHtml(state.streamerName)}</span>
      </div>
      <div class="meta">
        <span>${escapeHtml(state.attemptCode || "—")}</span>
        <span>${escapeHtml(state.runStatus)} · ${slotLabel}</span>
      </div>
      <div data-clock class="clock ${state.timerStatus === "paused" ? "paused" : ""}">
        <span>${main}</span><span class="centis">.${frac}</span>
      </div>
      <p class="slot now">
        <span class="n">NOW</span>
        <span class="title">${escapeHtml(current?.title || "—")}</span>
      </p>
      <div>
        ${games
          .map((game, index) => {
            const cls = game.completed ? "done" : index === state.currentSlotIndex ? "now" : "";
            const split =
              game.splitTimeMs != null ? formatSpeedrunTime(game.splitTimeMs) : "—";
            return `<div class="slot ${cls}"><span class="n">${index + 1}</span><span class="title">${escapeHtml(game.title)}</span><span class="split">${split}</span></div>`;
          })
          .join("")}
      </div>
      <div class="keys">
        <button class="btn btn-gold" data-act="toggle">${state.timerStatus === "running" ? "Pause" : "Start"} <span class="hint">${escapeHtml(formatBind(bindForAction("toggle")))}</span></button>
        <button class="btn" data-act="split">Split <span class="hint">${escapeHtml(formatBind(bindForAction("split")))}</span></button>
        <button class="btn" data-act="undo">Undo <span class="hint">${escapeHtml(formatBind(bindForAction("undo")))}</span></button>
        <button class="btn ${session.resetArmed ? "armed" : ""}" data-reset>Reset <span class="hint">${escapeHtml(formatBind(bindForAction("reset")))}×2</span></button>
      </div>
      <button class="btn ${session.hotkeys ? "" : "armed"}" data-hotkeys type="button">
        ${session.hotkeys ? "Pause hotkeys — keys go to the game" : "Resume hotkeys"}
      </button>
      ${
        session.hotkeys
          ? ""
          : `<p class="hint">Global hotkeys are paused. The game keeps Space/Enter. This window still accepts the binds below.</p>`
      }
      <div class="binds">
        <div class="binds-head">
          <span>Reassign shortcuts</span>
          <button type="button" class="btn btn-tiny" data-defaults>Defaults</button>
        </div>
        ${BIND_ACTIONS.map((action) => {
          const listening = session.capturing === action;
          const label = listening
            ? "Press a key… (Esc to cancel)"
            : formatBind(bindForAction(action));
          return `<div class="bind">
            <span>${BIND_LABELS[action]}</span>
            <button type="button" class="btn ${listening ? "listening" : ""}" data-capture="${action}">${escapeHtml(label)}</button>
          </div>`;
        }).join("")}
      </div>
      ${session.bindError ? `<p class="error">${escapeHtml(session.bindError)}</p>` : ""}
      <label class="check">
        <input id="aot" type="checkbox" ${session.alwaysOnTop ? "checked" : ""} />
        Always on top (Window Capture this window)
      </label>
      ${session.error ? `<p class="error">${escapeHtml(session.error)}</p>` : ""}
      <button class="btn" data-disconnect>Disconnect</button>
    </div>
  `;
  if (heldClock) {
    const slot = appEl.querySelector("[data-clock]");
    if (slot) slot.replaceWith(heldClock);
  }
  appEl.querySelectorAll("[data-act]").forEach((button) => {
    button.addEventListener("click", () => void act(button.dataset.act));
  });
  appEl.querySelector("[data-reset]").addEventListener("click", () => requestReset());
  appEl.querySelector("[data-hotkeys]").addEventListener("click", () => {
    void setHotkeysEnabled(!session.hotkeys);
  });
  appEl.querySelector("[data-defaults]").addEventListener("click", () => {
    restoreDefaultBinds();
  });
  appEl.querySelectorAll("[data-capture]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.dataset.capture;
      if (session.capturing === action) {
        cancelCapture();
        return;
      }
      void startCapture(action);
    });
  });
  document.getElementById("aot").addEventListener("change", (event) => {
    void setAlwaysOnTop(event.target.checked);
  });
  appEl.querySelector("[data-disconnect]").addEventListener("click", () => disconnect());
  if (session.capturing) {
    document.activeElement?.blur();
  }
}

function render(options = {}) {
  if (session.overlay) renderRun(Boolean(options.preserveClock));
  else renderConnect();
}

render();
void setAlwaysOnTop(true);
void getCurrentWindow()
  .onFocusChanged((event) => {
    windowFocused = Boolean(event.payload);
  })
  .catch(() => {});

document.addEventListener(
  "keydown",
  (event) => {
    if (session.capturing) {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        cancelCapture();
        return;
      }
      if (event.repeat) return;
      const shortcut = shortcutFromEvent(event);
      if (!shortcut) return;
      event.preventDefault();
      event.stopPropagation();
      applyCapturedShortcut(shortcut);
      return;
    }
    if (isTypingTarget(event.target)) return;
    if (event.repeat) return;
    if (!session.runId || !session.overlay) return;
    const shortcut = shortcutFromEvent(event);
    if (!shortcut) return;
    const action = actionForShortcut(shortcut);
    if (!action) return;
    event.preventDefault();
    event.stopPropagation();
    dispatchAction(action);
  },
  true,
);
