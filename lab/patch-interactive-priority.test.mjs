import assert from 'node:assert/strict';
import test from 'node:test';
import { GATE_SOURCE, MARKER, patchAgentEvents, patchCodexRunAttempt, patchDispatchFromConfig } from './patch-interactive-priority.mjs';

const slot = Symbol.for('openclaw.v.interactivePriority.v1');
const fresh = () => {
  delete globalThis[slot];
  return new Function(`${GATE_SOURCE}\nreturn __vInteractivePriority();`)();
};
const BG = 'agent:makaron:subagent:workboard-b1-c1';
const CHAT = 'agent:makaron:feishu:group:oc_x';

test('a background call does not wait when nobody is waiting for a first reply', async () => {
  const gate = fresh();
  assert.equal(await gate.yieldToInteractive(BG), 0);
});

test('a background call waits until the pending chat shows its first output', async () => {
  const gate = fresh();
  gate.enter(CHAT);
  const started = Date.now();
  setTimeout(() => gate.observe({ stream: 'assistant', sessionKey: CHAT }), 120);
  const waited = await gate.yieldToInteractive(BG);
  assert.ok(waited >= 100 && Date.now() - started < 1000, `waited ${waited}`);
  assert.equal(gate.stats().visible, 1);
  assert.equal(gate.stats().pending, 0);
});

test('lifecycle events do not end the window; the dispatch end does', async () => {
  const gate = fresh();
  const end = gate.enter(CHAT);
  gate.observe({ stream: 'lifecycle', sessionKey: CHAT });
  assert.equal(gate.stats().pending, 1);
  end();
  assert.equal(gate.stats().pending, 0);
  assert.equal(gate.stats().ended, 1);
});

test('the wait is capped, and the mark expires after its TTL', async () => {
  process.env.OPENCLAW_V_INTERACTIVE_PRIORITY_MAX_WAIT_MS = '80';
  process.env.OPENCLAW_V_INTERACTIVE_PRIORITY_TTL_MS = '200';
  try {
    const gate = fresh();
    gate.enter(CHAT);
    const waited = await gate.yieldToInteractive(BG);
    assert.ok(waited >= 70 && waited < 180, `waited ${waited}`);
    assert.equal(gate.stats().capped, 1);
    await new Promise((r) => setTimeout(r, 250));
    assert.equal(gate.stats().expired, 1);
    assert.equal(await gate.yieldToInteractive(BG), 0);
  } finally {
    delete process.env.OPENCLAW_V_INTERACTIVE_PRIORITY_MAX_WAIT_MS;
    delete process.env.OPENCLAW_V_INTERACTIVE_PRIORITY_TTL_MS;
  }
});

test('background sessions never mark, chat sessions never wait, and the switch turns it off', async () => {
  const gate = fresh();
  gate.enter(BG);
  assert.equal(gate.stats().pending, 0);
  gate.enter(CHAT);
  assert.equal(await gate.yieldToInteractive(CHAT), 0);
  process.env.OPENCLAW_V_INTERACTIVE_PRIORITY = '0';
  try {
    assert.equal(await gate.yieldToInteractive(BG), 0);
  } finally {
    delete process.env.OPENCLAW_V_INTERACTIVE_PRIORITY;
  }
});

test('an aborted background call stops waiting', async () => {
  const gate = fresh();
  gate.enter(CHAT);
  const ac = new AbortController();
  setTimeout(() => ac.abort(), 50);
  const waited = await gate.yieldToInteractive(BG, ac.signal);
  assert.ok(waited < 1000);
});

test('the three dist patches apply once and refuse to apply twice', () => {
  const dispatch = 'x\nasync function dispatchReplyFromConfigWithQueuePolicy(params, allowActiveQueueResolution) {\n\tconst ticket = reserveReplyAdmissionTicket([a]);\n\ttry {\n\t} finally {\n\t\tticket?.release();\n\t}\n}\nasync function dispatchReplyFromConfigInner(';
  const d = patchDispatchFromConfig(dispatch);
  assert.ok(d.includes(MARKER) && d.includes('vInteractivePriorityEnd();'));
  assert.throws(() => patchDispatchFromConfig(d));
  const events = 'function emitAgentEventIfCurrent(event) {\n\tconst enriched = enrichAgentEvent(event);\n\tif (!enriched) return false;\n\tnotify();\n}';
  assert.ok(patchAgentEvents(events).includes('__vInteractivePriority().observe(enriched);'));
  const attempt = 'async function runCodexAppServerAttempt(params, options) {\n\tconst connection = await prepareCodexAttemptConnection({\n\t\t\tconst replayedExecution = openClawDynamicToolExecutions.get(call);\n\t\t\tif (replayedExecution) {\n\t\t\t\tmarkCurrentTurnRequestProgress();\n\t\t\t\treturn toCodexDynamicToolProtocolResponse(await replayedExecution);\n\t\t\t}\n';
  const a = patchCodexRunAttempt(attempt);
  assert.equal(a.split('yieldToInteractive(params.sessionKey').length, 3);
});
