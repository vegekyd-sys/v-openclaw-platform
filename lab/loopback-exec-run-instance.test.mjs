import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER } from './patch-loopback-exec-run-instance.mjs';
import { OUTPUT_DIR, PLAN } from './build-loopback-exec-run-instance.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const read = (name) => fs.readFileSync(path.join(repo, OUTPUT_DIR, name), 'utf8');
const lines = (s) => s.split('\n');

test('plan lists the patched files with V before-bytes', () => {
  assert.deepEqual(plan.files.map((f) => f.target), FILES.map((f) => `${f.target}/${f.name}`));
  assert.deepEqual(plan.files.map((f) => f.before), FILES.map((f) => f.before));
});

for (const file of FILES) {
  test(`${file.name} carries the marker, parses, and refuses a second patch`, () => {
    const out = read(file.name);
    assert(out.includes(MARKER));
    assert.throws(() => file.patch(out), /already patched/u);
    const r = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, file.name)], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
  });
}

test('tool-resolution hands the run instance to the mediated coding tools only', () => {
  const out = read('tool-resolution-Con11qMn.js');
  const start = out.indexOf('const mediatedCodingTools = surface === "loopback"');
  assert.notEqual(start, -1);
  const call = out.slice(start, out.indexOf('}) : [];', start));
  assert.match(call, /\n\t\trunId: params\.runId,\n\t\t\/\/ loopback-exec-run-instance-v1[^\n]*\n\t\toperationalRunInstance: params\.operationalRunInstance,\n\t\tworkspaceDir,/u);
  assert.equal(out.split('operationalRunInstance: params.operationalRunInstance').length, 2);
});

test('mcp-http passes the bound grant\'s admitted run and keys the tool cache by it', () => {
  const out = read('mcp-http-BL3X6y4w.js');
  const resolve = out.slice(out.indexOf('const scopedTools = await toolCache.resolve({'));
  assert.match(resolve.slice(0, 1200), /runId: requestContext\.runId,\n\t+\.\.\.boundClientGrant \? \{ operationalRunInstance: boundClientGrant\.admittedRunContext\.operationalRunInstance \} : \{\},\n/u);
  const key = out.slice(out.indexOf('const cacheKey = ['), out.indexOf('const cacheKey = [') + 800);
  assert.match(key, /params\.runId \?\? "",\n[^\n]*\n\t+params\.operationalRunInstance \? `\$\{params\.operationalRunInstance\.instanceId\}\/\$\{params\.operationalRunInstance\.runId\}` : "",\n/u);
  // resolveMcpLoopbackTools forwards the rest of the scope params, so the instance reaches resolveGatewayScopedTools.
  assert.match(out, /signal: _signal, \.\.\.scopeParams \} = params;\n\tconst scoped = resolveGatewayScopedTools\(\{\n\t\t\.\.\.scopeParams,/u);
});

test('nothing but the marked lines changes', () => {
  for (const file of FILES) {
    const out = lines(read(file.name));
    const extra = out.filter((l) => l.includes(MARKER) || l.includes('operationalRunInstance: params.operationalRunInstance') || l.includes('params.operationalRunInstance ?') || l.includes('...boundClientGrant ? { operationalRunInstance'));
    const rest = out.filter((l) => !extra.includes(l));
    // Re-applying the patch to the rest must reproduce the release file exactly.
    assert.equal(file.patch(rest.join('\n')), out.join('\n'));
  }
});
