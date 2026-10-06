import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FIRST_TURN_MODULES, patchAgentCommandChunk, patchWorker } from './patch-worker-prewarm2-v.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
const base = (name) => read(`./release-files/worker-prewarm-v/${name}`);
const released = (name) => read(`./release-files/worker-prewarm2-v/${name}`);
const chunk = base('agent-command-DPfawBbr.js');

test('release files are the worker-prewarm-v files with only the prewarm2 change', () => {
  assert.equal(patchAgentCommandChunk(chunk), released('agent-command-DPfawBbr.js'));
  assert.equal(patchWorker(base('worker.mjs')), released('worker.mjs'));
  assert.throws(() => patchAgentCommandChunk(released('agent-command-DPfawBbr.js')), /prewarm loader list|session store prewarm return/);
  assert.throws(() => patchWorker(released('worker.mjs')), /worker command prewarm call/);
});

test('the skill snapshot prewarm derives the inputs a turn derives, through names the chunk already imports', () => {
  const out = released('agent-command-DPfawBbr.js');
  const turn = chunk.slice(chunk.indexOf('async function prepareEmbeddedSessionState(params)'), chunk.indexOf('//#region src/agents/agent-command.ts'));
  assert(turn.length > 0);
  // the turn's call: the same function and the same fields that make up its cache key
  for (const field of ['workspaceDir', 'executionSkillsDir', 'config', 'agentId', 'librarySelections', 'skillFilter', 'eligibility', 'watch']) assert.match(turn, new RegExp(`\\b${field}[:,]`), field);
  assert.match(turn, /resolveReusableWorkspaceSkillSnapshot\(\{/);
  assert.match(chunk, /executionSkillsDir: path\.join\(sessionEntry\?\.worktree\?\.canonicalWorkspaceDir \?\? cwd \?\? workspaceDir, "skills"\)/);
  const body = out.slice(out.indexOf('function prewarmWorkspaceSkillSnapshot('), out.indexOf('async function prewarmFirstTurnModules('));
  assert(body.length > 0);
  for (const name of ['resolveUserPath', 'resolveAgentWorkspaceDir', 'resolveAgentRunCwd', 'resolvePluginMetadataSnapshot', 'resolveEffectiveAgentSkillFilter', 'normalizeAgentId']) {
    assert.match(body, new RegExp(`\\b${name}\\(`), name);
    assert.match(chunk, new RegExp(`^import \\{[^}]*\\b${name}\\b[^}]*\\} from `, 'm'), `${name} is not imported by V's chunk`);
  }
  assert.match(chunk, /^import path from "node:path";$/m);
  // nothing that persists, and no watcher
  assert.match(body, /watch: false/);
  assert.match(body, /existingSnapshot: void 0/);
  const code = body.split('\n').filter((line) => !/^\s*(\/\/|\*|\/\*\*)/.test(line)).join('\n');
  assert.doesNotMatch(code, /persist|write|append|insert|delete|sessionStore/i);
});

test('the module prewarm imports each first-turn module on its own', () => {
  const out = released('agent-command-DPfawBbr.js');
  const body = out.slice(out.indexOf('async function prewarmFirstTurnModules('), out.indexOf('async function resolveAgentCommandDeps('));
  assert.match(body, /Promise\.allSettled\(/);
  const imported = [...body.matchAll(/import\("([^"]+)"\)/g)].map((m) => m[1]);
  assert.deepEqual(imported, FIRST_TURN_MODULES);
  assert.equal(new Set(imported).size, imported.length);
  for (const m of imported) assert.match(m, /^\.\/[\w./-]+\.js$/);
});

test('the steps added here can be turned off on their own and come after the session store step', () => {
  const out = released('agent-command-DPfawBbr.js');
  const fn = out.slice(out.indexOf('async function prewarmAgentCommandRuntimes(params)'), out.indexOf('function prewarmWorkspaceSkillSnapshot('));
  assert.ok(fn.indexOf('resolveSession({') < fn.indexOf('OPENCLAW_WORKER_EAGER_PREPARE_SKILLS'));
  assert.match(fn, /if \(process\.env\.OPENCLAW_WORKER_EAGER_PREPARE_SKILLS === "0"\) return \{ sessionStorePrepared: true \};/);
});

// Run the chunk's added functions against fakes.
function chunkPrewarm({ env = {}, skills, execDefaults, imports } = {}) {
  const out = released('agent-command-DPfawBbr.js');
  const src = out.slice(out.indexOf('function prewarmWorkspaceSkillSnapshot('), out.indexOf('async function resolveAgentCommandDeps('))
    .replace(/import\(("[^"]+")\)/g, '__import($1)');
  const AsyncFunction = (async () => {}).constructor;
  const fn = new AsyncFunction('process', 'path', 'normalizeAgentId', 'resolveUserPath', 'resolveAgentWorkspaceDir', 'resolveAgentRunCwd', 'resolvePluginMetadataSnapshot', 'resolveEffectiveAgentSkillFilter', '__import', 'params', 'skillsRuntime', 'execDefaultsRuntime',
    `${src}\nreturn { ...prewarmWorkspaceSkillSnapshot(params, skillsRuntime, execDefaultsRuntime), ...await prewarmFirstTurnModules() };`);
  return (params) => fn({ env }, { join: (...p) => p.join('/') }, (id) => id.toLowerCase(), (p) => p.replace('~', '/home'), () => '~/ws', () => '/run/cwd', () => ['metadata-from-config'], () => ['skill-a'], imports ?? (async () => ({})), params, skills, execDefaults);
}

test('the skill snapshot is built with the turn inputs and the lease metadata', async () => {
  let call;
  const run = chunkPrewarm({
    skills: { getRemoteSkillEligibility: ({ advertiseExecNode }) => ({ advertiseExecNode }), resolveReusableWorkspaceSkillSnapshot: (p) => { call = p; return { snapshot: {}, shouldRefresh: true }; } },
    execDefaults: { resolveNodeExecEligibility: (p) => ({ canExec: false, key: p.sessionKey }) },
  });
  const result = await run({ config: {}, agentId: 'Makaron', pluginMetadataSnapshot: ['metadata-from-lease'] });
  assert.equal(result.skillSnapshotPrepared, true);
  assert.equal(result.firstTurnModules, `${FIRST_TURN_MODULES.length}/${FIRST_TURN_MODULES.length}`);
  assert.equal(call.workspaceDir, '/home/ws');
  assert.equal(call.executionSkillsDir, '/run/cwd/skills');
  assert.equal(call.agentId, 'makaron');
  assert.deepEqual(call.skillFilter, ['skill-a']);
  assert.deepEqual(call.eligibility, { nodeSkills: { canExec: false, key: 'agent:makaron:feishu:group:worker-prewarm' }, remote: { advertiseExecNode: false } });
  assert.deepEqual(call.pluginMetadataSnapshot, ['metadata-from-lease']);
  assert.equal(call.watch, false);
  assert.equal(call.existingSnapshot, undefined);
});

test('plugins disabled: no metadata, like a turn', async () => {
  let call;
  const run = chunkPrewarm({
    skills: { getRemoteSkillEligibility: () => ({}), resolveReusableWorkspaceSkillSnapshot: (p) => { call = p; return { snapshot: {} }; } },
    execDefaults: { resolveNodeExecEligibility: () => ({ canExec: true }) },
  });
  await run({ config: { plugins: { enabled: false } }, agentId: 'makaron', pluginMetadataSnapshot: ['ignored'] });
  assert.equal('pluginMetadataSnapshot' in call, false);
});

test('a failing skill snapshot or module does not fail preparation', async () => {
  const run = chunkPrewarm({
    skills: { getRemoteSkillEligibility: () => ({}), resolveReusableWorkspaceSkillSnapshot: () => { throw new Error('skills dir unreadable'); } },
    execDefaults: { resolveNodeExecEligibility: () => ({ canExec: false }) },
    imports: async (m) => { if (m.includes('mcp')) throw new Error('missing'); return {}; },
  });
  const result = await run({ config: {}, agentId: 'makaron' });
  assert.equal(result.skillSnapshotPrepared, false);
  assert.match(result.skillSnapshotError, /skills dir unreadable/);
  assert.equal(result.firstTurnModules, `${FIRST_TURN_MODULES.length - 1}/${FIRST_TURN_MODULES.length}`);
});

test('the Worker passes its lease metadata and reports the new fields', () => {
  const out = released('worker.mjs');
  const block = out.slice(out.indexOf('let runtimePrewarm = { status: "disabled" };'), out.indexOf('process.send?.({', out.indexOf('let runtimePrewarm')));
  assert.match(block, /pluginMetadataSnapshot: lease\?\.pluginGeneration\?\.pluginMetadataSnapshot/);
  assert.match(block, /skillSnapshotPrepared: command\?\.skillSnapshotPrepared === true/);
  assert.match(block, /firstTurnModules: command\.firstTurnModules/);
  // the lease is still released in finally, after the command prewarm
  assert.ok(block.indexOf('prewarmAgentCommandRuntimes({') < block.indexOf('lease?.release()'));
});
