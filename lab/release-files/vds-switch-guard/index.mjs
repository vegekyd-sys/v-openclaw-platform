// Blocks switching a session from /vds (Codex + DeepSeek) back to an OpenAI model on the
// Codex runtime. DeepSeek leaves plaintext reasoning items in the Codex thread, and the
// OpenAI Responses API rejects them (invalid_request_error array_above_max_length), so the
// user would only see an opaque error. /new starts a fresh session and clears the mark.
import fs from 'node:fs';
import path from 'node:path';
import {definePluginEntry} from 'openclaw/plugin-sdk/plugin-entry';
import {MAX_SESSIONS, decide, runtimeFor, splitRef} from './guard-core.mjs';

function loadState(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
}

function saveState(file, state) {
  const entries = Object.entries(state).sort((a, b) => b[1] - a[1]).slice(0, MAX_SESSIONS);
  fs.mkdirSync(path.dirname(file), {recursive: true, mode: 0o700});
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(Object.fromEntries(entries)), {mode: 0o600});
  fs.renameSync(tmp, file);
}

export default definePluginEntry({id: 'vds-switch-guard', register(api) {
  const stateDir = process.env.OPENCLAW_STATE_DIR ?? path.join(process.env.HOME ?? '.', '.openclaw');
  const file = path.join(stateDir, 'plugins', 'vds-switch-guard', 'sessions.json');
  api.on('before_agent_run', (_event, ctx) => {
    const sel = splitRef(ctx.modelProviderId, ctx.modelId);
    const runtime = runtimeFor(api.config, ctx.agentId, sel.ref);
    const state = loadState(file);
    const result = decide({state, sessionId: ctx.sessionId, sel, runtime});
    if (result.marked) saveState(file, state);
    if (result.outcome === 'block') {
      api.logger.warn(JSON.stringify({vdsSwitchGuard: 'blocked', agentId: ctx.agentId, ref: sel.ref}));
      return {outcome: 'block', reason: result.reason, message: result.message, category: result.category};
    }
    return undefined;
  }, {priority: 100});
}});
