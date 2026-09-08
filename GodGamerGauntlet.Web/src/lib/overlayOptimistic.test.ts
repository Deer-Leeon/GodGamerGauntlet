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

test("elapsedWhenAdoptingRemote freezes the on-screen time on pause", () => {
  assert.equal(
    elapsedWhenAdoptingRemote(
      { timerStatus: "running", elapsedMs: 1000 },
      { timerStatus: "paused", elapsedMs: 1234 },
      10_000,
      11_500,
    ),
    2500,
  );
});

test("elapsedWhenAdoptingRemote keeps a local freeze instead of the ledger stamp", () => {
  assert.equal(
    elapsedWhenAdoptingRemote(
      { timerStatus: "paused", elapsedMs: 2500 },
      { timerStatus: "paused", elapsedMs: 1234 },
      11_500,
      12_000,
    ),
    2500,
  );
});

test("elapsedWhenAdoptingRemote resumes from the local freeze", () => {
  assert.equal(
    elapsedWhenAdoptingRemote(
      { timerStatus: "paused", elapsedMs: 2500 },
      { timerStatus: "running", elapsedMs: 1234 },
      11_500,
      12_000,
    ),
    2500,
  );
});

test("elapsedWhenAdoptingRemote takes the ledger when starting from idle", () => {
  assert.equal(
    elapsedWhenAdoptingRemote(
      { timerStatus: "idle", elapsedMs: 0 },
      { timerStatus: "running", elapsedMs: 500 },
      0,
      1000,
    ),
    500,
  );
});
