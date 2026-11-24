import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER } from './patch-workboard-list-page.mjs';
import { OUTPUT_DIR, PLAN } from './build-workboard-list-page.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const out = Object.fromEntries(FILES.map((f) => [f.name, read(`${OUTPUT_DIR}/${f.name}`)]));
const store = out['sqlite-store-CH-caj1l.js'];
const runtime = out['runtime-api-1CCazqtv.js'];
const tool = out['extensions/workboard/index.js'];

function extract(source, head) {
  const start = source.indexOf(head);
  assert(start >= 0, head);
  let depth = 0;
  for (let i = source.indexOf('{', start + head.length - 1); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}' && (depth -= 1) === 0) return source.slice(start, i + 1);
  }
  throw new Error(`unterminated ${head}`);
}

const helpers = ['function stringValue(', 'function numberValue(', 'function requiredString(', 'function requiredNumber('].map((h) => extract(store, h)).join('\n');
// WORKBOARD_STATUSES comes from another chunk; its order only has to be the same on both paths.
const statuses = 'const WORKBOARD_STATUSES = ["backlog", "todo", "ready", "running", "blocked", "review", "done"];';
const compareCards = extract(runtime, 'function compareCards(');
const cardBoardId = extract(runtime, 'function cardBoardId(');
const sortKeysMethod = extract(store, '\tasync listCardSortKeys(filter = {}) {');
const listPageMethod = extract(runtime, '\tasync listPage(filter, keep, limit) {');
const listMethod = extract(runtime, '\tasync list(options = {}) {');
// The tool's own filters, exactly as the release defines them.
const keepSource = tool.match(/const keep = \(card\) => [^\n]*;/u)?.[0];
assert(keepSource, 'keep');

// The release methods on a store whose cards are SQLite rows plus the fields the filters read.
const makeStore = new Function('db', 'cards', 'normalizeBoardId', `
  ${helpers}
  ${statuses}
  ${compareCards}
  ${cardBoardId}
  class CardStore { constructor(db) { this.db = db; }
    ${sortKeysMethod}
    async entries() { return [...cards.values()].toSorted((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)).map((card) => ({ key: card.id, value: { version: 1, card } })); }
  }
  class Store { constructor() { this.cardStore = new CardStore(db); this.store = this.cardStore; this.reads = 0; }
    async get(id) { this.reads += 1; return cards.get(id); }
    ${listMethod}
    ${listPageMethod}
  }
  return new Store();`);
const makeKeep = new Function('record', 'status', 'agentId', 'tenant', `${keepSource} return keep;`);

