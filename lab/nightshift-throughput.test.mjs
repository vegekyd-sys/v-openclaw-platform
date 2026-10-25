import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { FILES, MARKER, patchFile, sha256 } from './patch-nightshift-throughput.mjs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const built = (name) => read(`lab/release-files/nightshift-throughput/${name}`);
const plan = JSON.parse(read('lab/nightshift-throughput.plan.json'));

test('the release files are the patch applied to V bytes, and the plan names them', () => {
  for (const [name, spec] of Object.entries(FILES)) {
    const source = read(spec.from);
    assert.equal(sha256(source), spec.before, name);
    assert.equal(patchFile(name, source), built(name), name);
    const entry = plan.files.find((file) => file.target === spec.target);
    assert.deepEqual([entry.before, entry.after], [spec.before, sha256(built(name))], name);
  }
});

test('the worker manifest accepts a pool of 24 Workers', () => {
  const schema = JSON.parse(built('openclaw.plugin.json')).configSchema.properties;
  assert.equal(schema.maxWorkers.maximum, 32);
  assert.equal(schema.warmSpareWorkers.maximum, 31);
  assert.equal(JSON.parse(read(FILES['openclaw.plugin.json'].from)).configSchema.properties.maxWorkers.maximum, 16, 'V bytes refuse 24');
});

test('card notes are cut at the board limit, not at 4,000', () => {
  const runtime = built('runtime-api-1CCazqtv.js');
  assert.match(runtime, /capText\(card\.notes, 12e3\)/);
  assert.doesNotMatch(runtime, /capText\(card\.notes, 4e3\)/);
});

test('a Workboard card session skips the memory flush; chats and other subagents do not', () => {
  const memory = built('agent-runner-memory-7VF-zwNt.js');
  assert.ok(memory.includes(MARKER));
  const source = memory.match(/function isWorkboardCardSessionKey\(sessionKey\) \{[\s\S]*?\n\}/)[0];
  const isCard = new Function(`${source}; return isWorkboardCardSessionKey;`)();
  assert.equal(isCard('agent:makaron:subagent:workboard-nightshift-062a19ca-dccb-47c1-95d1-bfe02752624c'), true);
  assert.equal(isCard(' AGENT:makaron:subagent:Workboard-nightshift-x '), true);
  for (const key of [
    'agent:makaron:feishu:group:oc_7d72b0ca19376785433d1876b24c5412',
    'agent:makaron:main',
    'agent:makaron:subagent:5b0c6f0e-8a8f-4d6e-9e5f-2f1d5a7c9b11',
    'agent:makaron:subagent:workboard-nightshift-x:thread:1',
    undefined,
  ]) assert.equal(isCard(key), false, String(key));
  // The skip sits right after the incognito skip, before any flush work or deferral.
  const body = memory.slice(memory.indexOf('async function runMemoryFlushIfNeeded(params) {'));
  assert.ok(body.indexOf('isWorkboardCardSessionKey(params.sessionKey)') < body.indexOf('const runtimeParams = {'));
});
