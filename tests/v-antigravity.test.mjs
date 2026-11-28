import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildAntigravityCliBackend } from '../apps/v-antigravity/plugin/backend.js';
import { accountModel, readHostArgs, toAgyMcpConfig, composePrompt, createClaudeStreamTranslator } from '../apps/v-antigravity/plugin/runtime.js';

// A stand-in for `agy --input-format stream-json --output-format stream-json`
// that behaves like agy 1.5.18 did on VLab (2026-11-28): init once, then per
// user message a user_input step, an answer and a result; a message written
// while a turn runs is queued and runs as the next turn.
const FAKE_AGY = `
const fs = require('node:fs');
const args = process.argv.slice(2);
const at = (f) => { const i = args.indexOf(f); return i >= 0 ? args[i + 1] : undefined; };
fs.writeFileSync(process.env.FAKE_LOG, JSON.stringify({ args, cwd: process.cwd(), home: process.env.HOME,
  agent: fs.existsSync('.agents/agents/v.md') ? fs.readFileSync('.agents/agents/v.md', 'utf8') : null,
  mcp: fs.existsSync('.agents/mcp_config.json') ? JSON.parse(fs.readFileSync('.agents/mcp_config.json', 'utf8')) : null, pid: process.pid }) + '\\n', { flag: 'a' });
const conv = at('--conversation') || 'conv-' + process.pid;
const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
out({ event: 'init', conversation_id: conv, init: { model: at('--model'), agent: at('--agent') } });
let step = 0; const queue = []; let busy = false;
const run = async () => {
  if (busy || !queue.length) return; busy = true;
  const msg = queue.shift();
  out({ event: 'step_update', step_update: { conversation_id: conv, step_index: step++, state: 'DONE', step_type: 'user_input' } });
  if (msg.includes('EXIT')) process.exit(3);
  await new Promise((r) => setTimeout(r, msg.includes('QUIET') ? 1500 : msg.includes('SLOW') ? 300 : 20));
  out({ event: 'step_update', step_update: { conversation_id: conv, step_index: step++, state: 'DONE', step_type: 'agent_response', text_delta: 'ANS<' + msg + '>' } });
  out({ event: 'result', result: { conversation_id: conv, status: 'SUCCESS', response: 'ANS<' + msg + '>', usage: { input_tokens: 10, output_tokens: 2 } } });
  busy = false; run();
};
require('node:readline').createInterface({ input: process.stdin }).on('line', (l) => { queue.push(JSON.parse(l).message.content); run(); });
`;

function setup(t, { config: extra = {}, deps: extraDeps = {} } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agy-test-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const fake = path.join(dir, 'agy');
  fs.writeFileSync(fake, `#!${process.execPath}\n${FAKE_AGY}`, { mode: 0o755 });
  const log = path.join(dir, 'log.jsonl');
  const mcpConfig = path.join(dir, 'host-mcp.json');
  fs.writeFileSync(mcpConfig, JSON.stringify({ mcpServers: { openclaw: { type: 'http', url: 'http://127.0.0.1:1/mcp', headers: { Authorization: 'Bearer t0k' } } } }));
  const handles = new Map();
  let activated = false;
  const capability = {
    fingerprint: 'fp-1',
    current: () => handles.get('k'),
    register: (h) => handles.set('k', h),
    // OpenClaw's loopback MCP accepts the session's token only once the live handle is activated.
    activate: (h) => { assert.equal(handles.get('k'), h, 'activate after register'); activated = true; },
    remove: (h) => { if (handles.get('k') === h) handles.delete('k'); },
  };
  const fetchImpl = async (_url, init) => {
    if (!activated) return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, error: { code: -32001, message: 'unauthorized' } }), { headers: { 'content-type': 'application/json' } });
    const body = JSON.parse(init.body);
    const result = body.method === 'tools/list' ? { tools: [{ name: 'memory_search' }, { name: 'message' }] } : {};
    return new Response(JSON.stringify({ jsonrpc: '2.0', id: body.id, result }), { headers: { 'content-type': 'application/json' } });
  };
  const backend = buildAntigravityCliBackend({ agyBin: fake, agyHome: dir, runRoot: path.join(dir, 'runs'), idleTimeoutMs: 60_000, followOnTimeoutMs: 2_000, ...extra }, { fetchImpl, ...extraDeps });
  const execute = backend.prepareExecution().execute;
  const ctx = (over = {}) => ({
    args: backend.resolveExecutionArgs({ baseArgs: ['--strict-mcp-config', '--mcp-config', mcpConfig, '--disallowedTools', 'mcp__openclaw__message'], thinkingLevel: 'high' }),
    cwd: '/workspace/v', env: { FAKE_LOG: log }, prompt: 'hello', modelId: 'gemini-4-neon', systemPrompt: "You are V, Tianyi's personal agent.\\nRULES",
    liveSession: capability, ...over,
  });
  const run = async (c) => {
    const records = [];
    for await (const r of execute(c)) records.push(r);
    return records;
  };
  const logs = () => fs.readFileSync(log, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  return { dir, ctx, run, logs, capability, handles };
}

