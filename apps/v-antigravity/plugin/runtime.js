// Plugin-owned execution of the Antigravity CLI, shaped like Claude Code's live
// Agent SDK session in 2026.9.1 (extensions/anthropic/agent-sdk.runtime.js plus
// V's vcc-steer-live-injection-v1):
//
// - one long-lived `agy --input-format stream-json` process per OpenClaw
//   session (the host's live-session capability owns its lifecycle; a new
//   process resumes the conversation with --conversation);
// - V's system prompt is the body of a workspace custom agent (`--agent v`),
//   OpenClaw's tools come from the loopback MCP config core prepared for
//   Claude Code, converted to agy's .agents/mcp_config.json with every tool
//   loaded eagerly;
// - a steer is written into the running process. agy queues it and runs it as
//   its own turn right after the current result (the "answer-time" case of
//   Claude Code); the OpenClaw turn stays open until that queued input has been
//   consumed (a `user_input` step) and answered, so both land in one reply.
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';

export const AGENT_NAME = 'v';
export const EFFORTS = ['low', 'medium', 'high', 'xhigh'];
export const LIVE_IDLE_TIMEOUT_MS = 10 * 60 * 1000;
export const STEER_FOLLOW_ON_TIMEOUT_MS = 120 * 1000;

const sessions = new WeakMap();

/** gemini-4-neon + high -> gemini-4-neon-high; an id that already has a tier keeps it. */
export function accountModel(model, effort) {
  const bare = String(model ?? '').replace(/^[^/]+\//, '');
  if (EFFORTS.some((e) => bare.endsWith(`-${e}`))) return bare;
  const level = String(effort ?? '').toLowerCase();
  const tier = level === 'minimal' || level === 'off' ? 'low' : level === 'max' ? 'xhigh' : EFFORTS.includes(level) ? level : 'high';
  return `${bare}-${tier}`;
}

/** Reads the values the host put into the backend argv (MCP config, images, effort). */
export function readHostArgs(args = []) {
  const out = { images: [], disallowed: [] };
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--mcp-config') out.mcpConfig = args[++i];
    else if (arg === '--disallowedTools') out.disallowed.push(...String(args[++i] ?? '').split(',').map((s) => s.trim()).filter(Boolean));
    else if (arg === '--image') out.images.push(args[++i]);
    else if (arg === '--effort') out.effort = args[++i];
    else if (arg === '--model') out.model = args[++i];
  }
  return out;
}

/** Claude-format MCP servers ({type:'http', url, headers}) -> agy ({serverUrl, headers}). */
export function toAgyMcpConfig(claudeConfig, { disallowed = [], toolNames = {} } = {}) {
  const servers = {};
  for (const [name, server] of Object.entries(claudeConfig?.mcpServers ?? {})) {
    const entry = {};
    if (server.url || server.serverUrl) {
      entry.serverUrl = server.url ?? server.serverUrl;
      if (server.headers) entry.headers = server.headers;
    } else if (server.command) {
      for (const key of ['command', 'args', 'env', 'cwd']) if (server[key] !== undefined) entry[key] = server[key];
    } else continue;
    const prefix = `mcp__${name.replace(/[^A-Za-z0-9_-]/g, '_')}__`;
    const denied = disallowed.filter((t) => t.startsWith(prefix)).map((t) => t.slice(prefix.length));
    if (denied.length) entry.disabledTools = denied;
    // Eager tools are declared to the model directly (mcp_<server>_<tool>);
    // lazy ones cost an extra read of the tool's schema before every call.
    const eager = (toolNames[name] ?? []).filter((t) => !denied.includes(t));
    if (eager.length) entry.tools = Object.fromEntries(eager.map((t) => [t, { eager: true }]));
    entry.timeoutSeconds = 3600;
    servers[name] = entry;
  }
  return { mcpServers: servers };
}

