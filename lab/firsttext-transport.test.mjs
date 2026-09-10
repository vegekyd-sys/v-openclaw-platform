import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
for (const name of ['index.mjs', 'worker-pool.mjs', 'worker.mjs']) {
  const updated = read('./release-files/production-worker-' + name), before = read('./fixtures/concurrency-native-baseline/production-worker-' + name);
  test(name + ': only the already-sanitized observer sink changes', () => {
    assert.equal(updated, before.replace("    console.error('[firsttext-worker-phases] ' + JSON.stringify(row));", "    // row contains only validated timing/identity fields; no prompt, tool args or credentials.\n    process.stderr.write('[firsttext-worker-phases] ' + JSON.stringify(row) + '\\n');"));
  });
  test(name + ': allowlist excludes all arbitrary strings, secrets, bodies and tool arguments', () => {
    const output = [], source = updated.slice(0, updated.indexOf('\nimport '));
    const process = {pid: 123, env: {OPENCLAW_FIRSTTEXT_WORKER_PHASES: '1'}, stderr: {write: s => output.push(s)}};
    const mark = Function('process', source + ';return ocFirsttextWorkerMark;')(process);
    const runId = '11111111-1111-1111-1111-111111111111';
    mark('gateway-harness-enter', runId, {requestId: 'Bearer secret', eventId: 'secret', name: 'secret', workerPid: 'secret', slot: 'secret', prompt: 'secret', apiKey: 'secret', args: {secret: true}});
    const row = JSON.parse(output[0].slice('[firsttext-worker-phases] '.length));
    assert.deepEqual(Object.keys(row).sort(), ['atMs', 'monoMs', 'pid', 'runId', 'stage', 'v']); assert(!output[0].includes('secret'));
    mark('unknown-stage', runId); mark('gateway-harness-enter', 'secret-token'); assert.equal(output.length, 1);
    mark('pool-callback-enter', runId, {requestId: 'request-1', eventId: 'stream-2', name: 'onPartialReply', workerPid: 22, slot: 1});
    const valid = JSON.parse(output[1].slice('[firsttext-worker-phases] '.length)); assert.equal(valid.requestId, 'request-1'); assert.equal(valid.name, 'onPartialReply');
    process.env.OPENCLAW_FIRSTTEXT_WORKER_PHASES = '0'; mark('gateway-harness-enter', runId); assert.equal(output.length, 2);
  });
}
