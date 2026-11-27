import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER } from './patch-subagent-tree-read.mjs';
import { OUTPUT_DIR, PLAN } from './build-subagent-tree-read.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const out = Object.fromEntries(FILES.map((f) => [f.name, read(`${OUTPUT_DIR}/${f.name}`)]));
const registryRead = out['subagent-registry-read-UaDFTyfW.js'];

function extract(source, name) {
  const start = source.indexOf(`function ${name}(`);
  assert(start >= 0, name);
  let depth = 0;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && (depth -= 1) === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated ${name}`);
}

// The release function, with the module bindings it reads supplied by the test.
const makeTreeRead = new Function('deps', `
  const { shouldReadPersistedSubagentRuns, getFreshPersistedSubagentRunsSnapshot, persistedSubagentRunsReadCache,
    __strLoadTreeEdges, loadSubagentRunsForChildSessionFromSqlite, getSubagentRunsSnapshotForRead } = deps;
  ${extract(registryRead, 'indexLiveSubagentRunsForTree')}
  ${extract(registryRead, 'compareSubagentRunStorageOrder')}
  ${extract(registryRead, 'getSubagentRunsSnapshotForSessionTrees')}
  return getSubagentRunsSnapshotForSessionTrees;`);

function prng(seed) {
  let state = seed >>> 0;
  return () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

function registry(seed) {
  const random = prng(seed);
  const pick = (items) => items[Math.floor(random() * items.length)];
  const sessions = ['agent:main:main', 'agent:main:feishu:group:a', 'agent:ops:main'];
  const children = [];
  const table = [];
  for (let i = 0; i < 140; i += 1) {
    const requester = pick(sessions);
    const reuse = children.length > 0 && random() < 0.25;
    const child = reuse ? pick(children) : `agent:main:subagent:c${i}`;
    if (!reuse) { children.push(child); sessions.push(child); }
    const roll = random();
    table.push({
      runId: `r${String(i).padStart(3, '0')}${pick(['a', 'B', '_'])}`,
      childSessionKey: child,
      requesterSessionKey: requester,
      ...(roll < 0.5 ? {} : { controllerSessionKey: roll < 0.75 ? requester : pick(sessions) }),
      createdAt: 1000 + Math.floor(random() * 6),
    });
  }
  const memory = new Map();
  for (const row of table) if (random() < 0.3) memory.set(row.runId, { ...row, ...(random() < 0.4 ? { controllerSessionKey: pick(sessions) } : {}) });
  for (let i = 0; i < 10; i += 1) {
    const child = random() < 0.5 ? pick(children) : `agent:main:subagent:live${i}`;
    memory.set(`live${i}`, { runId: `live${i}`, childSessionKey: child, requesterSessionKey: pick(sessions), createdAt: 2000 });
    sessions.push(child);
  }
  return { table, memory, sessions: [...new Set(sessions)] };
}

const storageOrder = (a, b) => a.createdAt - b.createdAt || (a.runId < b.runId ? -1 : a.runId > b.runId ? 1 : 0);

// The full snapshot as V's getSubagentRunsSnapshotForRead builds it: persisted rows in storage order, live
// memory replacing a run in place, live-only runs appended in memory order.
function fullSnapshot({ table, memory }) {
  const merged = new Map(table.toSorted(storageOrder).map((row) => [row.runId, { ...row }]));
  for (const [runId, entry] of memory) merged.set(runId, entry);
  return merged;
}

// The closure by brute force over the full snapshot: a visited session's requested/controlled runs, every
// generation of the children those runs name, and those children as visited sessions; repeated to a fixed point.
function bruteClosure(full, roots) {
  const visited = new Set(roots.map((r) => r.trim()).filter(Boolean));
  const children = new Set();
  const taken = new Set();
  for (let changed = true; changed;) {
    changed = false;
    for (const entry of full.values()) {
      const edge = visited.has(entry.requesterSessionKey) || visited.has(entry.controllerSessionKey?.trim());
      if ((edge || children.has(entry.childSessionKey)) && !taken.has(entry.runId)) {
        taken.add(entry.runId);
        children.add(entry.childSessionKey);
        visited.add(entry.childSessionKey);
        changed = true;
      }
    }
  }
  return new Map([...full].filter(([runId]) => taken.has(runId)));
}

function deps({ table }, overrides = {}) {
  const calls = { full: 0, edges: 0, generations: 0 };
  const rows = (filter) => table.filter(filter).toSorted(storageOrder).map((row) => ({ ...row }));
  return {
    calls,
    shouldReadPersistedSubagentRuns: () => true,
    getFreshPersistedSubagentRunsSnapshot: () => null,
    persistedSubagentRunsReadCache: {},
    __strLoadTreeEdges: (key) => { calls.edges += 1; return rows((e) => e.requesterSessionKey === key || e.controllerSessionKey === key); },
    loadSubagentRunsForChildSessionFromSqlite: (key) => { calls.generations += 1; return rows((e) => e.childSessionKey === key); },
    getSubagentRunsSnapshotForRead: () => { calls.full += 1; return new Map(); },
    ...overrides,
  };
}

test('plan replaces four files by V bytes and rebuilds byte-identically', () => {
  assert.deepEqual(plan.files, FILES.map((f) => ({ source: `${OUTPUT_DIR}/${f.name}`, target: `${f.target}/${f.name}`, before: f.before })));
  for (const f of FILES) {
    const base = read(`${f.base}/${f.name}`);
    assert.equal(sha(base), f.before, f.name);
    assert.equal(f.patch(base), out[f.name], `${f.name} rebuilds`);
    assert(out[f.name].includes(MARKER), f.name);
    assert.throws(() => f.patch(out[f.name]), /already applied/u, f.name);
    const r = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, f.name)], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  }
});

test('the session-tree snapshot is the full snapshot restricted to the closure, in the same order', () => {
  for (let seed = 1; seed <= 25; seed += 1) {
    const reg = registry(seed);
    const full = fullSnapshot(reg);
    const d = deps(reg);
    const treeRead = makeTreeRead(d);
    for (const roots of [...reg.sessions.map((s) => [s]), reg.sessions.slice(3, 9), [' agent:main:main ', ''], ['agent:none']]) {
      const expected = bruteClosure(full, roots);
      const actual = treeRead(reg.memory, roots);
      assert.deepEqual([...actual.keys()], [...expected.keys()], `seed ${seed} roots ${roots}`);
      for (const [runId, entry] of actual) assert.deepEqual(entry, expected.get(runId));
      for (const [runId, entry] of actual) if (reg.memory.has(runId)) assert.equal(entry, reg.memory.get(runId), 'live memory wins by identity');
    }
    assert.equal(d.calls.full, 0);
  }
});

test('switch, fresh full cache, no persisted reads and disk errors behave like the full read', () => {
  const reg = registry(7);
  const fullMap = new Map([['x', { runId: 'x' }]]);
  const saved = process.env.OPENCLAW_V_SUBAGENT_TREE_READ;
  try {
    process.env.OPENCLAW_V_SUBAGENT_TREE_READ = '0';
    const off = deps(reg, { getSubagentRunsSnapshotForRead: () => fullMap });
    assert.equal(makeTreeRead(off)(reg.memory, ['agent:main:main']), fullMap);
    assert.equal(off.calls.edges, 0);
  } finally {
    if (saved === undefined) delete process.env.OPENCLAW_V_SUBAGENT_TREE_READ; else process.env.OPENCLAW_V_SUBAGENT_TREE_READ = saved;
  }
  const fresh = deps(reg, { getFreshPersistedSubagentRunsSnapshot: () => new Map(), getSubagentRunsSnapshotForRead: () => fullMap });
  assert.equal(makeTreeRead(fresh)(reg.memory, ['agent:main:main']), fullMap, 'a fresh full snapshot is reused');
  assert.equal(fresh.calls.edges, 0);
  const memoryOnly = { table: [], memory: reg.memory, sessions: reg.sessions };
  const expected = bruteClosure(fullSnapshot(memoryOnly), ['agent:main:main']);
  const noDisk = deps(reg, { shouldReadPersistedSubagentRuns: () => false });
  assert.deepEqual([...makeTreeRead(noDisk)(reg.memory, ['agent:main:main']).keys()], [...expected.keys()]);
  const broken = deps(reg, { __strLoadTreeEdges: () => { throw new Error('SQLITE_BUSY'); } });
  assert.deepEqual([...makeTreeRead(broken)(reg.memory, ['agent:main:main']).keys()], [...expected.keys()], 'disk errors fall back to memory');
  assert.equal(makeTreeRead(deps(reg))(reg.memory, []).size, 0);
});

test('callers root the tree at the caller, the listed children and the descendant root; the list reads exact session rows', () => {
  const scope = out['subagent-control-scope-DA4oSvgr.js'];
  assert.match(scope, /const snapshot = getSubagentRunsSnapshotForSessionTrees\(subagentRuns, \[key\]\);/u);
  assert.doesNotMatch(scope, /getSubagentRunsSnapshotForRead\(/u);
  const list = out['subagent-list-BS8F5xN_.js'];
  assert.match(list, /buildLatestSubagentRunIndex\(getSubagentRunsSnapshotForSessionTrees\(subagentRuns, params\.runs\.map\(\(entry\) => entry\.childSessionKey\)\)\)/u);
  assert.match(list, /loadExactSessionEntryReadOnly\(\{\n\t\t\tstorePath,\n\t\t\tsessionKey: params\.key\n\t\t\}\)\?\.entry/u);
  assert.match(list, /if \(process\.env\.OPENCLAW_V_SUBAGENT_TREE_READ !== "0"\) \{/u);
  for (const fn of ['countActiveDescendantRunsFromRuns', 'listDescendantRunsForRequesterFromRuns', 'countPendingDescendantRunsFromRuns']) {
    assert(registryRead.includes(`return ${fn}(getSubagentRunsSnapshotForSessionTrees(subagentRuns, [rootSessionKey]), rootSessionKey);`), fn);
  }
  assert.match(registryRead, /hasDescendantRunAwaitingSettleFromRuns\(process\.env\.OPENCLAW_V_SUBAGENT_TREE_READ === "0" \? getSubagentSessionListRunsSnapshotForRead\(subagentRuns\) : getSubagentRunsSnapshotForSessionTrees\(subagentRuns, \[rootSessionKey\]\)/u);
  assert.match(registryRead, /export \{ getSubagentRunsSnapshotForSessionTrees \};\n$/u);
  const store = out['subagent-registry.store.sqlite-hzGu4QSk.js'];
  assert.match(store, /else if \(scope\?\.kind === "tree-edge"\) query = query\.where\(\(eb\) => eb\.or\(\[eb\("requester_session_key", "=", scope\.sessionKey\), eb\("controller_session_key", "=", scope\.sessionKey\)\]\)\);/u);
  assert.match(store, /export \{ loadSubagentRunTreeEdgesFromSqlite \};\n$/u);
});
