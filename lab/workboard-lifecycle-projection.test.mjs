import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
const read = name => fs.readFileSync(new URL('./release-files/' + name, import.meta.url), 'utf8');
const sql = read('lifecycle-sqlite-store.js'), api = read('lifecycle-runtime-api.js'), ext = read('lifecycle-workboard-index.js');
const fn = (s, name) => {const m = s.match(new RegExp('^function ' + name + '\\([^\\n]*\\) \\{[\\s\\S]*?^\\}', 'm')); assert(m, name); return m[0];};
const projectBody = fn(sql, 'readCardLifecycleLink');
const project = new Function(['parseJson', 'stringValue', 'numberValue', 'requiredString', 'readCardLifecycleLink'].map(n => fn(sql, n)).join('\n') + '\nreturn readCardLifecycleLink;')();
const match = new Function(['cardSessionKey', 'cardRunId', 'cardBoardId', 'sanitizeSessionSegment', 'workboardSessionKeyForCard', 'sessionKeyMatchesCard', 'workboardCardMatchesLifecycleLink'].map(n => fn(api, n)).join('\n') + '\nreturn workboardCardMatchesLifecycleLink;')();
const method = (s, name) => {const m = s.match(new RegExp('\\tasync ' + name + '\\([^\\n]*\\) \\{[\\s\\S]*?\\n\\t\\}')); assert(m, name); return m[0];};
const methodBody = method(api, 'listLifecycleCandidates');
const candidates = new Function('workboardCardMatchesLifecycleLink', 'return ({' + methodBody + '}).listLifecycleCandidates;')(match);
const nativeMethod = new Function('readCardLifecycleLink', 'return ({' + method(sql, 'listLifecycleLinks') + '}).listLifecycleLinks;')(project);
const row = (id, fields = {}) => ({id, agent_id: null, session_key: null, run_id: null, execution_id: null, execution_session_key: null, execution_run_id: null, automation_json: null, archived_at: null, ...fields});
test('projection preserves native primary/execution precedence and generated-link inputs', () => {
  assert.deepEqual(project(row('id', {agent_id: 'a', session_key: 'primary', run_id: 'r1', execution_id: 'e', execution_session_key: 'secondary', execution_run_id: 'r2', automation_json: '{"boardId":"b"}', archived_at: 0})), {id: 'id', agentId: 'a', sessionKey: 'primary', runId: 'r1', execution: {sessionKey: 'secondary', runId: 'r2'}, metadata: {automation: {boardId: 'b'}, archivedAt: 0}});
  const absent = project(row('id', {execution_id: '', execution_session_key: 'ignored'})); assert(!absent.execution);
  assert.throws(() => project(row('id', {automation_json: '{broken'})));
});
for (const [name, fields, source, expected] of [
  ['primary match', {session_key: 's', run_id: 'r'}, {sessionKey: 's', runId: 'r'}, true],
  ['run mismatch', {session_key: 's', run_id: 'old'}, {sessionKey: 's', runId: 'new'}, false],
  ['session mismatch', {session_key: 'old', run_id: 'r'}, {sessionKey: 'new', runId: 'r'}, false],
  ['run only', {run_id: 'r'}, {runId: 'r'}, true],
  ['no source', {}, {}, false],
  ['execution fallback', {execution_id: 'e', execution_session_key: 's', execution_run_id: 'r'}, {sessionKey: 's', runId: 'r'}, true],
  ['primary beats execution', {session_key: 'primary', execution_id: 'e', execution_session_key: 'secondary'}, {sessionKey: 'secondary'}, false],
  ['generated scoped key', {agent_id: 'a', automation_json: '{"boardId":"b"}'}, {sessionKey: 'agent:a:subagent:workboard-b-id'}, true],
  ['generated unscoped alias', {automation_json: '{"boardId":"b"}'}, {sessionKey: 'agent:a:subagent:workboard-b-id'}, true],
  ['linked unscoped alias', {session_key: 'subagent:workboard-b-id'}, {sessionKey: 'agent:a:subagent:workboard-b-id'}, true],
  ['placeholder run with key', {session_key: 's', run_id: 'workboard:id:prepared'}, {sessionKey: 's', runId: 'actual'}, true],
  ['placeholder run without key', {run_id: 'workboard:id:prepared'}, {sessionKey: 'unrelated', runId: 'actual'}, true],
  ['placeholder cannot ignore linked key', {session_key: 's', run_id: 'workboard:id:prepared'}, {sessionKey: 'other', runId: 'actual'}, false],
]) test('native lifecycle matching: ' + name, () => assert.equal(match(project(row('id', fields)), source), expected));
test('native link scan reads only parent link columns, never child tables or large notes', async () => {
  let calls = 0;
  const result = await nativeMethod.call({db: {prepare: query => {
    calls++; assert(query.startsWith('SELECT id, agent_id, session_key, run_id,'));
    assert(query.endsWith('FROM workboard_cards ORDER BY created_at ASC, id ASC'));
    assert(!query.includes('*') && !query.includes('notes') && !query.includes('workboard_card_events'));
    return {all: () => [row('a', {session_key: 's'})]};
  }}});
  assert.equal(calls, 1); assert.deepEqual(result, [project(row('a', {session_key: 's'}))]);
});
test('only matched, unarchived IDs hydrate through the existing sorted list path', async () => {
  const records = [row('a', {session_key: 's'}), row('b', {session_key: 'other'}), row('c', {session_key: 's', archived_at: 7})].map(project);
  const value = [{id: 'a', notes: 'native full card'}];
  assert.equal(await candidates.call({cardStore: {listLifecycleLinks: async () => records}, list: async options => {assert.deepEqual(options, {cardIds: ['a']}); return value;}}, {sessionKey: 's'}), value);
});
test('unsupported stores use the unchanged full list; database failures are not hidden', async () => {
  const value = [{id: 'a'}];
  assert.equal(await candidates.call({list: async () => value}, {}), value);
  const error = new Error('native database unavailable');
  await assert.rejects(candidates.call({cardStore: {listLifecycleLinks: async () => {throw error;}}, list: () => assert.fail('unsafe fallback')}, {}), e => e === error);
});
test('link changes during hydration are still filtered and use fresh association guards', async () => {
  const body = ext.match(/async function syncWorkboardLifecycleEvent\(params\) \{[\s\S]*?\n\}/)[0];
  const calls = [], run = new Function('workboardCardMatchesLifecycleLink', 'syncWorkboardCardLifecycle', 'cardSessionKey', 'cardRunId', 'return (' + body + ');')(match, async p => {calls.push(p); return true;}, c => c.sessionKey ?? c.execution?.sessionKey, c => c.runId ?? c.execution?.runId);
  const source = {sessionKey: 's', runId: 'r'}, observation = {state: 'succeeded', sourceUpdatedAt: 10};
  const changed = {id: 'a', sessionKey: 'other', runId: 'new'};
  assert.equal((await run({store: {listLifecycleCandidates: async s => {assert.equal(s, source); return [changed];}}, source, observation, now: 10})).count, 0);
  assert.equal(calls.length, 0);
  const current = {id: 'a', sessionKey: 's', runId: 'r'}; let matched;
  assert.equal((await run({store: {listLifecycleCandidates: async () => [current]}, source, observation, now: 10, onMatched: args => {matched = args.cards;}})).count, 1);
  assert.deepEqual(matched, [current]);
  assert.deepEqual(calls[0].association, {expectedSessionKey: 's', expectedRunId: 'r', sessionKey: 's', runId: 'r', acceptedAt: 10});
});
test('all existing mutations, full reads, matches, callbacks, ownership and stale rules are byte-identical', () => {
  const plan = JSON.parse(fs.readFileSync(new URL('./workboard-lifecycle-projection-plan.json', import.meta.url)));
  const originals = [
    sql.replace(projectBody + '\n', '').replace(method(sql, 'listLifecycleLinks') + '\n', ''),
    api.replace('\t\t\t...typeof store.listLifecycleLinks === "function" ? {listLifecycleLinks: async () => await store.listLifecycleLinks()} : {},\n', '').replace(methodBody + '\n', ''),
    ext.replace('const candidates = await (typeof params.store.listLifecycleCandidates === "function" ? params.store.listLifecycleCandidates(params.source) : params.store.list());\n\tconst cards = candidates.filter', 'const cards = (await params.store.list()).filter'),
  ];
  for (let i = 0; i < originals.length; i++) assert.equal(createHash('sha256').update(originals[i]).digest('hex'), plan.files[i].before);
});
