import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { ENV, FILES, MARKER, sha256 } from './patch-workboard-sweep-bounded.mjs';

// workboard-sweep-bounded: the Workboard lifecycle sweep stops reading every session and every card.
// See lab/workboard-sweep-bounded.md.
const root = new URL('..', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');
const dir = 'lab/release-files/workboard-sweep-bounded';
const plan = JSON.parse(read('lab/workboard-sweep-bounded.plan.json'));
const released = Object.fromEntries(FILES.map(([name]) => [name, read(`${dir}/${name}`)]));

test('plan pins V bytes before and the release files after', () => {
  assert.deepEqual(plan.files.map((f) => f.target), FILES.map(([name]) => `openclaw/dist/${name}`));
  for (const [name, before, patch, unpatch] of FILES) {
    const file = plan.files.find((f) => f.target === `openclaw/dist/${name}`);
    assert.equal(file.source, `${dir}/${name}`);
    assert.equal(file.before, before);
    assert.equal(sha256(released[name]), file.after, `release bytes ${name}`);
    const original = unpatch(released[name]);
    assert.equal(sha256(original), before, `unpatched ${name} is V's bytes`);
    assert.equal(patch(original), released[name], `patch(V) is the release ${name}`);
    assert.throws(() => patch(released[name]), /already patched/u);
  }
});

test('each change is behind the kill switch', () => {
  const gate = `process.env.${ENV} !== "0"`;
  assert.equal(released['sessions-read-C6mAMxyQ.js'].split(gate).length - 1, 2, 'row builder/bounded load and completed cache');
  assert.equal(released['extensions/workboard/index.js'].split(gate).length - 1, 2, 'sweep links and projected card states');
  // The other files only add functions; nothing calls them with the switch off.
  for (const name of ['v-session-entries-matching.mjs', 'session-utils-list-BUP03AzS.js', 'sqlite-store-CH-caj1l.js', 'runtime-api-1CCazqtv.js']) {
    assert(released[name].includes(MARKER), name);
  }
  assert(released['v-session-entries-matching.mjs'].includes('if (updatedSince !== void 0) {'));
});

test('lifecycle rows carry the fields the sweep and the active-run flags read', () => {
  const source = released['session-utils-list-BUP03AzS.js'];
  const fn = source.slice(source.indexOf('function listSessionLifecycleRowsFromStore('), source.indexOf('//#endregion\nexport { listSessionLifecycleRowsFromStore'));
  for (const field of ['key,', 'agentId', 'updatedAt: entry?.updatedAt ?? null', 'sessionId: entry?.sessionId', 'abortedLastRun: entry?.abortedLastRun', 'status: subagentRun ? subagentStatus : entry?.status']) assert(fn.includes(field), field);
  // The status derivation is buildGatewaySessionRow's, line for line.
  const row = source.slice(source.indexOf('function buildGatewaySessionRow('));
  const status = /const subagentStatus = .*;\n/u.exec(row)[0].trim();
  assert(fn.includes(status), 'subagentStatus derivation');
  // workboard reads these from a sessions.list row (readWorkboardLifecycleSessions → normalizeSession)
  const index = released['extensions/workboard/index.js'];
  const normalize = index.slice(index.indexOf('function normalizeSession('), index.indexOf('async function readWorkboardLifecycleSessions('));
  for (const field of ['value.key', 'value.updatedAt', 'value.status', 'value.hasActiveRun', 'value.abortedLastRun']) assert(normalize.includes(field), field);
  assert.equal((normalize.match(/value\.[a-zA-Z]+/gu) ?? []).filter((x) => !['value.key', 'value.updatedAt', 'value.status', 'value.hasActiveRun', 'value.abortedLastRun'].includes(x)).length, 0, 'no other row field');
});

// V's own latestStatusTransitionAt (runtime-api) against the SQL lookup on random event histories.
const runtime = released['runtime-api-1CCazqtv.js'];
const latestStatusTransitionAt = new Function(`${runtime.slice(runtime.indexOf('function latestStatusTransitionAt('), runtime.indexOf('function shouldSkipPersistedLifecycleStatusUpdate('))}\nreturn latestStatusTransitionAt;`)();
const sqliteStore = released['sqlite-store-CH-caj1l.js'];
const transitionSql = /lifecycleStatusTransition\(cardId, status\) \{\n\t\tconst row = this\.db\.prepare\(`([^`]+)`\)/u.exec(sqliteStore)[1];

test('lifecycleStatusTransition finds the event latestStatusTransitionAt reads', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE workboard_card_events (card_id TEXT, ordinal INTEGER, id TEXT, kind TEXT, at INTEGER, from_status TEXT, to_status TEXT); CREATE INDEX workboard_card_events_card_idx ON workboard_card_events(card_id, ordinal)');
  const statuses = ['backlog', 'todo', 'ready', 'running', 'review', 'blocked', 'done', null, ''];
  const kinds = ['created', 'moved', 'linked', 'claimed', 'heartbeat', 'commented'];
  let seed = 7;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) >>> 0; return seed % n; };
  const insert = db.prepare('INSERT INTO workboard_card_events VALUES (?, ?, ?, ?, ?, ?, ?)');
  const lookup = db.prepare(transitionSql);
  for (let card = 0; card < 3000; card += 1) {
    const cardId = `c${card}`;
    const events = [];
    for (let ordinal = 0, n = rand(12); ordinal < n; ordinal += 1) {
      const row = { kind: kinds[rand(kinds.length)], at: 1000 + rand(100000), from_status: statuses[rand(statuses.length)], to_status: statuses[rand(statuses.length)] };
      insert.run(cardId, ordinal, `${cardId}-${ordinal}`, row.kind, row.at, row.from_status, row.to_status);
      // readEvents: fromStatus / toStatus only when a non-empty string
      events.push({ kind: row.kind, at: row.at, ...row.from_status ? { fromStatus: row.from_status } : {}, ...row.to_status ? { toStatus: row.to_status } : {} });
    }
    for (const status of ['todo', 'ready', 'running', 'review', 'blocked', 'done']) {
      const expected = latestStatusTransitionAt({ status, events });
      const found = lookup.get(cardId, status, status);
      const event = found ? { kind: found.kind, at: found.at, ...found.from_status ? { fromStatus: found.from_status } : {}, toStatus: found.to_status } : void 0;
      assert.equal(event ? latestStatusTransitionAt({ status, events: [event] }) : void 0, expected, `${cardId} ${status}`);
    }
  }
});

// The no-op check on a state (no events) passes every card the check on the full card passes.
const lifecycleSyncPatch = (() => {
  const helpers = ['function shouldSkipPersistedLifecycleStatusUpdate(', 'function shouldSyncWorkboardLifecycleStatus(', 'function preparedLaunchMatchesCard(', 'function acceptedLaunchForAssociation(', 'function executionAssociationPatch(', 'function lifecycleExecution('];
  const fnSource = (start) => {
    const from = runtime.indexOf(start);
    const to = runtime.indexOf('\n}\n', from) + 3;
    return runtime.slice(from, to);
  };
  const method = runtime.slice(runtime.indexOf('\tlifecycleSyncPatch(card, input) {'), runtime.indexOf('\tasync syncLifecycle(id, input) {'));
  return new Function(`
    function cardSessionKey(card) { return card.sessionKey ?? card.execution?.sessionKey; }
    function cardRunId(card) { return card.runId ?? card.execution?.runId; }
    ${fnSource('function latestStatusTransitionAt(')}
    ${helpers.map(fnSource).join('\n')}
    return function ${method.trim().replace(/^lifecycleSyncPatch/u, 'lifecycleSyncPatch')};`)();
})();

test('a state without events passes a superset of what the full card passes', () => {
  let seed = 11;
  const rand = (n) => { seed = (seed * 1103515245 + 12345) >>> 0; return seed % n; };
  const statuses = ['todo', 'ready', 'running', 'review', 'blocked', 'done'];
  const exec = ['running', 'review', 'blocked', 'idle', 'done'];
  let checked = 0, passedFull = 0, passedState = 0;
  for (let i = 0; i < 20000; i += 1) {
    const status = statuses[rand(statuses.length)];
    const sessionKey = rand(5) ? `agent:makaron:subagent:workboard-x-${rand(3)}` : void 0;
    const runId = rand(2) ? `run-${rand(3)}` : void 0;
    const execution = rand(4) ? { id: 'e', kind: 'agent-session', mode: 'autonomous', status: exec[rand(exec.length)], ...rand(4) ? { sessionKey } : {}, ...rand(3) ? { runId } : {}, startedAt: 1, updatedAt: 2 } : void 0;
    const events = Array.from({ length: rand(6) }, () => ({ kind: rand(2) ? 'moved' : 'created', at: rand(2000), fromStatus: statuses[rand(statuses.length)], toStatus: rand(2) ? status : statuses[rand(statuses.length)] }));
    const state = { id: `c${i}`, status, position: 1, createdAt: 1, updatedAt: 3, ...sessionKey ? { sessionKey } : {}, ...runId ? { runId } : {}, ...execution ? { execution } : {},
      metadata: { ...rand(5) === 0 ? { lifecycleStatusSourceUpdatedAt: rand(2000) } : {}, ...rand(4) === 0 ? { stale: { detectedAt: 1, lastSessionUpdatedAt: rand(3), reason: 'Linked session has not reported recent activity.' } } : {} } };
    const card = { ...state, events };
    const target = [['running', 'running'], ['review', 'review'], ['blocked', 'blocked'], [void 0, 'idle']][rand(4)];
    const input = { targetStatus: target[0], executionStatus: target[1], sourceUpdatedAt: rand(2000), ...rand(5) === 0 ? { stale: { detectedAt: 9, lastSessionUpdatedAt: rand(3), reason: 'Linked session has not reported recent activity.' } } : {}, now: 5000,
      association: { ...state.sessionKey ?? execution?.sessionKey ? { expectedSessionKey: state.sessionKey ?? execution?.sessionKey } : {}, ...state.runId ?? execution?.runId ? { expectedRunId: state.runId ?? execution?.runId } : {}, sessionKey: sessionKey ?? 'agent:makaron:subagent:workboard-x-0' } };
    const full = lifecycleSyncPatch(card, input) !== void 0;
    const projected = lifecycleSyncPatch(state, input) !== void 0;
    checked += 1; passedFull += full; passedState += projected;
    if (full) assert(projected, `state skipped a card the full check passes (${i})`);
    // With the one transition event the release reads, the decision is the full card's.
    const at = latestStatusTransitionAt(card);
    const withTransition = state.metadata.lifecycleStatusSourceUpdatedAt === void 0 && at !== void 0 ? { ...state, events: [{ kind: 'moved', at, toStatus: status }] } : state;
    assert.equal(lifecycleSyncPatch(withTransition, input) !== void 0, full, `transition decision (${i})`);
  }
  assert(passedFull > 1000 && passedState > passedFull, `${checked} ${passedFull} ${passedState}`);
});

// The SQLite projection of the automation keys the sweep reads, against JSON.parse of the whole value.
const automationColumns = JSON.parse(/const WORKBOARD_SWEEP_AUTOMATION_COLUMNS = ("[^\n]+");\n/u.exec(sqliteStore)[1]);
const readSweepAutomation = new Function(`
  function parseJson(value) { if (typeof value !== "string" || !value) return; return JSON.parse(value); }
  ${sqliteStore.slice(sqliteStore.indexOf('function readSweepAutomation('), sqliteStore.indexOf('function readCardLifecycleState('))}
  return readSweepAutomation;`)();

test('sweep automation equals the parsed automation on the keys the sweep reads', () => {
  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE workboard_cards (id TEXT, automation_json TEXT)');
  const values = [
    null, '', '{}', '[]', '5', '"x"', 'true', 'false', '0', 'null', '{bad', '{"boardId":null}', '{"boardId":7}', '{"boardId":"nightshift"}',
    '{"boardId":"a","launch":{"phase":"prepared","preparedAt":1793005287051,"requestedSessionKey":"agent:makaron:x","provisionalRunId":"workboard:c:1"}}',
    '{"launch":"prepared"}', '{"launch":null}', '{"launch":{"phase":"accepted","acceptedAt":1.5,"acceptedSessionKey":"k","n":[1,2,{"x":"y"}]}}',
    '{"workspace":{"kind":"worktree","path":"/w","sourcePath":"/s"}}', '{"workspace":{"kind":"worktree","path":"","sourcePath":0}}', '{"workspace":"worktree"}',
    '{"boardId":"b","summary":"长文本","tenant":"t","idempotencyKey":"k","workspace":{"kind":"dir","path":"/p"},"launch":{"phase":"failed","reason":"r\\"q"}}',
    '{"boardId":"dup","boardId":"last"}', '{"launch":{"preparedAt":12345678901234567}}', '{"launch":{"x":1e21,"y":-0.0001,"z":3.141592653589793}}',
  ];
  const insert = db.prepare('INSERT INTO workboard_cards VALUES (?, ?)');
  values.forEach((v, i) => insert.run(`c${i}`, v));
  const pick = (a) => a && typeof a === 'object' ? Object.fromEntries(['boardId', 'launch', 'workspace'].filter((k) => k in a).map((k) => [k, a[k]])) : a;
  for (const row of db.prepare(`SELECT id, ${automationColumns} FROM workboard_cards ORDER BY rowid`).all()) {
    const raw = values[Number(row.id.slice(1))];
    let expected, threw = false;
    try { expected = typeof raw !== 'string' || !raw ? void 0 : JSON.parse(raw); } catch { threw = true; }
    if (threw) { assert.throws(() => readSweepAutomation(row), SyntaxError, raw); continue; }
    const got = readSweepAutomation(row);
    if (raw === '{"boardId":"dup","boardId":"last"}') { assert.equal(got.boardId, 'dup'); continue; } // SQLite keeps the first duplicate key; V has none (checked on V's export)
    assert.deepEqual(got && typeof got === 'object' && !Array.isArray(got) ? got : got, expected && typeof expected === 'object' && !Array.isArray(expected) ? pick(expected) : expected, raw);
  }
});
