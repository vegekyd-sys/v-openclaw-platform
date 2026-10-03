import assert from 'node:assert/strict';
import {EventEmitter, getEventListeners} from 'node:events';
import {spawn} from 'node:child_process';
import test from 'node:test';
import {waitForExperience} from './gpt-live-h5-experience-lifecycle.mjs';

const gateway = () => Object.assign(new EventEmitter(), {exitCode: null, signalCode: null});
function clean(g, signal) {
  assert.equal(g.listenerCount('exit'), 0);
  assert.equal(g.listenerCount('error'), 0);
  assert.equal(getEventListeners(signal, 'abort').length, 0);
}

test('expiry resolves and removes every owned listener', async () => {
  const g = gateway(), controller = new AbortController();
  assert.equal(await waitForExperience({durationMs: 5, gateway: g, signal: controller.signal}), 'expired');
  clean(g, controller.signal);
});

test('abort resolves stopped and cleans long-lived listeners', async () => {
  const g = gateway(), controller = new AbortController();
  const pending = waitForExperience({durationMs: 120000, gateway: g, signal: controller.signal});
  assert.equal(g.listenerCount('exit'), 1);
  assert.equal(g.listenerCount('error'), 1);
  assert.equal(getEventListeners(controller.signal, 'abort').length, 1);
  controller.abort();
  assert.equal(await pending, 'stopped');
  clean(g, controller.signal);
});

test('Gateway exit rejects and removes timer listeners', async () => {
  const g = gateway(), controller = new AbortController();
  const pending = waitForExperience({durationMs: 120000, gateway: g, signal: controller.signal});
  g.emit('exit', 7, null);
  await assert.rejects(pending, /code=7, signal=none/u);
  clean(g, controller.signal);
});

test('Gateway signal exit reports the signal', async () => {
  const g = gateway(), controller = new AbortController();
  const pending = waitForExperience({durationMs: 120000, gateway: g, signal: controller.signal});
  g.emit('exit', null, 'SIGTERM');
  await assert.rejects(pending, /code=none, signal=SIGTERM/u);
  clean(g, controller.signal);
});

test('Gateway error rejects with the original error and cleans listeners', async () => {
  const g = gateway(), controller = new AbortController(), failure = new Error('fixture Gateway failure');
  const pending = waitForExperience({durationMs: 120000, gateway: g, signal: controller.signal});
  g.emit('error', failure);
  await assert.rejects(pending, error => error === failure);
  clean(g, controller.signal);
});

test('already aborted signal returns stopped without installing resources', async () => {
  const g = gateway(), controller = new AbortController(); controller.abort();
  assert.equal(await waitForExperience({durationMs: 120000, gateway: g, signal: controller.signal}), 'stopped');
  clean(g, controller.signal);
});

test('already exited Gateway rejects without installing resources', async () => {
  for (const terminal of [{exitCode: 0}, {signalCode: 'SIGKILL'}]) {
    const g = Object.assign(gateway(), terminal), controller = new AbortController();
    await assert.rejects(waitForExperience({durationMs: 120000, gateway: g, signal: controller.signal}), /Candidate Gateway exited/u);
    clean(g, controller.signal);
  }
});

test('cleanup retains listeners owned by the caller', async () => {
  const g = gateway(), controller = new AbortController();
  const callerExit = () => {}, callerError = () => {}, callerAbort = () => {};
  g.on('exit', callerExit); g.on('error', callerError); controller.signal.addEventListener('abort', callerAbort);
  const pending = waitForExperience({durationMs: 120000, gateway: g, signal: controller.signal});
  controller.abort(); assert.equal(await pending, 'stopped');
  assert.deepEqual(g.listeners('exit'), [callerExit]);
  assert.deepEqual(g.listeners('error'), [callerError]);
  assert.deepEqual(getEventListeners(controller.signal, 'abort'), [callerAbort]);
});

test('terminal sources cannot settle the result twice', async () => {
  const g = gateway(), controller = new AbortController();
  const pending = waitForExperience({durationMs: 120000, gateway: g, signal: controller.signal});
  controller.abort(); g.emit('exit', 1, null);
  assert.equal(await pending, 'stopped');
  clean(g, controller.signal);
});

test('duration validation rejects zero, fractions and unsafe values', () => {
  for (const durationMs of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '5'])
    assert.throws(() => waitForExperience({durationMs, gateway: gateway()}), RangeError);
});

test('long safe-integer TTL does not overflow the native timer', async () => {
  const g = gateway(), controller = new AbortController();
  const pending = waitForExperience({durationMs: Number.MAX_SAFE_INTEGER, gateway: g, signal: controller.signal});
  await new Promise(resolve => setTimeout(resolve, 10));
  controller.abort();
  assert.equal(await pending, 'stopped');
  clean(g, controller.signal);
});

test('aborted two-hour experience does not keep its process alive', async () => {
  const helper = new URL('./gpt-live-h5-experience-lifecycle.mjs', import.meta.url).href;
  const script = `import {EventEmitter} from 'node:events'; import {waitForExperience} from ${JSON.stringify(helper)};
    const gateway=Object.assign(new EventEmitter(),{exitCode:null,signalCode:null});
    const controller=new AbortController(); const pending=waitForExperience({durationMs:7200000,gateway,signal:controller.signal});
    controller.abort(); if(await pending!=='stopped') process.exitCode=1;`;
  const child = spawn(process.execPath, ['--input-type=module', '-e', script], {stdio: ['ignore', 'pipe', 'pipe']});
  let stderr = ''; child.stderr.on('data', bytes => { stderr += bytes; });
  const watchdog = setTimeout(() => child.kill('SIGKILL'), 3000);
  try {
    const result = await new Promise((resolve, reject) => {
      child.once('error', reject);
      child.once('exit', (code, signal) => resolve({code, signal}));
    });
    assert.deepEqual(result, {code: 0, signal: null}, stderr || 'Experience TTL kept its process alive');
  } finally { clearTimeout(watchdog); }
});
