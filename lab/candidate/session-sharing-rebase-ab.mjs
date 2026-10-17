// A/B of session-sharing-bounded-reads rebuilt on V's current bytes.
// Arm "v" is the candidate runtime untouched (asserted equal to V's live bytes);
// arm "rebuilt" is a hard-linked copy of it with only the four release chunks
// replaced. Each arm runs in its own process against the same private snapshot.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual} from 'node:util';
import {patchState, patchEntry, patchUtils, patchRead} from '../patch-session-sharing-bounded-reads.mjs';

const data = process.env.VLAB_CANDIDATE_DATA, state = process.env.OPENCLAW_STATE_DIR, runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(data && state.startsWith(data + '/') && runtime);
const sha = value => createHash('sha256').update(value).digest('hex');
const timings = {}, mark = (name, started) => { timings[name] = Math.round(performance.now() - started); };

// V's live bytes on 2026-10-17 (ssh v, /opt/openclaw-experiments/db91-release-v2026.9.1-db91.6/core/dist).
const V_BYTES = {
  'session-accessor.sqlite-transcript-state-Cz9g7S9v.js': '792b1c75740b3fcc17a1708f4b55e10f206b5718f02cd94a24bf4bbcef278788',
  'session-accessor.sqlite-entry-BlklNPKQ.js': 'a15b1426ec9a328df9b4b975e9956fe2e39df3984ac93e7b655a0ba42e1da7d7',
  'session-utils-store-Dlphca2N.js': '26adfebaf50c68339e8f09456a8b03ed1382ad0e5938e007a1caa116e1c7dc39',
  'sessions-read-C6mAMxyQ.js': '36c5a27bea777b383727dc891648a288002a54864e594f6027d01d98ff0dfa22',
};
const patches = {
  'session-accessor.sqlite-transcript-state-Cz9g7S9v.js': patchState,
  'session-accessor.sqlite-entry-BlklNPKQ.js': patchEntry,
  'session-utils-store-Dlphca2N.js': patchUtils,
  'sessions-read-C6mAMxyQ.js': patchRead,
};
const vDist = path.join(runtime, 'openclaw/dist'), rebuiltRoot = path.join(runtime, 'openclaw-sharing-rebuilt'), rebuiltDist = path.join(rebuiltRoot, 'dist');
const hashes = {};
for (const [name, expected] of Object.entries(V_BYTES)) {
  const vSource = fs.readFileSync(path.join(vDist, name), 'utf8');
  assert.equal(sha(vSource), expected, `candidate runtime ${name} is V's live bytes`);
  const release = fs.readFileSync(new URL(`../release-files/session-sharing-bounded-reads/${name}`, import.meta.url), 'utf8');
  assert.equal(patches[name](vSource), release, `patcher on V bytes reproduces ${name}`);
  hashes[name] = {before: expected, after: sha(release)};
}

let started = performance.now();
console.log(execFileSync('python3', [new URL('./session-sharing-bounded-snapshot.py', import.meta.url).pathname], {encoding: 'utf8', timeout: 95000}));
mark('snapshotMs', started);
const snapshot = JSON.parse(fs.readFileSync(path.join(data, 'sharing-snapshot.json')));
const cfg = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH));
cfg.session = {...cfg.session, maintenance: {...cfg.session?.maintenance, mode: 'warn'}};
fs.writeFileSync(process.env.OPENCLAW_CONFIG_PATH, JSON.stringify(cfg));

// Same tree, same relative paths; only the four replaced files are new inodes.
fs.rmSync(rebuiltRoot, {recursive: true, force: true});
execFileSync('cp', ['-al', path.join(runtime, 'openclaw'), rebuiltRoot]);
for (const name of Object.keys(V_BYTES)) {
  fs.rmSync(path.join(rebuiltDist, name));
  fs.copyFileSync(new URL(`../release-files/session-sharing-bounded-reads/${name}`, import.meta.url), path.join(rebuiltDist, name));
  assert.equal(sha(fs.readFileSync(path.join(rebuiltDist, name))), hashes[name].after);
  assert.equal(sha(fs.readFileSync(path.join(vDist, name))), hashes[name].before, 'arm v untouched');
}

