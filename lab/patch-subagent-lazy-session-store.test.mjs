import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  ADMISSION_FILE, CAPABILITIES_FILE, ENTRY_FILE, MARKER, patchAdmission, patchCapabilities, patchEntryLookup,
} from "./patch-subagent-lazy-session-store.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const fixture = (file) => readFileSync(path.join(here, "fixtures/subagent-lazy-store", file), "utf8");
const release = (file) => readFileSync(path.join(here, "release-files/subagent-lazy-store", file), "utf8");
const parses = (source) => {
  const dir = mkdtempSync(path.join(tmpdir(), "subagent-lazy-store-"));
  try {
    const file = path.join(dir, "patched.mjs");
    writeFileSync(file, source);
    execFileSync(process.execPath, ["--check", file]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

test("entry chunk: adds the lazy view and exports it, keeps the full list reader", () => {
  const before = fixture(ENTRY_FILE);
  const after = patchEntryLookup(before);
  assert.match(after, /function createSessionEntryLookupReadOnly\(scope = \{\}\) \{/u);
  assert.match(after, /createSessionEntryLookupReadOnly as z \};$/mu);
  assert.equal(after.split("function listSessionEntriesReadOnly(scope = {}) {").length, 2, "full reader untouched");
  assert.match(after, /OPENCLAW_V_SUBAGENT_LAZY_STORE === "0"/u);
  assert.match(after, /where\("current_session_id", "=", sessionId\)/u, "id lookups use the indexed column");
  assert.throws(() => patchEntryLookup(after), new RegExp(`already carries ${MARKER}`, "u"));
  assert.throws(() => patchEntryLookup(`${before}\n`), /not V's db91.6 bytes/u);
  parses(after);
});

test("capability and completion lookups use the lazy view; nothing else changes", () => {
  const capsBefore = fixture(CAPABILITIES_FILE);
  const caps = patchCapabilities(capsBefore);
  assert.doesNotMatch(caps, /listSessionEntriesReadOnly/u, "no whole-store read left in subagent capabilities");
  assert.match(caps, /return createSessionEntryLookupReadOnly\(\{\n\t\t\tagentId,\n\t\t\tstorePath\n\t\t\}\);/u);
  assert.match(caps, /lookup\.findBySessionId\(normalizedSessionId\)/u);
  assert.equal(caps.split("\n").length - capsBefore.split("\n").length, 1 - 1 + 2, "marker line, one line shorter store read, two-line id shortcut");
  parses(caps);

  const admissionBefore = fixture(ADMISSION_FILE);
  const admission = patchAdmission(admissionBefore);
  assert.match(admission, /store = createSessionEntryLookupReadOnly\(\{ storePath \}\);/u);
  assert.match(admission, /return store\[key\] \?\? store\[normalizeStoreSessionKey\(key\)\];/u, "lookup unchanged");
  parses(admission);
});

test("release files are exactly the patched V bytes", () => {
  assert.equal(release(ENTRY_FILE), patchEntryLookup(fixture(ENTRY_FILE)));
  assert.equal(release(CAPABILITIES_FILE), patchCapabilities(fixture(CAPABILITIES_FILE)));
  assert.equal(release(ADMISSION_FILE), patchAdmission(fixture(ADMISSION_FILE)));
});

test("the entry patch stacks on PR #403's chunk without touching its bounded reader", () => {
  const pr403 = readFileSync(path.join(here, "release-files/session-sharing-bounded-reads", ENTRY_FILE), "utf8");
  const after = patchEntryLookup(pr403);
  assert.equal(after, release(`on-pr403/${ENTRY_FILE}`));
  assert.match(after, /function loadExactSessionEntriesReadOnly\(scope, requestedKeys\) \{/u);
  assert.match(after, /^export \{ loadExactSessionEntriesReadOnly \};$/mu);
  assert.match(after, /createSessionEntryLookupReadOnly as z \};$/mu);
  parses(after);
});
