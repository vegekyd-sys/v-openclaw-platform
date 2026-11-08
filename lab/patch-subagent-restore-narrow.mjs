#!/usr/bin/env node
// subagent-restore-narrow-v1: restoring the subagent registry stops reading every child session
// entry in full.
//
// V 2026-11-07: a Worker's first turn spends 18.4-19.3 s between prompt-prep total and its
// first model call (6 fresh Workers that day; later turns 0.1-0.4 s). It grew from ~6 s on
// 10/06 to 21.7 s on 11/06, about +0.5 s a day, with Night Shift. restoreSubagentRunsOnce
// (first registry access in each process, and in the Gateway at start) runs
// reconcileOrphanedRestoredRuns, which asks resolveSubagentRunOrphanReason about every row:
// loadSessionEntryReadOnly per child, i.e. one Kysely query, the full entry_json and its
// parse per row. V has 16,663 subagent_runs; 15,495 distinct Night Shift children, all present,
// 80 KB of entry JSON each (skillsSnapshot 68 KB, systemPromptReport 39 KB), 1.24 GB in all.
// Reading them in Python on V, read-only, takes 6.6 s before any of OpenClaw's own work.
//
// After: one bulk query per agent store reads session_key and current_session_id of the rows
// with entry_valid = 1 (0.07 s for all 15,495 on V). A child in that set has an entry whose
// sessionId is that id (bindSessionNode writes both from the same entry), so it cannot be
// "missing-session-entry" or "missing-session-id"; unless the run is stale-unended (only the
// full entry can clear that, through abortedLastRun) it is not an orphan and its entry is not
// read. Every other child (missing, tombstoned, not validated, blank id, stale-unended, or any
// bulk-read failure) takes the original exact read. The fast path only ever answers "not an
// orphan", and the original read already answers that for every valid row (its parse errors
// are caught as "not an orphan" too), so no row is pruned that was kept before and vice versa.
//
// Source: vegekyd-sys/openclaw-versa versa/port-subagent-restore-narrow-20261107
// (listLiveSessionKeysReadOnly, listLiveSubagentChildSessionKeys,
// subagent-restore-live-children.test.ts).
//
//   node lab/patch-subagent-restore-narrow.mjs <dist dir with V's bytes> <out dir>
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export const MARKER = "subagent-restore-narrow-v1";
export const FILES = {
  accessor: {
    path: "session-accessor.sqlite-entry-BlklNPKQ.js",
    before: "789fca01601893b6437154543628936dc28eb93c19070ad95f5a4ff1607c8f61",
  },
  admission: {
    path: "subagent-completion-admission.store-JmpNDYTF.js",
    before: "733f6b75f404488e55292fa618c238b844bd6f42f1b882f3b807d390b50b3692",
  },
};

const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");

function replaceOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchAccessor(source) {
  assert(!source.includes(MARKER), "accessor already patched");
  const fn = `
// ${MARKER}: keys with a valid entry and a current session id, from columns only (no entry JSON).
function listLiveSessionKeysReadOnly(scope, requestedKeys) {
	const keys = [...new Set(requestedKeys.filter((key) => typeof key === "string" && key !== ""))];
	const live = new Set();
	if (keys.length === 0) return live;
	const resolved = resolveSqliteScope({ ...scope, sessionKey: keys[0] });
	const result = withOpenClawAgentDatabaseReadOnly((database) => {
		const db = getSessionKysely(database.db);
		for (let offset = 0; offset < keys.length; offset += 400) {
			const chunk = keys.slice(offset, offset + 400);
			for (const row of executeSqliteQuerySync(database.db, db.selectFrom("session_nodes").select(["session_key", "current_session_id"]).where("session_key", "in", chunk).where("entry_valid", "=", 1)).rows) if (typeof row.current_session_id === "string" && row.current_session_id.trim()) live.add(row.session_key);
		}
		return live;
	}, toDatabaseOptions(resolved));
	return result.found ? result.value : live;
}
`;
  const tail = "\nexport { loadExactSessionEntriesReadOnly };\n";
  assert(source.endsWith(tail), "accessor tail export moved");
  return `${source.slice(0, -tail.length)}\n${fn}${tail.trimEnd()}\nexport { listLiveSessionKeysReadOnly };\n`;
}

