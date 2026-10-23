import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { FILES, NOTICE_MARKER, OVERFLOW_NOTICE, SETTLED_MARKER, patchAgentRunner, patchEmbeddedAgent } from './patch-context-overflow-recovery.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

// V's live bytes on 2026-10-15 (checked on V 18:30 CST), as already shipped from this repository.
const V_BYTES = {
  'embedded-agent-DaSvA-Yk.js': ['release-files/upstream-5xx-fallback-on-e3/embedded-agent-DaSvA-Yk.js', 'a53fe92d1c6d1a1690587ade48271f7d1c960922716bc84935e6511242215e54'],
  'embedded-agent-helpers-CzpaLpCq.js': ['release-files/upstream-5xx-fallback-on-e3/embedded-agent-helpers-CzpaLpCq.js', '63002d77d5d5b24601e3294e64331784ef855bb8019fad6c2316614f184672b2'],
  'agent-runner.runtime-CAdsMsQt.js': ['release-files/history-image-e3/agent-runner.runtime-CAdsMsQt.js', '8c192b9d68e51450cd820352fc610d8ba8ab21cc716b05ea682275e312f95a54'],
};
const plan = JSON.parse(fs.readFileSync(path.join(here, 'context-overflow-recovery.plan.json'), 'utf8'));

test('release files are the patch applied to V bytes, and the plan pins V before-shas', () => {
  for (const file of FILES) {
    const [rel, before] = V_BYTES[file.name];
    const v = fs.readFileSync(path.join(here, rel));
    assert.equal(sha(v), before, `${rel} is not V's ${file.name}`);
    const release = fs.readFileSync(path.join(here, 'release-files/context-overflow-recovery', file.name));
    assert.equal(sha(Buffer.from(file.patch(v.toString('utf8')), 'utf8')), sha(release), `${file.name} release differs from patch(V)`);
    const entry = plan.files.find((f) => f.target === file.target);
    assert(entry, `plan lacks ${file.target}`);
    assert.equal(entry.before, before);
    assert.equal(entry.after, sha(release));
    assert.equal(entry.source, `lab/release-files/context-overflow-recovery/${file.name}`);
  }
  assert.equal(plan.files.length, FILES.length);
});

test('embedded-agent: every mid-turn-only continuation now follows requiresTranscriptContinuation', () => {
  const v = fs.readFileSync(path.join(here, V_BYTES['embedded-agent-DaSvA-Yk.js'][0]), 'utf8');
  const out = patchEmbeddedAgent(v);
  const recover = out.slice(out.indexOf('async function recoverEmbeddedRunOverflow('), out.indexOf('//#region src/agents/embedded-agent-runner/run/prompt-failure.ts'));
  assert(recover.includes('const requiresTranscriptContinuation = preflightRecovery?.source === "mid-turn" || !isCurrentAttemptReplaySafe(input.attempt);'));
  assert.equal((recover.match(/if \(requiresTranscriptContinuation\) input\.prepareCurrentTranscriptRetry\(\);/g) ?? []).length, 4);
  assert(!/preflightRecovery\??\.source === "mid-turn"\) input\.prepareCurrentTranscriptRetry/.test(recover));
  // the mid-turn precheck budget stays precheck-only, as upstream
  assert(recover.includes('terminal.promptErrorSource === "precheck" && preflightRecovery?.source === "mid-turn" && typeof preflightRecovery.promptBudgetBeforeReserve'));
  assert(out.includes('&& !vSettledToolOverflow) return { action: "proceed" };'));
  assert(out.includes(SETTLED_MARKER) && out.includes(NOTICE_MARKER));
  assert(!out.includes('Try /reset (or /new) to start a fresh session, or use a larger-context model.'));
  assert(out.includes(OVERFLOW_NOTICE));
  assert.throws(() => patchEmbeddedAgent(out), /already patched/);
});

test('agent-runner: no English overflow copy left; the rendered notice passes through', () => {
  const v = fs.readFileSync(path.join(here, V_BYTES['agent-runner.runtime-CAdsMsQt.js'][0]), 'utf8');
  const out = patchAgentRunner(v);
  for (const english of ['Auto-compaction could not recover this turn', 'Context limit exceeded', 'Context overflow — prompt too large', 'Context overflow — this conversation is too large', 'Try starting a fresh session']) {
    assert(!out.includes(english), english);
  }
  const fn = out.slice(out.indexOf('function vDeepSeekBudgetNoticeText(text) {'));
  const vDeepSeekBudgetNoticeText = new Function(`${fn.slice(0, fn.indexOf('\n}\n') + 2)}; return vDeepSeekBudgetNoticeText;`)();
  assert.equal(vDeepSeekBudgetNoticeText(`${OVERFLOW_NOTICE}本轮已经执行过的操作不会重做，重试前请先核对结果。`), `${OVERFLOW_NOTICE}本轮已经执行过的操作不会重做，重试前请先核对结果。`);
  assert.match(vDeepSeekBudgetNoticeText('Context overflow: [V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED] x'), /^上下文剩余空间不足/);
  assert.equal(vDeepSeekBudgetNoticeText('400 This model\'s maximum context length is 1048576 tokens.'), undefined);
});
