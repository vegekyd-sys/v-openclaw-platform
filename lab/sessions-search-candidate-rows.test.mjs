import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FILES, LIST, MARKER, READ, SCHEMA, TOOLS, sha256 } from './patch-sessions-search-candidate-rows.mjs';

// sessions-search-candidate-rows: sessions_search lists its candidates with one sessions.list of
// visibility fields per scope. See lab/sessions-search-candidate-rows.md.
const root = new URL('..', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');
const dir = 'lab/release-files/sessions-search-candidate-rows';
const plan = JSON.parse(read('lab/sessions-search-candidate-rows.plan.json'));
const released = Object.fromEntries(FILES.map(([name]) => [name, read(`${dir}/${name}`)]));
const original = Object.fromEntries(FILES.map(([name, , , unpatch]) => [name, unpatch(released[name])]));

test('plan pins V bytes before and the release files after', () => {
  assert.deepEqual(plan.files.map((f) => f.target), FILES.map(([name]) => `openclaw/dist/${name}`));
  for (const [name, before, patch] of FILES) {
    const file = plan.files.find((f) => f.target === `openclaw/dist/${name}`);
    assert.equal(file.source, `${dir}/${name}`);
    assert.equal(file.before, before);
    assert.equal(sha256(original[name]), before, `V bytes ${name}`);
    assert.equal(sha256(released[name]), file.after, `release bytes ${name}`);
    assert.equal(patch(original[name]), released[name]);
    assert.throws(() => patch(released[name]), /already patched/);
    assert(released[name].includes(MARKER));
  }
});

test('schema: visibilityRowsOnly is an optional boolean of the closed sessions.list params', () => {
  const schema = released[SCHEMA];
  const start = schema.indexOf('const SessionsListParamsSchema = closedObject({');
  const body = schema.slice(start, schema.indexOf('\n});', start));
  assert.match(body, /\n\tvisibilityRowsOnly: Type\.Optional\(Type\.Boolean\(\)\),\n/);
});

test('visibility rows derive their fields as buildGatewaySessionRow does', () => {
  const list = released[LIST];
  const row = list.slice(list.indexOf('function buildGatewaySessionRow(params) {'), list.indexOf('//#region src/gateway/session-utils-search.ts'));
  // the full row's sources for the four fields (unchanged V code)
  assert.match(row, /const sessionAgentId = normalizeAgentId\(parsedAgent\?\.agentId \?\? params\.agentId \?\? resolveSessionStoreAgentId\(cfg, key\)\);/);
  assert.match(row, /const subagentIndex = rowContext\?\.subagentRuns \?\? params\.subagentRuns \?\? buildSingleRowSubagentRunIndex\(now, \{\n\t\tkey,\n\t\tstore\n\t\}\);/);
  assert.match(row, /const subagentRun = subagentIndex \? subagentIndex\.getDisplaySubagentRun\(key\) : getSessionDisplaySubagentRunByChildSessionKey\(key\);/);
  assert.match(row, /const subagentOwner = normalizeOptionalString\(subagentRun\?\.controllerSessionKey\) \|\| normalizeOptionalString\(subagentRun\?\.requesterSessionKey\);/);
  assert.match(row, /\t\tspawnedBy: subagentOwner \|\| entry\?\.spawnedBy,\n/);
  assert.match(row, /\t\t\.\.\.sessionClassificationForRow\(cfg, key, sessionAgentId, entry\),\n/);
  assert.match(row, /\t\tparentSessionKey: entry\?\.parentSessionKey,\n/);
  // listSessionsFromStoreAsync passes the row agentId only for keys without an agent prefix
  assert.match(list, /const rowAgentId = !parseAgentSessionKey\(key\) && typeof opts\.agentId === "string" \? normalizeAgentId\(opts\.agentId\) : void 0;\n\t\t\tconst row = buildGatewaySessionRow\(\{/);
  const lean = list.slice(list.indexOf('function listSessionVisibilityRowsFromStore(params) {'), list.indexOf('//#endregion\nexport {'));
  assert.match(lean, /const rowAgentId = !parsedAgent && typeof opts\.agentId === "string" \? normalizeAgentId\(opts\.agentId\) : void 0;/);
  assert.match(lean, /const sessionAgentId = normalizeAgentId\(parsedAgent\?\.agentId \?\? rowAgentId \?\? resolveSessionStoreAgentId\(cfg, key\)\);/);
  assert.match(lean, /const subagentIndex = getRowContext\(\)\.subagentRuns \?\? buildSingleRowSubagentRunIndex\(now, \{/);
  assert.match(lean, /spawnedBy: subagentOwner \|\| entry\?\.spawnedBy,/);
  assert.match(lean, /const \{ agentId \} = sessionClassificationForRow\(cfg, key, sessionAgentId, entry\);/);
  assert.match(lean, /parentSessionKey: entry\?\.parentSessionKey/);
  // same selection as prepareSessionList (filters, archived, order, paging, default limit)
  assert.match(lean, /const selection = selectSessionEntries\(\{/);
  assert.match(lean, /defaultLimit: SESSIONS_LIST_DEFAULT_LIMIT,/);
  assert.match(lean, /getRowContext: hasSpawnedByFilter \|\| Boolean\(normalizeOptionalString\(opts\.search\)\) \? getRowContext : void 0,/);
  assert.match(list, /export \{ listSessionVisibilityRowsFromStore, /);
});

test('sessions.list handler: visibility rows skip only the projections the tool does not read', () => {
  const source = released[READ];
  assert.match(source, /import \{ listSessionVisibilityRowsFromStore, _ as readSessionAutomationVersion, n as listSessionsFromStoreAsync,/);
  assert.match(source, /const visibilityRowsOnly = p\.visibilityRowsOnly === true;/);
  assert.match(source, /\(visibilityRowsOnly \? listSessionVisibilityRowsFromStore : listSessionsFromStoreAsync\)\(\{/);
  // sharing still runs for a caller with a visibility filter, which decides the rows it sees
  assert.match(source, /= lifecycleOnly \|\| visibilityRowsOnly && !visibilityFilter \? \{/);
  assert.match(source, /const sessions = visibilityRowsOnly \? result\.sessions : measureDiagnosticsTimelineSpanSync\("gateway\.sessions\.list\.active_run_flags"/);
  assert.match(source, /const currentVisibilityFilter = sharing\.entryFilter;/);
  assert.match(source, /&& params\.request\.visibilityRowsOnly !== true;/);
  // without the flag the handler is V's: every changed line is guarded by visibilityRowsOnly
  const releaseLines = new Set(original[READ].split('\n'));
  const added = released[READ].split('\n').filter((line) => !releaseLines.has(line) && !line.trim().startsWith('//'));
  assert(added.length > 0);
  for (const line of added) assert.match(line, /visibilityRowsOnly|listSessionVisibilityRowsFromStore/, line);
});

// ---- the tool's candidate listing, V's and the release's, against a fake Gateway ----
const functionSource = (source) => {
  const start = source.indexOf('async function listVisibleSearchSessions(params) {');
  const end = source.indexOf('\nfunction compareSearchHits(', start);
  return source.slice(start, end);
};
const parseAgentSessionKey = (key) => {
  const m = /^agent:([^:]+):(.+)$/u.exec(key ?? '');
  return m ? { agentId: m[1], rest: m[2] } : null;
};
const loadListing = (source, env = {}) => new Function('parseAgentSessionKey', 'process', `${functionSource(source)}\nreturn listVisibleSearchSessions;`)(parseAgentSessionKey, { env });

function fakeGateway({ sessions, acceptsVisibilityRows = true, failWith }) {
  const calls = [];
  const gatewayCall = async ({ method, params }) => {
    assert.equal(method, 'sessions.list');
    calls.push(params);
    if (failWith) throw failWith;
    if (params.visibilityRowsOnly !== undefined && !acceptsVisibilityRows) throw new Error('invalid sessions.list params: at root: unexpected property "visibilityRowsOnly"');
    const matching = sessions
      .filter((s) => params.archived === 'all' || (params.archived === true) === Boolean(s.archived))
      .filter((s) => !params.agentId || parseAgentSessionKey(s.key)?.agentId === params.agentId || s.key === 'global' && params.includeGlobal)
      .filter((s) => params.includeGlobal || s.key !== 'global')
      .filter((s) => !params.spawnedBy || s.spawnedBy === params.spawnedBy)
      .sort((a, b) => b.updatedAt - a.updatedAt || a.key.localeCompare(b.key));
    const page = matching.slice(params.offset, params.offset + params.limit);
    const nextOffset = params.offset + page.length;
    return {
      sessions: page.map((s) => params.visibilityRowsOnly
        ? { key: s.key, ...s.agentId ? { agentId: s.agentId } : {}, ...s.spawnedBy ? { spawnedBy: s.spawnedBy } : {}, ...s.parentSessionKey ? { parentSessionKey: s.parentSessionKey } : {} }
        : { ...s, displayName: `row ${s.key}`, thinkingLevels: ['low', 'high'], archived: Boolean(s.archived) }),
      hasMore: nextOffset < matching.length,
      nextOffset: nextOffset < matching.length ? nextOffset : null,
    };
  };
  return { calls, gatewayCall };
}
const store = (() => {
  const sessions = [{ key: 'global', updatedAt: 5 }];
  for (let i = 0; i < 1234; i++) {
    const agentId = ['makaron', 'v-codex', 'dealclaw'][i % 3];
    sessions.push({
      key: `agent:${agentId}:s${String(i).padStart(4, '0')}`,
      agentId,
      updatedAt: 10_000 - (i * 7) % 997,
      archived: i % 17 === 0,
      ...i % 5 === 0 ? { spawnedBy: 'agent:makaron:main' } : {},
      ...i % 11 === 0 ? { parentSessionKey: `agent:${agentId}:s0000` } : {},
    });
  }
  return sessions;
})();
const rowGuard = { check: (row) => ({ allowed: row.agentId !== 'dealclaw' && !(row.spawnedBy && row.key.endsWith('5')) }) };
const listingParams = (gatewayCall, extra = {}) => ({ unscopedAgentId: 'makaron', effectiveRequesterAgentId: 'makaron', effectiveRequesterKey: 'agent:makaron:main', gatewayCall, rowGuard, restrictToSpawned: false, ...extra });

test('release listing: two visibility-row calls give V\'s 200-row paging candidates', async () => {
  for (const restrictToSpawned of [false, true]) {
    const v = fakeGateway({ sessions: store });
    const expected = await loadListing(original[TOOLS])(listingParams(v.gatewayCall, { restrictToSpawned }));
    const r = fakeGateway({ sessions: store });
    const got = await loadListing(released[TOOLS])(listingParams(r.gatewayCall, { restrictToSpawned }));
    assert.deepEqual(got, expected);
    assert(expected.length > (restrictToSpawned ? 10 : 500), `candidates ${expected.length}`);
    assert(v.calls.length > (restrictToSpawned ? 2 : 6), `V paged ${v.calls.length} times`);
    assert.equal(r.calls.length, restrictToSpawned ? 1 : 2);
    for (const call of r.calls) {
      assert.equal(call.archived, 'all');
      assert.equal(call.limit, 1e4);
      assert.equal(call.visibilityRowsOnly, true);
      assert.equal(call.includeUnknown, false);
      assert.equal(call.includeGlobal, !restrictToSpawned);
    }
    assert.deepEqual(r.calls.map((c) => c.agentId ?? null), restrictToSpawned ? [null] : [null, 'makaron']);
  }
});

test('release listing pages visibility rows past 10,000', async () => {
  const big = Array.from({ length: 23_456 }, (_, i) => ({ key: `agent:makaron:b${i}`, agentId: 'makaron', updatedAt: i, archived: i % 3 === 0 }));
  const v = fakeGateway({ sessions: big });
  const expected = await loadListing(original[TOOLS])(listingParams(v.gatewayCall));
  const r = fakeGateway({ sessions: big });
  assert.deepEqual(await loadListing(released[TOOLS])(listingParams(r.gatewayCall)), expected);
  assert.deepEqual(r.calls.map((c) => [c.agentId ?? null, c.offset]), [[null, 0], [null, 1e4], [null, 2e4], ['makaron', 0], ['makaron', 1e4], ['makaron', 2e4]]);
});

test('a Gateway without visibilityRowsOnly: the release falls back to V\'s paging once', async () => {
  const v = fakeGateway({ sessions: store });
  const expected = await loadListing(original[TOOLS])(listingParams(v.gatewayCall));
  const old = fakeGateway({ sessions: store, acceptsVisibilityRows: false });
  assert.deepEqual(await loadListing(released[TOOLS])(listingParams(old.gatewayCall)), expected);
  assert.equal(old.calls[0].visibilityRowsOnly, true);
  assert.deepEqual(old.calls.slice(1), v.calls, 'then exactly V\'s requests');
});

test('OPENCLAW_V_SESSIONS_SEARCH_CANDIDATE_ROWS=0 restores V\'s requests', async () => {
  const v = fakeGateway({ sessions: store });
  const expected = await loadListing(original[TOOLS])(listingParams(v.gatewayCall));
  const off = fakeGateway({ sessions: store });
  assert.deepEqual(await loadListing(released[TOOLS], { OPENCLAW_V_SESSIONS_SEARCH_CANDIDATE_ROWS: '0' })(listingParams(off.gatewayCall)), expected);
  assert.deepEqual(off.calls, v.calls);
});

test('other sessions.list errors are not swallowed', async () => {
  const failing = fakeGateway({ sessions: store, failWith: new Error('gateway timeout after 10000ms') });
  await assert.rejects(loadListing(released[TOOLS])(listingParams(failing.gatewayCall)), /gateway timeout/);
  assert.equal(failing.calls.length, 1);
});
