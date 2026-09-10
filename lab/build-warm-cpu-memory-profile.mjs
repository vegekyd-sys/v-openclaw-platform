// Temporary selected-session diagnostic. Never signals or attaches to a PID.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const sha = s => createHash('sha256').update(s).digest('hex');
const read = target => JSON.parse(execFileSync(process.execPath, ['/Users/tianyicai/vlab-dev/lab/vlab.mjs', 'read-code', '--target', target], {encoding: 'utf8', maxBuffer: 4 * 1024 ** 2, timeout: 120000}));
const files = [];
for (const [target, dest, apply] of [
  ['openclaw/dist/chat-send-handler-DBjXcn_1.js', 'profile-chat-send-handler.js', source => {
    const anchor = 'async function handleChatSend(options, onAdmissionOwned, externalAuthorityAdmission) {\n\tawait handleChatSendWithOptions(options, onAdmissionOwned, externalAuthorityAdmission);\n}';
    assert.equal(source.split(anchor).length, 2);
    return 'import {withConcurrencyProfile} from "./concurrency-cpu-memory-profiler.mjs";\n' + source.replace(anchor, 'async function handleChatSend(options, onAdmissionOwned, externalAuthorityAdmission) {\n\treturn await withConcurrencyProfile(options.params, () => handleChatSendWithOptions(options, onAdmissionOwned, externalAuthorityAdmission));\n}');
  }],
  ['production-worker/worker.mjs', 'profile-production-worker.mjs', source => {
    const anchor = 'async function runAgent(message, abortSignal) {';
    assert.equal(source.split(anchor).length, 2);
    return 'import {withConcurrencyProfile} from "../openclaw/dist/concurrency-cpu-memory-profiler.mjs";\n' + source.replace(anchor, 'async function runAgent(message, abortSignal) {\n  return await withConcurrencyProfile({sessionKey: message.sessionKey, idempotencyKey: message.runId}, () => runAgentUnprofiled(message, abortSignal));\n}\nasync function runAgentUnprofiled(message, abortSignal) {');
  }],
]) {
  const r = read(target); assert.equal(r.current.release, 'concurrency-workboard-cache-v1');
  const source = Buffer.from(r.content, 'base64').toString(); assert.equal(sha(source), r.sha256);
  const output = apply(source); fs.writeFileSync(new URL('./release-files/' + dest, import.meta.url), output);
  files.push({source: 'lab/release-files/' + dest, target, before: r.sha256});
}
let profiler = fs.readFileSync(new URL('./release-files/gateway-concurrency-profiler.mjs', import.meta.url), 'utf8');
profiler = profiler.replace("import {Session} from 'node:inspector';", "import {Session} from 'node:inspector';\nimport {Console} from 'node:console';\nconst metricConsole = new Console({stdout: process.stdout, stderr: process.stderr, ignoreErrors: true});");
profiler = profiler.replace("const emit = data => console.error(", "const emit = data => metricConsole.error(");
profiler = profiler.replace('current = undefined; clearTimeout(state.timer);', 'current = undefined; clearTimeout(state.timer); clearInterval(state.memoryTimer); state.sampleMemory();');
profiler = profiler.replace("event: 'summary', pid: process.pid,", "event: 'summary', pid: process.pid, memory: {start: state.memoryStart, peak: state.memoryPeak, end: process.memoryUsage()},");
profiler = profiler.replace('const state = {session, lag, startedAt: Date.now()};', `const memoryStart = process.memoryUsage(), memoryPeak = {...memoryStart};
  const sampleMemory = () => {for (const [key, value] of Object.entries(process.memoryUsage())) memoryPeak[key] = Math.max(memoryPeak[key], value);};
  const state = {session, lag, startedAt: Date.now(), memoryStart, memoryPeak, sampleMemory, memoryTimer: setInterval(sampleMemory, 100).unref()};`);
profiler = profiler.replace('} catch {lag.disable(); session.disconnect();', '} catch {clearInterval(state.memoryTimer); lag.disable(); session.disconnect();');
fs.writeFileSync(new URL('./release-files/concurrency-cpu-memory-profiler.mjs', import.meta.url), profiler);
files.push({source: 'lab/release-files/concurrency-cpu-memory-profiler.mjs', target: 'openclaw/dist/concurrency-cpu-memory-profiler.mjs', before: null});
fs.writeFileSync(new URL('./warm-cpu-memory-profile-plan.json', import.meta.url), JSON.stringify({baseRelease: 'concurrency-workboard-cache-v1', files}, null, 2) + '\n');
console.log(JSON.stringify({baseRelease: 'concurrency-workboard-cache-v1', files: files.length}));
