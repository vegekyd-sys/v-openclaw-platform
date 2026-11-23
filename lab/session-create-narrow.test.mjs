import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER, patchAccessor, patchCreateService, patchStoreUtils } from './patch-session-create-narrow.mjs';
import { OUTPUT_DIR, PLAN } from './build-session-create-narrow.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const out = Object.fromEntries(FILES.map((f) => [f.name, read(`${OUTPUT_DIR}/${f.name}`)]));
const accessor = out['session-accessor-K0XuW6ln.js'];

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

test('plan replaces three files by V bytes and rebuilds byte-identically', () => {
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

test('creation reads candidate rows, passes the label helper and skips entry counts; the switch restores V', () => {
  assert.match(accessor, /const store = Object\.fromEntries\(\(narrow \? loadSessionCreateCandidateEntries\(storeScope, scope\.sessionKey\) : listSessionEntriesCore\(storeScope\)\)/u);
  assert.match(accessor, /\.\.\.narrow \? \{ isSessionLabelInUse: \(label, exceptKey\) => isSessionCreateLabelInUse\(storeScope, label, exceptKey\) \} : \{\}/u);
  assert.match(accessor, /skipMaintenance: true,\n\t\t\.\.\.sessionCreateNarrowEnabled\(\) \? \{ skipEntryCounts: true \} : \{\},/u);
  assert.match(accessor, /const countEntries = projected\.runOwnedInternalRemovalsOnly !== true && params\.skipEntryCounts !== true;/u);
  // incognito stores and OPENCLAW_V_SESSION_CREATE_NARROW=0 keep the full listing
  assert.match(accessor, /const narrow = sessionCreateNarrowEnabled\(\) && !isIncognitoSessionKey\(scope\.sessionKey\);/u);
  const enabled = new Function(`${extract(accessor, 'sessionCreateNarrowEnabled')}\nreturn sessionCreateNarrowEnabled;`)();
  const saved = process.env.OPENCLAW_V_SESSION_CREATE_NARROW;
  try {
    delete process.env.OPENCLAW_V_SESSION_CREATE_NARROW; assert.equal(enabled(), true);
    process.env.OPENCLAW_V_SESSION_CREATE_NARROW = '0'; assert.equal(enabled(), false);
  } finally {
    if (saved === undefined) delete process.env.OPENCLAW_V_SESSION_CREATE_NARROW; else process.env.OPENCLAW_V_SESSION_CREATE_NARROW = saved;
  }
  const service = out['session-create-service--hv2vsLh.js'];
  assert.match(service, /async \(\{ existingEntry, sessionEntries, isSessionLabelInUse \}\) => \{/u);
  assert.match(service, /isLabelInUse: \(label\) => typeof isSessionLabelInUse === "function" \? isSessionLabelInUse\(label, target\.canonicalKey\) : Object\.entries\(sessionEntries\)/u);
  const utils = out['session-utils-store-Dlphca2N.js'];
  assert.match(utils, /\.\.\.params,\n\t\t\/\/ session-create-narrow-v1[^\n]*\n\t\t\.\.\.process\.env\.OPENCLAW_V_SESSION_CREATE_NARROW !== "0" && params\.exactRead === void 0 \? \{ exactRead: true \} : \{\},\n\t\tprojection: "list"/u);
});

// ---- behaviour of the accessor helpers, against an in-memory session_nodes table ----------------------------
// A minimal stand-in for the kysely-sync calls the helpers make: selectFrom/select/where/orderBy build a query
// object; iterate/execute evaluate it over `rows`.
function fakeDb(rows) {
  const reads = [];
  const query = (q = {}) => ({
    selectFrom: (table) => query({ ...q, table }),
    select: (cols) => query({ ...q, cols: [...(q.cols ?? []), ...[cols].flat()] }),
    where: (...args) => query({ ...q, wheres: [...(q.wheres ?? []), args] }),
    orderBy: (col) => query({ ...q, orderBy: col }),
    q,
  });
  const matches = (row, w) => {
    const [col, op, value] = w;
    if (op === 'in') return value.includes(row[col]);
    if (op === '=') return row[col] === value;
    if (op === '!=') return row[col] !== value;
    throw new Error(op);
  };
  const eb = Object.assign((col, op, value) => (row) => matches(row, [col, op, value]), { or: (preds) => preds });
  const run = ({ q }) => {
    const selected = rows.filter((row) => (q.wheres ?? []).every((w) => (typeof w[0] === 'function' ? w[0](eb).some((p) => p(row)) : matches(row, w))));
    const ordered = q.orderBy ? selected.toSorted((a, b) => Buffer.compare(Buffer.from(a.session_key), Buffer.from(b.session_key))) : selected;
    reads.push({ cols: q.cols, wheres: (q.wheres ?? []).map((w) => (typeof w[0] === 'function' ? 'or' : `${w[0]} ${w[1]} ${Array.isArray(w[2]) ? `[${w[2].join(',')}]` : w[2]}`)), n: ordered.length });
    return ordered.map((row) => Object.fromEntries((q.cols ?? []).map((c) => [c, row[c]])));
  };
  return { reads, query, run };
}

function helpers(rows, options = {}) {
  const db = fakeDb(rows);
  const database = { db: { isTransaction: false }, agentId: 'makaron' };
  const calls = { full: 0, deferred: 0, canonical: 0 };
  const deps = {
    isInternalSessionEffectsKey: (key) => key.includes(':internal-effects:'),
    iterateSqliteQuerySync: (_db, q) => db.run(q),
    executeSqliteQuerySync: (_db, q) => ({ rows: db.run(q) }),
    getSessionKysely: () => db.query(),
    __scnSelectSessionEntryRows: () => db.query().selectFrom('session_nodes').select(['session_key', 'entry_json']),
    parseSessionEntryJson: (row) => { try { const e = JSON.parse(row.entry_json); return e && typeof e === 'object' && e.sessionId ? e : null; } catch { return null; } },
    __scnProjectParticipants: (_db, parsed) => new Map([...parsed].map(([k, e]) => [k, { ...e, participants: [] }])),
    Buffer$1: Buffer,
    __scnResolveDeliveryProvenKey: options.resolveKey ?? ((key) => key),
    __scnCanonicalMigrationError: (message) => new Error(message),
    openOpenClawAgentDatabase: () => database,
    toDatabaseOptions: (scope) => scope,
    resolveSqliteScope: (scope) => scope,
    assertCanonicalSqliteSessionKeysCurrent: () => { calls.canonical += 1; },
    runSqliteDeferredTransactionSync: (_db, fn) => { calls.deferred += 1; return fn(); },
    // the real ones lowercase outside opaque peer spans and trim; enough for the selection rule
    normalizeStoreSessionKey: (key) => key.trim().replace(/^(agent:[^:]+:[^:]+:)/iu, (m) => m.toLowerCase()),
    collectSessionEntryLookupKeys: (_db, key) => [key.trim(), key.trim().toLowerCase()],
    listSessionEntriesCore: () => { calls.full += 1; return rows.flatMap((row) => { const e = deps.parseSessionEntryJson(row); return e ? [{ sessionKey: row.session_key, entry: e }] : []; }); },
  };
  const names = ['sessionCreateNarrowFoldKey', 'readSessionCreateEntriesForKeys', 'withSessionCreateDatabase', 'loadSessionCreateCandidateEntries', 'isSessionCreateLabelInUse'];
  const body = `${names.map((n) => extract(accessor, n)).join('\n')}\nreturn { ${names.join(', ')} };`;
  return { ...new Function(...Object.keys(deps), body)(...Object.values(deps)), reads: db.reads, calls };
}

const node = (key, entry, extra = {}) => ({ session_key: key, entry_json: JSON.stringify(entry), entry_valid: 1, label: typeof entry.label === 'string' && entry.label.trim() ? entry.label.trim() : null, ...extra });

test('candidate entries: only keys the resolver can consult are read, in SQLite key order, with the listing checks', () => {
  const target = 'agent:makaron:dashboard:Abc';
  const rows = [
    node('agent:makaron:dashboard:zzz', { sessionId: 's1', label: 'other' }),
    node(target, { sessionId: 's2' }),
    node('AGENT:MAKARON:DASHBOARD:Abc', { sessionId: 's3' }), // normalizes to the target
    node('agent:makaron:dashboard:abc', { sessionId: 's4' }), // folded alias
    node('agent:makaron:dashboard:ABC', { sessionId: 's5' }), // same fold, different opaque id: not consulted
    node('agent:makaron:internal-effects:x', { sessionId: 's6' }),
    node('agent:makaron:dashboard:broken', { sessionId: 's7' }, { entry_json: '{not json' }),
  ];
  const h = helpers(rows);
  const got = h.loadSessionCreateCandidateEntries({ agentId: 'makaron' }, ` ${target} `);
  assert.deepEqual(got.map((e) => e.sessionKey), ['AGENT:MAKARON:DASHBOARD:Abc', target, 'agent:makaron:dashboard:abc']);
  assert.deepEqual(got.map((e) => e.entry.participants), [[], [], []], 'participants projected as in the listing');
  assert.equal(h.calls.full, 0, 'never the full listing');
  assert.equal(h.calls.canonical, 1);
  assert.equal(h.calls.deferred, 1, 'keys and rows from one snapshot');
  // first read: keys only; second: entry rows for the three candidates only
  assert.deepEqual(h.reads.map((r) => r.cols), [['session_key'], ['session_key', 'entry_json', 'updated_at']]);
  assert.equal(h.reads[1].n, 3);

  const bad = helpers(rows, { resolveKey: (key) => (key === target ? 'agent:makaron:dashboard:elsewhere' : key) });
  assert.throws(() => bad.loadSessionCreateCandidateEntries({}, target), /non-canonical persisted row resolves to session key agent:makaron:dashboard:elsewhere/u);
});

test('label in use: label column plus every entry_valid != 1 row, decided by the parsed entry label', () => {
  const rows = [
    node('agent:makaron:dashboard:a', { sessionId: 'a', label: 'Skill gate: x' }),
    node('agent:makaron:dashboard:b', { sessionId: 'b', label: 'other' }),
    node('agent:makaron:dashboard:pending', { sessionId: 'p', label: 'pending label' }, { entry_valid: 0, label: null }),
    node('agent:makaron:dashboard:col-only', { sessionId: 'c', label: ' spaced ' }),
    node('agent:makaron:internal-effects:z', { sessionId: 'z', label: 'internal' }),
  ];
  const h = helpers(rows);
  const inUse = (label, except = 'agent:makaron:dashboard:new') => h.isSessionCreateLabelInUse({ agentId: 'makaron' }, label, except);
  assert.equal(inUse('Skill gate: x'), true);
  assert.equal(inUse('Skill gate: x', 'agent:makaron:dashboard:a'), false, 'the session itself does not count');
  assert.equal(inUse('pending label'), true, 'rows with entry_valid != 1 are read whole');
  assert.equal(inUse('spaced'), false, 'column matches, entry.label (" spaced ") does not: same answer as V');
  assert.equal(inUse('internal'), false, 'internal-effects keys are not listed sessions');
  assert.equal(inUse('free'), false);
  assert.equal(h.calls.full, 0);
  // a label the column cannot answer exactly falls back to the full listing, as V did
  assert.equal(inUse(' spaced '), true);
  assert.equal(h.calls.full, 1);
  assert.equal(inUse(''), false);
  assert.equal(h.calls.full, 2);
});
