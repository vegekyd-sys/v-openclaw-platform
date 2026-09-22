// Pure decision logic for vds-switch-guard; no OpenClaw imports so it is unit-testable.
export const BLOCK_MESSAGE = [
  '这个会话已经用过 DeepSeek（/vds），GPT（/vcodex）没法接着这段历史继续。',
  '想用 GPT，请先发 /new 开新会话再切 /vcodex；也可以继续用 /vds。',
].join('\n');

export const MAX_SESSIONS = 2000;

export function splitRef(provider, model) {
  const p = String(provider ?? '').trim().toLowerCase();
  const m = String(model ?? '').trim();
  return {provider: p, model: m, ref: p && m ? `${p}/${m}` : m};
}

export function runtimeFor(config, agentId, ref) {
  const lookup = (models) => models?.[ref]?.agentRuntime?.id;
  return lookup(config?.agents?.entries?.[agentId]?.models) ?? lookup(config?.agents?.defaults?.models);
}

// Codex runs whose upstream model provider is not OpenAI (e.g. codex/deepseek/deepseek-flash).
export function isForeignCodexModel({provider, model}) {
  if (provider === 'codex') {
    const inner = model.split('/')[0].toLowerCase();
    return model.includes('/') && inner !== 'openai' && inner !== 'codex';
  }
  return false;
}

export function isOpenAICodexModel({provider, model}) {
  if (provider === 'openai') return true;
  return provider === 'codex' && (!model.includes('/') || ['openai', 'codex'].includes(model.split('/')[0].toLowerCase()));
}

export function decide({state, sessionId, sel, runtime}) {
  if (!sessionId || runtime !== 'codex') return {outcome: 'pass'};
  if (isForeignCodexModel(sel)) {
    state[sessionId] = Date.now();
    return {outcome: 'pass', marked: true};
  }
  if (state[sessionId] && isOpenAICodexModel(sel)) {
    return {outcome: 'block', reason: 'codex-thread-has-foreign-reasoning', message: BLOCK_MESSAGE, category: 'model_switch'};
  }
  return {outcome: 'pass'};
}