/** tools/list over MCP Streamable HTTP, so the tools can be loaded eagerly. Best effort. */
export async function listHttpMcpTools(server, fetchImpl = fetch) {
  const url = server.url ?? server.serverUrl;
  if (!url) return [];
  const headers = { 'content-type': 'application/json', accept: 'application/json, text/event-stream', ...(server.headers ?? {}) };
  const rpc = async (body, session) => {
    const res = await fetchImpl(url, { method: 'POST', headers: { ...headers, ...(session ? { 'mcp-session-id': session } : {}) }, body: JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
    const text = await res.text();
    const json = text.trim().startsWith('{') ? JSON.parse(text) : JSON.parse(text.split('\n').find((l) => l.startsWith('data:'))?.slice(5) ?? '{}');
    return { json, session: res.headers.get('mcp-session-id') ?? session };
  };
  try {
    const init = await rpc({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'v-antigravity', version: '1' } } });
    await fetchImpl(url, { method: 'POST', headers: { ...headers, ...(init.session ? { 'mcp-session-id': init.session } : {}) }, body: JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }), signal: AbortSignal.timeout(10_000) }).then((r) => r.text()).catch(() => {});
    const list = await rpc({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }, init.session);
    listHttpMcpTools.lastError = list.json?.error ? JSON.stringify(list.json.error).slice(0, 200) : init.json?.error ? `init ${JSON.stringify(init.json.error).slice(0, 200)}` : undefined;
    return (list.json?.result?.tools ?? []).map((t) => t.name).filter((n) => typeof n === 'string');
  } catch (error) {
    listHttpMcpTools.lastError = String(error?.message ?? error).slice(0, 120);
    return [];
  }
}

// agy's native tools the agent keeps, like Claude Code keeps Bash and its file
// tools: shell, files, web. Scheduling, background tasks, sub-agents and agy's
// own browser stay off; OpenClaw's tools (MCP) cover those. An agent without a
// `tools` list gets no native tools at all, and without
// commandExecutionPolicy: auto commands need agy's sandbox, which Linux hosts
// like V do not provide.
export const NATIVE_TOOLS = Object.freeze([
  'run_command', 'command_status', 'send_command_input',
  'view_file', 'list_dir', 'grep_search', 'find_by_name',
  'write_to_file', 'replace_file_content', 'multi_replace_file_content',
  'read_url_content', 'search_web',
]);

export function agentFile(systemPrompt) {
  return [
    '---',
    `name: ${AGENT_NAME}`,
    "description: V, Tianyi's personal agent, on the Antigravity CLI for OpenClaw.",
    'mainAgent: true',
    'subagent: false',
    'commandExecutionPolicy: auto',
    'tools:',
    ...NATIVE_TOOLS.map((t) => `  - ${t}`),
    '---',
    '',
    systemPrompt ?? '',
    '',
  ].join('\n');
}

export function composePrompt({ prompt, promptContext, images = [] }) {
  const parts = [promptContext?.prependContext, prompt, promptContext?.appendContext].filter((p) => typeof p === 'string' && p.trim());
  const text = parts.join('\n\n');
  return images.length ? `${text}\n\n${images.map((p) => `@${p}`).join('\n')}` : text;
}

/** Writes the run directory agy starts in: the custom agent and the MCP config. */
export async function prepareRunDir({ runRoot, systemPrompt, hostArgs, fetchImpl }) {
  fs.mkdirSync(runRoot, { recursive: true, mode: 0o700 });
  const runDir = fs.mkdtempSync(path.join(runRoot, 'session-'));
  fs.chmodSync(runDir, 0o700);
  fs.mkdirSync(path.join(runDir, '.agents', 'agents'), { recursive: true, mode: 0o700 });
  fs.writeFileSync(path.join(runDir, '.agents', 'agents', `${AGENT_NAME}.md`), agentFile(systemPrompt), { mode: 0o600 });
  if (hostArgs.mcpConfig) {
    const claude = JSON.parse(fs.readFileSync(hostArgs.mcpConfig, 'utf8'));
    const toolNames = {};
    for (const [name, server] of Object.entries(claude.mcpServers ?? {})) {
      toolNames[name] = await listHttpMcpTools(server, fetchImpl);
      process.stderr.write(`[v-antigravity] mcp server ${name}: ${server.url || server.serverUrl ? 'http' : 'stdio'} eagerTools=${toolNames[name].length}${listHttpMcpTools.lastError ? ` listError=${listHttpMcpTools.lastError}` : ''}\n`);
    }
    fs.writeFileSync(path.join(runDir, '.agents', 'mcp_config.json'), JSON.stringify(toAgyMcpConfig(claude, { disallowed: hostArgs.disallowed, toolNames }), null, 2), { mode: 0o600 });
  }
  return runDir;
}