const arms = {v: vDist, rebuilt: rebuiltDist};
const work = path.join(data, 'sharing-rebase-ab'), fixturesPath = path.join(work, 'fixtures.json');
fs.mkdirSync(work, {recursive: true});
const runArm = (arm, mode, outDir, env = {}) => {
  fs.mkdirSync(outDir, {recursive: true});
  const at = performance.now();
  const output = execFileSync(process.execPath, [new URL('./session-sharing-rebase-arm.mjs', import.meta.url).pathname, arms[arm], mode, fixturesPath, outDir], {encoding: 'utf8', env: {...process.env, OPENCLAW_DIAGNOSTICS: '1', OPENCLAW_DIAGNOSTICS_TIMELINE_PATH: path.join(work, 'timeline-unused.jsonl'), ...env}, maxBuffer: 64 * 1024 * 1024, timeout: 900000});
  console.log(arm, mode, Math.round(performance.now() - at) + 'ms', output.trim().split('\n').at(-1).slice(0, 400));
};

started = performance.now();
runArm('v', 'setup', path.join(work, 'setup'));
mark('setupMs', started);
const fixtures = JSON.parse(fs.readFileSync(fixturesPath));

// Correctness: every case in both arms, twice, alternating order.
started = performance.now();
const matrix = {};
for (const [round, order] of [[0, ['v', 'rebuilt']], [1, ['rebuilt', 'v']]]) for (const arm of order) {
  const outDir = path.join(work, `matrix-${arm}-${round}`);
  runArm(arm, 'matrix', outDir);
  matrix[`${arm}-${round}`] = JSON.parse(fs.readFileSync(path.join(outDir, 'matrix.json')));
}
mark('matrixMs', started);
const difference = (left, right) => {
  if (left.payloadSha256 === right.payloadSha256) return null;
  const rows = new Map(left.rowDigests), other = new Map(right.rowDigests);
  return {
    envelope: left.envelopeSha256 === right.envelopeSha256 ? false : {left: JSON.stringify(left.envelope).slice(0, 1500), right: JSON.stringify(right.envelope).slice(0, 1500)},
    order: !isDeepStrictEqual(left.rowDigests.map(([key]) => key), right.rowDigests.map(([key]) => key)),
    onlyLeft: [...rows.keys()].filter(key => !other.has(key)).slice(0, 5),
    onlyRight: [...other.keys()].filter(key => !rows.has(key)).slice(0, 5),
    changed: [...rows].filter(([key, sha]) => other.has(key) && other.get(key) !== sha).map(([key]) => key).slice(0, 5),
  };
};
const cases = matrix['v-0'].map((row, index) => {
  const others = ['rebuilt-0', 'v-1', 'rebuilt-1'].map(key => matrix[key][index]);
  for (const other of others) assert.equal(other.name, row.name);
  const differences = others.map(other => difference(row, other));
  return {...row, rowDigests: undefined, envelope: undefined, abEqual: differences.every(found => !found), differences: differences.filter(Boolean)};
});
const unequal = cases.filter(row => !row.abEqual);
if (unequal.length) console.log(JSON.stringify({unequal: unequal.length, first: unequal.slice(0, 3).map(row => ({name: row.name, differences: row.differences}))}).slice(0, 12000));
assert.equal(unequal.length, 0, 'sessions.list results identical across arms and rounds');
const byName = Object.fromEntries(cases.map(row => [row.name, row]));
console.log('COVERAGE ' + JSON.stringify(cases.map(({name, ok, rows, visibility, sharingRole, sharingSpans, placementCalls, midwayCommit}) => ({name, ok, rows, visibility, sharingRole, sharingSpans, placementCalls, midwayCommit}))));
// Coverage must be real, not identically empty.
assert(cases.filter(row => !row.name.endsWith('/configured-agents')).every(row => row.ok), 'every makaron case answered');
// sessions.list hides internal rows (subagents, cron, heartbeats); ~830 of ~4300 are listable.
assert(byName['admin/all'].rows >= 500 && byName['admin/all'].rows > byName['admin/offset-100'].rows, 'admin sees the representative store');
assert.equal(byName['foreign/midway-visibility-draft'].sharingSpans, 2, 'midway revocation exercises the row-repair retry');
assert(byName['foreign/all'].rows < byName['admin/all'].rows, 'entry filter hides rows from a foreign user');
assert(byName['fixture-owner/limit-50'].sharingRole.owner >= 4 && byName['alias/limit-50'].sharingRole.owner >= 4, 'owner and alias resolve to owner');
assert(byName['member/limit-50'].sharingRole.member >= 1, 'member role observed');
assert.equal(byName['admin/lifecycle-only'].sharingSpans, 0, 'lifecycleOnly admin skips sharing');
assert.equal(byName['admin/lifecycle-only'].placementCalls, 0, 'lifecycleOnly admin skips placement');
assert.equal(byName['admin/all'].sharingSpans, 1);
assert.equal(byName['real-owner/lifecycle-only'].sharingSpans, 1, 'lifecycleOnly with an entry filter keeps sharing');
assert(byName['foreign/midway-visibility-draft'].midwayCommit && byName['member/midway-member-revoked'].midwayCommit);

