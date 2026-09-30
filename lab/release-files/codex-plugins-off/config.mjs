// Turn off Codex app plugins (codexPlugins) in a Gateway or Worker configuration.
//
// V 2026-09-30: with codexPlugins enabled for canva, every /vcodex turn waits ~3-4 s
// before turn/start while the Codex plugin thread config reads plugin/read (network,
// plugin marketplace) -> app/installed -> plugin/read again. Canva's app inventory is
// always "missing", so the initial-inventory branch runs on every turn and never
// caches. Canva was never called by any Codex rollout in September, and the missing
// inventory means its app was never exposed to the model anyway.
//
// With codexPlugins.enabled === false, buildCodexPluginThreadConfig returns an empty
// config plus a disabled-apps patch before issuing any request. The plugin list is
// kept, so rollback is flipping enabled back to true.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pathToFileURL} from 'node:url';

// Plugins this change knowingly disables. Anything else configured means someone
// added a plugin after this was reviewed; refuse rather than silently turn it off.
export const KNOWN_PLUGINS = ['canva'];

export function disableCodexPlugins(input) {
  const cfg = structuredClone(input);
  const codex = cfg.plugins?.entries?.codex;
  const plugins = codex?.config?.codexPlugins;
  if (plugins === undefined) return {config: cfg, changed: false, reason: 'codexPlugins not configured'};
  assert(plugins && typeof plugins === 'object' && !Array.isArray(plugins), 'codexPlugins must be an object');
  assert.notEqual(plugins.allow_all_plugins, true, 'allow_all_plugins is set; review before disabling');
  const unknown = Object.keys(plugins.plugins ?? {}).filter(k => !KNOWN_PLUGINS.includes(k));
  assert.deepEqual(unknown, [], `Unreviewed Codex plugins configured: ${unknown.join(', ')}`);
  if (plugins.enabled === false) return {config: cfg, changed: false, reason: 'already disabled'};
  codex.config.codexPlugins = {...plugins, enabled: false};
  return {config: cfg, changed: true, reason: 'disabled'};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [file, ...flags] = process.argv.slice(2);
  assert(file && flags.every(f => f === '--apply'), 'usage: node config.mjs /absolute/openclaw.json [--apply]');
  const apply = flags.includes('--apply');
  const text = fs.readFileSync(file, 'utf8');
  const {config, changed, reason} = disableCodexPlugins(JSON.parse(text));
  const plugins = config.plugins?.entries?.codex?.config?.codexPlugins;
  console.log(JSON.stringify({file, apply, changed, reason, enabled: plugins?.enabled ?? null, plugins: Object.keys(plugins?.plugins ?? {})}));
  if (apply && changed) {
    const stat = fs.statSync(file);
    const backup = `${file}.before-codex-plugins-off-${Date.now()}`;
    fs.writeFileSync(backup, text, {flag: 'wx', mode: stat.mode & 0o777});
    fs.chownSync(backup, stat.uid, stat.gid);
    const temp = `${file}.codex-plugins-off-${process.pid}`;
    fs.writeFileSync(temp, JSON.stringify(config, null, 2) + '\n', {flag: 'wx', mode: stat.mode & 0o777});
    fs.chownSync(temp, stat.uid, stat.gid);
    fs.renameSync(temp, file);
    console.log(JSON.stringify({backup}));
  }
}
