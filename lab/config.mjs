import {randomBytes} from 'node:crypto';

export function validateName(name) {
  if (!/^[a-z][a-z0-9-]{1,23}$/.test(name ?? '')) throw Error('Instance name must be 2-24 lowercase letters/digits/hyphens');
  return name;
}
export function requireOwner(manifest, owner) {
  if (!owner || manifest.owner !== owner) throw Error('Owner mismatch; refusing to operate another experiment');
}
export function buildConfig(root, port, {provider, worker = true} = {}) {
  const model = 'deepseek/deepseek-v4-pro';
  const config = {
    gateway: {mode: 'local', bind: 'loopback', port, auth: {mode: 'token', token: randomBytes(32).toString('hex')}, reload: {mode: 'off'}},
    agents: {
      ownership: 'explicit',
      defaults: {workspace: `${root}/workspace`, model: {primary: model, fallbacks: []},
        models: {[model]: {agentRuntime: {id: worker ? 'vlab-worker' : 'openclaw'}}},
        maxConcurrent: 2, subagents: {maxConcurrent: 2, runTimeoutSeconds: 21600},
        heartbeat: {every: '0m'}, thinkingDefault: 'low'},
      entries: {lab: {name: 'Isolated Lab', workspace: `${root}/workspace`, agentDir: `${root}/state/agents/lab/agent`}}
    },
    channels: {}, cron: {enabled: false}, browser: {enabled: false},
    plugins: {allow: ['deepseek', ...(worker ? ['vlab-agent-worker-isolation'] : [])],
      load: {paths: worker ? [`${root}/runtime/worker`] : []},
      entries: {deepseek: {enabled: true}}},
  };
  if (provider) config.models = {providers: {deepseek: {...provider, apiKey: '${DEEPSEEK_API_KEY}'}}};
  if (worker) config.plugins.entries['vlab-agent-worker-isolation'] = {enabled: true, config: {
    minWorkers: 1, maxWorkers: 1, sessionsPerWorker: 2,
    idleTimeoutMs: 180000, requestTimeoutMs: 600000, nativeRequestTimeoutMs: 21600000,
    requestStallTimeoutMs: 120000, gatewayOwnedToolTimeoutMs: 310000,
    workerConfigPath: `${root}/state/worker-openclaw.json`, gatewayConfigPath: `${root}/state/openclaw.json`
  }};
  const overlay = structuredClone(config);
  overlay.agents.defaults.models[model].agentRuntime.id = 'openclaw';
  overlay.plugins.allow = ['deepseek'];
  overlay.plugins.load.paths = [];
  delete overlay.plugins.entries['vlab-agent-worker-isolation'];
  return {config, overlay};
}

export function assertSafeConfig(config, root, port) {
  if (config.gateway?.bind !== 'loopback' || config.gateway?.port !== port || !config.gateway?.auth?.token) throw Error('Gateway endpoint isolation violated');
  if (Object.keys(config.channels ?? {}).length) throw Error('Personal instances cannot attach messaging channels; use the leased integration Gateway');
  if (config.cron?.enabled !== false || config.browser?.enabled !== false) throw Error('Cron/browser must be explicitly disabled in the base development profile');
  const paths = [config.agents?.defaults?.workspace, ...Object.values(config.agents?.entries ?? {}).flatMap(a=>[a.workspace,a.agentDir]), ...(config.plugins?.load?.paths ?? [])];
  if (paths.some(p=>typeof p === 'string' && !p.startsWith(root + '/'))) throw Error('Config references a shared mutable path');
}
