// End-to-end: a yielded parent with two visible children hands their results back.
//
// V 2026-11-07 (group oc_a59571a2): four children of a yielded parent finished ok and never
// reached it. Visible children (sessions_spawn visible=true) register without the tool call's
// Gateway resolver, so each holds its own fenced closure; the settle wake compared resolver
// functions, got a rejecting binding and failed "In-process gateway dispatch requires a gateway
// request scope or instance binding (method: agent)".
//
// Same arm, real DeepSeek, private candidate Gateway with mock Feishu: the parent spawns two
// visible children and yields. ARM=baseline (V's bytes) must show the binding failure and no
// final; ARM=fixed (subagent-settle-wake-shared-gateway-v1) must deliver one final carrying both
// children's tokens.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {DatabaseSync} from 'node:sqlite';
import {prepareCandidate, until, groupKey, GROUP_B, redact} from '../inter-session-support.mjs';

const ARM = process.env.ARM;
assert(['baseline', 'fixed'].includes(ARM), 'ARM must be baseline or fixed');
const MARKER = 'subagent-settle-wake-shared-gateway-v1';
const BINDING_ERROR = 'In-process gateway dispatch requires a gateway request scope or instance binding';
const tag = crypto.randomBytes(3).toString('hex').toUpperCase();
const tokenA = `SWA_${tag}_A`;
const tokenB = `SWA_${tag}_B`;
const final = `SWA_FINAL_${tag}`;

const c = await prepareCandidate({harness: 'worker', envMode: 'v', plugin: 'absent', maxWorkers: 2});
const loaded = ['gateway-request-scope-CmMd3nUp.js', 'subagent-completion-admission.store-JmpNDYTF.js']
  .map((name) => ({name, patched: fs.readFileSync(path.join(c.dist, name), 'utf8').includes(MARKER)}));
const proof = {kind: 'subagent-settle-wake', arm: ARM, ok: false, tag, loaded, checks: []};
assert(loaded.every((f) => f.patched === (ARM === 'fixed')), `runtime does not match ARM=${ARM}: ${JSON.stringify(loaded)}`);

const parentKey = groupKey(GROUP_B);
const runs = () => {
  const f = path.join(c.stateDir, 'state', 'openclaw.sqlite');
  if (!fs.existsSync(f)) return [];
  const db = new DatabaseSync(f, {readOnly: true});
  try {
    return db.prepare('select run_id as runId, child_session_key as child, payload_json as p from subagent_runs where requester_session_key = ?')
      .all(parentKey).map((r) => {
        const p = JSON.parse(r.p);
        return {runId: r.runId, child: r.child, taskName: p.taskName, status: p.execution?.status, outcome: p.execution?.outcome?.status,
          delivery: p.delivery?.status, lastError: p.delivery?.lastError, wake: p.requesterSettleWake && {status: p.requesterSettleWake.status, attempts: p.requesterSettleWake.attemptCount, lastError: p.requesterSettleWake.lastError, yieldBatch: p.requesterSettleWake.requesterYieldBatch === true}};
      });
  } finally { db.close(); }
};
const finals = () => c.fake.list(GROUP_B).filter((m) => JSON.stringify(m).includes(final));
const bindingFailures = () => c.lines.filter((x) => x.line.includes('requester settle wake') && x.line.includes(BINDING_ERROR)).map((x) => redact(x.line).slice(0, 300));

try {
  await c.start();
  await c.ensureSession(parentKey);
  await c.humanInGroup(GROUP_B, {text: [
    '这是自动化功能验收，请严格照做。',
    `第一步：调用 sessions_spawn 两次，两次都必须带 visible=true 和 runtime="subagent"。第一次 taskName=svA，task 写「只回复 ${tokenA}，不要调用任何工具」；第二次 taskName=svB，task 写「只回复 ${tokenB}，不要调用任何工具」。`,
    '第二步：两个都派出后，立即调用 sessions_yield，不要等待、不要轮询、不要自己代做。',
    `第三步：收到两个子 agent 的结果后，只回复一行：${final} 加上两个子 agent 返回的原文。不要调用 message 工具。`,
  ].join('\n')});

  const children = await until(() => {
    const r = runs().filter((x) => x.taskName === 'svA' || x.taskName === 'svB');
    return r.length === 2 && r.every((x) => x.status === 'terminal') ? r : undefined;
  }, {timeoutMs: 360_000, label: 'two visible children finished'});
  proof.children = children;
  assert(children.every((x) => x.child.includes(':dashboard:')), 'both children must be visible (dashboard) sessions');
  assert(children.every((x) => x.outcome === 'ok'), 'both children must finish ok');
  assert(children.some((x) => x.wake?.yieldBatch), 'the parent must have yielded (requester settle wake batch)');
  proof.checks.push('two visible children ok under a yielded parent');

  if (ARM === 'fixed') {
    await until(() => finals().length > 0, {timeoutMs: 300_000, label: 'parent final with both results'});
    const text = JSON.stringify(finals());
    assert(text.includes(tokenA) && text.includes(tokenB), 'the final must carry both children\'s results');
    assert.equal(bindingFailures().length, 0, 'no settle wake binding failure');
    proof.checks.push('settle wake delivered: one final with both tokens', 'no binding failure');
  } else {
    await until(() => bindingFailures().length > 0, {timeoutMs: 300_000, label: 'settle wake binding failure (V today)'});
    // Give the retry window a chance to prove nothing is delivered after the failure.
    await new Promise((r) => setTimeout(r, 60_000));
    assert.equal(finals().length, 0, 'baseline must not deliver the final');
    proof.checks.push('settle wake refused a Gateway binding', 'no final delivered');
  }
  proof.bindingFailures = bindingFailures();
  proof.runs = runs();
  proof.finals = finals().length;
  proof.ok = true;
} catch (e) {
  proof.error = redact(e.stack);
  proof.runs = runs();
  proof.bindingFailures = bindingFailures();
  proof.finals = finals().length;
  proof.gatewayTail = redact(c.lines.filter((x) => /subagent|settle|spawn|yield/iu.test(x.line)).slice(-60).map((x) => x.line).join('\n'));
  process.exitCode = 1;
} finally {
  await c.stop();
  await c.cleanup();
  console.log(JSON.stringify(proof));
}
