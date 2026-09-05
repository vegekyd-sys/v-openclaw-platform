import assert from 'node:assert/strict';

function once(source, before, after) {
  if (source.includes(after)) return source;
  assert.equal(source.split(before).length - 1, 1, 'Unexpected WeCom source; refusing unreviewed patch');
  return source.replace(before, after);
}

export function patchWecomEntry(source) {
  return once(source,
    'return createWeComCliTool({ accountId: ctx.agentAccountId });',
    `return createWeComCliTool({
                accountId: ctx.agentAccountId,
                // Native 9.1 tool context owns the resolved configuration.
                // Never take account/config from model-authored tool arguments.
                getRuntimeConfig: () => ctx.getRuntimeConfig?.() ?? ctx.runtimeConfig ?? ctx.config,
            });`);
}

export function patchWecomTool(source) {
  let s = once(source, 'function resolveBot(accountId) {', 'function resolveBot(accountId, getRuntimeConfig) {');
  s = once(s, '        cfg = getWeComRuntime().config.loadConfig();', '        cfg = getRuntimeConfig ? getRuntimeConfig() : getWeComRuntime().config.loadConfig();\n        if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) throw new Error("Missing native tool configuration");');
  s = once(s, 'function resolveBinPath(accountId) {', 'function resolveBinPath(accountId, getRuntimeConfig) {');
  s = once(s, 'const cfg = getWeComRuntime().config.loadConfig();', 'const cfg = getRuntimeConfig ? getRuntimeConfig() : getWeComRuntime().config.loadConfig();');
  s = once(s, 'bot = resolveBot(accountId);', `// Capture once per invocation: credentials and binary selection must agree.
                const cfg = options.getRuntimeConfig ? options.getRuntimeConfig() : getWeComRuntime().config.loadConfig();
                const configForInvocation = () => cfg;
                bot = resolveBot(accountId, configForInvocation);`);
  s = once(s, 'resolveBinPath(accountId));', 'resolveBinPath(accountId, configForInvocation));');
  return s;
}