export function buildAgyArgv({ model, effort, conversation, workspaceDir, runDir }) {
  const argv = ['--input-format', 'stream-json', '--output-format', 'stream-json', '--agent', AGENT_NAME,
    '--disable-slash-commands', '--dangerously-skip-permissions'];
  if (model) argv.push('--model', accountModel(model, effort));
  if (conversation) argv.push('--conversation', conversation);
  if (workspaceDir && path.resolve(workspaceDir) !== path.resolve(runDir)) argv.push('--add-dir', workspaceDir);
  return argv;
}

/** OpenClaw requires each yielded record to have a `type`; agy events use `event`. */
export function toHostRecord(event, { replyText } = {}) {
  if (event.event === 'init') return { type: 'system', subtype: 'init', ...event };
  if (event.event === 'result') {
    // The host keeps the last result's text as the reply, so a result carries
    // everything this turn has said (a steered follow-on answer included).
    const result = { ...event.result };
    if (typeof replyText === 'string' && replyText) result.response = replyText;
    return { type: 'result', is_error: result.status !== 'SUCCESS', event: 'result', result };
  }
  return { type: `agy_${event.event}`, ...event };
}

class PushQueue {
  constructor() { this.items = []; this.waiters = []; this.ended = false; }
  push(item) { if (this.ended) return; const w = this.waiters.shift(); if (w) w({ value: item, done: false }); else this.items.push(item); }
  end() { this.ended = true; for (const w of this.waiters.splice(0)) w({ value: undefined, done: true }); }
  [Symbol.asyncIterator]() { return { next: () => (this.items.length ? Promise.resolve({ value: this.items.shift(), done: false }) : this.ended ? Promise.resolve({ value: undefined, done: true }) : new Promise((r) => this.waiters.push(r))) }; }
}

function writeUser(session, text) {
  session.child.stdin.write(`${JSON.stringify({ event: 'user', message: { content: text } })}\n`);
}

function completeTurn(session) {
  const turn = session.currentTurn;
  if (!turn) return;
  clearTimeout(turn.followOnTimer);
  session.currentTurn = undefined;
  turn.events.end();
  session.idleTimer = setTimeout(() => session.handle.close('idle'), session.idleTimeoutMs);
  session.idleTimer.unref?.();
}

function acceptEvent(session, event) {
  if (event.event === 'init' && event.conversation_id) session.conversationId = event.conversation_id;
  const turn = session.currentTurn;
  if (!turn) return;
  const step = event.step_update;
  if (event.event === 'step_update' && step?.step_type === 'user_input' && step.state === 'DONE') {
    // The first user_input of a turn is its own prompt; later ones are steers.
    if (turn.inputsSeen > 0 && turn.pendingSteers > 0) turn.pendingSteers -= 1;
    turn.inputsSeen += 1;
  }
  if (event.event === 'step_update' && step?.step_type === 'agent_response' && step.text_delta) turn.text += step.text_delta;
  if (process.env.V_ANTIGRAVITY_TRACE && event.event === 'step_update') {
    process.stderr.write(`[v-antigravity] trace step=${step?.step_index} ${step?.step_type} ${step?.state} ${step?.tool_info?.name ?? step?.tool_name ?? ''} out=${String(step?.tool_info?.output ?? '').slice(0, 80).replace(/\s+/g, ' ')} err=${JSON.stringify(step?.tool_info?.error ?? null).slice(0, 300)}\n`);
  }
  if (event.event === 'step_update' && step?.step_type === 'tool' && (step.state === 'DONE' || step.state === 'ERROR')) {
    const info = step.tool_info ?? {};
    process.stderr.write(`[v-antigravity] tool ${info.name ?? step.tool_name ?? '?'}${info.error || step.state === 'ERROR' ? ' error' : ''}${step.duration_seconds ? ` ${step.duration_seconds}s` : ''}\n`);
  }
  turn.events.push(toHostRecord(event, { replyText: turn.text }));
  if (event.event === 'result') {
    turn.results += 1;
    clearTimeout(turn.followOnTimer);
    if (turn.pendingSteers > 0) {
      turn.followOnTimer = setTimeout(() => {
        if (session.currentTurn !== turn) return;
        completeTurn(session);
        session.handle.close('restart');
      }, session.followOnTimeoutMs);
      turn.followOnTimer.unref?.();
      return;
    }
    completeTurn(session);
  }
}

