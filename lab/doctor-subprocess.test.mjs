import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { BEFORE, CONTRIBUTIONS, MARKER, OPERATIONS, patch, sha256, unpatch } from './patch-doctor-subprocess.mjs';

// doctor-subprocess: the built-in assistant's doctor runs in a child process without the two
// transcript-wide scans. See lab/doctor-subprocess.md.
const root = new URL('..', import.meta.url);
const read = (rel) => fs.readFileSync(new URL(rel, root), 'utf8');
const plan = JSON.parse(read('lab/doctor-subprocess.plan.json'));
const released = Object.fromEntries([OPERATIONS, CONTRIBUTIONS].map((name) => [name, read(`lab/release-files/doctor-subprocess/${name}`)]));
const original = Object.fromEntries(Object.entries(released).map(([name, source]) => [name, unpatch(name, source)]));
const between = (source, from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)) + to.length);

test('plan pins V bytes before and the release files after', () => {
  assert.deepEqual(plan.files.map((file) => file.target), [OPERATIONS, CONTRIBUTIONS].map((name) => `openclaw/dist/${name}`));
  for (const file of plan.files) {
    const name = path.basename(file.target);
    assert.equal(file.source, `lab/release-files/doctor-subprocess/${name}`);
    assert.equal(file.before, BEFORE[name]);
    assert.equal(sha256(original[name]), BEFORE[name], `${name}: V bytes`);
    assert.equal(sha256(released[name]), file.after, `${name}: release bytes`);
    assert.equal(patch(name, original[name]), released[name]);
    assert.throws(() => patch(name, released[name]), /already patched/);
  }
});

test('only the doctor case and the contribution runner change; V code stays behind the switches', () => {
  const removed = (name) => {
    const lines = new Set(released[name].split('\n'));
    return original[name].split('\n').filter((line) => !lines.has(line)).map((line) => line.trim());
  };
  assert.deepEqual(removed(OPERATIONS), []);
  assert.deepEqual(removed(CONTRIBUTIONS), ['await runDoctorHealthContributionList(ctx, resolveDoctorHealthContributions());']);
  const doctorCase = between(released[OPERATIONS], '\t\tcase "doctor":', '\t\tcase "doctor-fix":');
  assert.match(doctorCase, /if \(!opts\.deps\?\.runDoctor && process\.env\.OPENCLAW_V_DOCTOR_SUBPROCESS !== "0"\) \{\n\t\t\t\tawait runDoctorSubprocess\(runtime\);\n\t\t\t\treturn \{ applied: false \};/);
  // the in-process doctor is V's line, reached with OPENCLAW_V_DOCTOR_SUBPROCESS=0 or an injected runDoctor
  assert.match(doctorCase, /\t\t\tawait \(opts\.deps\?\.runDoctor \?\? \(await import\("\.\/doctor-C3VXV-em\.js"\)\)\.doctorCommand\)\(runtime, \{ nonInteractive: true \}\);\n\t\t\treturn \{ applied: false \};\n\t\tcase "doctor-fix":/);
  const runner = between(released[CONTRIBUTIONS], 'async function runDoctorHealthContributions(ctx) {', '\n}\n');
  assert.match(runner, /process\.env\.OPENCLAW_V_DOCTOR_SKIP_TRANSCRIPT_SCANS === "1" \? skipTranscriptScanContributions\(contributions\) : contributions/);
  // the lint path (resolveDoctorContributionHealthChecks) is untouched
  const lint = (source) => between(source, 'async function resolveDoctorContributionHealthChecks()', '\treturn checks;\n}\n');
  assert.equal(lint(released[CONTRIBUTIONS]), lint(original[CONTRIBUTIONS]));
  for (const name of [OPERATIONS, CONTRIBUTIONS]) assert(released[name].includes(MARKER));
});

// ---- the released runner, run against a fake dist/index.js ----
function sandbox(t, indexSource) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'doctor-subprocess-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const region = between(released[OPERATIONS], `//#region ${MARKER}\n`, '//#endregion\n');
  fs.writeFileSync(path.join(dir, 'runner.mjs'), `import fs from "node:fs";\n${region}export { runDoctorSubprocess };\n`);
  fs.writeFileSync(path.join(dir, 'index.js'), indexSource);
  fs.writeFileSync(path.join(dir, 'harness.mjs'), `import { runDoctorSubprocess } from "./runner.mjs";
const calls = [];
const runtime = { log: (line) => calls.push(["log", line]), error: (line) => calls.push(["error", line]), exit: (code) => calls.push(["exit", code]) };
let failure;
try { await runDoctorSubprocess(runtime); } catch (error) { failure = error.message; }
process.stdout.write(JSON.stringify({ calls, failure }));
`);
  return (env = {}, nodeArgs = []) => {
    const result = spawnSync(process.execPath, [...nodeArgs, path.join(dir, 'harness.mjs')], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, env: { ...process.env, ...env } });
    assert.equal(result.status, 0, result.stderr);
    return JSON.parse(result.stdout);
  };
}

