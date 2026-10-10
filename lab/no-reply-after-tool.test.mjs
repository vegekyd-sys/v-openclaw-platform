import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { MARKER, patchBuiltinOpenclaw } from './patch-no-reply-after-tool.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
// Base: V's bytes (release-batch-20261009, 972d25fe…). Ships without the not-yet-deployed
// early-tool-status change; the patcher also applies on top of that bundle.
const base = read('../release/captured/release-batch-20261009/dist/builtin-openclaw-zQV8Wwjr.js');
const patched = read('./release-files/no-reply-after-tool/builtin-openclaw-zQV8Wwjr.js');
const earlyToolStatus = read('./release-files/early-tool-status/builtin-openclaw-zQV8Wwjr.js');

test('release file is V\'s bundle plus only this patch; the dev bundle takes it too', () => {
  assert.equal(patchBuiltinOpenclaw(base), patched);
  assert.throws(() => patchBuiltinOpenclaw(patched), /already patched/);
  const onDev = patchBuiltinOpenclaw(earlyToolStatus);
  assert.equal(onDev.split(MARKER).length, 2);
  assert.equal(onDev.length - earlyToolStatus.length, patched.length - base.length);
});

// Run the real recovery helpers (sliced from the bundle) with stubbed imports.
function silenceGate(source) {
  const slice = (name) => {
    const start = source.indexOf(`function ${name}(`);
    assert(start >= 0, name);
    return source.slice(start, source.indexOf('\n}\n', start) + 3);
  };
  const context = {
    isSilentReplyPayloadText: (text, token) => text.trim() === token,
    resolveCurrentAttemptAssistant: (attempt) => attempt.currentAttemptAssistant,
    hasCommittedMessagingToolDeliveryEvidence: (attempt) => (attempt.messagingToolSentTexts ?? []).length > 0,
    hasAcceptedSessionSpawn: (spawns) => (spawns ?? []).length > 0,
    hasAsyncActivity: (metas) => (metas ?? []).some((m) => m.asyncStarted === true),
    classifyAssistantTurn: () => ({ nonVisibleEligibleForSilentReply: true }),
  };
  vm.runInNewContext(['hasOnlySilentAssistantReply', 'shouldSkipNonVisibleTurnRetry', 'shouldTreatEmptyAssistantReplyAsSilent']
    .map(slice).join('\n') + '\nthis.gate = shouldTreatEmptyAssistantReplyAsSilent;', context);
  return context.gate;
}

// The 15:03 turn: message react succeeded, the model answered NO_REPLY, directed group turn.
function turn({ text = 'NO_REPLY', allow = false, ...attempt } = {}) {
  return {
    allowEmptyAssistantReplyAsSilent: allow,
    terminalReplyExpectation: 'required',
    onlyExplicitSilentReply: false,
    payloadCount: 0,
    aborted: false,
    timedOut: false,
    attempt: {
      assistantTexts: text ? [text] : [],
      currentAttemptAssistant: { role: 'assistant', stopReason: 'stop' },
      terminal: { kind: 'ok' },
      toolMetas: [{ toolName: 'message', meta: 'react' }],
      replayMetadata: { hadPotentialSideEffects: true, replaySafe: false },
      ...attempt,
    },
  };
}

test('unpatched 9.1 treats NO_REPLY after a reaction as a missing answer (the bug)', () => {
  const gate = silenceGate(base);
  assert.equal(gate(turn()), false);
  assert.equal(gate(turn({ allow: undefined })), false);
  assert.equal(gate(turn({ allow: true })), true);
});

test('patched: NO_REPLY after a reaction or a command is silence whether or not empty replies are allowed', () => {
  const gate = silenceGate(patched);
  assert.equal(gate(turn()), true);
  assert.equal(gate(turn({ allow: undefined })), true);
  assert.equal(gate(turn({ toolMetas: [{ toolName: 'exec' }] })), true);
  assert.equal(gate(turn({ text: ' NO_REPLY \n' })), true);
});

test('patched: everything that was not an authored NO_REPLY keeps the old answer', () => {
  const gate = silenceGate(patched);
  assert.equal(gate(turn({ text: '' })), false, 'a blank reply still asks for a summary');
  assert.equal(gate(turn({ lastToolError: { toolName: 'exec' } })), false, 'failed tool');
  assert.equal(gate(turn({ toolMetas: [{ toolName: 'exec', asyncStarted: true }] })), false, 'async work');
  assert.equal(gate(turn({ messagingToolSentTexts: ['已发'] })), false, 'a message was sent');
  assert.equal(gate(turn({ currentAttemptAssistant: { stopReason: 'error' } })), false);
  const a = turn(); a.payloadCount = 1;
  assert.equal(gate(a), false, 'visible payload');
});
