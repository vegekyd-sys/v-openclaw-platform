import assert from "node:assert/strict";
import test from "node:test";

import { patchOpenClawSessionStoreBundle } from "../scripts/patch-openclaw-session-hotset.mjs";

const fixture = `
import fs from "node:fs";
import path from "node:path";
async function saveSessionStoreUnlocked(storePath, store, opts) {
\tconst singleEntrySerialized = buildSingleEntrySerializedStore();
\tif (singleEntrySerialized) {
\t\t\tawait writeSessionStoreAtomic({
\t\t\t\tstorePath,
\t\t\t\tstore,
\t\t\t\tserialized: singleEntrySerialized.serialized,
\t\t});
\t}
\tconst persisted = projectSessionStoreForPersistence({
\t\tstorePath,
\t\tstore
\t});
\tconst json = JSON.stringify(persisted.store, null, 2);
}
`;

test("patches the exact OpenClaw 2026.7.1 persistence projection", () => {
  const result = patchOpenClawSessionStoreBundle(
    fixture,
    "file:///opt/vlab/session-hotset.mjs",
  );

  assert.equal(result.changed, true);
  assert.match(result.source, /applyVersaSessionHotsetProjection/);
  assert.match(result.source, /versa-session-hotset-v0\.2\.0/);
  assert.match(result.source, /activeSessionKey: opts\?\.activeSessionKey/);
  assert.doesNotMatch(result.source, /serialized: hotsetSerialized/);
  assert.match(result.source, /JSON\.stringify\(persisted\.store/);
});

test("patch is idempotent for the same immutable module URL", () => {
  const first = patchOpenClawSessionStoreBundle(
    fixture,
    "file:///opt/vlab/session-hotset.mjs",
  );
  const second = patchOpenClawSessionStoreBundle(
    first.source,
    "file:///opt/vlab/session-hotset.mjs",
  );

  assert.equal(second.changed, false);
  assert.equal(second.source, first.source);
});

test("upgrades an existing Hotset patch to the new immutable release URL", () => {
  const first = patchOpenClawSessionStoreBundle(
    fixture,
    "file:///opt/vlab/releases/old/session-hotset.mjs",
  );
  const upgraded = patchOpenClawSessionStoreBundle(
    first.source,
    "file:///opt/vlab/releases/new/session-hotset.mjs",
  );

  assert.equal(upgraded.changed, true);
  assert.match(upgraded.source, /releases\/new\/session-hotset\.mjs/);
  assert.doesNotMatch(upgraded.source, /releases\/old\/session-hotset\.mjs/);
  assert.equal(
    upgraded.source.match(/versa-session-hotset-v0\.2\.0/g)?.length,
    1,
  );
});

test("patch rejects partial or unsupported bundles", () => {
  assert.throws(
    () => patchOpenClawSessionStoreBundle(
      `${fixture}\n// versa-session-hotset-v0.2.0`,
      "file:///opt/vlab/session-hotset.mjs",
    ),
    /partially patched/,
  );
  assert.throws(
    () => patchOpenClawSessionStoreBundle(
      fixture.replace(
        "const persisted = projectSessionStoreForPersistence",
        "const persisted = changedPersistenceProjection",
      ),
      "file:///opt/vlab/session-hotset.mjs",
    ),
    /could not find Session Store persistence projection/,
  );
});
