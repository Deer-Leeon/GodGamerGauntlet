import assert from "node:assert/strict";
import { test } from "node:test";
import { keepRunningClock } from "./overlayOptimistic.ts";

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
