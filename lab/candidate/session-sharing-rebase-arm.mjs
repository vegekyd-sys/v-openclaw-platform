// One arm of the session-sharing-bounded-reads rebase A/B: drives the real
// sessions.list handler of one dist directory against the private snapshot.
// Usage: node session-sharing-rebase-arm.mjs <dist> <setup|matrix|perf> <fixtures.json> <out-dir>
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {createHash, randomUUID} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {Worker} from 'node:worker_threads';

const [dist, mode, fixturesPath, outDir] = process.argv.slice(2);
assert(dist && mode && fixturesPath && outDir);
const state = process.env.OPENCLAW_STATE_DIR;
const file = path.join(state, 'agents/makaron/agent/openclaw-agent.sqlite');
const cfg = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH));
const digest = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
// The envelope's ts is the wall clock of the call; everything else must match.
const stablePayload = response => { const {ts, ...rest} = response.payload ?? {}; return {ok: response.ok, error: response.error ?? null, payload: rest}; };

// Native timeline spans are emitted synchronously at span start/end. Owning the
// process singleton lets one hook observe the real sharing stage boundaries.
let spans = [], onSharingStart, activeStats, sharingStats;
globalThis[Symbol.for('openclaw.diagnosticsTimelineWriter')] = {
  flush() {},
  write(_path, content) {
    for (const line of content.split('\n')) {
      if (!line) continue;
      const event = JSON.parse(line);
      if (!event.name?.startsWith('gateway.sessions.list')) continue;
      if (event.type === 'span.start' && event.name === 'gateway.sessions.list.sharing') {
        onSharingStart?.();
        activeStats = {sqlReads: 0, sessionNodesQueries: 0, participantsQueries: 0, membersQueries: 0, otherQueries: 0, nodeRows: 0};
      }
      if (event.type !== 'span.start') spans.push({name: event.name, type: event.type, ms: event.durationMs});
      if (event.type !== 'span.start' && event.name === 'gateway.sessions.list.sharing') {
        sharingStats = activeStats;
        activeStats = undefined;
      }
    }
  },
};
assert(process.env.OPENCLAW_DIAGNOSTICS && process.env.OPENCLAW_DIAGNOSTICS_TIMELINE_PATH);

