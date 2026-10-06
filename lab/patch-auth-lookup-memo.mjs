// Memoizes resolveProviderAuthLookupMaps (openclaw/dist/provider-env-vars-BMbvepMk.js)
// per plugin metadata snapshot, config object and workspace-trust flag. Its result is a
// pure function of those three (the env only selects the snapshot), and every caller
// reads it without mutating. A Worker turn rebuilt it ~5 times from the same inputs
// (resolveApiKeyForProvider, resolveModelAuthMode, tool construction, run auth plan).
export const MEMO_MARKER = 'OPENCLAW_PROVIDER_AUTH_LOOKUP_MEMO_V1';

function once(source, before, after, label) {
  if (source.split(before).length - 1 !== 1) throw new Error(`${label} anchor mismatch`);
  return source.replace(before, after);
}

export function patchProviderEnvVarsChunk(source) {
  if (source.includes(MEMO_MARKER)) throw new Error('already patched');
  return once(source,
    '/** Resolves all provider auth lookup maps from a single metadata snapshot. */\nfunction resolveProviderAuthLookupMaps(params) {\n\tconst snapshot = resolveProviderMetadataSnapshot(params);\n',
    `// ${MEMO_MARKER}: same snapshot + same config object + same trust flag => same maps.\n` +
    'const providerAuthLookupMapsMemo = /* @__PURE__ */ new WeakMap();\n' +
    'const providerAuthLookupMapsNoConfig = {};\n' +
    '/** Resolves all provider auth lookup maps from a single metadata snapshot. */\nfunction resolveProviderAuthLookupMaps(params) {\n\tconst snapshot = resolveProviderMetadataSnapshot(params);\n' +
    '\tif (process.env.OPENCLAW_PROVIDER_AUTH_LOOKUP_MEMO === "0" || !snapshot || typeof snapshot !== "object") return resolveProviderAuthLookupMapsFromSnapshot(params, snapshot);\n' +
    '\tconst config = params?.config;\n' +
    '\tconst configKey = config && typeof config === "object" ? config : providerAuthLookupMapsNoConfig;\n' +
    '\tconst trust = params?.includeUntrustedWorkspacePlugins === true ? "include" : params?.includeUntrustedWorkspacePlugins === false ? "exclude" : "default";\n' +
    '\tlet byConfig = providerAuthLookupMapsMemo.get(snapshot);\n' +
    '\tif (!byConfig) providerAuthLookupMapsMemo.set(snapshot, byConfig = /* @__PURE__ */ new WeakMap());\n' +
    '\tlet byTrust = byConfig.get(configKey);\n' +
    '\tif (!byTrust) byConfig.set(configKey, byTrust = /* @__PURE__ */ new Map());\n' +
    '\tlet maps = byTrust.get(trust);\n' +
    '\tif (!maps) byTrust.set(trust, maps = resolveProviderAuthLookupMapsFromSnapshot(params, snapshot));\n' +
    '\treturn maps;\n' +
    '}\n' +
    'function resolveProviderAuthLookupMapsFromSnapshot(params, snapshot) {\n',
    'resolveProviderAuthLookupMaps');
}
