import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { buildAntigravityCliBackend, parseAgyJsonlEvent } from '../apps/v-antigravity/plugin/backend.js';
import { accountModel, readHostArgs, toAgyMcpConfig, composePrompt } from '../apps/v-antigravity/plugin/runtime.js';

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
  await new Promise((r) => setTimeout(r, msg.includes('SLOW') ? 300 : 20));
  out({ event: 'step_update', step_update: { conversation_id: conv, step_index: step++, state: 'DONE', step_type: 'agent_response', text_delta: 'ANS<' + msg + '>' } });
  out({ event: 'result', result: { conversation_id: conv, status: 'SUCCESS', response: 'ANS<' + msg + '>', usage: { input_tokens: 10, output_tokens: 2 } } });
  busy = false; run();
};
require('node:readline').createInterface({ input: process.stdin }).on('line', (l) => { queue.push(JSON.parse(l).message.content); run(); });
`;

function setup(t) {
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
  const backend = buildAntigravityCliBackend({ agyBin: fake, agyHome: dir, runRoot: path.join(dir, 'runs'), idleTimeoutMs: 60_000, followOnTimeoutMs: 2_000 }, { fetchImpl });
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

const parsed = (records) => records.flatMap((r) => [].concat(parseAgyJsonlEvent(JSON.stringify(r)) ?? []));

test('a turn runs in a live agy with V\'s prompt as the agent and OpenClaw tools over MCP', async (t) => {
  const { ctx, run, logs, handles } = setup(t);
  const records = await run(ctx());
  assert(records.every((r) => typeof r.type === 'string'), 'every record has a host type');
  assert.equal(records.at(-1).type, 'result');
  const events = parsed(records);
  assert.deepEqual(events.filter((e) => e.kind === 'text').map((e) => e.text), ['ANS<hello>']);
  assert.equal(events.find((e) => e.kind === 'sessionId').sessionId.startsWith('conv-'), true);
  assert.equal(events.find((e) => e.kind === 'result').text, 'ANS<hello>', 'the result carries the turn\'s text');
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
  const events = parsed(second);
  assert(events.some((e) => e.kind === 'sessionId'));
  assert.deepEqual(events.filter((e) => e.kind === 'text').map((e) => e.text), ['ANS<again>']);
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
  const texts = parsed(records).filter((e) => e.kind === 'text').map((e) => e.text);
  assert.deepEqual(texts, ['ANS<SLOW main>', 'ANS<STEER kiwi>']);
  assert.equal(records.filter((r) => r.type === 'result').length, 2);
  assert.equal(parsed(records).filter((e) => e.kind === 'result').at(-1).text, 'ANS<SLOW main>ANS<STEER kiwi>', 'the last result is the whole reply');
  assert.equal(h.isIdle(), true);
  assert.equal(h.canQueueMessage(), false);
  await assert.rejects(h.queueMessage('late'), /no running turn/);
  h.close('test'); await h.waitForExit();
});

test('a new process resumes the stored conversation', async (t) => {
  const { ctx, run, logs, handles } = setup(t);
  const records = await run(ctx({ useResume: true, sessionId: 'conv-old' }));
  assert.equal(logs()[0].args[logs()[0].args.indexOf('--conversation') + 1], 'conv-old');
  assert(parsed(records).some((e) => e.kind === 'sessionId' && e.sessionId === 'conv-old'));
  const h = handles.get('k'); h.close('test'); await h.waitForExit();
});

test('agy exiting mid-turn fails the turn and removes its run directory', async (t) => {
  const { ctx, run, dir } = setup(t);
  await assert.rejects(run(ctx({ prompt: 'EXIT now' })), /exited during a turn/);
  await new Promise((r) => setTimeout(r, 50));
  assert.deepEqual(fs.readdirSync(path.join(dir, 'runs')), [], 'run directory (MCP bearer) removed');
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
  const toolError = parseAgyJsonlEvent(JSON.stringify({ event: 'step_update', step_update: { conversation_id: 'c', step_index: 4, state: 'ERROR', step_type: 'tool', tool_info: { name: 'mcp_openclaw_memory_search', error: { type: 'TOOL_ERROR', message: 'index metadata is missing' } } } }));
  assert.deepEqual(toolError.map((e) => [e.kind, e.isError ?? null]), [['toolStart', null], ['toolResult', true]], 'a tool step that ends in ERROR still closes the tool');
  const failed = parseAgyJsonlEvent(JSON.stringify({ type: 'result', event: 'result', result: { status: 'ERROR', error: 'quota' } }));
  assert.match(failed.errorText, /error: quota/);
});