test('child gets doctor --non-interactive, the parent execArgv without --inspect, nice and the skip switch', (t) => {
  const run = sandbox(t, `import os from "node:os";
console.log(JSON.stringify({ argv: process.argv.slice(2), execArgv: process.execArgv, nice: os.getPriority(), skip: process.env.OPENCLAW_V_DOCTOR_SKIP_TRANSCRIPT_SCANS ?? null, cwd: process.cwd(), marker: process.env.DOCTOR_TEST_MARKER }));
`);
  const { calls, failure } = run({ DOCTOR_TEST_MARKER: 'parent-env' }, ['--inspect=127.0.0.1:0', '--max-old-space-size=256']);
  assert.equal(failure, undefined);
  const logs = calls.filter(([kind]) => kind === 'log');
  assert.equal(logs.length, 1);
  const seen = JSON.parse(logs[0][1]);
  assert.deepEqual(seen.argv, ['doctor', '--non-interactive']);
  assert.deepEqual(seen.execArgv, ['--max-old-space-size=256', '--disable-warning=ExperimentalWarning']);
  assert.equal(seen.nice, 10);
  assert.equal(seen.skip, '1');
  assert.equal(seen.marker, 'parent-env');
  assert.equal(seen.cwd, process.cwd());
  assert(!calls.some(([kind]) => kind === 'exit'));
  // OPENCLAW_V_DOCTOR_TRANSCRIPT_SCANS=1 keeps both scans, even if the Gateway had the skip set
  const full = run({ OPENCLAW_V_DOCTOR_TRANSCRIPT_SCANS: '1', OPENCLAW_V_DOCTOR_SKIP_TRANSCRIPT_SCANS: '1' });
  assert.equal(JSON.parse(full.calls.find(([kind]) => kind === 'log')[1]).skip, null);
});

test('stdout and stderr arrive line by line, split UTF-8 included; a non-zero exit goes to runtime.exit', (t) => {
  const run = sandbox(t, `const out = Buffer.from("┌  OpenClaw doctor\\n│  第一行\\n└  Doctor complete.");
process.stdout.write(out.subarray(0, 21));
setTimeout(() => {
  process.stdout.write(out.subarray(21));
  process.stderr.write("warn one\\nwarn two\\n");
  process.exitCode = 3;
}, 50);
`);
  const { calls, failure } = run();
  assert.equal(failure, undefined);
  assert.deepEqual(calls.filter(([kind]) => kind === 'log'), [['log', '┌  OpenClaw doctor'], ['log', '│  第一行'], ['log', '└  Doctor complete.']]);
  assert.deepEqual(calls.filter(([kind]) => kind === 'error'), [['error', 'warn one'], ['error', 'warn two']]);
  assert.deepEqual(calls.at(-1), ['exit', 3]);
});

test('output stops at 1 MiB with a note; a killed child is an error', (t) => {
  const big = sandbox(t, `process.stdout.write("x".repeat(100) + "\\n");
for (let i = 0; i < 12; i++) process.stdout.write("y".repeat(100 * 1024) + "\\n");
`);
  const { calls } = big();
  const lines = calls.filter(([kind]) => kind === 'log').map(([, line]) => line);
  const logged = Buffer.byteLength(lines.join('\n'));
  assert(logged > 1000 * 1024 && logged <= 1024 * 1024, `logged ${logged} bytes`);
  assert.match(calls.find(([kind]) => kind === 'error')[1], /truncated after 1 MiB/);
  const killed = sandbox(t, 'process.kill(process.pid, "SIGKILL");\n');
  assert.match(killed().failure, /Doctor process stopped unexpectedly \(SIGKILL\)/);
});

test('the skip replaces both transcript scans with one note in place and leaves other contributions alone', async () => {
  const source = between(released[CONTRIBUTIONS], 'const TRANSCRIPT_SCAN_CONTRIBUTION_IDS', '\treturn kept;\n}\n');
  const notes = [];
  const skip = new Function('loadNoteModule', `${source}return skipTranscriptScanContributions;`)(async () => ({ note: (...args) => notes.push(args) }));
  const make = (id) => ({ id, label: id, required: false, healthChecks: [], healthCheckIds: [], run: async () => notes.push(['ran', id]) });
  const ids = ['doctor:backups', 'doctor:session-transcript-headers', 'doctor:session-transcript-labels', 'doctor:session-snapshots'];
  const kept = skip(ids.map(make));
  assert.deepEqual(kept.map((c) => c.id), ['doctor:backups', 'doctor:session-transcript-scans-skipped', 'doctor:session-snapshots']);
  assert.equal(kept[1].required, false);
  for (const contribution of kept) await contribution.run();
  assert.deepEqual(notes.map((n) => n[0] === 'ran' ? n[1] : n[1]), ['doctor:backups', 'Session transcripts', 'doctor:session-snapshots']);
  assert.match(notes[1][0], /openclaw doctor/);
  const none = ['doctor:backups'].map(make);
  assert.equal(skip(none), none);
  // V's contribution list has both ids, adjacent
  const list = released[CONTRIBUTIONS];
  const headers = list.indexOf('id: "doctor:session-transcript-headers"');
  const labels = list.indexOf('id: "doctor:session-transcript-labels"');
  assert(headers > 0 && labels > headers && list.slice(headers, labels).split('createDoctorHealthContribution(').length === 2);
});