export function patchAdmission(source) {
  assert(!source.includes(MARKER), "admission already patched");
  let out = replaceOnce(
    source,
    `import { a as listSessionEntriesReadOnly, f as loadSessionEntryReadOnly, p as patchSessionEntryCore, w as resolveSessionStorePathForScope, z as createSessionEntryLookupReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";`,
    `import { a as listSessionEntriesReadOnly, f as loadSessionEntryReadOnly, p as patchSessionEntryCore, w as resolveSessionStorePathForScope, z as createSessionEntryLookupReadOnly, listLiveSessionKeysReadOnly } from "./session-accessor.sqlite-entry-BlklNPKQ.js";`,
    "session accessor import",
  );
  out = replaceOnce(
    out,
    `/** Resolves whether a registry row is orphaned from its child session entry. */
function resolveSubagentRunOrphanReason(params) {
	const childSessionKey = params.entry.childSessionKey?.trim();
	if (!childSessionKey) return "missing-session-entry";
	try {`,
    `// ${MARKER}: child keys with a valid entry and a sessionId, one column read per agent store.
function listLiveSubagentChildSessionKeys(entries, cfg) {
	const live = /* @__PURE__ */ new Set();
	const byStore = /* @__PURE__ */ new Map();
	try {
		const resolvedCfg = cfg ?? getRuntimeConfig();
		for (const entry of entries) {
			const key = entry.childSessionKey?.trim();
			if (!key) continue;
			const storePath = resolveSessionStorePathCore(resolvedCfg.session?.store, { agentId: resolveAgentIdFromSessionKey(key) });
			const keys = byStore.get(storePath);
			if (keys) keys.push(key);
			else byStore.set(storePath, [key]);
		}
	} catch {
		return live;
	}
	for (const [storePath, keys] of byStore) try {
		for (const key of listLiveSessionKeysReadOnly({ storePath }, keys)) live.add(key);
	} catch {}
	return live;
}
/** Resolves whether a registry row is orphaned from its child session entry. */
function resolveSubagentRunOrphanReason(params) {
	const childSessionKey = params.entry.childSessionKey?.trim();
	if (!childSessionKey) return "missing-session-entry";
	if (params.liveChildSessionKeys?.has(childSessionKey) && !(params.includeStaleUnended === true && isStaleUnendedSubagentRun(params.entry, params.now))) return null;
	try {`,
    "resolveSubagentRunOrphanReason head",
  );
  out = replaceOnce(
    out,
    `function reconcileOrphanedRestoredRuns(params) {
	const now = Date.now();
	let changed = false;
	for (const [runId, entry] of params.runs.entries()) {`,
    `function reconcileOrphanedRestoredRuns(params) {
	const now = Date.now();
	let changed = false;
	const liveChildSessionKeys = process.env.OPENCLAW_V_SUBAGENT_RESTORE_NARROW === "0" ? void 0 : listLiveSubagentChildSessionKeys(params.runs.values());
	for (const [runId, entry] of params.runs.entries()) {`,
    "reconcileOrphanedRestoredRuns head",
  );
  out = replaceOnce(
    out,
    `		const orphanReason = resolveSubagentRunOrphanReason({
			entry,
			includeStaleUnended: true,
			now
		});`,
    `		const orphanReason = resolveSubagentRunOrphanReason({
			entry,
			includeStaleUnended: true,
			now,
			liveChildSessionKeys
		});`,
    "restore orphan call",
  );
  return out;
}

export function build(distDir) {
  const out = {};
  for (const [name, file] of Object.entries(FILES)) {
    const source = fs.readFileSync(path.join(distDir, file.path), "utf8");
    assert.equal(sha256(source), file.before, `${file.path}: input is not the expected base bytes`);
    out[file.path] = name === "accessor" ? patchAccessor(source) : patchAdmission(source);
  }
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [distDir, outDir] = process.argv.slice(2);
  assert(distDir && outDir, "usage: patch-subagent-restore-narrow.mjs <dist dir> <out dir>");
  fs.mkdirSync(outDir, { recursive: true });
  for (const [rel, text] of Object.entries(build(distDir))) {
    fs.writeFileSync(path.join(outDir, rel), text);
    console.log(`${rel} ${sha256(text)}`);
  }
}
