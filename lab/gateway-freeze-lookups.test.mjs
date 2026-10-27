import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { BEFORE_SHA, MARKER, NAME, patchRunSessionLookup, sha256, unpatchRunSessionLookup } from './patch-run-session-lookup-exact.mjs';

// run-session-lookup-exact: resolveSessionKeyForRun reads only the rows whose current session id is
// the run id. See lab/run-session-lookup-exact.md.
const root = new URL('..', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');
const plan = JSON.parse(read('lab/run-session-lookup-exact.plan.json'));
const released = read(`lab/release-files/run-session-lookup-exact/${NAME}`);
const original = unpatchRunSessionLookup(released);

test('plan pins V bytes before and the release file after', () => {
  assert.equal(plan.files.length, 1);
  const [file] = plan.files;
  assert.equal(file.target, `openclaw/dist/${NAME}`);
  assert.equal(file.source, `lab/release-files/run-session-lookup-exact/${NAME}`);
  assert.equal(file.before, BEFORE_SHA);
  assert.equal(sha256(original), BEFORE_SHA, 'V bytes');
  assert.equal(sha256(released), file.after, 'release bytes');
  assert.equal(patchRunSessionLookup(original), released);
  assert.throws(() => patchRunSessionLookup(released), /already patched/);
});

test('only the store read changes; filter, selection and miss cache stay V code', () => {
  const releaseLines = new Set(released.split('\n'));
  const removed = original.split('\n').filter((line) => !releaseLines.has(line)).map((line) => line.trim());
  assert.deepEqual(removed, ['const { store } = loadCombinedSessionStoreForGatewayCore(cfg, { agentId: requestedAgentId });']);
  assert.equal(released.split(MARKER).length - 1, 1);
  assert.match(released, /const exactRunLookup = typeof runId === "string" && runId\.length > 0 && process\.env\.OPENCLAW_V_RUN_SESSION_LOOKUP_EXACT !== "0";/);
  assert.match(released, /\.\.\.exactRunLookup \? \{ match: \{ sessionIds: \[runId\] \} \} : \{\}/);
  // the rows are still filtered on entry.sessionId and the agent, and a miss is still cached for 1 s
  assert.match(released, /entry\[1\]\?\.sessionId === runId && sessionKeyMatchesAgent\(entry\[0\], requestedAgentId, cfg\)/);
  assert.match(released, /const RUN_LOOKUP_MISS_TTL_MS = 1e3;/);
});

test('the combined store on V takes match.sessionIds for durable stores', () => {
  // V's combined-store-gateway (sessions-search-exact-read, 2026-10-25) routes match to the indexed
  // reader; this patch depends on it being deployed.
  const combined = read('lab/release-files/sessions-search-exact-read/combined-store-gateway-BwDhjbIt.js');
  assert.match(combined, /if \(params\.match && !params\.includeOpenDatabases\) return listSessionEntriesMatchingReadOnly\(/);
  assert.match(combined, /\.\.\.opts\.match \? \{ match: opts\.match \} : \{\}/);
  const matching = read('lab/release-files/sessions-search-exact-read/v-session-entries-matching.mjs');
  assert.match(matching, /where\("current_session_id", "in", chunk\)/);
});