function prng(seed) {
  let state = seed >>> 0;
  return () => (state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32;
}

const STATUSES = ['backlog', 'todo', 'ready', 'running', 'review', 'blocked', 'done', 'weird'];
const TENANTS = ['acme', 'beta.co', 'a"b', 'x\\y', 'ü-tenant', '', undefined];

function board(seed) {
  const random = prng(seed);
  const pick = (items) => items[Math.floor(random() * items.length)];
  const db = new DatabaseSync(':memory:');
  db.exec(`CREATE TABLE workboard_cards (id TEXT PRIMARY KEY, board_id TEXT NOT NULL, status TEXT NOT NULL, agent_id TEXT,
    position REAL NOT NULL, created_at INTEGER NOT NULL, archived_at INTEGER, automation_json TEXT) STRICT`);
  const insert = db.prepare('INSERT INTO workboard_cards VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const cards = new Map();
  for (let i = 0; i < 300; i += 1) {
    const id = `c${String(Math.floor(random() * 1e6)).padStart(6, '0')}${i}`;
    const boardId = pick(['default', 'nightshift', 'nightshift', 'xiaoyuan']);
    const tenant = pick(TENANTS);
    const automation = random() < 0.15 ? undefined : { ...(boardId === 'default' && random() < 0.5 ? {} : { boardId }), ...(tenant === undefined ? {} : { tenant }), note: random() < 0.1 ? `mentions "acme" and ${JSON.stringify('beta.co')}` : 'x' };
    const card = {
      id,
      status: pick(STATUSES),
      position: pick([1000, 2000, 3000, 1500.5]),
      createdAt: 1000 + Math.floor(random() * 8),
      ...(random() < 0.7 ? { agentId: pick(['makaron', 'ops', 'ns']) } : {}),
    };
    const archivedAt = random() < 0.2 ? pick([0, 1700000000000]) : undefined;
    card.metadata = { ...(automation ? { automation } : {}), ...(archivedAt !== undefined ? { archivedAt } : {}) };
    cards.set(id, card);
    insert.run(id, automation?.boardId ?? 'default', card.status, card.agentId ?? null, card.position, card.createdAt, archivedAt ?? null, automation ? JSON.stringify(automation) : null);
  }
  return { db, cards, pick, random };
}

const normalizeBoardId = (value) => (typeof value === 'string' && value.trim() ? value.trim().toLowerCase() : undefined);

test('plan replaces three files by V bytes and rebuilds byte-identically', () => {
  assert.deepEqual(plan.files, FILES.map((f) => ({ source: `${OUTPUT_DIR}/${f.name}`, target: `${f.target}/${f.name}`, before: f.before })));
  for (const f of FILES) {
    const base = read(`${f.base}/${f.name}`);
    assert.equal(sha(base), f.before, f.name);
    assert.equal(f.patch(base), out[f.name], `${f.name} rebuilds`);
    assert(out[f.name].includes(MARKER), f.name);
    assert.throws(() => f.patch(out[f.name]), /already applied/u, f.name);
  }
});

test('listPage returns exactly list({ boardId }).filter(keep).slice(0, limit), reading only what it returns', async () => {
  for (let seed = 1; seed <= 20; seed += 1) {
    const { db, cards, pick, random } = board(seed);
    for (let round = 0; round < 40; round += 1) {
      const record = { includeArchived: random() < 0.3 };
      const boardId = pick([undefined, 'nightshift', 'default', 'xiaoyuan', 'NightShift', 'none']);
      const status = pick([undefined, undefined, ...STATUSES]);
      const agentId = pick([undefined, undefined, 'makaron', 'ops', 'nobody']);
      const tenant = pick([undefined, undefined, ...TENANTS.filter(Boolean), 'acm']);
      const limit = pick([1, 5, 20, 50, 200]);
      const keep = makeKeep(record, status, agentId, tenant);
      const s = makeStore(db, cards, normalizeBoardId);
      const expected = (await s.list({ boardId })).filter(keep).slice(0, limit);
      s.reads = 0;
      const actual = await s.listPage({ boardId, status, agentId, tenant, includeArchived: record.includeArchived === true }, keep, limit);
      const label = JSON.stringify({ seed, round, boardId, status, agentId, tenant, limit, record });
      assert.deepEqual(actual.map((c) => c.id), expected.map((c) => c.id), label);
      // a plain tenant narrows in SQL, so every card read is returned until the page is full
      if (!tenant || /^[A-Za-z0-9_.:@-]+$/u.test(tenant)) assert.equal(s.reads, actual.length, label);
    }
  }
});

test('the switch and a store without sort keys fall back to the full read', async () => {
  const { db, cards } = board(3);
  const keep = makeKeep({}, undefined, undefined, undefined);
  const s = makeStore(db, cards, normalizeBoardId);
  const saved = process.env.OPENCLAW_V_WORKBOARD_LIST_PAGE;
  try {
    process.env.OPENCLAW_V_WORKBOARD_LIST_PAGE = '0';
    const off = await s.listPage({ boardId: 'nightshift' }, keep, 7);
    assert.equal(s.reads, 0);
    assert.deepEqual(off.map((c) => c.id), (await s.list({ boardId: 'nightshift' })).filter(keep).slice(0, 7).map((c) => c.id));
  } finally {
    if (saved === undefined) delete process.env.OPENCLAW_V_WORKBOARD_LIST_PAGE; else process.env.OPENCLAW_V_WORKBOARD_LIST_PAGE = saved;
  }
  s.cardStore.listCardSortKeys = undefined;
  assert.equal((await s.listPage({}, keep, 3)).length, 3);
  assert.equal(s.reads, 0);
});

test('the tool keeps its filters and falls back when the store has no listPage; the tracker forwards the sort keys', () => {
  assert.match(tool, /const keep = \(card\) => \(record\.includeArchived === true \|\| !card\.metadata\?\.archivedAt\) && \(!status \|\| card\.status === status\) && \(!agentId \|\| card\.agentId === agentId\) && \(!tenant \|\| card\.metadata\?\.automation\?\.tenant === tenant\);/u);
  assert.match(tool, /: \(await store\.list\(\{ boardId \}\)\)\.filter\(keep\)\.slice\(0, limit\)\)\.map\(summarizeCard\);/u);
  assert.doesNotMatch(tool, /\.filter\(\(card\) => !status \|\| card\.status === status\)/u);
  assert.match(runtime, /\.\.\.typeof store\.listCardSortKeys === "function" \? \{listCardSortKeys: async \(filter\) => await store\.listCardSortKeys\(filter\)\} : \{\}/u);
  // insertCard, the only writer, keeps board_id equal to cardBoardId(card)
  assert.match(store, /board_id: cardBoardId\(card\),/u);
  assert.equal(store.match(/INSERT INTO workboard_cards \(/gu).length, 1);
  assert.doesNotMatch(store, /UPDATE workboard_cards/u);
});
