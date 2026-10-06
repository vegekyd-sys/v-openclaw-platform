import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { NON_BLOCKING_STREAM_CALLBACKS, patchWorker } from './patch-worker-model-selected-async.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
const base = read('./release-files/worker-prewarm-v/worker.mjs');
const released = read('./release-files/worker-model-selected-async/worker.mjs');
// The Worker package V runs (worker.mjs there is byte-identical to worker-prewarm-v's).
const capturedDist = new URL('../release/captured/v2026.9.1-db91.6-workboard-incremental-sweep-20261006.worker/dist/', import.meta.url);

test('release file is the worker-prewarm-v Worker with only this change', () => {
  assert.equal(read(new URL('worker.mjs', capturedDist)), base);
  assert.equal(patchWorker(base), released);
  assert.throws(() => patchWorker(released), /already patched/);
  assert.deepEqual(NON_BLOCKING_STREAM_CALLBACKS, ['onActiveModelSelected']);
});

test('the Agent command awaits onActiveModelSelected before its model call and ignores the result', () => {
  const chunk = read('./release-files/worker-prewarm-v/agent-command-DPfawBbr.js');
  assert.match(chunk, /\n\t+await params\.opts\.onActiveModelSelected\?\.\(\{\n\t+provider: providerOverride,\n\t+model: modelOverride\n\t+\}\);\n/);
  assert.equal(chunk.split('onActiveModelSelected').length, 2);
});

// A Worker package where the Agent awaits onActiveModelSelected, then emits a later event.
function workerPackage(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'worker-model-selected-async-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.cpSync(capturedDist, dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'worker.mjs'), released);
  fs.writeFileSync(path.join(dir, 'model-selected-runtime.mjs'), `export * from "./fake-agent-runtime.mjs";
export async function agentCommandFromGatewayIngress(params) {
  const startedAt = Date.now();
  const result = await params.onActiveModelSelected?.({ provider: "fixture", model: "fixture-model" });
  const modelCallAt = Date.now();
  await params.onAssistantMessageStart?.();
  return { payloads: [{ text: JSON.stringify({ awaitedMs: modelCallAt - startedAt, result: result ?? null }) }],
    meta: { agentMeta: { provider: "fixture", model: "fixture-model", sessionId: params.sessionId } } };
}
`);
  return dir;
}

async function run(t, { env = {}, onEvent }) {
  const dir = workerPackage(t);
  const { WorkerPool } = await import(pathToFileURL(path.join(dir, 'worker-pool.mjs')).href);
  const pool = new WorkerPool({
    minWorkers: 1, maxWorkers: 1, sessionsPerWorker: 1, idleTimeoutMs: 1_000,
    requestTimeoutMs: 10_000, requestCancelGraceMs: 100,
    workerEnv: { ...process.env, ...env,
      VLAB_OPENCLAW_AGENT_RUNTIME: path.join(dir, 'model-selected-runtime.mjs'),
      VLAB_REQUIRE_OPENCLAW_AGENT_RUNTIME: '1' },
  });
  t.after(() => pool.close?.());
  return await pool.dispatch('agent:fixture:model-selected', {
    kind: 'agent', harnessAttempt: true, message: 'model-selected',
    sessionId: 'model-selected-session', runId: 'model-selected-run',
    eventCallbackNames: ['onActiveModelSelected', 'onAssistantMessageStart'],
  }, { onEvent });
}

const slowGateway = (trace, delayMs) => async (event) => {
  if (event.name === 'onActiveModelSelected') await new Promise((resolve) => setTimeout(resolve, delayMs));
  trace.push({ name: event.name, args: event.args });
};

test('the Agent reaches its model call without waiting for the Gateway; order and arguments are unchanged', async (t) => {
  const trace = [];
  const result = await run(t, { onEvent: slowGateway(trace, 600) });
  const { awaitedMs, result: callbackResult } = JSON.parse(result.payloads[0].text);
  assert.ok(awaitedMs < 300, `awaited ${awaitedMs} ms`);
  assert.equal(callbackResult, null);
  // the Gateway still received both, in the Agent's order, and the run waited for both acks
  assert.deepEqual(trace, [
    { name: 'onActiveModelSelected', args: [{ provider: 'fixture', model: 'fixture-model' }] },
    { name: 'onAssistantMessageStart', args: [] },
  ]);
});

test('OPENCLAW_WORKER_ASYNC_MODEL_SELECTED=0 restores the blocking await', async (t) => {
  const trace = [];
  const result = await run(t, { env: { OPENCLAW_WORKER_ASYNC_MODEL_SELECTED: '0' }, onEvent: slowGateway(trace, 600) });
  const { awaitedMs } = JSON.parse(result.payloads[0].text);
  assert.ok(awaitedMs >= 550, `awaited ${awaitedMs} ms`);
  assert.deepEqual(trace.map((e) => e.name), ['onActiveModelSelected', 'onAssistantMessageStart']);
});

test('a failed onActiveModelSelected delivery still fails the request, and later events are not delivered', async (t) => {
  const trace = [];
  await assert.rejects(run(t, { onEvent: async (event) => {
    trace.push(event.name);
    if (event.name === 'onActiveModelSelected') throw Object.assign(new Error('gateway callback failed'), { code: 'FIXTURE_CALLBACK' });
  } }), /gateway callback failed/);
  assert.deepEqual(trace, ['onActiveModelSelected']);
});
