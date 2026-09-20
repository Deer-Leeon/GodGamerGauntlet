import assert from "node:assert/strict";
import { test } from "node:test";
import { safeNextPath } from "./safeNextPath.ts";

test("safeNextPath keeps in-site paths", () => {
  assert.equal(safeNextPath("/draft"), "/draft");
  assert.equal(safeNextPath("/records/abc?x=1"), "/records/abc?x=1");
});

test("safeNextPath rejects open redirects and login loops", () => {
  assert.equal(safeNextPath(null), null);
  assert.equal(safeNextPath("//evil.example"), null);
  assert.equal(safeNextPath("https://evil.example"), null);
  assert.equal(safeNextPath("/login"), null);
  assert.equal(safeNextPath("/login?next=/draft"), null);
});
