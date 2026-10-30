import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FILES, MARKER, sha256 } from './patch-gateway-freeze-lookups.mjs';

// gateway-freeze-lookups: resolveSessionKeyForRun and findTaskSessionEntry read only the matching
// session rows. See lab/gateway-freeze-lookups.md.
const root = new URL('..', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');
const plan = JSON.parse(read('lab/gateway-freeze-lookups.plan.json'));
const released = (name) => read(`lab/release-files/gateway-freeze-lookups/${name}`);
const removedLines = (original, release) => {
  const releaseLines = new Set(release.split('\n'));
  return original.split('\n').filter((line) => !releaseLines.has(line)).map((line) => line.trim());
};

test('plan pins V bytes before and the release files after', () => {
  assert.deepEqual(plan.files.map((f) => f.target), Object.keys(FILES).map((name) => `openclaw/dist/${name}`));
  for (const file of plan.files) {
    const name = file.target.slice('openclaw/dist/'.length);
    const release = released(name);
    const original = FILES[name].unpatch(release);
    assert.equal(file.source, `lab/release-files/gateway-freeze-lookups/${name}`);
    assert.equal(file.before, FILES[name].before);
    assert.equal(sha256(original), file.before, `V bytes: ${name}`);
    assert.equal(sha256(release), file.after, `release bytes: ${name}`);
    assert.equal(FILES[name].patch(original), release);
    assert.throws(() => FILES[name].patch(release), /already patched/);
    assert.equal(release.split(MARKER).length - 1, 1);
  }
});

test('run lookup: only the store read changes; filter, selection and miss cache stay V code', () => {
  const release = released('server-session-key-ZtX3Ble7.js');
  const original = FILES['server-session-key-ZtX3Ble7.js'].unpatch(release);
  assert.deepEqual(removedLines(original, release), ['const { store } = loadCombinedSessionStoreForGatewayCore(cfg, { agentId: requestedAgentId });']);
  assert.match(release, /const exactRunLookup = typeof runId === "string" && runId\.length > 0 && process\.env\.OPENCLAW_V_RUN_SESSION_LOOKUP_EXACT !== "0";/);
  assert.match(release, /\.\.\.exactRunLookup \? \{ match: \{ sessionIds: \[runId\] \} \} : \{\}/);
  assert.match(release, /entry\[1\]\?\.sessionId === runId && sessionKeyMatchesAgent\(entry\[0\], requestedAgentId, cfg\)/);
  assert.match(release, /const RUN_LOOKUP_MISS_TTL_MS = 1e3;/);
});

test('task lookup: reads one key with the default runtime; the whole-store lookup stays behind the switch', () => {
  const release = released('task-registry.maintenance-C4nMaDY9.js');
  const original = FILES['task-registry.maintenance-C4nMaDY9.js'].unpatch(release);
  assert.deepEqual(removedLines(original, release), ['return findSessionEntryByKey(getSessionEntryLookup(taskRegistryMaintenanceRuntime.resolveStorePath(void 0, { agentId }), context), childSessionKey);']);
  assert.match(release, /import \{ listSessionEntriesMatchingReadOnly \} from "\.\/v-session-entries-matching\.mjs";/);
  assert.match(release, /if \(taskRegistryMaintenanceRuntime\.listSessionEntries === listSessionEntriesReadOnly && process\.env\.OPENCLAW_V_TASK_SESSION_LOOKUP_EXACT !== "0"\) \{/);
  assert.match(release, /listSessionEntriesMatchingReadOnly\(\{ storePath \}, \{ sessionKeys: \[childSessionKey\] \}\)/);
  assert.match(release, /return findSessionEntryByKey\(getSessionEntryLookup\(storePath, context\), childSessionKey\);/);
  // every caller still goes through findTaskSessionEntry; nothing else reads the whole store here
  assert.equal(release.split('getSessionEntryLookup(').length - 1, 2, 'definition + fallback');
  assert.equal(release.split('findTaskSessionEntry(').length - 1, original.split('findTaskSessionEntry(').length - 1);
});

test('the matching reader both patches import is the one on V', () => {
  // sessions-search-exact-read (2026-10-25) put these on V; this patch depends on them being deployed.
  const combined = read('lab/release-files/sessions-search-exact-read/combined-store-gateway-BwDhjbIt.js');
  assert.match(combined, /if \(params\.match && !params\.includeOpenDatabases\) return listSessionEntriesMatchingReadOnly\(/);
  assert.match(combined, /\.\.\.opts\.match \? \{ match: opts\.match \} : \{\}/);
  const matching = read('lab/release-files/sessions-search-exact-read/v-session-entries-matching.mjs');
  assert.equal(sha256(matching), 'd2d2c2cd7b33622fabcd1ab52ec003d2bf471735c64b49030294a76f27af7e02');
  assert.match(matching, /where\("current_session_id", "in", chunk\)/);
  assert.match(matching, /where\("session_key", "in", chunk\)/);
});
