import assert from "node:assert/strict";
import { test } from "node:test";
import { rebase } from "./storage.ts";

const API = "http://10.0.0.5:4000";
const SHA = "ab".repeat(32);

test("http ref keeps path and query but takes the API_URL origin", () => {
  assert.equal(rebase("http://192.168.1.9:4000/media/xyz?a=1", API), `${API}/media/xyz?a=1`);
  assert.equal(rebase("https://tunnel.example.com/api/listings/7/metadata.json", API), `${API}/api/listings/7/metadata.json`);
});

test("sha ref maps to API_URL/media/<sha>", () => {
  assert.equal(rebase(SHA.toUpperCase(), API), `${API}/media/${SHA}`);
});

test("API_URL with a trailing slash is fine", () => {
  assert.equal(rebase("http://x/y", API + "/"), `${API}/y`);
});
