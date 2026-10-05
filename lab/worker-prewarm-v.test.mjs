import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { patchAgentCommandChunk, patchAgentCommandFacade, patchWorker } from './patch-worker-prewarm-v.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
const captured = '../release/captured/v2026.9.1-db91.6-gpt-live-voice-20261005';
const chunk = read(`${captured}/dist/agent-command-DPfawBbr.js`);
const facade = read('./fixtures/worker-prewarm-v/agent-command-DeP5kHlK.js');
const worker = read(`${captured}.worker/dist/worker.mjs`);
const released = (name) => read(`./release-files/worker-prewarm-v/${name}`);

test('release files are V\'s files with only the prewarm change', () => {
  assert.equal(patchAgentCommandChunk(chunk), released('agent-command-DPfawBbr.js'));
  assert.equal(patchAgentCommandFacade(facade), released('agent-command-DeP5kHlK.js'));
  assert.equal(patchWorker(worker), released('worker.mjs'));
  assert.throws(() => patchAgentCommandChunk(released('agent-command-DPfawBbr.js')), /agent id import|command chunk exports/);
  assert.throws(() => patchAgentCommandFacade(released('agent-command-DeP5kHlK.js')), /facade import/);
  assert.throws(() => patchWorker(released('worker.mjs')), /worker ready message/);
});

test('the facade exports the chunk prewarm under its semantic name', () => {
  const out = released('agent-command-DeP5kHlK.js');
  assert.match(out, /import \{[^}]*\bprewarmAgentCommandRuntimes\b[^}]*\} from "\.\/agent-command-DPfawBbr\.js"/);
  assert.match(out, /export \{[^}]*\bprewarmAgentCommandRuntimes \};/);
  assert.match(released('agent-command-DPfawBbr.js'), /export \{[^}]*\bprewarmAgentCommandRuntimes,/);
});

test('the chunk prewarm only calls loaders the chunk already defines', () => {
  const out = released('agent-command-DPfawBbr.js');
  const body = out.slice(out.indexOf('async function prewarmAgentCommandRuntimes(params)'), out.indexOf('async function resolveAgentCommandDeps('));
  assert(body.length > 0);
  const calls = [...body.matchAll(/\b(load\w+Runtime|cliDepsRuntimeLoader)\b/g)].map((m) => m[1]);
  assert.equal(calls.length, 14);
  for (const name of calls) assert.match(chunk, new RegExp(`(function ${name}\\(\\)|const ${name} = )`), `${name} is not defined in V's chunk`);
  // the session read goes through names V's chunk already imports, and nothing that writes
  assert.match(chunk, /import \{[^}]*\bi as resolveSession\b[^}]*\} from "\.\/session-CEfQoC2g\.js";/);
  assert.match(chunk, /import \{ n as normalizeAgentId \} from "\.\/agent-id-CeT3w4ap\.js";/);
  assert.match(released('agent-command-DPfawBbr.js'), /import \{ g as openOpenClawAgentDatabase \} from "\.\/openclaw-agent-db-CUTe8BX6\.js";/);
  const code = body.slice(body.indexOf(']);')).split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  assert.doesNotMatch(code, /write|persist|update|append|insert|delete/i);
});

// Run the Worker's prewarm block (from the release file) against fakes.
function prewarmBlock() {
  const out = released('worker.mjs');
  const start = out.indexOf('let runtimePrewarm = { status: "disabled" };');
  const end = out.indexOf('process.send?.({', start);
  return out.slice(start, end) + '\nreturn runtimePrewarm;';
}
async function runPrewarm({ env = {}, acquire, commandRuntime = { prewarmAgentCommandRuntimes: async () => ({ sessionStorePrepared: true }) } } = {}) {
  const AsyncFunction = (async () => {}).constructor;
  const released = [];
  const stderr = [];
  const fakeProcess = { env, pid: 4242, stderr: { write: (s) => stderr.push(s) } };
  const loadAgentRuntime = async () => ({ resolveAgentWorkspaceDir: () => '/ws', resolveAgentDir: () => '/agent' });
  const loadCompactionRuntime = async () => ({
    configRuntime: { loadConfig: () => ({}) },
    commandRuntime,
    preparedRuntime: { acquireAgentRunPreparedModelRuntime: acquire ?? (async () => ({ release: () => released.push(true) })) },
  });
  const fn = new AsyncFunction('process', 'performance', 'loadAgentRuntime', 'loadCompactionRuntime', prewarmBlock());
  const result = await fn(fakeProcess, performance, loadAgentRuntime, loadCompactionRuntime);
  return { result, released, stderr };
}

test('preparation runs before ready and releases its lease', async () => {
  let args;
  const rel = [];
  const { result, stderr } = await runPrewarm({ acquire: async (params, options) => { args = { params, options }; return { release: () => rel.push(true) }; } });
  assert.equal(result.status, 'ready');
  assert.equal(result.commandModules, 'loaded');
  assert.equal(result.sessionStorePrepared, true);
  assert.equal(args.params.agentId, 'makaron');
  assert.equal(args.params.allowGatewaySubagentBinding, true);
  assert.equal(args.options.catalogMode, 'static');
  assert.equal(rel.length, 1);
  assert.match(stderr.join(''), /\[worker-runtime-prewarm\.3\] \{"pid":4242,"status":"ready"/);
});

test('a runtime without the command prewarm still prepares the model runtime', async () => {
  const { result } = await runPrewarm({ commandRuntime: {} });
  assert.equal(result.status, 'ready');
  assert.equal(result.commandModules, 'unavailable');
});

test('failure falls back to the old first turn and the Worker still becomes ready', async () => {
  const { result } = await runPrewarm({ acquire: async () => { throw new Error('catalog unavailable'); } });
  assert.equal(result.status, 'deferred-to-normal-turn');
  assert.equal(result.errorCategory, 'other');
});

test('OPENCLAW_WORKER_EAGER_PREPARE=0 turns it off', async () => {
  let called = false;
  const { result, stderr } = await runPrewarm({ env: { OPENCLAW_WORKER_EAGER_PREPARE: '0' }, acquire: async () => { called = true; return { release() {} }; } });
  assert.deepEqual(result, { status: 'disabled' });
  assert.equal(called, false);
  assert.equal(stderr.length, 0);
});

test('preparation is bounded by its timeout', async (t) => {
  // the prewarm timer is unref'd (a real Worker is kept alive by its IPC channel); keep
  // this test's event loop alive until the timeout fires
  const keepAlive = setTimeout(() => {}, 10_000);
  t.after(() => clearTimeout(keepAlive));
  const { result } = await runPrewarm({
    env: { OPENCLAW_WORKER_EAGER_PREPARE_TIMEOUT_MS: '1000' },
    acquire: (_params, { abortSignal }) => new Promise((_resolve, reject) => abortSignal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))),
  });
  assert.equal(result.status, 'deferred-to-normal-turn');
  assert.equal(result.errorCategory, 'abort');
});