// Performance: alternate the arm order on every round.
started = performance.now();
const perf = {v: [], rebuilt: []};
for (let round = 0; round < 2; round++) for (const arm of round % 2 ? ['rebuilt', 'v'] : ['v', 'rebuilt']) {
  const outDir = path.join(work, `perf-${arm}-${round}`);
  runArm(arm, 'perf', outDir);
  perf[arm].push(...JSON.parse(fs.readFileSync(path.join(outDir, 'perf.json'))).map(row => ({...row, round})));
}
mark('perfMs', started);
const median = values => { const sorted = values.toSorted((a, b) => a - b); const middle = sorted.length >> 1; return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2; };
const round2 = value => value == null ? null : Math.round(value * 100) / 100;
const summary = [];
for (const row of perf.v.filter(item => item.round === 0)) {
  const pick = arm => perf[arm].filter(item => item.regime === row.regime && item.name === row.name).flatMap(item => item.samples);
  const describe = samples => ({
    samples: samples.length,
    sharingMsMedian: round2(median(samples.map(s => s.sharingMs))), sharingMsMax: round2(Math.max(...samples.map(s => s.sharingMs))),
    totalMsMedian: round2(median(samples.map(s => s.totalMs))),
    sqlReadsMedian: median(samples.map(s => s.stats?.sqlReads ?? 0)), nodeRowsMedian: median(samples.map(s => s.stats?.nodeRows ?? 0)),
    participantsQueriesMedian: median(samples.map(s => s.stats?.participantsQueries ?? 0)),
    sharingSpans: [...new Set(samples.map(s => s.sharingSpans))], placementCalls: [...new Set(samples.map(s => s.placementCalls))],
    rows: [...new Set(samples.map(s => s.rows))], writerCommitsMedian: median(samples.map(s => s.writerCommits)),
  });
  const v = pick('v'), rebuilt = pick('rebuilt');
  // Quiet/midway pages are deterministic; the churn row only changes its own JSON.
  const payloadsEqual = isDeepStrictEqual([...new Set(v.map(s => s.payloadSha256))].sort(), [...new Set(rebuilt.map(s => s.payloadSha256))].sort());
  summary.push({regime: row.regime, name: row.name, payloadsEqual, v: describe(v), rebuilt: describe(rebuilt)});
}
for (const row of summary) {
  if (row.regime !== 'continuous-writer') assert(row.payloadsEqual, `${row.regime} ${row.name} payloads equal`);
  if (row.name.startsWith('admin/') && row.name.endsWith('lifecycle-only')) {
    assert.deepEqual(row.v.sharingSpans, [0]); assert.deepEqual(row.rebuilt.sharingSpans, [0]);
    assert.deepEqual(row.v.placementCalls, [0]); assert.deepEqual(row.rebuilt.placementCalls, [0]);
  }
}
const report = {
  kind: 'session-sharing-bounded-reads-rebase-ab', hashes, snapshot, fixtures: {...fixtures, ownerId: undefined, aliasId: undefined, realOwners: fixtures.realOwners.map(owner => ({sessions: owner.sessions}))},
  matrix: cases.map(({name, ok, count, rows, visibility, sharingRole, sharingSpans, placementCalls, midwayCommit, payloadSha256, abEqual}) => ({name, ok, count, rows, visibility, sharingRole, sharingSpans, placementCalls, midwayCommit, payloadSha256, abEqual})),
  perf: summary, timings, modelCalls: 0, sharedWrites: 0,
  scope: 'real sessions.list handler (store_load, rows, sharing, active-run flags) on a private metadata snapshot; no Gateway, channel or model',
};
fs.writeFileSync(path.join(data, 'session-sharing-rebase-report.json'), JSON.stringify(report, null, 2));
console.log('REPORT ' + JSON.stringify(report));
fs.rmSync(work, {recursive: true, force: true});
fs.rmSync(rebuiltRoot, {recursive: true, force: true});
process.exit(0);
