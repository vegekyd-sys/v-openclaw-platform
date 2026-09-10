// Code-only diagnostic. Never starts a Gateway or sends a model/tool request.
// Run in a private-network, resource-limited unit against installed code read-only.
import { mkdtempSync, mkdirSync, rmSync, readdirSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import { Session } from 'node:inspector/promises';
import { basename } from 'node:path';
import { enableCompileCache, flushCompileCache } from 'node:module';
import { resolveOpenClawAgentCommandRuntimePath, resolveOpenClawPreparedModelRuntimePath } from '../experiments/agent-worker-isolation-v1/runtime-path.mjs';
import { installNativeModuleResolutionCache } from '../experiments/agent-worker-isolation-v1/native-module-resolution-cache.mjs';

const [mode, runtimeRoot, cacheDirectory] = process.argv.slice(2);
if (!runtimeRoot?.startsWith('/') || !['matrix', 'single'].includes(mode)) {
  throw new Error('Usage: node benchmark-worker-native-import.mjs matrix|single /absolute/openclaw [cacheDirectory]');
}
if (mode === 'matrix') {
  const scratch = mkdtempSync(join(tmpdir(), 'worker-native-import-'));
  const bytes = (path) => readdirSync(path, {withFileTypes: true}).reduce((sum, item) => sum +
    (item.isDirectory() ? bytes(join(path, item.name)) : statSync(join(path, item.name)).size), 0);
  try {
    const cache = join(scratch, 'compile-cache');
    // Interleave controls and reuse to avoid crediting OS page-cache effects.
    const variants = process.env.WORKER_RESOLVE_BENCH === '1' ? ['disabled', 'resolve', 'disabled', 'resolve', 'disabled', 'resolve'] : process.env.WORKER_IMPORT_PROFILE === '1' ? ['disabled'] : ['disabled', 'seed', 'reuse', 'disabled', 'reuse', 'disabled', 'reuse'];
    for (const [index, variant] of variants.entries()) {
      const state = join(scratch, `state-${index}`);
      mkdirSync(state, {mode: 0o700});
      const env = {...process.env, OPENCLAW_STATE_DIR: state,
        OPENCLAW_CONFIG_PATH: join(state, 'absent-config.json'),
        OPENCLAW_AGENT_DIR: join(state, 'agent'), OPENCLAW_SKIP_CHANNELS: '1'};
      delete env.NODE_COMPILE_CACHE;
      delete env.NODE_DISABLE_COMPILE_CACHE;
      if (['disabled', 'resolve'].includes(variant)) env.NODE_DISABLE_COMPILE_CACHE = '1';
      env.WORKER_RESOLVE_CACHE = variant === 'resolve' ? '1' : '0';
      const result = spawnSync(process.execPath, [process.argv[1], 'single', runtimeRoot, ...(['disabled', 'resolve'].includes(variant) ? [] : [cache])], {
        encoding: 'utf8', timeout: 90_000, maxBuffer: 2 * 1024 * 1024,
        env,
      });
      console.log(JSON.stringify({variant, index, exitCode: result.status,
        stdout: result.stdout?.trim(), stderr: result.stderr?.trim().slice(-3000),
        error: result.error?.message, scratchBytes: bytes(scratch)}));
      if (result.status !== 0 || bytes(scratch) > 150 * 1024 * 1024) {
        process.exitCode = 1;
        break;
      }
    }
  } finally {
    // Only the exact directory returned by mkdtemp above, never live state.
    rmSync(scratch, {recursive: true, force: true});
  }
} else {
  const stages = [];
  const inspector = process.env.WORKER_IMPORT_PROFILE === '1' ? new Session() : null;
  if (inspector) { inspector.connect(); await inspector.post('Profiler.enable'); await inspector.post('Profiler.start'); }
  const totalStart = performance.now();
  async function measure(name, fn) {
    const start = performance.now();
    const cpuStart = process.cpuUsage();
    const value = await fn();
    const cpu = process.cpuUsage(cpuStart);
    stages.push({name, wallMs: Math.round(performance.now() - start), cpuMs: Math.round((cpu.user + cpu.system) / 1000)});
    return value;
  }
  const cache = cacheDirectory ? enableCompileCache(cacheDirectory) : {status: 'disabled'};
  const agentRuntimePath = join(runtimeRoot, 'dist/plugin-sdk/agent-runtime.js');
  const resolver = process.env.WORKER_RESOLVE_CACHE === '1' ? installNativeModuleResolutionCache({agentRuntimePath}) : null;
  const agentRuntime = await measure('agent-runtime-import', () => import(pathToFileURL(agentRuntimePath).href));
  await measure('event-runtime-import', () => import(pathToFileURL(join(runtimeRoot, 'dist/plugin-sdk/agent-harness-runtime.js')).href));
  const [, , preparedRuntime] = await measure('command-prepared-import', () => Promise.all([
    import(pathToFileURL(join(runtimeRoot, 'dist/plugin-sdk/config-runtime.js')).href),
    import(pathToFileURL(resolveOpenClawAgentCommandRuntimePath({agentRuntimePath})).href),
    import(pathToFileURL(resolveOpenClawPreparedModelRuntimePath({agentRuntimePath})).href),
  ]));
  const state = process.env.OPENCLAW_STATE_DIR;
  if (!state?.includes('/worker-native-import-')) throw new Error('Fresh diagnostic state is required');
  const config = {agents: {defaults: {workspace: join(state, 'workspace')}, list: [{id: 'diagnostic'}]}, plugins: {enabled: false}};
  let lease;
  try {
    lease = await measure('static-prepared-runtime', () => preparedRuntime.acquireAgentRunPreparedModelRuntime({
      config, agentId: 'diagnostic', agentDir: agentRuntime.resolveAgentDir(config, 'diagnostic'),
      workspaceDir: agentRuntime.resolveAgentWorkspaceDir(config, 'diagnostic'), allowGatewaySubagentBinding: true,
    }, {catalogMode: 'static', abortSignal: AbortSignal.timeout(30_000)}));
    const dist = join(runtimeRoot, 'dist');
    for (const builtin of readdirSync(dist).filter(name => /^builtin-openclaw-[\w-]+\.js$/.test(name)).sort()) {
      await measure(builtin, () => import(pathToFileURL(join(dist, builtin)).href));
    }
  } finally { lease?.release(); }
  if (cacheDirectory) await measure('flush-compile-cache', () => flushCompileCache());
  let profile;
  if (inspector) {
    const {profile: raw} = await inspector.post('Profiler.stop');
    inspector.disconnect();
    const counts = new Map();
    for (const [index, id] of raw.samples.entries()) counts.set(id, (counts.get(id) ?? 0) + raw.timeDeltas[index]);
    profile = raw.nodes.map(node => ({function: node.callFrame.functionName,
      file: basename(node.callFrame.url), line: node.callFrame.lineNumber + 1,
      selfMs: Math.round((counts.get(node.id) ?? 0) / 1000)}))
      .sort((a, b) => b.selfMs - a.selfMs).slice(0, 25);
  }
  console.log(JSON.stringify({cacheStatus: cache.status, resolution: resolver?.status(), stages, totalMs: Math.round(performance.now() - totalStart), maxRSSKiB: process.resourceUsage().maxRSS, profile}));
  process.exit(0);
}
