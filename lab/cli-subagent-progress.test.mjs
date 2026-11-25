import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { INTERVAL_MS, MARKER } from './patch-cli-subagent-progress.mjs';
import { FILES, OUTPUT_DIR, PLAN } from './build-cli-subagent-progress.mjs';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const plan = JSON.parse(fs.readFileSync(path.join(repo, PLAN), 'utf8'));
const sha = (value) => createHash('sha256').update(value).digest('hex');
const read = (rel) => fs.readFileSync(path.join(repo, rel), 'utf8');
const out = Object.fromEntries(FILES.map((f) => [f.name, read(`${OUTPUT_DIR}/${f.name}`)]));
const parser = out['cli-live-session-registry-Bux1JHPe.js'];
const runner = out['execute.runtime-DRmvah87.js'];

// V 2026-11-25 16:13:06-16:29:00: Agent call toolu_01J2StiTW7TD9efHFC5r396g, subagent records every minute.
const MINUTE = 60_000;
const ABORT_FLOOR_MS = 900_000; // BLOCKED_TOOL_CALL_ABORT_FLOOR_MS on V (diagnostic-run-activity-DLw8ESkx.js)

test('plan replaces two files by V bytes and rebuilds byte-identically', () => {
  assert.deepEqual(plan.files, FILES.map((f) => ({ source: `${OUTPUT_DIR}/${f.name}`, target: `${f.target}/${f.name}`, before: f.before })));
  for (const f of FILES) {
    const base = read(`${f.base}/${f.name}`);
    assert.equal(sha(base), f.before, f.name);
    assert.equal(f.patch(base), out[f.name], `${f.name} rebuilds`);
    assert.throws(() => f.patch(out[f.name]), /already applied/u, f.name);
    assert(out[f.name].includes(MARKER), f.name);
  }
});

function parserHook() {
  const body = parser.match(/\tconst handleParsedRecord = \(parsed\) => \{\n\t\tif \(parseErrorText\) return;\n(\t\t\/\/ cli-subagent-progress-v1[^\n]*\n\t\tif \(claudeStreamJson[\s\S]*?\n\t\t\}\n)/u)?.[1];
  assert(body, 'subagent hook right after the parse-error guard of handleParsedRecord');
  return (claudeStreamJson, record) => {
    const seen = [];
    const isClaudeSubagentRecord = (parsed) => parsed.parent_tool_use_id != null;
    new Function('claudeStreamJson', 'isClaudeSubagentRecord', 'params', 'parsed', body)(
      claudeStreamJson, isClaudeSubagentRecord, { onSubagentActivity: (a) => seen.push(a.parentToolCallId) }, record);
    return seen;
  };
}

test('the parser reports Claude subagent records by parent tool, and nothing else', () => {
  const run = parserHook();
  assert.deepEqual(run(true, { type: 'assistant', parent_tool_use_id: 'toolu_agent', message: {} }), ['toolu_agent']);
  assert.deepEqual(run(true, { type: 'user', parent_tool_use_id: ' toolu_agent ', message: {} }), ['toolu_agent']);
  assert.deepEqual(run(true, { type: 'assistant', parent_tool_use_id: null, message: {} }), []);
  assert.deepEqual(run(true, { type: 'assistant', message: {} }), []);
  assert.deepEqual(run(true, { type: 'assistant', parent_tool_use_id: '', message: {} }), []);
  assert.deepEqual(run(false, { type: 'assistant', parent_tool_use_id: 'toolu_agent' }), [], 'other CLI dialects are untouched');
  // The parent-lane filters that hide subagent records from tools/thinking/transcript are unchanged.
  const base = read('lab/release-files/cli-subagent-progress-base/cli-live-session-registry-Bux1JHPe.js');
  const filters = (s) => s.split('isClaudeSubagentRecord(params.parsed)').length - 1;
  assert(filters(base) > 0);
  assert.equal(filters(parser), filters(base));
});

function runnerHandler() {
  const body = runner.match(/\tlet lastSubagentProgressAt;\n[\s\S]*?\n\tconst emitCliSubagentActivity = [\s\S]*?\n\t\};\n/u)?.[0];
  assert(body, 'emitCliSubagentActivity');
  return ({ activeParsedTools, runParams, now }) => {
    const progress = [];
    const activity = [];
    const make = new Function('activeParsedTools', 'runParams', 'markDiagnosticRunProgress', 'resolveActiveReplyOperationForSessionId', 'Date', 'CLI_SUBAGENT_PROGRESS_INTERVAL_MS',
      `let observedCliActivity = false;\n${body}\nreturn { emitCliSubagentActivity, observed: () => observedCliActivity };`);
    const handlers = make(activeParsedTools, runParams, (p) => progress.push(p),
      (sessionId) => (sessionId === runParams.sessionId ? { recordActivity: () => activity.push(now()) } : undefined),
      { now }, INTERVAL_MS);
    return { ...handlers, progress, activity };
  };
}

