import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { BEFORE, MARKER, NAME, patchFile, sha256 } from './patch-card-memory-read-only.mjs';

const read = (path) => fs.readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');
const built = read(`lab/release-files/card-memory-read-only/${NAME}`);

test('the release file is the patch applied to V bytes, and the plan names it', () => {
  const source = read(`lab/fixtures/card-memory-read-only/${NAME}`);
  assert.equal(sha256(source), BEFORE);
  assert.equal(patchFile(source), built);
  const [entry] = JSON.parse(read('lab/card-memory-read-only.plan.json')).files;
  assert.deepEqual([entry.target, entry.before, entry.after], [`openclaw/dist/${NAME}`, BEFORE, sha256(built)]);
});

test('only Workboard card sessions are read-only', () => {
  assert.ok(built.includes(MARKER));
  const source = built.match(/function isWorkboardCardSessionKey\(sessionKey\) \{[\s\S]*?\n\}/)[0];
  const isCard = new Function(`${source}; return isWorkboardCardSessionKey;`)();
  assert.equal(isCard('agent:makaron:subagent:workboard-nightshift-062a19ca-dccb-47c1-95d1-bfe02752624c'), true);
  assert.equal(isCard('agent:v-codex:subagent:workboard-other-board-1'), true, 'any agent, any board');
  for (const key of ['agent:makaron:feishu:group:oc_x', 'agent:makaron:main', 'agent:makaron:subagent:5b0c6f0e', undefined]) {
    assert.equal(isCard(key), false, String(key));
  }
});

test('the refusal comes before provenance is recorded or the file is touched', () => {
  const write = built.slice(built.indexOf('\t\twrite: async ({ absolutePath, contentBefore, contentAfter, commit }) => {'));
  assert.ok(write.indexOf('if (cardSession) throw cardMemoryReadOnlyError(relativePath);') < write.indexOf('recordMemoryArtifactWriteProvenance('));
  const remove = built.slice(built.indexOf('...remove ? { remove: async (absolutePath) => {'));
  assert.ok(remove.indexOf('await observer.assertWritable?.(absolutePath);') < remove.indexOf('await remove(absolutePath);'));
});
