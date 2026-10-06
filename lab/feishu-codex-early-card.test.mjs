import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { MARKER, patchFeishuMonitor } from './patch-feishu-codex-early-card.mjs';

const read = (url) => fs.readFileSync(new URL(url, import.meta.url), 'utf8');
// V's Feishu monitor as captured after firsttext-r1 (2026-10-06)
const original = read('../release/captured/v2026.9.1-db91.6-firsttext-r1-20261006.feishu/dist/dist/monitor.account-WFdlCDhR.js');
const released = read('./release-files/feishu-codex-early-card/monitor.account-WFdlCDhR.js');

test('release file is V\'s Feishu monitor plus only the early-card line', () => {
  assert.equal(patchFeishuMonitor(original), released);
  assert.throws(() => patchFeishuMonitor(released), /already patched/);
  const added = released.split('\n').filter((line) => !original.includes(line));
  assert.equal(added.length, 2);
});

test('the line runs inside onAgentRunStart, after the run start mark, in the dispatcher scope', () => {
  const at = released.indexOf(MARKER);
  const hook = released.lastIndexOf('onAgentRunStart: (runId) => {', at);
  assert(hook > 0 && at - hook < 400, 'not inside onAgentRunStart');
  assert(released.lastIndexOf('vFirsttextMark("runStartAtMs");', at) > hook);
  // every name it uses is declared earlier in the same reply dispatcher
  const scopeStart = released.lastIndexOf('const vFirsttextE2e = {', at);
  for (const decl of ['const previewStreamingEnabled =', 'let idleRequestedForReply =', 'const startStreaming = () =>', 'responsePrefixContextProvider, onModelSelected } = createChannelMessageReplyPipeline']) {
    const i = released.indexOf(decl, scopeStart);
    assert(i > scopeStart && i < at, decl);
  }
});

test('only codex runs open the card at run start, and never after the reply went idle', () => {
  const at = released.indexOf(MARKER);
  const line = released.slice(released.indexOf('\n', at) + 1, released.indexOf('\n', released.indexOf('\n', at) + 1));
  const run = (agentRuntime, { preview = true, idle = false } = {}) => {
    let started = 0;
    vm.runInNewContext(line, {
      previewStreamingEnabled: preview,
      idleRequestedForReply: idle,
      responsePrefixContextProvider: () => ({ agentRuntime }),
      startStreaming: () => { started += 1; },
    });
    return started;
  };
  assert.equal(run('codex'), 1);
  for (const runtime of ['vlab-worker', 'claude-cli', 'pi', undefined]) assert.equal(run(runtime), 0, String(runtime));
  assert.equal(run('codex', { preview: false }), 0);
  assert.equal(run('codex', { idle: true }), 0);
});
