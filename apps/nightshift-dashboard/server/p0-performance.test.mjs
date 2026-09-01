import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("dashboard request paths do not fall back to unscoped Workboard refreshes", async () => {
  const source = await readFile(new URL("./index.mjs", import.meta.url), "utf8");
  assert.doesNotMatch(source, /await refreshCards\(\)/);
  assert.match(source, /notModified: true/);
  assert.match(source, /cardSummary\(card\)/);
});

test("review UI applies targeted card updates instead of a full bootstrap refresh", async () => {
  const source = await readFile(new URL("../client/src/App.jsx", import.meta.url), "utf8");
  const decide = source.slice(source.indexOf("async function decide"), source.indexOf("async function retry"));
  assert.match(decide, /applyCardUpdates\(result\)/);
  assert.doesNotMatch(decide, /await refresh\(/);
  assert.match(source, /api\(`\/api\/cards\/\$\{encodeURIComponent\(card\.id\)\}`\)/);
});
