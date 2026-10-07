import assert from 'node:assert/strict';

// normalizeChatChannelId remembers its runtime-catalog answers (chat-channel-id-memo), on top
// of npm openclaw@2026.9.1's ids chunk (unmodified on V).
//
// normalizeChatChannelId falls back to normalizeRuntimeBundledChatChannelId for every id
// that is not a built-in chat channel, which is most plugin ids. That walks
// listBundledChannelCatalogEntries, and every call recomputes two cache keys:
// resolveBundledPluginsDir reads about a dozen process.env values (isVitestRuntimeEnv twice,
// the bundled-dir overrides), resolves the user path and JSON-stringifies, and the catalog
// read stringifies again. isPluginExplicitlyDisabled and resolveChannelConfigEnablement call
// it per plugin and per channel. Private VLab candidate 2026-10-06 (5 Workers, Worker CPU
// profiles, cold 8 + warm 16): listBundledChannelCatalogEntries held 4.2 s in total, all of
// it under normalizeRuntimeBundledChatChannelId < normalizeChatChannelId; this includes
// resolveBundledPluginsDir 3.3 s and isVitestRuntimeEnv 2.0 s. In the cold-turn windows,
// isVitestRuntimeEnv was the top self-time frame after the SQLite and GC frames.
//
// The catalog for a given key is built once and never changes, so the answer for a
// normalized id is fixed while the plugin cache holds exactly one catalog. The memo hangs
// off that plugin cache's catalog map, so a reset or scoped plugin cache starts empty. It is
// only consulted while that map holds a single catalog: a second catalog (a changed working
// directory or bundled-plugins override) turns the memo off and every lookup takes the
// original walk. OPENCLAW_CHAT_CHANNEL_ID_MEMO=0 (read at module load) turns it off.

export const MARKER = '/* OPENCLAW_CHAT_CHANNEL_ID_MEMO_V1 */';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchIdsChunk(source) {
  assert.equal(source.includes(MARKER), false, 'already patched');
  let out = replaceExactlyOnce(
    source,
    `import { n as listBundledChannelCatalogEntries } from "./bundled-channel-catalog-read-BwcurWAL.js";
`,
    `import { n as listBundledChannelCatalogEntries } from "./bundled-channel-catalog-read-BwcurWAL.js";
import { a as getPluginCache } from "./plugin-cache-DGWspMEc.js";
`,
    'catalog import',
  );
  out = replaceExactlyOnce(
    out,
    `function normalizeRuntimeBundledChatChannelId(normalized) {
	for (const entry of listBundledChannelCatalogEntries()) if (entry.id === normalized || entry.aliases.includes(normalized)) return entry.id;
	return null;
}`,
    `${MARKER}
const runtimeBundledChatChannelIdMemoEnabled = process.env.OPENCLAW_CHAT_CHANNEL_ID_MEMO !== "0";
const runtimeBundledChatChannelIdMemos = /* @__PURE__ */ new WeakMap();
function normalizeRuntimeBundledChatChannelId(normalized) {
	const catalogs = runtimeBundledChatChannelIdMemoEnabled ? getPluginCache().metadata.bundledChannelCatalogs : void 0;
	const memo = catalogs?.size === 1 ? runtimeBundledChatChannelIdMemos.get(catalogs) : void 0;
	if (memo?.has(normalized)) return memo.get(normalized);
	let result = null;
	for (const entry of listBundledChannelCatalogEntries()) if (entry.id === normalized || entry.aliases.includes(normalized)) {
		result = entry.id;
		break;
	}
	if (catalogs?.size === 1) {
		let next = runtimeBundledChatChannelIdMemos.get(catalogs);
		if (!next || next.size >= 4096) runtimeBundledChatChannelIdMemos.set(catalogs, next = /* @__PURE__ */ new Map());
		next.set(normalized, result);
	}
	return result;
}`,
    'runtime bundled chat channel lookup',
  );
  return out;
}
