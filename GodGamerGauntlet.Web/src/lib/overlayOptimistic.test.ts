import assert from "node:assert/strict";
import { test } from "node:test";
import { elapsedWhenAdoptingRemote, keepRunningClock } from "./overlayOptimistic.ts";

test("keepRunningClock keeps the origin only while both sides are running", () => {
  assert.equal(
    keepRunningClock({ timerStatus: "running" }, { timerStatus: "running" }),
    true,
  );
});

test("keepRunningClock adopts a remote pause", () => {
  assert.equal(
    keepRunningClock({ timerStatus: "running" }, { timerStatus: "paused" }),
    false,
  );
});

test("keepRunningClock adopts a remote resume", () => {
  assert.equal(
    keepRunningClock({ timerStatus: "paused" }, { timerStatus: "running" }),
    false,
  );
});

test("keepRunningClock adopts a start from idle", () => {
  assert.equal(
    keepRunningClock({ timerStatus: "idle" }, { timerStatus: "running" }),
    false,
  );
});

test("elapsedWhenAdoptingRemote takes the ledger pause, not the follower's extra tick", () => {
  assert.equal(
    elapsedWhenAdoptingRemote(
      { timerStatus: "running", elapsedMs: 1000 },
      { timerStatus: "paused", elapsedMs: 1234 },
    ),
    1234,
  );
});

test("elapsedWhenAdoptingRemote corrects a freeze that ran ahead of the ledger", () => {
  assert.equal(
    elapsedWhenAdoptingRemote(
      { timerStatus: "paused", elapsedMs: 11458 },
      { timerStatus: "paused", elapsedMs: 8601 },
    ),
    8601,
  );
});

test("elapsedWhenAdoptingRemote resumes from the ledger freeze", () => {
  assert.equal(
    elapsedWhenAdoptingRemote(
      { timerStatus: "paused", elapsedMs: 11458 },
      { timerStatus: "running", elapsedMs: 8601 },
    ),
    8601,
  );
});

test("elapsedWhenAdoptingRemote takes the ledger when starting from idle", () => {
  assert.equal(
    elapsedWhenAdoptingRemote(
      { timerStatus: "idle", elapsedMs: 0 },
      { timerStatus: "running", elapsedMs: 500 },
    ),
    500,
  );
});

test("stop-go cannot stack follower lag onto the next resume", () => {
  let local = { timerStatus: "running", elapsedMs: 0 };
  for (let i = 0; i < 3; i += 1) {
    const freeze = 4000 * (i + 1);
    local = {
      timerStatus: "paused",
      elapsedMs: elapsedWhenAdoptingRemote(local, {
        timerStatus: "paused",
        elapsedMs: freeze,
      }),
    };
    assert.equal(local.elapsedMs, freeze);
    local = {
      timerStatus: "running",
      elapsedMs: elapsedWhenAdoptingRemote(local, {
        timerStatus: "running",
        elapsedMs: freeze,
      }),
    };
    assert.equal(local.elapsedMs, freeze);
  }
});
