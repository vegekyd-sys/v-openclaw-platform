import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  CACHE_CONTROL_AFTER,
  CACHE_CONTROL_BEFORE,
  patchControlUiRevalidate,
} from "./patch-control-ui-revalidate.mjs";

const fixture = readFileSync(
  new URL("./fixtures/control-ui-revalidate/control-ui-DhD7PO_6.js", import.meta.url),
  "utf8",
);

test("control UI assets become revalidating instead of immutable", () => {
  assert.equal(fixture.includes(CACHE_CONTROL_BEFORE), true, "fixture lost the immutable constant");
  const patched = patchControlUiRevalidate(fixture);
  // "immutable" also appears as identifiers (immutableAsset, options.immutable),
  // so assert on the directive, not the word.
  assert.equal(patched.includes(", immutable\""), false, "an immutable cache directive survived");
  assert.equal(patched.includes("max-age=31536000"), false, "the one-year max-age survived");
  assert.match(patched, /CONTROL_UI_IMMUTABLE_CACHE_CONTROL = "public, max-age=0, must-revalidate"/u);
  // The non-asset branch must still send no-cache exactly as before.
  assert.match(patched, /CONTROL_UI_IMMUTABLE_CACHE_CONTROL : "no-cache"/u);
  assert.equal(patchControlUiRevalidate(patched), patched);
});

test("fails closed on drift", () => {
  assert.throws(() => patchControlUiRevalidate("unrelated"), /anchor drifted/u);
});