const realPrepare = DatabaseSync.prototype.prepare;
DatabaseSync.prototype.prepare = function (sql) {
  const statement = realPrepare.call(this, sql);
  const table = /\bfrom\s+["`\[]?session_nodes\b/i.test(sql) ? 'sessionNodes' : /session_participants/i.test(sql) ? 'participants' : /session_members/i.test(sql) ? 'members' : 'other';
  for (const method of ['get', 'all', 'iterate']) {
    const original = statement[method].bind(statement);
    if (method === 'iterate') statement.iterate = function* (...args) {
      if (activeStats) { activeStats.sqlReads++; activeStats[table + 'Queries']++; }
      for (const row of original(...args)) { if (activeStats && table === 'sessionNodes') activeStats.nodeRows++; yield row; }
    };
    else statement[method] = (...args) => {
      if (activeStats) { activeStats.sqlReads++; activeStats[table + 'Queries']++; }
      const value = original(...args);
      if (activeStats && table === 'sessionNodes') activeStats.nodeRows += Array.isArray(value) ? value.length : value === undefined ? 0 : 1;
      return value;
    };
  }
  return statement;
};

const load = name => import(pathToFileURL(path.join(dist, name)).href);
const {n: sessionsListHandler} = await load('sessions-read-C6mAMxyQ.js');
assert.equal(typeof sessionsListHandler, 'function');

let placementCalls = 0;
async function call(params, client, hooks = {}) {
  // A fresh context bypasses the per-context completed-list cache on every call.
  const context = {
    getRuntimeConfig: () => cfg,
    chatAbortControllers: new Map(),
    workerSessionPlacementService: {getMany: () => { placementCalls++; return new Map(); }, getPlacementMoves: () => new Map()},
  };
  spans = []; sharingStats = undefined; onSharingStart = hooks.onSharingStart; placementCalls = 0;
  let response;
  const started = performance.now();
  await sessionsListHandler({params, client, context, respond: (ok, payload, error) => { response = {ok, payload, error}; }});
  const totalMs = performance.now() - started;
  onSharingStart = undefined;
  assert(response, 'handler responded');
  const sharingSpans = spans.filter(span => span.name === 'gateway.sessions.list.sharing');
  return {
    response, totalMs, placementCalls,
    sharingSpans: sharingSpans.length,
    sharingMs: sharingSpans.reduce((sum, span) => sum + span.ms, 0),
    storeLoadMs: spans.filter(span => span.name === 'gateway.sessions.list.store_load').reduce((sum, span) => sum + span.ms, 0),
    sharingStats,
  };
}

const external = () => { const db = new DatabaseSync(file); db.exec('PRAGMA busy_timeout=5000'); return db; };
const schemaCommit = db => () => {
  const before = db.prepare('PRAGMA data_version').get().data_version;
  db.prepare('UPDATE schema_meta SET updated_at=updated_at+1 WHERE meta_key=(SELECT meta_key FROM schema_meta ORDER BY meta_key LIMIT 1)').run();
  assert.equal(db.prepare('PRAGMA data_version').get().data_version, before, 'own connection');
};

if (mode === 'setup') {
  const entry = await load('session-accessor.sqlite-entry-BlklNPKQ.js');
  const profiles = await load('user-profiles-ftXkbNlK.js');
  const scope = {agentId: 'makaron', storePath: file};
  const owner = await profiles.n('sharing-rebase-owner@candidate.invalid');
  const alias = await profiles.n('sharing-rebase-alias@candidate.invalid');
  await profiles.o('sharing-rebase-alias@candidate.invalid', owner.id);
  assert(profiles.h(alias.id).has(owner.id), 'native alias merge');
  const now = Date.now(), fixtures = {ownerId: owner.id, aliasId: alias.id, memberId: 'sharing-rebase-member', foreignId: 'sharing-rebase-foreign', sessions: {}};
  for (const [index, visibility] of ['shared', 'draft', 'read-only', 'suggest'].entries()) {
    const key = `agent:makaron:explicit:sharing-rebase-${visibility}-${randomUUID()}`;
    const initial = {sessionId: randomUUID(), createdAt: now, updatedAt: now + index, createdVia: 'operator', createdActor: {type: 'human', id: owner.id, source: 'profile'}, status: 'done', visibility};
    await entry.p({...scope, sessionKey: key}, () => initial, {fallbackEntry: initial, replaceEntry: true, skipMaintenance: true});
    fixtures.sessions[visibility] = key;
  }
  const db = new DatabaseSync(file);
  for (const visibility of ['draft', 'read-only']) db.prepare('INSERT INTO session_members(session_key,identity_id,added_by,added_at) VALUES(?,?,?,?)').run(fixtures.sessions[visibility], fixtures.memberId, owner.id, now);
  // Old updatedAt keeps the churn row outside every limited page.
  fixtures.churnKey = `agent:makaron:explicit:sharing-rebase-churn-${randomUUID()}`;
  const churn = {sessionId: randomUUID(), createdAt: 1000, updatedAt: 1000, status: 'done', visibility: 'shared'};
  await entry.p({...scope, sessionKey: fixtures.churnKey}, () => churn, {fallbackEntry: churn, replaceEntry: true, skipMaintenance: true});
  fixtures.realOwners = db.prepare("SELECT json_extract(entry_json,'$.createdActor.id') AS id, count(*) AS n FROM session_nodes WHERE json_extract(entry_json,'$.createdActor.type')='human' GROUP BY 1 ORDER BY 2 DESC LIMIT 2").all().map(row => ({id: row.id, sessions: row.n}));
  fixtures.sessionRows = db.prepare('SELECT count(*) AS n FROM session_nodes').get().n;
  fixtures.visibilityCounts = Object.fromEntries(db.prepare("SELECT coalesce(json_extract(entry_json,'$.visibility'),'shared') AS v, count(*) AS n FROM session_nodes GROUP BY 1").all().map(row => [row.v, row.n]));
  db.close();
  assert(fixtures.realOwners.length > 0, 'real creator identities');
  fs.writeFileSync(fixturesPath, JSON.stringify(fixtures, null, 2));
  console.log(JSON.stringify({mode, fixtures}));
  process.exit(0);
}

const fixtures = JSON.parse(fs.readFileSync(fixturesPath));
const read = profileId => ({connect: {scopes: ['operator.read']}, ...profileId ? {authenticatedUserProfile: {profileId}} : {}});
const clients = {
  admin: {connect: {scopes: ['operator.admin']}},
  'admin-with-profile': {connect: {scopes: ['operator.admin']}, authenticatedUserProfile: {profileId: fixtures.ownerId}},
  'real-owner': read(fixtures.realOwners[0].id),
  'real-owner-2': read(fixtures.realOwners[1]?.id ?? fixtures.realOwners[0].id),
  'fixture-owner': read(fixtures.ownerId),
  alias: read(fixtures.aliasId),
  member: read(fixtures.memberId),
  foreign: read(fixtures.foreignId),
  'read-no-profile': read(),
};
const base = {agentId: 'makaron', includeLastMessage: false};
// sessions.list defaults to 100 rows; whole-store callers pass a large limit.
const everything = {...base, limit: 5000};
const summarize = result => {
  const sessions = result.response.payload?.sessions ?? [];
  const tally = field => sessions.reduce((out, row) => { const value = String(row[field] ?? '(none)'); out[value] = (out[value] ?? 0) + 1; return out; }, {});
  return {ok: result.response.ok, error: result.response.error ?? null, count: result.response.payload?.count, rows: sessions.length, visibility: tally('visibility'), sharingRole: tally('sharingRole'), sharingSpans: result.sharingSpans, placementCalls: result.placementCalls};
};

if (mode === 'matrix') {
  const params = {
    'limit-50': {...base, limit: 50},
    all: everything,
    'lifecycle-only': {...everything, lifecycleOnly: true},
    'involving-me': {...base, limit: 200, involvingMe: true},
    'owner-first': {...base, limit: 200, ownerFirst: true},
    'offset-100': {...base, limit: 100, offset: 100},
    'configured-agents': {includeLastMessage: false, configuredAgentsOnly: true, limit: 50},
  };
  const cases = [];
  for (const [clientName, client] of Object.entries(clients)) for (const [paramsName, p] of Object.entries(params)) cases.push({name: `${clientName}/${paramsName}`, client, params: p});
  // Semantic writes by another connection after selection and before sharing.
  const db = external();
  const sharedKey = fixtures.sessions.shared;
  // Like a native accessor write: JSON change plus validation mark in one transaction
  // (the AFTER UPDATE OF entry_json trigger resets entry_valid to pending).
  const setVisibility = value => {
    db.exec('BEGIN IMMEDIATE');
    db.prepare("UPDATE session_nodes SET entry_json=json_set(entry_json,'$.visibility',?) WHERE session_key=?").run(value, sharedKey);
    db.prepare('UPDATE session_nodes SET entry_valid=1 WHERE session_key=?').run(sharedKey);
    db.exec('COMMIT');
  };
  for (const clientName of ['admin', 'foreign', 'fixture-owner']) cases.push({name: `${clientName}/midway-visibility-draft`, client: clients[clientName], params: {...base, limit: 50}, hook: () => setVisibility('draft'), restore: () => setVisibility('shared')});
  const readonlyKey = fixtures.sessions['read-only'];
  cases.push({name: 'member/midway-member-revoked', client: clients.member, params: {...base, limit: 50}, hook: () => db.prepare('DELETE FROM session_members WHERE session_key=? AND identity_id=?').run(readonlyKey, fixtures.memberId), restore: () => db.prepare('INSERT INTO session_members(session_key,identity_id,added_by,added_at) VALUES(?,?,?,?)').run(readonlyKey, fixtures.memberId, fixtures.ownerId, 1)});
  for (const clientName of ['admin', 'real-owner', 'foreign']) cases.push({name: `${clientName}/midway-unrelated-commit`, client: clients[clientName], params: {...base, limit: 500}, hook: schemaCommit(db)});
  const results = [];
  for (const item of cases) {
    let hooked = false;
    const result = await call(item.params, item.client, {onSharingStart: item.hook && (() => { hooked = true; item.hook(); })});
    item.restore?.();
    if (item.hook && result.sharingSpans) assert(hooked, `${item.name} hook ran`);
    // Full pages are large; keep only per-row digests for locating any difference.
    const stable = stablePayload(result.response);
    const {sessions = [], ...envelope} = stable.payload;
    const rowDigests = sessions.map(row => [row.key, digest(row).slice(0, 16)]);
    results.push({name: item.name, payloadSha256: digest(stable), envelopeSha256: digest({...stable, payload: envelope}), envelope: {...stable, payload: envelope}, rowDigests, midwayCommit: hooked, ...summarize(result)});
  }
  db.close();
  fs.writeFileSync(path.join(outDir, 'matrix.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({mode, cases: results.length}));
  process.exit(0);
}

if (mode === 'perf') {
  const repeats = Number(process.env.SHARING_REBASE_REPEATS ?? 5);
  const scenarios = [
    ['admin/limit-25', clients.admin, {...base, limit: 25}],
    ['admin/limit-500', clients.admin, {...base, limit: 500}],
    ['admin/all', clients.admin, everything],
    ['real-owner/all', clients['real-owner'], everything],
    ['foreign/all', clients.foreign, everything],
    ['admin/all-lifecycle-only', clients.admin, {...everything, lifecycleOnly: true}],
    ['real-owner/all-lifecycle-only', clients['real-owner'], {...everything, lifecycleOnly: true}],
  ];
  const db = external();
  const results = [];
  for (const regime of ['quiet', 'midway-commit', 'continuous-writer']) {
    let writer, control;
    if (regime === 'continuous-writer') {
      control = new Int32Array(new SharedArrayBuffer(5 * 4));
      writer = new Worker(`
        const {workerData} = require('node:worker_threads');
        const {DatabaseSync} = require('node:sqlite');
        const control = new Int32Array(workerData.shared), db = new DatabaseSync(workerData.file);
        db.exec('PRAGMA busy_timeout=5000');
        const statement = db.prepare("UPDATE session_nodes SET entry_json=json_set(entry_json,'$.abChurn',?) WHERE session_key=?");
        const validate = db.prepare('UPDATE session_nodes SET entry_valid=1 WHERE session_key=?');
        Atomics.store(control, 0, 1); Atomics.notify(control, 0);
        try { while (!Atomics.load(control, 1)) { db.exec('BEGIN IMMEDIATE'); statement.run(Atomics.add(control, 2, 1), workerData.key); validate.run(workerData.key); db.exec('COMMIT'); Atomics.wait(control, 1, 0, 5); } }
        catch { Atomics.store(control, 3, 1); }
        db.close(); Atomics.store(control, 4, 1); Atomics.notify(control, 4);
      `, {eval: true, workerData: {file, shared: control.buffer, key: fixtures.churnKey}});
      Atomics.wait(control, 0, 0, 10000);
      assert.equal(Atomics.load(control, 0), 1, 'writer started');
    }
    for (const [name, client, params] of scenarios) {
      const samples = [];
      for (let index = 0; index <= repeats; index++) {
        const commitsBefore = control ? Atomics.load(control, 2) : 0;
        const result = await call(params, client, regime === 'midway-commit' ? {onSharingStart: schemaCommit(db)} : {});
        assert(result.response.ok, `${name} ok: ${JSON.stringify(result.response.error)}`);
        if (index === 0) continue; // warmup
        samples.push({totalMs: result.totalMs, sharingMs: result.sharingMs, storeLoadMs: result.storeLoadMs, sharingSpans: result.sharingSpans, placementCalls: result.placementCalls, stats: result.sharingStats ?? null, rows: result.response.payload.sessions.length, payloadSha256: digest(stablePayload(result.response)), writerCommits: control ? Atomics.load(control, 2) - commitsBefore : 0});
      }
      results.push({regime, name, samples});
    }
    if (writer) {
      Atomics.store(control, 1, 1); Atomics.notify(control, 1);
      Atomics.wait(control, 4, 0, 10000);
      assert.equal(Atomics.load(control, 3), 0, 'writer never failed');
      await writer.terminate();
    }
  }
  db.close();
  fs.writeFileSync(path.join(outDir, 'perf.json'), JSON.stringify(results, null, 2));
  console.log(JSON.stringify({mode, scenarios: results.length}));
  process.exit(0);
}
throw new Error(`unknown mode ${mode}`);
