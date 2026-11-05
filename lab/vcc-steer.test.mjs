import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { PassThrough } from 'node:stream';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { FILES, MARKER } from './patch-vcc-steer.mjs';
import { OUTPUT_DIR, PLAN } from './build-vcc-steer.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const read = (name) => fs.readFileSync(path.join(repo, OUTPUT_DIR, name), 'utf8');

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

test('the claude-cli live reply handle offers injection only through its live session', () => {
  const out = read('execute.runtime-DRmvah87.js');
  const at = out.indexOf(`// ${MARKER}`);
  const handle = out.slice(at, out.indexOf('if (replyBackendHandle) run.replyOperation?.attachBackend(replyBackendHandle);', at));
  assert.match(handle, /liveSession\?\.current\(\)/u);
  assert.match(handle, /handle\.canQueueMessage\?\.\(\) === true/u);
  assert.match(handle, /messageInjection: \{\n\t\t\tisAvailable: \(\) => Boolean\(liveSteerHandle\(\)\)/u);
  assert.match(handle, /sourceReplyDeliveryMode: run\.sourceReplyDeliveryMode/u);
  // Only the plugin-executed handle changes; the node-placement and managed-process handles do not.
  assert.equal(out.split('queueMessage: queueLiveSteer').length, 2);
  assert.equal(out.split('kind: "cli",').length, 4);
});

// ---- behaviour of the patched live session, with a simulated Claude Code behind a fake SDK ----

const STEER_TIMEOUT_MS = 300;
async function loadRuntime(tmp) {
  let src = read('agent-sdk.runtime.js');
  const imports = src.slice(0, src.indexOf('//#region extensions/anthropic/agent-sdk.runtime.ts'));
  src = src.slice(imports.length)
    .replace('await import("./agent-sdk/sdk.mjs")', 'globalThis.__vccSteerSdk')
    .replace('const CLAUDE_STEER_FOLLOW_ON_TIMEOUT_MS = 6e4;', `const CLAUDE_STEER_FOLLOW_ON_TIMEOUT_MS = ${STEER_TIMEOUT_MS};`);
  const prelude = `import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
const isRecord = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
const _usingCtx = () => ({ e: undefined, u: (v) => v, d() { if (this.e) throw this.e; } });
const createClaudeAgentSdkProcessOwner = () => ({ spawn: () => undefined, withDiagnostics: async (e) => e, [Symbol.dispose]() {} });
const splitClaudeToolNames = (v) => v.split(",").map((s) => s.trim()).filter(Boolean);
const createClaudeAgentSdkUserMessage = (context) => ({ type: "user", message: { role: "user", content: context.prompt }, parent_tool_use_id: null, uuid: randomUUID(), ...context.sessionId ? { session_id: context.sessionId } : {} });
const createClaudeAgentSdkUserInputAuthorizer = () => ({ authorize: async () => ({ behavior: "deny" }) });
`;
  const file = path.join(tmp, `runtime-${randomUUID()}.mjs`);
  fs.writeFileSync(file, prelude + src);
  return import(pathToFileURL(file).href);
}

// Mirrors V's Claude Code: a prompt with SLOW:<ms> runs a tool for <ms>; messages arriving during the
// tool join this turn; messages arriving during the answer (answerMs) run as the next turn.
// replay=false drops the echo, to exercise the timeout.
function simulatedSdk({ answerMs = 120, replay = true } = {}) {
  const sim = { seenOptions: undefined, writes: [] };
  sim.query = ({ prompt, options }) => {
    sim.seenOptions = options;
    const out = new PassThrough({ objectMode: true });
    const queue = [];
    let phase = 'idle', absorbed = [], wake;
    const textOf = (m) => m.message.content;
    prompt.on('data', (m) => {
      sim.writes.push({ m, phase });
      if (phase === 'tool') absorbed.push(m); else queue.push(m);
      wake?.();
    });
    const echo = (m) => { if (replay && options.extraArgs?.['replay-user-messages'] === null) out.write({ ...m, isReplay: true }); };
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    (async () => {
      for (;;) {
        if (!queue.length) await new Promise((r) => { wake = r; });
        wake = undefined;
        while (queue.length) {
          const first = queue.shift();
          const consumed = [first];
          out.write({ type: 'system', subtype: 'init' });
          echo(first);
          const slow = /SLOW:(\d+)/u.exec(textOf(first));
          if (slow) {
            phase = 'tool';
            out.write({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }] } });
            await sleep(Number(slow[1]));
            out.write({ type: 'user', message: { content: [{ type: 'tool_result', tool_use_id: 't1', content: 'ok' }] } });
            for (const m of absorbed) { consumed.push(m); echo(m); }
            absorbed = [];
          }
          phase = 'answer';
          await sleep(answerMs);
          const text = `reply(${consumed.map(textOf).join(' | ')})`;
          out.write({ type: 'assistant', message: { content: [{ type: 'text', text }] } });
          out.write({ type: 'result', subtype: 'success', result: text });
          phase = 'idle';
        }
      }
    })();
    const iterable = out[Symbol.asyncIterator]();
    return Object.assign(iterable, { close: () => out.end() });
  };
  return sim;
}

