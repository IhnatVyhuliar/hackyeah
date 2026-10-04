import assert from "node:assert/strict";
import { test } from "node:test";
import { crankEnabled } from "./crank.ts";

test("crank is on by default and for CRANK=on", () => {
  assert.equal(crankEnabled({}), true);
  assert.equal(crankEnabled({ CRANK: "on" }), true);
  assert.equal(crankEnabled({ CRANK: "" }), true);
});

test("CRANK=off disables the crank (case and spaces ignored)", () => {
  assert.equal(crankEnabled({ CRANK: "off" }), false);
  assert.equal(crankEnabled({ CRANK: " OFF " }), false);
});
