import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldResolve } from "./resolve.ts";

test("no resolve_dispute in the last 30 s before ORACLE_TIMEOUT or after it", () => {
  assert.equal(shouldResolve(1000, 1000 + 600 - 31, 600), true);
  assert.equal(shouldResolve(1000, 1000 + 600 - 30, 600), false);
  assert.equal(shouldResolve(1000, 1000 + 601, 600), false);
});
