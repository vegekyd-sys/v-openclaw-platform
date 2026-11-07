import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import vm from "node:vm";
import { FILES, MARKER, build, patchAccessor, patchAdmission } from "./patch-subagent-restore-narrow.mjs";

const repo = path.resolve(import.meta.dirname, "..");
const V_DIST = path.join(repo, "release/captured/delete-cleanup-vcc-steer-20261106/dist");
const RELEASE = path.join(repo, "lab/release-files/subagent-restore-narrow");
const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");

test("release files are V's bytes plus this patch, reproducibly", () => {
  const built = build(V_DIST);
  for (const file of Object.values(FILES)) {
    const released = fs.readFileSync(path.join(RELEASE, file.path), "utf8");
    assert.equal(released, built[file.path], `${file.path} differs from a fresh build`);
    assert(released.includes(MARKER));
    const before = fs.readFileSync(path.join(V_DIST, file.path), "utf8");
    assert.equal(sha256(before), file.before);
  }
});

test("patching twice is refused, other bytes are untouched", () => {
  const accessor = fs.readFileSync(path.join(V_DIST, FILES.accessor.path), "utf8");
  const admission = fs.readFileSync(path.join(V_DIST, FILES.admission.path), "utf8");
  assert.throws(() => patchAccessor(patchAccessor(accessor)), /already patched/u);
  assert.throws(() => patchAdmission(patchAdmission(admission)), /already patched/u);
  // the accessor only gains a function and an export at its end
  const patched = patchAccessor(accessor);
  assert(patched.startsWith(accessor.slice(0, accessor.lastIndexOf("export { loadExactSessionEntriesReadOnly };"))));
  assert.match(patched, /\nexport \{ listLiveSessionKeysReadOnly \};\n$/u);
  // the admission chunk: import, helper, fast path, restore call; nothing else
  const lines = (s) => s.split("\n");
  const removed = lines(admission).filter((l) => !lines(patchAdmission(admission)).includes(l));
  assert.deepEqual(removed.map((l) => l.trim()), [
    `import { a as listSessionEntriesReadOnly, f as loadSessionEntryReadOnly, p as patchSessionEntryCore, w as resolveSessionStorePathForScope, z as createSessionEntryLookupReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";`,
    "now",
  ]);
});

// Run the patched orphan check with stand-ins for the store, as the restore calls it.
function loadOrphanCheck({ live, entries, stale, liveThrows = false }) {
  const source = patchAdmission(fs.readFileSync(path.join(V_DIST, FILES.admission.path), "utf8"));
  const start = source.indexOf("// subagent-restore-narrow-v1: child keys");
  const end = source.indexOf("/** Convert persisted session status");
  assert(start > 0 && end > start);
  const loaderStart = source.indexOf("/** Resolve a child session entry without depending on the file-backed store shape. */");
  const exactReads = [];
  const context = {
    exactReads,
    getRuntimeConfig: () => ({ session: {} }),
    resolveAgentIdFromSessionKey: (key) => key.split(":")[1],
    resolveSessionStorePathCore: (_store, { agentId }) => `/store/${agentId}`,
    listLiveSessionKeysReadOnly: (_scope, keys) => {
      if (liveThrows) throw new Error("database busy");
      return new Set(keys.filter((k) => live.has(k)));
    },
    loadSessionEntryReadOnly: ({ sessionKey }) => { exactReads.push(sessionKey); return entries[sessionKey]; },
    isStaleUnendedSubagentRun: (entry) => stale.has(entry.runId),
  };
  vm.runInNewContext(`${source.slice(loaderStart, source.indexOf("/** Resolves whether a registry row is orphaned", loaderStart))}${source.slice(start, end)}
    this.listLiveSubagentChildSessionKeys = listLiveSubagentChildSessionKeys;
    this.resolveSubagentRunOrphanReason = resolveSubagentRunOrphanReason;`, context);
  return context;
}

test("the fast path gives the exact read's answer for every child state", () => {
  const entries = {
    "agent:main:subagent:live": { sessionId: "s1" },
    "agent:main:subagent:aborted": { sessionId: "s2", abortedLastRun: true },
    "agent:main:subagent:blank": { sessionId: " " },
  };
  // the bulk read reports the valid rows with a non-blank current_session_id
  const live = new Set(["agent:main:subagent:live", "agent:main:subagent:aborted"]);
  const runs = [
    { runId: "a", childSessionKey: "agent:main:subagent:live" },
    { runId: "b", childSessionKey: "agent:main:subagent:gone" },
    { runId: "c", childSessionKey: "agent:main:subagent:blank" },
    { runId: "d", childSessionKey: "" },
    { runId: "e", childSessionKey: "agent:main:subagent:live" },
    { runId: "f", childSessionKey: "agent:main:subagent:aborted" },
    { runId: "g", childSessionKey: "  agent:main:subagent:live " },
  ];
  const stale = new Set(["e", "f"]);
  const fast = loadOrphanCheck({ live, entries, stale });
  const liveKeys = fast.listLiveSubagentChildSessionKeys(runs);
  const exact = loadOrphanCheck({ live, entries, stale });
  for (const entry of runs) {
    assert.equal(
      fast.resolveSubagentRunOrphanReason({ entry, includeStaleUnended: true, now: 1, liveChildSessionKeys: liveKeys }),
      exact.resolveSubagentRunOrphanReason({ entry, includeStaleUnended: true, now: 1 }),
      entry.runId,
    );
  }
  // live, not stale: answered without reading the entry (a and g); every other row reads it
  assert.deepEqual(fast.exactReads.toSorted(), ["agent:main:subagent:aborted", "agent:main:subagent:blank", "agent:main:subagent:gone", "agent:main:subagent:live"]);
});

test("a failing bulk read sends every child to the exact read", () => {
  const check = loadOrphanCheck({ live: new Set(["agent:main:subagent:live"]), entries: { "agent:main:subagent:live": { sessionId: "s1" } }, stale: new Set(), liveThrows: true });
  const runs = [{ runId: "a", childSessionKey: "agent:main:subagent:live" }];
  const liveKeys = check.listLiveSubagentChildSessionKeys(runs);
  assert.equal(liveKeys.size, 0);
  assert.equal(check.resolveSubagentRunOrphanReason({ entry: runs[0], includeStaleUnended: true, now: 1, liveChildSessionKeys: liveKeys }), null);
  assert.deepEqual(check.exactReads, ["agent:main:subagent:live"]);
});
