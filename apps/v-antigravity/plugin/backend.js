// The Antigravity CLI as an OpenClaw CLI backend, shaped like Claude Code's
// (extensions/anthropic/cli-backend.ts in 2026.9.1):
//
//   Claude Code                                     Antigravity (runtime.js)
//   plugin-owned execution, live stdio session      same: one live `agy --input-format stream-json` per session
//   system prompt (always)                          custom agent `v` whose body is the prompt (rewritten per process)
//   bundle MCP, claude-config-file                  same host files; converted to .agents/mcp_config.json, eager tools
//   steer -> queueMessage into the live process     same; held open until agy has consumed and answered it
//   resume: --resume {sessionId}, session_id        --conversation {sessionId} (agy's conversation_id)
//   stream-json records, parsed by core's Claude     agy events translated to the same records
//   parser (commentary, tools, reply)                (runtime.js createClaudeStreamTranslator)
//   images: workspace paths                         --image paths -> @path mentions (agy reads them)
//   thinking level -> env                           thinking level -> account tier (gemini-4-neon-high)
//   serialize per session; native compaction        same (agy manages its own context)
import { createAntigravityExecutor } from './runtime.js';

export const BACKEND_ID = 'antigravity-cli';

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
      sessionIdFields: ['session_id'],
      // The runtime yields Claude Code stream-json records, so core parses this
      // backend with the same code as /vcc: text before a tool call is channel
      // commentary (the Feishu card's process), the reply is the text after it.
      jsonlDialect: 'claude-stream-json',
      // Declared so the host treats the system prompt as transported; in plugin
      // execution it hands the prompt to execute() instead of writing a file.
      systemPromptFileArg: '--system-prompt-file',
      systemPromptMode: 'replace',
      systemPromptWhen: 'always',
      serialize: true,
    },
    prepareExecution: () => ({ execute }),
    // The thinking level reaches execute() through the argv (account tier).
    resolveExecutionArgs: (ctx) => [...ctx.baseArgs, '--effort', ctx.thinkingLevel ?? config.defaultEffort ?? 'high'],
  };
}
