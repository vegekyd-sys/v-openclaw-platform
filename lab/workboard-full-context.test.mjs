import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { FILES, MARKER } from './patch-workboard-full-context.mjs';
import { OUTPUT_DIR, PLAN } from './build-workboard-full-context.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const read = (name) => fs.readFileSync(path.join(repo, OUTPUT_DIR, name), 'utf8');
const sha = (value) => createHash('sha256').update(value).digest('hex');
const RUNTIME = 'runtime-api-1CCazqtv.js';
const WORKSPACE = 'workspace-BFk42BX6.js';

test('plan lists both patched files with V before-bytes', () => {
  assert.deepEqual(plan.files.map((f) => f.target), FILES.map((f) => `${f.target}/${f.name}`));
  assert.deepEqual(plan.files.map((f) => f.before), FILES.map((f) => f.before));
  for (const f of plan.files) assert.equal(f.source, `${OUTPUT_DIR}/${path.basename(f.target)}`);
});

test('release files carry the marker, parse, and refuse a second patch', () => {
  for (const file of FILES) {
    const out = read(file.name);
    assert(out.includes(MARKER), file.name);
    assert.throws(() => file.patch(out), /already patched/u);
    const r = spawnSync(process.execPath, ['--check', path.join(repo, OUTPUT_DIR, file.name)], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    assert.notEqual(sha(out), file.before);
  }
});

test('Workboard dispatch starts card workers with full context unless the switch is 1', () => {
  const src = read(RUNTIME);
  assert.equal(src.split('lightContext: true').length, 1, 'no hard-coded light start left');
  const line = src.split('\n').find((l) => l.includes('lightContext:') && l.includes('OPENCLAW_WORKBOARD_LIGHT_CONTEXT'));
  const expr = line.trim().replace(/^lightContext:\s*/u, '').replace(/,$/u, '');
  const run = (env) => new Function('process', `return ${expr};`)({ env });
  assert.equal(run({}), false);
  assert.equal(run({ OPENCLAW_WORKBOARD_LIGHT_CONTEXT: '0' }), false);
  assert.equal(run({ OPENCLAW_WORKBOARD_LIGHT_CONTEXT: '1' }), true);
});

test('bootstrap filter keeps every file for Workboard card workers, subagent filter otherwise', () => {
  const src = read(WORKSPACE);
  const fn = src.slice(src.indexOf('function filterBootstrapFilesForSession'), src.indexOf('function isWorkboardWorkerWithFullContext'));
  const helper = src.slice(src.indexOf('function isWorkboardWorkerWithFullContext'), src.indexOf('function hasGlobPattern'));
  const files = ['AGENTS.md', 'SOUL.md', 'IDENTITY.md', 'USER.md', 'MEMORY.md'].map((name) => ({ name }));
  const make = (env) => new Function('process', `
    const SUBAGENT_BOOTSTRAP_ALLOWLIST = new Set(["AGENTS.md"]);
    const CRON_BOOTSTRAP_ALLOWLIST = new Set(["AGENTS.md", "SOUL.md", "IDENTITY.md", "USER.md"]);
    const DEFAULT_MEMORY_FILENAME = "MEMORY.md";
    const resolveBootstrapSessionContext = (s) => (typeof s === "string" ? { sessionKey: s } : s ?? {});
    const isSubagentSessionKey = (k) => /(^|:)subagent:/u.test(k ?? "");
    const isCronSessionKey = (k) => /(^|:)cron:/u.test(k ?? "");
    const deriveSessionChatTypeFromKey = () => undefined;
    ${helper}
    ${fn}
    return filterBootstrapFilesForSession;`)({ env });
  const names = (out) => out.map((f) => f.name);
  const filter = make({});
  const card = 'agent:makaron:subagent:workboard-nightshift-18318dc8-2a57-4a4d-ad0a-c6c22e20a750';
  assert.deepEqual(names(filter(files, card)), names(files));
  assert.deepEqual(names(filter(files, 'agent:makaron:subagent:task-1')), ['AGENTS.md', 'MEMORY.md']);
  assert.deepEqual(names(filter(files, 'agent:makaron:subagent:workboarder-1')), ['AGENTS.md', 'MEMORY.md']);
  assert.deepEqual(names(filter(files, 'agent:makaron:feishu:group:oc_x')), names(files));
  assert.deepEqual(names(make({ OPENCLAW_WORKBOARD_LIGHT_CONTEXT: '1' })(files, card)), ['AGENTS.md', 'MEMORY.md']);
});