// The host's live-session capability needs a registered (and, per turn,
// activated) handle before OpenClaw's loopback MCP accepts this session's
// token, so the handle exists before the process: createSession registers it,
// spawnSession starts agy once the MCP tools could be listed.
function createSession(capability, options) {
  let resolveExit;
  const exited = new Promise((r) => { resolveExit = r; });
  const session = {
    capability, closed: false, exited, resolveExit, conversationId: options.conversation,
    idleTimeoutMs: options.idleTimeoutMs ?? LIVE_IDLE_TIMEOUT_MS,
    followOnTimeoutMs: options.followOnTimeoutMs ?? STEER_FOLLOW_ON_TIMEOUT_MS,
    stderr: '',
  };
  const finish = (reason) => {
    if (!session.closed) {
      session.closed = true;
      const turn = session.currentTurn;
      if (turn) {
        turn.error = new Error(`Antigravity CLI exited during a turn (${reason})${session.stderr ? `: ${session.stderr.trim().split('\n').slice(-3).join(' | ')}` : ''}`);
        session.currentTurn = undefined;
        turn.events.end();
      }
      capability.remove?.(session.handle);
    }
    if (session.runDir) fs.rmSync(session.runDir, { recursive: true, force: true });
    resolveExit();
  };
  session.finish = finish;
  session.handle = {
    generation: randomUUID(),
    fingerprint: capability.fingerprint,
    isIdle: () => !session.closed && !session.currentTurn,
    canQueueMessage: () => !session.closed && Boolean(session.child) && Boolean(session.currentTurn) && !session.currentTurn.aborted
      && !(session.currentTurn.results > 0 && session.currentTurn.pendingSteers === 0),
    queueMessage: async (text) => {
      const turn = session.currentTurn;
      if (session.closed || !turn || !session.child) throw new Error('Antigravity live session has no running turn to steer.');
      if (turn.results > 0 && turn.pendingSteers === 0) throw new Error('Antigravity live turn already finished.');
      if (typeof text !== 'string' || !text.trim()) throw new Error('Antigravity live steer needs text.');
      turn.pendingSteers += 1;
      writeUser(session, text);
      process.stderr.write(`[v-antigravity] steer queued into the live turn (pending=${turn.pendingSteers})\n`);
    },
    close: () => {
      clearTimeout(session.idleTimer);
      if (session.currentTurn) session.currentTurn.aborted = true;
      if (!session.child) { finish('closed before start'); return; }
      if (!session.closed && session.child.exitCode === null) {
        session.child.stdin.end();
        session.child.kill('SIGTERM');
        setTimeout(() => { if (session.child.exitCode === null) session.child.kill('SIGKILL'); }, 5000).unref?.();
      }
    },
    waitForExit: () => session.exited,
  };
  sessions.set(session.handle, session);
  capability.register(session.handle);
  return session;
}

function spawnSession(session, { command, argv, env, runDir }) {
  session.runDir = runDir;
  const child = spawn(command, argv, { cwd: runDir, env, stdio: ['pipe', 'pipe', 'pipe'] });
  session.child = child;
  child.stdin.on('error', () => {});
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk) => { session.stderr = (session.stderr + chunk).slice(-4000); });
  readline.createInterface({ input: child.stdout }).on('line', (line) => {
    let event;
    try { event = JSON.parse(line); } catch { return; }
    if (event && typeof event.event === 'string') acceptEvent(session, event);
  });
  child.on('exit', (code, signal) => session.finish(signal ? `signal ${signal}` : `code ${code}`));
  child.on('error', (error) => session.finish(error.message));
}

