import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CACHE_RESET_QUERY_KEY,
  CACHE_RESET_QUERY_VALUE,
  patchControlUiCacheReset,
} from "./patch-control-ui-cache-reset.mjs";

const fixture = new URL(
  "./release-files/control-ui-revalidate/control-ui-DhD7PO_6.js",
  import.meta.url,
);

test("an explicit one-time URL can clear stale immutable Control UI assets", async () => {
  const source = await readFile(fixture, "utf8");
  const patched = patchControlUiCacheReset(source);
  assert.notEqual(patched, source);
  assert.match(patched, /Clear-Site-Data/u);
  assert.match(patched, /\\"cache\\"/u);
  assert.match(patched, new RegExp(CACHE_RESET_QUERY_KEY, "u"));
  assert.match(patched, new RegExp(CACHE_RESET_QUERY_VALUE, "u"));
  assert.equal(patchControlUiCacheReset(patched), patched);
});

test("cache reset patch fails closed on drift", () => {
  assert.throws(() => patchControlUiCacheReset("unrelated"), /anchor drifted/u);
});