// What OpenClaw's Claude stream-json parser reads from the yielded records.
const view = (records) => ({
  text: records.filter((r) => r.type === 'stream_event' && r.event.type === 'content_block_delta' && r.event.delta.type === 'text_delta').map((r) => r.event.delta.text),
  results: records.filter((r) => r.type === 'result').map((r) => r.result),
  sessions: records.filter((r) => r.type === 'system' && r.subtype === 'init').map((r) => r.session_id),
});

// The rule core applies to Claude stream-json when the channel shows progress
// (2026.9.1 createCliJsonlStreamingParser, classifyClaudeCommentary): text still
// pending when a tool_use block starts is commentary; text pending at
// message_stop or result is the reply.
function classify(records) {
  const commentary = []; const tools = []; const toolResults = []; let pending = ''; let reply = '';
  for (const r of records) {
    if (r.type === 'stream_event') {
      const e = r.event;
      if (e.type === 'content_block_delta' && e.delta.type === 'text_delta') pending += e.delta.text;
      else if (e.type === 'content_block_start' && e.content_block.type === 'tool_use') {
        if (pending.trim()) commentary.push(pending.trim());
        pending = '';
        tools.push([e.content_block.name, e.content_block.input]);
      } else if (e.type === 'message_stop') { reply += pending; pending = ''; }
    } else if (r.type === 'user') toolResults.push(r.message.content.map((c) => [c.tool_use_id, c.is_error]));
    else if (r.type === 'result') { reply += pending; pending = ''; }
  }
  return { commentary, tools, toolResults: toolResults.flat(), reply: reply.trim() };
}