/** OpenClaw plugin execution entry (prepareExecution().execute). */
export function createAntigravityExecutor(config = {}, deps = {}) {
  const fetchImpl = deps.fetchImpl ?? fetch;
  return async function* executeAntigravity(ctx) {
    const hostArgs = readHostArgs(ctx.args);
    const effort = hostArgs.effort ?? config.defaultEffort ?? 'high';
    const command = config.agyBin ?? ctx.command ?? 'agy';
    const agyHome = config.agyHome ?? os.homedir();
    const env = { ...process.env, ...(ctx.env ?? {}), HOME: agyHome };
    const runRoot = config.runRoot ?? path.join(agyHome, 'openclaw-runs');
    const capability = ctx.liveSession;
    const model = ctx.modelId ?? hostArgs.model;
    const conversation = ctx.useResume && ctx.sessionId ? ctx.sessionId : undefined;
    const prompt = composePrompt({ prompt: ctx.prompt, promptContext: ctx.promptContext, images: hostArgs.images });
    if (!capability) throw new Error('Antigravity CLI runs only as a live session (backend liveSession is required).');

    let handle = capability.current();
    let session = handle ? sessions.get(handle) : undefined;
    const why = !handle ? 'none' : !session ? 'foreign-handle' : session.closed ? 'closed' : handle.fingerprint !== capability.fingerprint ? 'fingerprint' : '';
    if (handle && (!session || session.closed || handle.fingerprint !== capability.fingerprint)) {
      handle.close('restart');
      await handle.waitForExit();
      handle = capability.current();
      session = handle ? sessions.get(handle) : undefined;
    }
    const fresh = !session;
    if (fresh) session = createSession(capability, { conversation, idleTimeoutMs: config.idleTimeoutMs, followOnTimeoutMs: config.followOnTimeoutMs });
    if (session.currentTurn) throw new Error('Antigravity live session is already handling another turn.');
    clearTimeout(session.idleTimer);
    const turn = { events: new PushQueue(), pendingSteers: 0, inputsSeen: 0, results: 0, text: '', aborted: false };
    session.currentTurn = turn;
    const abort = () => session.handle.close('abort');
    ctx.abortSignal?.addEventListener('abort', abort, { once: true });
    try {
      if (ctx.abortSignal?.aborted) throw ctx.abortSignal.reason ?? new Error('Antigravity turn was aborted.');
      capability.activate?.(session.handle);
      if (fresh) {
        const runDir = await prepareRunDir({ runRoot, systemPrompt: ctx.systemPrompt, hostArgs, fetchImpl });
        const argv = buildAgyArgv({ model, effort, conversation, workspaceDir: ctx.cwd ?? config.workspaceDir, runDir });
        if (session.closed) { fs.rmSync(runDir, { recursive: true, force: true }); throw new Error('Antigravity live session closed before its process started.'); }
        spawnSession(session, { command, argv, env, runDir });
        process.stderr.write(`[v-antigravity] process start: reason=${why || 'new'} resume=${conversation ? 'yes' : 'no'} model=${accountModel(model, effort)}\n`);
      }
      // A resumed conversation has no init event: tell the host its id first.
      if (session.conversationId) yield { type: 'system', subtype: 'init', event: 'init', conversation_id: session.conversationId };
      writeUser(session, prompt);
      let sawResult = false;
      for await (const record of turn.events) {
        if (record.type === 'result') sawResult = true;
        yield record;
      }
      if (turn.error) throw turn.error;
      if (!sawResult) throw new Error('Antigravity CLI turn ended without a result.');
    } catch (error) {
      if (!session.closed) session.handle.close('abort');
      throw error;
    } finally {
      ctx.abortSignal?.removeEventListener('abort', abort);
    }
  };
}
