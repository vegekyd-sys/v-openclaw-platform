import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {Console} from 'node:console';
import {Writable} from 'node:stream';
import {restoreDemandExpansion} from './cold-start-pipeline-contract.mjs';
const read = file => fs.readFileSync(new URL(file, import.meta.url), 'utf8');
for (const name of ['index.mjs', 'worker-pool.mjs', 'worker.mjs']) {
  const raw = read('./release-files/production-worker-' + name);
  const updated = name === 'worker-pool.mjs' ? restoreDemandExpansion(raw) : raw;
  const before = read('./fixtures/concurrency-native-baseline/production-worker-' + name);
  test(name + ': only the already-sanitized observer sink changes', () => {
    const prefix = 'import {Console as FirsttextMetricConsole} from "node:console";\nconst ocFirsttextMetricConsole = new FirsttextMetricConsole({stdout: process.stdout, stderr: process.stderr, ignoreErrors: true});\n';
    const withoutTemporaryProfile = updated.replace('// Temporary VLab-only, dedicated-session CPU diagnostic. No inspector listener.\nimport {withConcurrencyProfile} from \'../openclaw/dist/gateway-concurrency-profiler.mjs\';\nasync function runAgent(message, abortSignal) {\n  return withConcurrencyProfile(message, () => runAgentWithWorkerProfile(message, abortSignal));\n}\nasync function runAgentWithWorkerProfile(message, abortSignal) {', 'async function runAgent(message, abortSignal) {')
      // Independently covered by native-module-resolution-cache.test.mjs.
      .replace('import { installNativeModuleResolutionCache } from "./native-module-resolution-cache.mjs";\n', '')
      .replace('    installNativeModuleResolutionCache({agentRuntimePath: configuredAgentRuntimePath()});\n', '');
    assert.equal(withoutTemporaryProfile, prefix + before.replace("    console.error('[firsttext-worker-phases] ' + JSON.stringify(row));", "    // row contains only validated timing/identity fields; no prompt, tool args or credentials.\n    ocFirsttextMetricConsole.error('[firsttext-worker-phases] ' + JSON.stringify(row));"));
  });
  test(name + ': allowlist excludes all arbitrary strings, secrets, bodies and tool arguments', () => {
    const output = [], source = updated.slice(updated.indexOf('\n') + 1, updated.indexOf('\nimport '));
    const sink = new Writable({write(chunk, _encoding, callback) {output.push(String(chunk)); callback();}});
    const process = {pid: 123, env: {OPENCLAW_FIRSTTEXT_WORKER_PHASES: '1'}, stderr: sink, stdout: sink};
    const mark = Function('process', 'FirsttextMetricConsole', source + ';return ocFirsttextWorkerMark;')(process, Console);
    const runId = '11111111-1111-1111-1111-111111111111';
    mark('gateway-harness-enter', runId, {requestId: 'Bearer secret', eventId: 'secret', name: 'secret', workerPid: 'secret', slot: 'secret', prompt: 'secret', apiKey: 'secret', args: {secret: true}});
    const row = JSON.parse(output[0].slice('[firsttext-worker-phases] '.length));
    assert.deepEqual(Object.keys(row).sort(), ['atMs', 'monoMs', 'pid', 'runId', 'stage', 'v']); assert(!output[0].includes('secret'));
    mark('unknown-stage', runId); mark('gateway-harness-enter', 'secret-token'); assert.equal(output.length, 1);
    mark('pool-callback-enter', runId, {requestId: 'request-1', eventId: 'stream-2', name: 'onPartialReply', workerPid: 22, slot: 1});
    const valid = JSON.parse(output[1].slice('[firsttext-worker-phases] '.length)); assert.equal(valid.requestId, 'request-1'); assert.equal(valid.name, 'onPartialReply');
    process.env.OPENCLAW_FIRSTTEXT_WORKER_PHASES = '0'; mark('gateway-harness-enter', runId); assert.equal(output.length, 2);
  });
  test(name + ': output-stream errors cannot reject or crash the business callback', async () => {
    const source = updated.slice(updated.indexOf('\n') + 1, updated.indexOf('\nimport '));
    const sink = new Writable({write(_chunk, _encoding, callback) {callback(Object.assign(new Error('closed fixture pipe'), {code: 'EPIPE'}));}});
    const process = {pid: 123, env: {OPENCLAW_FIRSTTEXT_WORKER_PHASES: '1'}, stderr: sink, stdout: sink};
    const mark = Function('process', 'FirsttextMetricConsole', source + ';return ocFirsttextWorkerMark;')(process, Console);
    assert.doesNotThrow(() => mark('gateway-harness-enter', '11111111-1111-1111-1111-111111111111'));
    await new Promise(resolve => setImmediate(resolve));
  });
}