test('a turn runs in a live agy with V\'s prompt as the agent and OpenClaw tools over MCP', async (t) => {
  const { ctx, run, logs, handles } = setup(t);
  const records = await run(ctx());
  assert(records.every((r) => typeof r.type === 'string'), 'every record has a host type');
  assert.equal(records.at(-1).type, 'result');
  const v = view(records);
  assert.deepEqual(v.text, ['ANS<hello>']);
  assert.equal(v.sessions[0].startsWith('conv-'), true);
  assert.deepEqual(v.results, ['ANS<hello>']);
  const [start] = logs();
  assert.deepEqual(start.args.slice(0, 4), ['--input-format', 'stream-json', '--output-format', 'stream-json']);
  assert.equal(start.args[start.args.indexOf('--agent') + 1], 'v');
  assert.equal(start.args[start.args.indexOf('--model') + 1], 'gemini-4-neon-high');
  assert.equal(start.args[start.args.indexOf('--add-dir') + 1], '/workspace/v');
  assert(start.args.includes('--dangerously-skip-permissions'));
  assert.match(start.agent, /^---\nname: v\n[\s\S]*---\n\nYou are V, Tianyi's personal agent\./);
  assert.match(start.agent, /\ncommandExecutionPolicy: auto\ntools:\n  - run_command\n/);
  assert.doesNotMatch(start.agent, /call_mcp_tool|schedule|invoke_subagent/);
  assert.deepEqual(start.mcp.mcpServers.openclaw, {
    serverUrl: 'http://127.0.0.1:1/mcp', headers: { Authorization: 'Bearer t0k' },
    disabledTools: ['message'], tools: { memory_search: { eager: true } }, timeoutSeconds: 3600,
  });
  assert.equal(fs.realpathSync(start.home), fs.realpathSync(path.dirname(path.dirname(start.cwd))), 'agy runs with the configured HOME');
  handles.get('k').close('test');
  await handles.get('k')?.waitForExit();
});

test('the next turn reuses the process and still reports the conversation id', async (t) => {
  const { ctx, run, logs, handles } = setup(t);
  await run(ctx());
  const second = await run(ctx({ prompt: 'again' }));
  assert.equal(logs().length, 1, 'one agy process for both turns');
  const v = view(second);
  assert.equal(v.sessions.length > 0, true, 'a reused process still reports the conversation id');
  assert.deepEqual(v.text, ['ANS<again>']);
  const h = handles.get('k'); h.close('test'); await h.waitForExit();
});

test('a steer during the turn is answered in the same turn', async (t) => {
  const { ctx, run, handles } = setup(t);
  const pending = run(ctx({ prompt: 'SLOW main' }));
  await new Promise((r) => setTimeout(r, 150));
  const h = handles.get('k');
  assert.equal(h.canQueueMessage(), true);
  await h.queueMessage('STEER kiwi');
  const records = await pending;
  const v = view(records);
  assert.deepEqual(v.text, ['ANS<SLOW main>', 'ANS<STEER kiwi>']);
  // Two results in one host turn: core joins them into one reply, as for /vcc.
  assert.deepEqual(v.results, ['ANS<SLOW main>', 'ANS<STEER kiwi>']);
  assert.equal(h.isIdle(), true);
  assert.equal(h.canQueueMessage(), false);
  await assert.rejects(h.queueMessage('late'), /no running turn/);
  h.close('test'); await h.waitForExit();
});

test('a new process resumes the stored conversation', async (t) => {
  const { ctx, run, logs, handles } = setup(t);
  const records = await run(ctx({ useResume: true, sessionId: 'conv-old' }));
  assert.equal(logs()[0].args[logs()[0].args.indexOf('--conversation') + 1], 'conv-old');
  assert(view(records).sessions.includes('conv-old'));
  const h = handles.get('k'); h.close('test'); await h.waitForExit();
});

test('agy exiting mid-turn fails the turn and removes its run directory', async (t) => {
  const { ctx, run, dir } = setup(t);
  await assert.rejects(run(ctx({ prompt: 'EXIT now' })), /exited during a turn/);
  await new Promise((r) => setTimeout(r, 50));
  const left = fs.readdirSync(path.join(dir, 'runs'), { recursive: true }).map(String);
  assert(!left.some((f) => f.endsWith('mcp_config.json') || f.endsWith('v.md')), `no MCP bearer or prompt left behind: ${left}`);
});

test('a new process for a known conversation reuses its directory, so the prompt cache still matches', async (t) => {
  const { ctx, run, logs, handles, dir } = setup(t);
  const first = await run(ctx());
  const conv = view(first).sessions[0];
  let h = handles.get('k'); h.close('idle'); await h.waitForExit();
  assert(!fs.existsSync(path.join(logs()[0].cwd, '.agents', 'mcp_config.json')), 'bearer removed when the process ends');
  await run(ctx({ useResume: true, sessionId: conv, prompt: 'after idle' }));
  assert.equal(logs()[1].args[logs()[1].args.indexOf('--conversation') + 1], conv);
  assert.equal(logs()[1].cwd, logs()[0].cwd, 'same working directory as the first process');
  h = handles.get('k'); h.close('idle'); await h.waitForExit();
  await run(ctx({ useResume: true, sessionId: 'conv-other-123', prompt: 'another conversation' }));
  assert.notEqual(logs()[2].cwd, logs()[0].cwd, 'another conversation gets its own directory');
  assert.equal(fs.realpathSync(fs.readFileSync(path.join(dir, 'runs', 'index', conv), 'utf8').trim()), logs()[0].cwd);
  h = handles.get('k'); h.close('test'); await h.waitForExit();
});

test('a changed fingerprint (prompt, model, tools) restarts the process', async (t) => {
  const { ctx, run, logs, capability, handles } = setup(t);
  await run(ctx());
  capability.fingerprint = 'fp-2';
  await run(ctx({ prompt: 'after change' }));
  assert.equal(logs().length, 2);
  const h = handles.get('k'); h.close('test'); await h.waitForExit();
});

test('helpers', () => {
  assert.equal(accountModel('gemini-4-neon', 'high'), 'gemini-4-neon-high');
  assert.equal(accountModel('gemini-account/gemini-4-neon', 'max'), 'gemini-4-neon-xhigh');
  assert.equal(accountModel('gemini-4-neon-low', 'high'), 'gemini-4-neon-low');
  assert.equal(accountModel('gemini-4-neon', undefined), 'gemini-4-neon-high');
  assert.deepEqual(readHostArgs(['--image', '/w/a.png', '--effort', 'low', '--image', '/w/b.jpg']), { images: ['/w/a.png', '/w/b.jpg'], disallowed: [], effort: 'low' });
  assert.equal(composePrompt({ prompt: 'q', promptContext: { prependContext: 'ctx' }, images: ['/w/a.png'] }), 'ctx\n\nq\n\n@/w/a.png');
  assert.deepEqual(toAgyMcpConfig({ mcpServers: { s: { command: 'x', args: ['y'] }, junk: {} } }), { mcpServers: { s: { command: 'x', args: ['y'], timeoutSeconds: 3600 } } });
});

// agy 1.5.18 on VLab, 2026-11-28 17:02 CST: "say what you will do, run hostname, run date, answer".
const TOOL_TURN = [
  { event: 'init', conversation_id: 'c' },
  ['user_input', 'DONE'],
  ['agent_response', 'ACTIVE', 'I will run `hostname` first, '], ['agent_response', 'ACTIVE', 'then `date`.'], ['agent_response', 'DONE', '\n'],
  ['tool', 'ACTIVE', { name: 'run_command', parameters: { CommandLine: 'hostname' } }],
  ['tool', 'DONE', { name: 'run_command', parameters: { CommandLine: 'hostname' }, output: 'VM-0-4-ubuntu' }],
  ['agent_response', 'ACTIVE', 'I will now run `date`.'], ['agent_response', 'DONE', '\n'],
  ['tool', 'ACTIVE', { name: 'run_command', parameters: { CommandLine: 'date' } }],
  ['tool', 'DONE', { name: 'run_command', parameters: { CommandLine: 'date' }, output: 'Sat Nov 28' }],
  ['agent_response', 'ACTIVE', 'Hostname: `VM-0-4-ubuntu`, '], ['agent_response', 'ACTIVE', 'Date: `Sat Nov 28`.'], ['agent_response', 'DONE', '\n'],
  { event: 'result', result: { conversation_id: 'c', status: 'SUCCESS', response: 'I will run `hostname` first, then `date`.\nI will now run `date`.\nHostname: `VM-0-4-ubuntu`, Date: `Sat Nov 28`.\n', usage: { input_tokens: 7, output_tokens: 3, thinking_tokens: 2 } } },
];
function agyEvents(list) {
  let index = 0; let last = null;
  return list.map((e) => {
    if (!Array.isArray(e)) return e;
    const [type, state, x] = e;
    if (type !== last || type === 'user_input' || (type === 'tool' && state === 'ACTIVE')) index += 1;
    last = type;
    const step = { conversation_id: 'c', step_index: index, state, step_type: type };
    if (type === 'agent_response') step.text_delta = x;
    if (type === 'tool') { step.tool_name = x.name; step.tool_info = x; }
    return { event: 'step_update', step_update: step };
  });
}

test('agy text before a tool call becomes commentary and the reply is the text after the last tool', () => {
  const tr = createClaudeStreamTranslator();
  const records = agyEvents(TOOL_TURN).flatMap((e) => tr.translate(e));
  assert(records.every((r) => typeof r.type === 'string'));
  const c = classify(records);
  assert.deepEqual(c.commentary, ['I will run `hostname` first, then `date`.', 'I will now run `date`.'], 'the card shows the process');
  assert.deepEqual(c.tools, [['run_command', { CommandLine: 'hostname' }], ['run_command', { CommandLine: 'date' }]]);
  assert.deepEqual(c.toolResults, [['agy-c-3', false], ['agy-c-5', false]]);
  assert.equal(c.reply, 'Hostname: `VM-0-4-ubuntu`, Date: `Sat Nov 28`.');
  const result = records.at(-1);
  assert.equal(result.result, 'Hostname: `VM-0-4-ubuntu`, Date: `Sat Nov 28`.', 'not agy\'s response, which repeats the commentary');
  assert.deepEqual(result.usage, { input_tokens: 7, output_tokens: 5, cache_read_input_tokens: 0 });
  assert.equal(records.filter((r) => r.type === 'stream_event' && r.event.type === 'message_start').length, 3, 'one message per model call, as Claude Code reports');
});

test('a tool step that fails, and a failed result', () => {
  const tr = createClaudeStreamTranslator();
  const records = [
    { event: 'init', conversation_id: 'c' },
    { event: 'step_update', step_update: { conversation_id: 'c', step_index: 4, state: 'ERROR', step_type: 'tool', tool_info: { name: 'mcp_openclaw_memory_search', error: { type: 'TOOL_ERROR', message: 'index metadata is missing' } } } },
    { event: 'result', result: { conversation_id: 'c', status: 'ERROR', error: 'quota' } },
  ].flatMap((e) => tr.translate(e));
  const toolResult = records.find((r) => r.type === 'user').message.content[0];
  assert.deepEqual([toolResult.is_error, toolResult.content], [true, 'index metadata is missing'], 'a tool step that ends in ERROR still closes the tool');
  const failed = records.at(-1);
  assert.equal(failed.is_error, true);
  assert.match(failed.errors[0], /error: quota/);
});

test('the backend is parsed as Claude stream-json', () => {
  const backend = buildAntigravityCliBackend({});
  assert.equal(backend.config.jsonlDialect, 'claude-stream-json');
  assert.equal(backend.parseJsonlEvent, undefined, 'no custom parser: core\'s Claude parser classifies commentary');
  assert.deepEqual(backend.config.sessionIdFields, ['session_id']);
});

test('a long silent step stays alive only while agy is still receiving its model stream', async (t) => {
  const liveness = { sampleMs: 50, quietMs: 300, everyMs: 300, recentMs: 200, minBytes: 1024, maxQuietMs: 60_000 };
  const status = (records) => records.filter((r) => r.type === 'system' && r.subtype === 'status');
  let bytes = 0;
  const receiving = setup(t, { config: { liveness }, deps: { readRchar: () => (bytes += 3000) } });
  const alive = await receiving.run(receiving.ctx({ prompt: 'QUIET deck' }));
  assert(status(alive).length >= 2, `keepalive records while generating (${status(alive).length})`);
  assert.equal(status(alive)[0].status, 'agy_generating');
  assert.equal(alive.at(-1).type, 'result');
  assert.deepEqual(view(alive).results, ['ANS<QUIET deck>']);
  const h1 = receiving.handles.get('k'); h1.close('test'); await h1.waitForExit();

  const stalled = setup(t, { config: { liveness }, deps: { readRchar: () => 5_000_000 } });
  const quiet = await stalled.run(stalled.ctx({ prompt: 'QUIET stuck' }));
  assert.equal(status(quiet).length, 0, 'no incoming bytes: no keepalive, so the host watchdog still applies');
  const h2 = stalled.handles.get('k'); h2.close('test'); await h2.waitForExit();
});
