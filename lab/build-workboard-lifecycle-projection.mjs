// Read narrow lifecycle links first; hydrate only native-matched card IDs.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha = s => createHash('sha256').update(s).digest('hex');
const baseRelease = 'concurrency-cpu-memory-diag-v1', files = [];
const read = target => {
  const r = JSON.parse(execFileSync(process.execPath, ['/Users/tianyicai/vlab-dev/lab/vlab.mjs', 'read-code', '--target', target], {encoding: 'utf8', maxBuffer: 8 * 1024 ** 2, timeout: 120000}));
  assert.equal(r.current.release, baseRelease);
  const source = Buffer.from(r.content, 'base64').toString(); assert.equal(sha(source), r.sha256);
  return {...r, source};
};
const replaceOnce = (s, a, b) => {assert.equal(s.split(a).length, 2, 'Expected unique source anchor'); return s.replace(a, b);};
const save = (r, dest, output) => {
  fs.writeFileSync(new URL('./release-files/' + dest, import.meta.url), output);
  files.push({source: 'lab/release-files/' + dest, target: r.target, before: r.sha256});
};
const sqlite = read('openclaw/dist/sqlite-store-CH-caj1l.js');
const helper = `function readCardLifecycleLink(row) {
\tconst automation = parseJson(row.automation_json);
\treturn {
\t\tid: requiredString(row, "id"),
\t\t...stringValue(row, "agent_id") ? {agentId: stringValue(row, "agent_id")} : {},
\t\t...stringValue(row, "session_key") ? {sessionKey: stringValue(row, "session_key")} : {},
\t\t...stringValue(row, "run_id") ? {runId: stringValue(row, "run_id")} : {},
\t\t...stringValue(row, "execution_id") ? {execution: {
\t\t\t...stringValue(row, "execution_session_key") ? {sessionKey: stringValue(row, "execution_session_key")} : {},
\t\t\t...stringValue(row, "execution_run_id") ? {runId: stringValue(row, "execution_run_id")} : {}
\t\t}} : {},
\t\tmetadata: {
\t\t\t...automation ? {automation} : {},
\t\t\t...numberValue(row, "archived_at") !== void 0 ? {archivedAt: numberValue(row, "archived_at")} : {}
\t\t}
\t};
}
`;
let output = replaceOnce(sqlite.source, 'var WorkboardSqliteCardStore = class {', helper + 'var WorkboardSqliteCardStore = class {');
const linkMethod = `\tasync listLifecycleLinks() {
\t\treturn this.db.prepare("SELECT id, agent_id, session_key, run_id, execution_id, execution_session_key, execution_run_id, automation_json, archived_at FROM workboard_cards ORDER BY created_at ASC, id ASC").all().map(readCardLifecycleLink);
\t}
`;
output = replaceOnce(output, '\tasync listBoardAggregates() {', linkMethod + '\tasync listBoardAggregates() {');
save(sqlite, 'lifecycle-sqlite-store.js', output);
const api = read('openclaw/dist/runtime-api-1CCazqtv.js');
output = replaceOnce(api.source, '\t\t\tlistBoardAggregates: async () => await store.listBoardAggregates()', '\t\t\t...typeof store.listLifecycleLinks === "function" ? {listLifecycleLinks: async () => await store.listLifecycleLinks()} : {},\n\t\t\tlistBoardAggregates: async () => await store.listBoardAggregates()');
const candidateMethod = `\tasync listLifecycleCandidates(source) {
\t\tif (!this.cardStore?.listLifecycleLinks) return await this.list();
\t\tconst links = await this.cardStore.listLifecycleLinks();
\t\tconst cardIds = links.filter((card) => !card.metadata?.archivedAt && workboardCardMatchesLifecycleLink(card, source)).map((card) => card.id);
\t\treturn await this.list({cardIds});
\t}
`;
output = replaceOnce(output, '\tasync list(options = {}) {', candidateMethod + '\tasync list(options = {}) {');
save(api, 'lifecycle-runtime-api.js', output);
const ext = read('openclaw/dist/extensions/workboard/index.js');
output = replaceOnce(ext.source, 'const cards = (await params.store.list()).filter((card) => !card.metadata?.archivedAt && workboardCardMatchesLifecycleLink(card, params.source));', 'const candidates = await (typeof params.store.listLifecycleCandidates === "function" ? params.store.listLifecycleCandidates(params.source) : params.store.list());\n\tconst cards = candidates.filter((card) => !card.metadata?.archivedAt && workboardCardMatchesLifecycleLink(card, params.source));');
save(ext, 'lifecycle-workboard-index.js', output);
// Diagnostic hooks are removed in this same candidate, not left running after
// acceptance. Unimported profiler helpers are harmless code-only artifacts.
for (const [target, clean, expected] of [
  ['openclaw/dist/chat-send-handler-DBjXcn_1.js', 'chat-send-handler-DBjXcn_1.js', '99c82a810e112f097ab75a0129d80cf3d6305c7c77867504a20307a4cab9b311'],
  ['production-worker/worker.mjs', 'production-worker-worker.mjs', '4ca913d1dcffc8aac28cb02fa9e446c5f61456af1bbbab292c5eb4914cfdcc80'],
]) {
  const r = read(target), cleanSource = fs.readFileSync(new URL('./release-files/' + clean, import.meta.url), 'utf8');
  assert.equal(sha(cleanSource), expected);
  files.push({source: 'lab/release-files/' + clean, target, before: r.sha256});
}
fs.writeFileSync(new URL('./workboard-lifecycle-projection-plan.json', import.meta.url), JSON.stringify({baseRelease, files}, null, 2) + '\n');
console.log(JSON.stringify({baseRelease, files: files.length}));
