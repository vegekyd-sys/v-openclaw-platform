// Does a release need a Gateway restart, or does `vlab.workers.roll` suffice?
// docs/worker-roll-scope.md has the measurement and the replay.
//
// Node cannot replace a module that is already loaded, so a file the running
// Gateway has loaded only changes behaviour after a Gateway restart. A Worker
// process imports the runtime from disk when it is spawned, so a file that only
// Workers load takes effect when `vlab.workers.roll` replaces the Worker
// generation (drained, no turn is cut).
//
// The load manifest (release/load-manifest/*.json) lists, per process, the
// runtime files measured as loaded, plus the files Gateway-loaded code can
// still import. Per changed target (change: modified | added | removed):
//
//   gateway         the Gateway loads it                         -> restart
//   gateway-reachable  not seen loaded by the Gateway, but code the Gateway
//                   has loaded imports it (static or dynamic edge). A long-
//                   lived V Gateway may have loaded it on a path the
//                   measurement missed; if not, it will load the NEW bytes
//                   linked against OLD cached modules (worker-prewarm-20261005:
//                   new agent-command-DeP5kHlK imports an export the cached
//                   agent-command-DPfawBbr lacks -> SyntaxError)   -> restart
//   unmeasured      core/worker file nobody was seen loading     -> restart
//                   (conservative: the measurement may have missed a path)
//   gateway-plugin  Feishu, DingTalk, WeCom, Codex plugin: loaded by the
//                   Gateway (Codex and claude-cli turns run there) -> restart
//   plugin-manifest an added openclaw.plugin.json / package.json: plugin
//                   discovery happens at Gateway start           -> restart
//   unknown         a target outside every runtime component     -> restart
//   worker          only Workers load it, nothing in the Gateway imports it -> roll
//   added           a file that did not exist: no process can have it cached,
//                   and only changed code can import it          -> roll
//   removed         a deleted file the Gateway neither loads nor can import;
//                   whatever imported it is another changed file of the
//                   release and is judged on its own              -> roll
//   worker-behavior the Gateway loads it (keeps the old bytes), and a reviewer
//                   declared the change only matters inside a Worker (named
//                   target + reason; never inferred, never for gateway-reachable
//                   files)                                       -> roll
//
// A release is worker-roll-only when every target rolls.
import { readFileSync } from 'node:fs';
import { componentOfTarget } from './runtime-components.mjs';

export const RESTART_REQUIRED = 'restart-required';
export const WORKER_ROLL_ONLY = 'worker-roll-only';
const ROLL_SCOPES = new Set(['worker', 'added', 'removed', 'worker-behavior']);
const PLUGIN_MANIFEST = /(?:^|\/)(?:openclaw\.plugin\.json|package\.json)$/u;

export function loadManifest(file) {
  return normalizeManifest(JSON.parse(readFileSync(file, 'utf8')));
}

export function normalizeManifest(raw) {
  if (raw?.schema !== 1) throw new Error('load manifest: schema 1 expected');
  for (const key of ['gateway', 'worker']) {
    if (!Array.isArray(raw[key]) || raw[key].length === 0) throw new Error(`load manifest: ${key} file list missing`);
  }
  return { ...raw, gatewaySet: new Set(raw.gateway), workerSet: new Set(raw.worker), reachableSet: new Set(raw.gatewayReachable ?? []) };
}

// One target -> { target, component, change, scope, restart, reason }.
export function classifyTarget(target, manifest, workerBehavior = {}, change = 'modified') {
  const component = componentOfTarget(target)?.id ?? null;
  const out = (scope, reason) => ({ target, component, change, scope, restart: !ROLL_SCOPES.has(scope), reason });
  if (component !== 'core' && component !== 'worker') {
    return component
      ? out('gateway-plugin', `${component} plugin runs in the Gateway`)
      : out('unknown', 'not part of any runtime component');
  }
  if (change === 'added') {
    return PLUGIN_MANIFEST.test(target)
      ? out('plugin-manifest', 'new plugin manifest: discovered at Gateway start')
      : out('added', 'new file: nothing has it cached');
  }
  const inGateway = manifest.gatewaySet.has(target);
  const inWorker = manifest.workerSet.has(target);
  if (inGateway) {
    const why = workerBehavior[target];
    if (typeof why === 'string' && why.trim()) {
      return out('worker-behavior', `Gateway keeps the old bytes; declared Worker-only behaviour: ${why.trim()}`);
    }
    return out('gateway', inWorker ? 'loaded by the Gateway and by Workers' : 'loaded by the Gateway');
  }
  if (manifest.reachableSet.has(target)) {
    return out('gateway-reachable', `${inWorker ? 'loaded by Workers; ' : ''}Gateway-loaded code imports it: a later load would link new bytes to old modules`);
  }
  if (inWorker) return out('worker', 'loaded only by Workers');
  if (change === 'removed') return out('removed', 'deleted; the Gateway neither loads nor imports it');
  return out('unmeasured', 'not seen loaded by either process; treated as Gateway');
}

const asChange = (t) => (typeof t === 'string' ? { target: t, change: 'modified' } : { change: 'modified', ...t });

// targets: stage targets ("openclaw/dist/x.js", "production-worker/worker.mjs",
// "npm/projects/openclaw-feishu-.../x.js"), or { target, change } with change
// modified | added | removed. workerBehavior: { target: reason }.
export function classifyRelease(targets, manifest, { workerBehavior = {} } = {}) {
  const changes = [...new Map(targets.map(asChange).map((c) => [c.target, c])).values()]
    .sort((a, b) => a.target.localeCompare(b.target));
  const names = new Set(changes.map((c) => c.target));
  const unused = Object.keys(workerBehavior).filter((t) => !names.has(t));
  if (unused.length) throw new Error(`worker-behavior declared for targets not in this release: ${unused.join(', ')}`);
  const files = changes.map((c) => classifyTarget(c.target, manifest, workerBehavior, c.change));
  const triggers = files.filter((f) => f.restart);
  return {
    verdict: files.length > 0 && triggers.length === 0 ? WORKER_ROLL_ONLY : RESTART_REQUIRED,
    files,
    triggers,
  };
}

export function formatVerdict(result) {
  const lines = [`restart scope: ${result.verdict}`];
  if (result.files.length === 0) lines.push('  (no files: nothing to roll; treated as restart-required)');
  const tag = (f) => (f.change && f.change !== 'modified' ? `${f.change} ` : '');
  for (const f of result.triggers) lines.push(`  restart <- ${tag(f)}${f.target}  [${f.scope}] ${f.reason}`);
  for (const f of result.files.filter((x) => !x.restart)) lines.push(`  roll    <- ${tag(f)}${f.target}  [${f.scope}] ${f.reason}`);
  if (result.verdict === WORKER_ROLL_ONLY) lines.push('  takes effect with: openclaw gateway call vlab.workers.roll (drains the old Worker generation)');
  return lines.join('\n');
}
