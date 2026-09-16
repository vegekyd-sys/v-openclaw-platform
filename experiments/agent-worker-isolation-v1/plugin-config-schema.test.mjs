import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

// The plugin manifest sets additionalProperties false, so a key the plugin
// reads but never declares is not an inert mismatch: writing it into an
// instance config stops the Gateway from starting. That failure surfaces on
// whatever instance is unlucky enough to be configured first, long after the
// code that introduced it, so it is worth catching here.
const manifest = JSON.parse(
  readFileSync(new URL("./openclaw.plugin.json", import.meta.url), "utf8"),
);
const source = readFileSync(new URL("./index.mjs", import.meta.url), "utf8");

function readKeys(text) {
  return new Set(
    [...text.matchAll(/api\.pluginConfig\?\.([A-Za-z0-9_]+)/g)].map(
      (match) => match[1],
    ),
  );
}

test("every pluginConfig key the plugin reads is declared in the manifest", () => {
  assert.equal(
    manifest.configSchema?.additionalProperties,
    false,
    "this guard assumes the manifest rejects undeclared keys",
  );
  const declared = new Set(Object.keys(manifest.configSchema?.properties ?? {}));
  const undeclared = [...readKeys(source)].filter((key) => !declared.has(key));
  assert.deepEqual(
    undeclared,
    [],
    `index.mjs reads config keys the manifest does not declare, so setting them breaks Gateway startup: ${undeclared.join(", ")}`,
  );
});

test("the manifest declares no key the plugin never reads", () => {
  const read = readKeys(source);
  const declared = Object.keys(manifest.configSchema?.properties ?? {});
  const unread = declared.filter((key) => !read.has(key));
  assert.deepEqual(
    unread,
    [],
    `the manifest advertises knobs index.mjs ignores: ${unread.join(", ")}`,
  );
});
