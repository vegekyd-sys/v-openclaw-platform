import assert from 'node:assert/strict';

// isInstalledPluginEnabled reuses the normalized plugins config (plugin-config-memo), on top
// of npm openclaw@2026.9.1's installed-plugin-index chunk (unmodified on V).
//
// isInstalledPluginEnabled answers one plugin at a time, but every call re-normalizes the
// whole plugins config with normalizePluginsConfig: every entry's hooks, subagent and llm
// blocks are rebuilt, and every entry id goes through normalizePluginId. Callers ask for
// every installed plugin in a row (plugin-registry-contributions, provider-env-vars,
// model-selection, usage-format), so one pass costs plugins x entries. Private VLab
// candidate 2026-10-06 (5 Workers, Worker CPU profiles, cold 8 + warm 16):
// normalizePluginEntries held 1.2 s in total, nearly all of it under isInstalledPluginEnabled.
//
// With activation "defaults" and no bundled-provider compat, withBundledPluginEnablementCompat
// returns the caller's config, so the plugins object is the same across the loop. The memo
// keys on that object and also records the identity of its entries, allow, deny, slots and
// load values, its enabled flag, and each entry's identity and enabled flag; any change to
// those normalizes again. A compat copy is a new object each call and simply misses.
// The normalized value is only read by resolveEffectivePluginActivationState.
// OPENCLAW_PLUGIN_CONFIG_MEMO=0 (read at module load) turns it off.

export const MARKER = '/* OPENCLAW_PLUGIN_CONFIG_MEMO_V1 */';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export const ORIGINAL_ENABLED = `function isInstalledPluginEnabled(index, pluginId, config, env) {`;

export const MEMO = `${MARKER}
const installedPluginConfigMemoEnabled = process.env.OPENCLAW_PLUGIN_CONFIG_MEMO !== "0";
const installedPluginConfigMemos = /* @__PURE__ */ new WeakMap();
function installedPluginConfigEntriesShape(entries) {
	if (!entries || typeof entries !== "object" || Array.isArray(entries)) return [];
	const shape = [];
	for (const key in entries) {
		if (!Object.hasOwn(entries, key)) continue;
		const value = entries[key];
		shape.push(key, value, value && typeof value === "object" ? value.enabled : void 0);
	}
	return shape;
}
function normalizeInstalledPluginActivationConfig(plugins) {
	if (!installedPluginConfigMemoEnabled || !plugins || typeof plugins !== "object") return normalizePluginsConfig(plugins);
	const shape = installedPluginConfigEntriesShape(plugins.entries);
	const memo = installedPluginConfigMemos.get(plugins);
	if (memo && memo.entries === plugins.entries && memo.allow === plugins.allow && memo.deny === plugins.deny && memo.slots === plugins.slots && memo.load === plugins.load && memo.enabled === plugins.enabled && memo.shape.length === shape.length && memo.shape.every((value, index) => value === shape[index])) return memo.value;
	const value = normalizePluginsConfig(plugins);
	installedPluginConfigMemos.set(plugins, {
		entries: plugins.entries,
		allow: plugins.allow,
		deny: plugins.deny,
		slots: plugins.slots,
		load: plugins.load,
		enabled: plugins.enabled,
		shape,
		value
	});
	return value;
}
`;

export function patchInstalledPluginIndexChunk(source) {
  assert.equal(source.includes(MARKER), false, 'already patched');
  let out = replaceExactlyOnce(source, ORIGINAL_ENABLED, `${MEMO}${ORIGINAL_ENABLED}`, 'isInstalledPluginEnabled');
  out = replaceExactlyOnce(
    out,
    `	const normalizedConfig = normalizePluginsConfig(activationConfig?.plugins);
	return resolveEffectivePluginActivationState({
		id: record.pluginId,`,
    `	const normalizedConfig = normalizeInstalledPluginActivationConfig(activationConfig?.plugins);
	return resolveEffectivePluginActivationState({
		id: record.pluginId,`,
    'isInstalledPluginEnabled normalize',
  );
  return out;
}
