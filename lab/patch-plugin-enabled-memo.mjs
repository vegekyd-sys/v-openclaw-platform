import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

// isInstalledPluginEnabled re-normalized the plugins config and re-resolved activation for every plugin on
// every call. Tool construction and provider auth lookups ask it for every plugin, twice per Codex turn,
// on the Gateway's main thread. The answer depends only on the index record, the config object and, for
// bundled provider compat plugins, the bundled-discovery mode, so it is memoized per record and config
// object (config snapshots are replaced on reload, not mutated) and cleared with the other plugin metadata
// memos. See lab/plugin-enabled-memo.md. Source: openclaw-versa versa/plugin-enabled-memo-20261108 @aa8511f40f0.
// OPENCLAW_V_PLUGIN_ENABLED_MEMO=0 skips the memo, read on each call.

export const MARKER = 'plugin-enabled-memo';
export const RELEASE_DIR = 'lab/release-files/plugin-enabled-memo';
export const sha256 = (value) => createHash('sha256').update(value).digest('hex');

export const FILES = {
  'installed-plugin-index-DzUab7zi.js': {
    target: 'openclaw/dist/installed-plugin-index-DzUab7zi.js',
    before: '3d177fdc4cff00363fa39864bfb0dd188fccc6cb1cfa8d0528cfb3a38839192c',
    replacements: [
      [
        'import { r as readBundledDiscoveryModeMemoized } from "./bundled-discovery-state-D9XVJXpC.js";\n',
        'import { r as readBundledDiscoveryModeMemoized } from "./bundled-discovery-state-D9XVJXpC.js";\nimport { n as registerPluginMetadataProcessMemoLifecycleClear } from "./plugin-metadata-lifecycle-C6m-q5Au.js";\n',
      ],
      [
        `function isInstalledPluginEnabled(index, pluginId, config, env) {
	const record = getInstalledPluginRecord(index, pluginId);
	if (!record) return false;
	if (!config) return record.enabled;
	const activationConfig = withBundledPluginEnablementCompat({
		config,
		env,
		pluginIds: isBundledProviderCompatPlugin({
			origin: record.origin,
			providers: record.contributions?.providers,
			contracts: record.contributions?.contracts
		}) ? [record.pluginId] : [],
		activation: "defaults"
	});
`,
        `// ${MARKER}: one answer per index record and config object; cleared with the plugin metadata memos.
let installedPluginEnabledMemo = /* @__PURE__ */ new WeakMap();
registerPluginMetadataProcessMemoLifecycleClear(() => {
	installedPluginEnabledMemo = /* @__PURE__ */ new WeakMap();
});
function isInstalledPluginEnabled(index, pluginId, config, env) {
	const record = getInstalledPluginRecord(index, pluginId);
	if (!record) return false;
	if (!config) return record.enabled;
	const compatPluginIds = isBundledProviderCompatPlugin({
		origin: record.origin,
		providers: record.contributions?.providers,
		contracts: record.contributions?.contracts
	}) ? [record.pluginId] : [];
	if (process.env.OPENCLAW_V_PLUGIN_ENABLED_MEMO === "0") return resolveInstalledPluginEnabled(record, config, env, compatPluginIds);
	const memoKey = compatPluginIds.length > 0 ? \`compat:\${readBundledDiscoveryModeMemoized(env)}\` : "";
	let byConfig = installedPluginEnabledMemo.get(record);
	if (!byConfig) {
		byConfig = /* @__PURE__ */ new WeakMap();
		installedPluginEnabledMemo.set(record, byConfig);
	}
	let byKey = byConfig.get(config);
	if (!byKey) {
		byKey = /* @__PURE__ */ new Map();
		byConfig.set(config, byKey);
	}
	const memoized = byKey.get(memoKey);
	if (memoized !== void 0) return memoized;
	const enabled = resolveInstalledPluginEnabled(record, config, env, compatPluginIds);
	byKey.set(memoKey, enabled);
	return enabled;
}
function resolveInstalledPluginEnabled(record, config, env, compatPluginIds) {
	const activationConfig = withBundledPluginEnablementCompat({
		config,
		env,
		pluginIds: compatPluginIds,
		activation: "defaults"
	});
`,
      ],
    ],
  },
};

export function patchFile(name, source) {
  const spec = FILES[name];
  assert(spec, `unknown file ${name}`);
  assert(!source.includes(MARKER), `${name} already patched`);
  assert.equal(sha256(source), spec.before, `${name} is not V's bytes`);
  let output = source;
  for (const [from, to] of spec.replacements) {
    assert.equal(output.split(from).length, 2, `${name}: anchor must occur once: ${from.slice(0, 80)}`);
    output = output.replace(from, () => to);
  }
  return output;
}

export function unpatchFile(name, release) {
  const spec = FILES[name];
  let output = release;
  for (const [from, to] of [...spec.replacements].reverse()) {
    assert.equal(output.split(to).length, 2, `${name}: patched text must occur once: ${to.slice(0, 80)}`);
    output = output.replace(to, () => from);
  }
  return output;
}
