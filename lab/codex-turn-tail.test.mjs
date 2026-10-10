// codex-turn-tail-v1: the tail timer and where it is wired (core chunks and the Codex run-attempt).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { TAIL_HELPER, TAIL_MARKER } from './codex-turn-tail.mjs';
import { patchEmbeddedAgent, patchNodeSqlite, patchWsLog } from './patch-codex-turn-tail.mjs';
import { TAIL_FILES } from './build-codex-turn-tail.mjs';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const sha = (v) => createHash('sha256').update(v).digest('hex');
const KEY = Symbol.for('openclaw.v.codexTurnTail.v1');
const freshTail = () => {
  delete globalThis[KEY];
  return new Function(`${TAIL_HELPER}\nreturn __vCodexTurnTail();`)();
};

test('one tracker per process: marks, notes, one summary at the end, and the sampler stops', async () => {
  const tail = freshTail();
  assert.equal(new Function(`${TAIL_HELPER}\nreturn __vCodexTurnTail();`)(), tail, 'a second chunk gets the same tracker');
  assert.equal(tail.active(), false);
  tail.note('tx', { op: 'agent.write', waitMs: 900, holdMs: 40 }); // no tail: dropped
  tail.start('run-1', { harness: 'codex' });
  tail.start('run-1', { harness: 'other' }); // a second start keeps the first
  assert.equal(tail.active(), true);
  await new Promise((r) => setTimeout(r, 30));
  tail.mark('run-1', 'prompt-mirror-wait');
  tail.note('tx', { op: 'agent.write', waitMs: 1030, holdMs: 16 });
  tail.note('rpc', { method: 'sessions.get', ms: 1465, conn: '58df29f7' });
  tail.mark('run-1', 'settle');
  tail.mark('unknown-run', 'settle'); // ignored
  const out = tail.end('run-1');
  assert.equal(out.runId, 'run-1');
  assert.equal(out.harness, 'codex');
  assert.deepEqual(out.steps.map(([s]) => s), ['prompt-mirror-wait', 'settle']);
  assert(out.steps[0][1] >= 25, 'the first step counts from the tail start');
  assert.equal(out.tx.length, 1);
  assert.deepEqual({ ...out.tx[0], atMs: 0 }, { op: 'agent.write', waitMs: 1030, holdMs: 16, atMs: 0 });
  assert.equal(out.rpc[0].method, 'sessions.get');
  assert(out.totalMs >= out.steps[0][1]);
  assert.equal(typeof out.lagMaxMs, 'number');
  assert.equal(tail.end('run-1'), undefined, 'logged once');
  assert.equal(tail.active(), false, 'the sampler stops with the last tail');
  delete globalThis[KEY];
});

test('bounded: old tails expire, at most 64 run, at most 40 notes per kind', () => {
  const tail = freshTail();
  const realNow = Date.now;
  try {
    let now = 1_000_000;
    Date.now = () => now;
    tail.start('old', {});
    now += 601_000;
    tail.start('new', {});
    assert.equal(tail.end('old'), undefined, 'a tail older than 10 minutes is dropped at the next start');
    for (let i = 0; i < 70; i += 1) tail.start(`r${i}`, {});
    assert.equal(tail.end('new'), undefined, 'the oldest is evicted past 64');
    for (let i = 0; i < 50; i += 1) tail.note('rpc', { method: 'm', ms: 300 });
    assert.equal(tail.end('r69').rpc.length, 40);
  } finally {
    Date.now = realNow;
    for (let i = 0; i < 70; i += 1) globalThis[KEY]?.end(`r${i}`);
    delete globalThis[KEY];
  }
});

test('core release files are exactly the patch of V\'s bytes; each anchor once; a patched file is refused', () => {
  for (const file of TAIL_FILES) {
    const input = read(file.from);
    assert.equal(sha(input), file.before, `${file.name} input is V's bytes`);
    const out = file.patch(input);
    assert.equal(read(`lab/release-files/codex-turn-tail/${file.name}`), out, `${file.name} release`);
    assert.throws(() => file.patch(out), /already carries/u);
    assert.equal(out.split('//#region V codex-turn-tail-v1').length - 1, 1, `${file.name}: one helper`);
  }
  const sqlite = patchNodeSqlite(read('lab/fixtures/codex-turn-tail/node-sqlite-CL-d6drd.js'));
  assert.match(sqlite, /const vTailBeginAt = Date\.now\(\);[^\n]*\n\tbeginTransaction\(db, options, mode\);\n\tconst vTailWaitMs = Date\.now\(\) - vTailBeginAt;/u);
  assert.match(sqlite, /if \(vTail\.active\(\) && \(vTailWaitMs >= 20 \|\| vTailHoldMs >= 50\)\) vTail\.note\("tx"/u);
  const ws = patchWsLog(read('lab/fixtures/codex-turn-tail/ws-log-CFwaDvs6.js'));
  assert.match(ws, /durationMs >= 200 && __vCodexTurnTail\(\)\.active\(\)\) __vCodexTurnTail\(\)\.note\("rpc"/u);
  const agent = patchEmbeddedAgent(read('lab/release-files/gpt-live-call/embedded-agent-DaSvA-Yk.js'));
  const order = ['"attempt-return"', '"user-message-persistence"', '"settle"'].map((m) => agent.indexOf(m));
  assert(order.every((i) => i > 0));
  assert(agent.indexOf('"normalize"') > 0 && agent.indexOf('"failover-decision"') > 0);
  assert.match(agent, /if \(vTail\) log\$3\.info\(`\[codex-turn-tail\.1\] \$\{JSON\.stringify\(vTail\)\}`\);/u);
});

test('run-attempt starts the tail at turn/completed and marks its final section in order', () => {
  const ra = read('lab/release-files/codex-firsttext/dist/run-attempt-D1hJO4fX.js');
  assert.equal(ra.split(`//#region V ${TAIL_MARKER}`).length - 1, 1);
  assert.match(ra, /case "turn\/completed":\n\t+__vCodexTurnTail\(\)\.start\(this\.params\.runId,/u);
  const marks = ['turn-completion', 'drain-close-projection', 'turn-drain', 'usage-and-result', 'prompt-mirror-wait', 'transcript-mirror', 'settled-finalization', 'agent-end-hooks', 'binding-mark']
    .map((m) => ra.indexOf(`__vCodexTurnTail().mark(params.runId, "${m}")`));
  assert(marks.every((i) => i > 0), 'every mark is present');
  assert.deepEqual([...marks].sort((a, b) => a - b), marks, 'in source order');
  assert.equal(ra.split('await activeTurn.promptMirrorSettled;').length - 1, 1, 'the prompt-mirror wait is not duplicated');
});
