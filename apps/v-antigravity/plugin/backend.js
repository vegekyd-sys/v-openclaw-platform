// The Antigravity CLI as an OpenClaw CLI backend, shaped like Claude Code's
// (extensions/anthropic/cli-backend.ts in 2026.9.1):
//
//   Claude Code                                     Antigravity (runtime.js)
//   plugin-owned execution, live stdio session      same: one live `agy --input-format stream-json` per session
//   system prompt (always)                          custom agent `v` whose body is the prompt (rewritten per process)
//   bundle MCP, claude-config-file                  same host files; converted to .agents/mcp_config.json, eager tools
//   steer -> queueMessage into the live process     same; held open until agy has consumed and answered it
//   resume: --resume {sessionId}, session_id        --conversation {sessionId}, conversation_id
//   images: workspace paths                         --image paths -> @path mentions (agy reads them)
//   thinking level -> env                           thinking level -> account tier (gemini-4-neon-high)
//   serialize per session; native compaction        same (agy manages its own context)
import { createAntigravityExecutor } from './runtime.js';

export const BACKEND_ID = 'antigravity-cli';

/** Host-side JSONL events: records yielded by runtime.js (agy events plus a `type`). */
export function parseAgyJsonlEvent(line) {
  let event;
  try { event = JSON.parse(line); } catch { return null; }
  if (!event || typeof event !== 'object' || typeof event.event !== 'string') return null;
  if (event.event === 'init') {
    return event.conversation_id ? { kind: 'sessionId', sessionId: event.conversation_id } : [];
  }
  if (event.event === 'step_update') {
    const step = event.step_update ?? {};
    const out = [];
    if (step.step_type === 'agent_response' && typeof step.text_delta === 'string' && step.text_delta) {
      out.push({ kind: 'text', text: step.text_delta });
    }
    if (typeof step.thinking_delta === 'string' && step.thinking_delta) out.push({ kind: 'thinking', text: step.thinking_delta });
    if (step.step_type === 'tool') {
      const info = step.tool_info ?? {};
      const toolCallId = `${step.conversation_id ?? 'agy'}:${step.step_index}`;
      const name = info.name ?? step.tool_name ?? 'tool';
      out.push({ kind: 'toolStart', toolCallId, name, args: info.parameters ?? {} });
      if (step.state === 'DONE' || step.state === 'ERROR') {
        out.push({
          kind: 'toolResult', toolCallId, name,
          isError: Boolean(info.error) || step.state === 'ERROR',
          result: info.error ? (info.error.message ?? String(info.error.type ?? 'error')) : (info.output ?? ''),
        });
      }
    }
    return out;
  }
  if (event.event === 'result') {
    const result = event.result ?? {};
    const u = result.usage ?? {};
    const usage = {
      input: u.input_tokens || undefined,
      output: (u.output_tokens ?? 0) + (u.thinking_tokens ?? 0) || undefined,
      cacheRead: u.cache_read_tokens || undefined,
      total: u.total_tokens || undefined,
    };
    const ok = result.status === 'SUCCESS';
    return {
      kind: 'result',
      sessionId: result.conversation_id || undefined,
      ...(typeof result.response === 'string' ? { text: result.response } : {}),
      usage: Object.values(usage).some((v) => typeof v === 'number' && v > 0) ? usage : undefined,
      ...(ok ? {} : { errorText: `Antigravity CLI ${String(result.status ?? 'ERROR').toLowerCase()}: ${result.error ?? 'no response'}` }),
    };
  }
  return [];
}

export function buildAntigravityCliBackend(config = {}, deps = {}) {
  const execute = createAntigravityExecutor(config, deps);
  return {
    id: BACKEND_ID,
    modelProvider: config.modelProvider ?? 'gemini-account',
    bundleMcp: true,
    bundleMcpMode: 'claude-config-file',
    nativeToolMode: 'always-on',
    ownsNativeCompaction: true,
    authEpochMode: 'profile-only',
    autoSelectAuthProfile: false,
    config: {
      command: config.agyBin ?? 'agy',
      args: [],
      // Non-empty so the host resumes; the runtime reads the id from its context
      // and passes agy --conversation. `--resume` is the flag whose value the host
      // leaves out of the live-session fingerprint, so turn 2 keeps turn 1's process.
      resumeArgs: ['--resume', '{sessionId}'],
      output: 'jsonl',
      input: 'stdin',
      liveSession: 'agy-stream-json',
      modelArg: '--model',
      imageArg: '--image',
      imagePathScope: 'workspace',
      sessionMode: 'existing',
      sessionIdFields: ['conversation_id'],
      // Declared so the host treats the system prompt as transported; in plugin
      // execution it hands the prompt to execute() instead of writing a file.
      systemPromptFileArg: '--system-prompt-file',
      systemPromptMode: 'replace',
      systemPromptWhen: 'always',
      serialize: true,
    },
    parseJsonlEvent: parseAgyJsonlEvent,
    prepareExecution: () => ({ execute }),
    // The thinking level reaches execute() through the argv (account tier).
    resolveExecutionArgs: (ctx) => [...ctx.baseArgs, '--effort', ctx.thinkingLevel ?? config.defaultEffort ?? 'high'],
  };
}
