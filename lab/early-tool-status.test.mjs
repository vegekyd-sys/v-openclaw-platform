import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { MARKER, patchAgentRunner, patchBuiltinOpenclaw } from './patch-early-tool-status.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
// Base: the memory-flush-defer bundle on dev (builtin = V's bytes; agent-runner = V + #301)
const baseBuiltin = read('./release-files/memory-flush-defer/builtin-openclaw-zQV8Wwjr.js');
const baseRunner = read('./release-files/memory-flush-defer/agent-runner.runtime-CAdsMsQt.js');
const builtin = read('./release-files/early-tool-status/builtin-openclaw-zQV8Wwjr.js');
const runner = read('./release-files/early-tool-status/agent-runner.runtime-CAdsMsQt.js');

test('release files are the dev bundle plus only this patch', () => {
  assert.equal(baseBuiltin, read('../release/captured/release-batch-20261009/dist/builtin-openclaw-zQV8Wwjr.js'));
  assert.equal(patchBuiltinOpenclaw(baseBuiltin), builtin);
  assert.equal(patchAgentRunner(baseRunner), runner);
  assert.throws(() => patchBuiltinOpenclaw(builtin), /already patched/);
  assert.throws(() => patchAgentRunner(runner), /already patched/);
});

// Run the inserted handleMessageUpdate block with the real readToolCallBlock.
function earlyBlock(env = {}) {
  const start = builtin.indexOf(`// ${MARKER}`);
  const end = builtin.indexOf('\tconst eventAssistantMessage =', start);
  const helperStart = builtin.indexOf('function readToolCallBlock(event) {');
  const helperEnd = builtin.indexOf('\n}\n', helperStart) + 3;
  const events = [];
  const ctx = { state: {}, log: { debug() {} }, params: { onAgentEvent: (e) => events.push(JSON.parse(JSON.stringify(e))) } };
  const src = `${builtin.slice(helperStart, helperEnd)}\nthis.run = (ctx, evtType, assistantRecord) => {\n${builtin.slice(start, end)}\n};`;
  const context = {
    process: { env },
    normalizeToolPolicyName: (n) => n.toLowerCase(),
    runBestEffortCallback: ({ callback }) => callback(),
  };
  vm.runInNewContext(src, context);
  const call = (type, id, name) => context.run(ctx, type, { type, contentIndex: 0, partial: { content: [{ type: 'toolCall', id, name, partialJson: '' }] } });
  return { call, events };
}

test('first toolcall_start of each call reports input_start once, with name and id only', () => {
  const { call, events } = earlyBlock();
  call('toolcall_start', 'c1', 'Exec');
  call('toolcall_delta', 'c1', 'Exec');
  call('toolcall_delta', 'c2', 'Write');
  call('text_delta', 'c3', 'Read');
  assert.deepEqual(events, [
    { stream: 'tool', data: { phase: 'input_start', name: 'exec', toolCallId: 'c1' } },
    { stream: 'tool', data: { phase: 'input_start', name: 'write', toolCallId: 'c2' } },
  ]);
});

test('no name yet, or switched off: nothing is reported', () => {
  const a = earlyBlock();
  a.call('toolcall_start', 'c1', '');
  assert.equal(a.events.length, 0);
  a.call('toolcall_delta', 'c1', 'exec');
  assert.equal(a.events.length, 1, 'reported once the name arrives');
  const b = earlyBlock({ OPENCLAW_EARLY_TOOL_STATUS: '0' });
  b.call('toolcall_start', 'c1', 'exec');
  assert.equal(b.events.length, 0);
});

// Run the reply runner's tool branch against an input_start event.
function runnerBranch(evtData, env = {}) {
  const at = runner.indexOf(`// ${MARKER}`);
  const from = runner.lastIndexOf('\t\tif (evt.stream === "tool" && evt.data.hideFromChannelProgress !== true) {', at);
  const to = runner.indexOf('\t\tconst suppressItemChannelProgress', at);
  const starts = [];
  const params = {
    sourceRepliesAreToolOnly: false,
    turn: { toolProgressDetail: 'status', opts: { onToolStart: async (p) => { starts.push({ ...p }); } }, typingSignals: { signalToolStart: async () => {} } },
  };
  const context = {
    process: { env }, params, Promise, Boolean,
    readStringValue: (v) => (typeof v === 'string' ? v : undefined),
    isMessagingToolSendAction: () => false,
    shouldSuppressProgressAfterMessageToolDelivery: () => false,
    buildCommandOutputFromToolResultEvent: () => undefined,
  };
  vm.runInNewContext(`this.run = async (evt) => {\n${runner.slice(from, to)}\n};`, context);
  return context.run({ stream: 'tool', data: evtData }).then(() => starts);
}

test('reply runner shows input_start as a tool start; other unknown phases still ignored', async () => {
  assert.deepEqual(await runnerBranch({ phase: 'input_start', name: 'exec', toolCallId: 'c1' }),
    [{ itemId: undefined, toolCallId: 'c1', name: 'exec', phase: 'start', args: undefined, detailMode: 'status' }]);
  assert.deepEqual(await runnerBranch({ phase: 'input_start', toolCallId: 'c1' }), []);
  assert.deepEqual(await runnerBranch({ phase: 'input_delta', name: 'write', toolCallId: 'c1' }), []);
  assert.deepEqual(await runnerBranch({ phase: 'input_start', name: 'exec', toolCallId: 'c1' }, { OPENCLAW_EARLY_TOOL_STATUS: '0' }), []);
  assert.equal((await runnerBranch({ phase: 'start', name: 'exec', toolCallId: 'c1', args: { command: 'ls' } }))[0].phase, 'start');
});