function capability() {
  let registered;
  return {
    fingerprint: 'fp',
    current: () => registered,
    register: (h) => { registered = h; },
    activate: () => {},
    remove: (h) => { if (registered === h) registered = undefined; },
  };
}
const contextFor = (cap, prompt, extra = {}) => ({ prompt, sessionId: 's1', liveSession: cap, args: [], env: {}, cwd: '/tmp', modelId: 'claude', command: 'claude', systemPrompt: 'sys', ...extra });
async function runTurn(runtime, context, during) {
  const events = [];
  // The runtime's timers are unref'd (the Gateway keeps the process alive); hold the loop open here.
  const keepAlive = setInterval(() => {}, 1_000);
  try {
    const done = (async () => { for await (const e of runtime.executeClaudeAgentSdk(context)) events.push(e); })();
    if (during) await during();
    await done;
  } finally {
    clearInterval(keepAlive);
  }
  return events;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const results = (events) => events.filter((e) => e.type === 'result').map((e) => e.result);
const waitUntil = async (fn) => { for (let i = 0; i < 200 && !fn(); i += 1) await sleep(10); assert(fn()); };

test('live sessions ask Claude Code to echo consumed user messages, and echoes are not forwarded', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vcc-steer-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const runtime = await loadRuntime(tmp);
  const sim = simulatedSdk();
  globalThis.__vccSteerSdk = sim;
  const cap = capability();
  const events = await runTurn(runtime, contextFor(cap, 'hello'));
  assert.equal(sim.seenOptions.extraArgs['replay-user-messages'], null);
  assert.deepEqual(results(events), ['reply(hello)']);
  assert(!events.some((e) => e.isReplay));
  cap.current().close('done');
});

test('a steer written while a tool runs joins the same turn', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vcc-steer-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const runtime = await loadRuntime(tmp);
  const sim = simulatedSdk();
  globalThis.__vccSteerSdk = sim;
  const cap = capability();
  const events = await runTurn(runtime, contextFor(cap, 'main SLOW:200'), async () => {
    await waitUntil(() => cap.current()?.canQueueMessage());
    await sleep(50);
    assert.equal(await cap.current().queueMessage('steer'), undefined);
  });
  assert.deepEqual(results(events), ['reply(main SLOW:200 | steer)']);
  const steer = sim.writes.find((w) => w.m.message.content === 'steer');
  assert.equal(steer.phase, 'tool');
  assert.equal(steer.m.priority, 'next');
  assert.equal(steer.m.session_id, 's1');
  assert.equal(cap.current().canQueueMessage(), false, 'nothing to steer once the turn is over');
  await assert.rejects(cap.current().queueMessage('late'), /no running turn/u);
  cap.current().close('done');
});

test('a steer written during the final answer keeps the turn open for the follow-on turn', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vcc-steer-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const runtime = await loadRuntime(tmp);
  const sim = simulatedSdk({ answerMs: 150 });
  globalThis.__vccSteerSdk = sim;
  const cap = capability();
  const events = await runTurn(runtime, contextFor(cap, 'main'), async () => {
    await waitUntil(() => sim.writes.length === 1);
    await sleep(50);
    await cap.current().queueMessage('steer');
  });
  assert.equal(sim.writes.find((w) => w.m.message.content === 'steer').phase, 'answer');
  assert.deepEqual(results(events), ['reply(main)', 'reply(steer)']);
  // The live process is still usable, and the next turn sees only its own prompt.
  const next = await runTurn(runtime, contextFor(cap, 'next'));
  assert.deepEqual(results(next), ['reply(next)']);
  cap.current().close('done');
});

test('a steer Claude never echoes ends the turn after the timeout and retires the process', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vcc-steer-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const runtime = await loadRuntime(tmp);
  globalThis.__vccSteerSdk = simulatedSdk({ replay: false, answerMs: 150 });
  const cap = capability();
  const started = Date.now();
  const events = await runTurn(runtime, contextFor(cap, 'main'), async () => {
    await waitUntil(() => cap.current()?.canQueueMessage());
    await sleep(50);
    await cap.current().queueMessage('steer');
  });
  assert(results(events).includes('reply(main)'));
  assert(Date.now() - started >= STEER_TIMEOUT_MS);
  assert.equal(cap.current(), undefined, 'the process that may still answer the steer is closed');
});

test('a steered prompt does not get the turn prompt context prepended again', async (t) => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'vcc-steer-'));
  t.after(() => fs.rmSync(tmp, { recursive: true, force: true }));
  const runtime = await loadRuntime(tmp);
  const sim = simulatedSdk();
  globalThis.__vccSteerSdk = sim;
  const cap = capability();
  let hookResults = [];
  await runTurn(runtime, contextFor(cap, 'main SLOW:200', { promptContext: { prependContext: 'CTX' } }), async () => {
    await waitUntil(() => cap.current()?.canQueueMessage());
    await cap.current().queueMessage('steer');
    const hook = sim.seenOptions.hooks.UserPromptSubmit[0].hooks[0];
    const signal = new AbortController().signal;
    hookResults = [
      await hook({ hook_event_name: 'UserPromptSubmit', prompt: 'main SLOW:200' }, undefined, { signal }),
      await hook({ hook_event_name: 'UserPromptSubmit', prompt: 'steer' }, undefined, { signal }),
    ];
  });
  assert.equal(hookResults[0].hookSpecificOutput.additionalContext, 'CTX');
  assert.deepEqual(hookResults[1], {});
  cap.current().close('done');
});