const RUN = { runId: 'run-1', sessionId: '6645b335', sessionKey: 'agent:makaron:feishu:group:oc_2ab0b5b3' };

test('a busy 16-minute Agent call refreshes progress every minute, so the 900 s floor is never reached', () => {
  let t = Date.parse('2026-11-25T08:13:06Z');
  const started = t;
  const tools = new Map([['toolu_agent', { startedAt: t, toolName: 'Agent', kind: 'tool_use' }]]);
  const h = runnerHandler()({ activeParsedTools: tools, runParams: RUN, now: () => t });
  for (let minute = 1; minute <= 16; minute += 1) {
    t += MINUTE;
    h.emitCliSubagentActivity({ parentToolCallId: 'toolu_agent' });
    // Progress age as the heartbeat sees it (h.activity holds the refresh times).
    assert(t - (h.activity.at(-1) ?? started) < 2 * MINUTE, `minute ${minute}`);
  }
  assert(t - started > ABORT_FLOOR_MS, 'the tool itself is older than the floor, as on V');
  assert.equal(h.progress.length, 16);
  assert.deepEqual(h.progress[0], { ...RUN, reason: 'tool:Agent:subagent_activity' });
  assert.equal(h.activity.length, 16, 'reply operation activity refreshed too (no_activity takeover)');
  assert.equal(h.observed(), true);
});

test('refreshes at most once per interval; ignores unknown parents, finished tools and aborted runs', () => {
  let t = 0;
  const tools = new Map([['toolu_agent', { startedAt: 0, toolName: 'Agent', kind: 'tool_use' }]]);
  const controller = new AbortController();
  const h = runnerHandler()({ activeParsedTools: tools, runParams: { ...RUN, abortSignal: controller.signal }, now: () => t });
  for (let i = 0; i < 40; i += 1) { t += 1_000; h.emitCliSubagentActivity({ parentToolCallId: 'toolu_agent' }); }
  assert.equal(h.progress.length, 2, '40 s of records -> two refreshes');
  t += INTERVAL_MS;
  h.emitCliSubagentActivity({ parentToolCallId: 'toolu_other' });
  assert.equal(h.progress.length, 2, 'a parent this run is not running');
  tools.delete('toolu_agent');
  h.emitCliSubagentActivity({ parentToolCallId: 'toolu_agent' });
  assert.equal(h.progress.length, 2, 'the parent tool already returned');
  tools.set('toolu_agent', { startedAt: t, toolName: 'Agent', kind: 'tool_use' });
  controller.abort();
  h.emitCliSubagentActivity({ parentToolCallId: 'toolu_agent' });
  assert.equal(h.progress.length, 2, 'the run was aborted');
  assert.equal(h.activity.length, 2);
});

test('the runner wires the parser hook and imports the two V exports it calls', () => {
  assert.match(runner, /^import \{ d as markDiagnosticRunProgress, h as BLOCKED_TOOL_CALL_ABORT_FLOOR_MS \} from "\.\/diagnostic-run-activity-DLw8ESkx\.js";$/mu);
  assert.match(runner, /^import \{ h as resolveActiveReplyOperationForSessionId \} from "\.\/reply-run-registry\.registry-DWAbDPHN\.js";$/mu);
  assert.match(runner, new RegExp(`^const CLI_SUBAGENT_PROGRESS_INTERVAL_MS = ${INTERVAL_MS};$`, 'mu'));
  assert.match(runner, /\t\temitCliThinkingProgress,\n\t\temitCliSubagentActivity,\n\t\thasObservedCliActivity/u);
  assert.match(runner, /\t\tonUsage: params\.diagnostics\?\.observeUsage,\n\t\tonSubagentActivity: params\.events\.emitCliSubagentActivity\n\t\}\) : null;/u);
  // Each name is bound once at module scope (no shadowing collisions in the bundle).
  for (const name of ['markDiagnosticRunProgress', 'resolveActiveReplyOperationForSessionId', 'CLI_SUBAGENT_PROGRESS_INTERVAL_MS']) {
    assert.equal(runner.split(new RegExp(`(?:as|const|function) ${name}\\b`, 'u')).length - 1, 1, name);
  }
});
