import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// session-info-subagent-index (2026-10-19 02:20 V stall, see lab/session-info-subagent-index.md):
// a single session row reads the subagent registry through one prepared index instead of one
// global lookup per child run. Applies to V's session-utils-list-BUP03AzS.js (pristine 2026.9.1).
export const MARKER = 'v-session-info-subagent-index-v1';
export const V_BYTES_SHA256 = '353e0f211194c77e233f071c4080e107bda00b5f14fbb991c1ff102834628e79';
export const RELEASE_FILE = 'lab/release-files/session-info-subagent-index/session-utils-list-BUP03AzS.js';

export const REPLACEMENTS = [
  [
    'import { c as getSessionDisplaySubagentRunByChildSessionKey, d as isSubagentRunLive, f as isSubagentRunQueued, h as listSubagentRunsForController, i as countActiveDescendantRuns, r as buildSubagentSessionListReadIndex } from "./subagent-registry-read-UaDFTyfW.js";\n',
    'import { T as buildSubagentRunReadIndexFromRuns, b as getSubagentRunsSnapshotForRead, c as getSessionDisplaySubagentRunByChildSessionKey, d as isSubagentRunLive, f as isSubagentRunQueued, h as listSubagentRunsForController, i as countActiveDescendantRuns, r as buildSubagentSessionListReadIndex } from "./subagent-registry-read-UaDFTyfW.js";\nimport { w as subagentRunRegistry } from "./subagent-registry.store.sqlite-hzGu4QSk.js";\n',
  ],
  [
    `function buildSingleRowStoreChildSessionsByKey(params) {
	return buildStoreChildSessionIndex({
		store: params.store,
		keys: [params.key],
		now: params.now,
		requireCurrentController: true
	});
}`,
    `function buildSingleRowStoreChildSessionsByKey(params) {
	return buildStoreChildSessionIndex({
		store: params.store,
		keys: [params.key],
		now: params.now,
		requireCurrentController: true,
		...params.subagentRuns ? { subagentRuns: params.subagentRuns } : {}
	});
}
// ${MARKER}: one read index for a single session row. Without it every child
// run of the row (4,345 under agent:makaron:main on V) re-read the whole registry snapshot (reloaded
// from SQLite once it is 500 ms old) and rebuilt the index over all runs: 43-95 s of main thread per
// chat.history. Same snapshot and in-memory runs the global lookups read, so the row is unchanged.
function buildSingleRowSubagentRunIndex(now) {
	return buildSubagentRunReadIndexFromRuns({
		runs: getSubagentRunsSnapshotForRead(subagentRunRegistry),
		inMemoryRuns: subagentRunRegistry.values(),
		now
	});
}`,
  ],
  [
    `	const rowContext = params.rowContext;
	const subagentRun = rowContext ? rowContext.subagentRuns.getDisplaySubagentRun(key) : getSessionDisplaySubagentRunByChildSessionKey(key);`,
    `	const rowContext = params.rowContext;
	const subagentIndex = rowContext?.subagentRuns ?? params.subagentRuns ?? buildSingleRowSubagentRunIndex(now);
	const subagentRun = subagentIndex ? subagentIndex.getDisplaySubagentRun(key) : getSessionDisplaySubagentRunByChildSessionKey(key);`,
  ],
  [
    'const hasActiveSubagentRun = liveSubagentRunActive || (rowContext?.subagentRuns.countActiveDescendantRuns(key) ?? countActiveDescendantRuns(key)) > 0;',
    'const hasActiveSubagentRun = liveSubagentRunActive || (subagentIndex?.countActiveDescendantRuns(key) ?? countActiveDescendantRuns(key)) > 0;',
  ],
  [
    'const childSessions = params.storeChildSessionsByKey ? mergeChildSessionKeys(resolveRuntimeChildSessionKeys(key, now, rowContext?.subagentRuns), params.storeChildSessionsByKey.get(key)) : resolveChildSessionKeys(key, store, now, rowContext?.subagentRuns);',
    'const childSessions = params.storeChildSessionsByKey ? mergeChildSessionKeys(resolveRuntimeChildSessionKeys(key, now, subagentIndex), params.storeChildSessionsByKey.get(key)) : resolveChildSessionKeys(key, store, now, subagentIndex);',
  ],
  [
    `	if (!entry) return { row: null };
	const storeChildSessionsByKey = buildSingleRowStoreChildSessionsByKey({
		store,
		key: canonicalKey,
		now
	});`,
    `	if (!entry) return { row: null };
	const subagentRuns = buildSingleRowSubagentRunIndex(now);
	const storeChildSessionsByKey = buildSingleRowStoreChildSessionsByKey({
		store,
		key: canonicalKey,
		now,
		subagentRuns
	});`,
  ],
  [
    `			storeChildSessionsByKey,
			skipTranscriptUsageFallback: lightweight,
			lightweightListRow: lightweight,`,
    `			storeChildSessionsByKey,
			subagentRuns,
			skipTranscriptUsageFallback: lightweight,
			lightweightListRow: lightweight,`,
  ],
  [
    `function buildGatewaySessionInfo(params) {
	const now = params.now ?? Date.now();
	const storeChildSessionsByKey = buildSingleRowStoreChildSessionsByKey({
		store: params.store,
		key: params.key,
		now
	});`,
    `function buildGatewaySessionInfo(params) {
	const now = params.now ?? Date.now();
	const subagentRuns = buildSingleRowSubagentRunIndex(now);
	const storeChildSessionsByKey = buildSingleRowStoreChildSessionsByKey({
		store: params.store,
		key: params.key,
		now,
		subagentRuns
	});`,
  ],
  [
    `		now,
		storeChildSessionsByKey,
		skipTranscriptUsageFallback: true,
		lightweightListRow: true
	});
}`,
    `		now,
		storeChildSessionsByKey,
		subagentRuns,
		skipTranscriptUsageFallback: true,
		lightweightListRow: true
	});
}`,
  ],
];

const swap = (source, from, to) => {
  assert.equal(source.split(from).length, 2, `Expected one anchor: ${from.slice(0, 100)}`);
  return source.replace(from, () => to);
};

export function patchSessionUtilsList(source) {
  assert(!source.includes(MARKER), 'already patched');
  return REPLACEMENTS.reduce((text, [before, after]) => swap(text, before, after), source);
}

export function unpatchSessionUtilsList(release) {
  return [...REPLACEMENTS].reverse().reduce((text, [before, after]) => swap(text, after, before), release);
}

// node lab/patch-session-info-subagent-index.mjs <V dist session-utils-list-BUP03AzS.js>
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const original = fs.readFileSync(process.argv[2], 'utf8');
  assert.equal(createHash('sha256').update(original).digest('hex'), V_BYTES_SHA256, 'input is not V bytes');
  fs.writeFileSync(path.join(root, RELEASE_FILE), patchSessionUtilsList(original));
}
