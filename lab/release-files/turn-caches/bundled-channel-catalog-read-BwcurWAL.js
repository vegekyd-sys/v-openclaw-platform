import { a as getPluginCache } from "./plugin-cache-DGWspMEc.js";
import { n as resolveOpenClawPackageRootSync } from "./openclaw-root-CfYY-fyD.js";
import { c as isRecord } from "./record-coerce-DItp3I4t.js";
import { c as normalizeOptionalLowercaseString } from "./string-coerce-CIXf7egm.js";
import { y as uniqueStrings } from "./string-normalization-DiSb4JeN.js";
import { l as readPluginCacheJsonFile, s as readPluginCacheDirectory } from "./plugin-cache-files-ephosqaM.js";
import { i as resolveBundledPluginsDir } from "./bundled-dir-CnR4u-Mo.js";
import { n as BUNDLED_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_ENTRIES } from "./official-external-plugin-bundled-catalogs-DV0ahlzn.js";
import path from "node:path";
//#region src/channels/bundled-channel-catalog-read.ts
/**
* Bundled channel catalog reader.
*
* Loads channel metadata from generated package catalogs and bundled plugin package manifests.
*/
const OFFICIAL_CHANNEL_CATALOG_RELATIVE_PATH = path.join("dist", "channel-catalog.json");
function listPackageRoots() {
	return uniqueStrings([resolveOpenClawPackageRootSync({ cwd: process.cwd() }), resolveOpenClawPackageRootSync({ moduleUrl: import.meta.url })].filter((entry) => Boolean(entry)));
}
function readBundledExtensionCatalogEntriesSync(pluginsDir) {
	if (!pluginsDir) return [];
	try {
		return readPluginCacheDirectory(pluginsDir).filter((entry) => entry.isDirectory()).flatMap((entry) => {
			const packageJsonPath = path.join(pluginsDir, entry.name, "package.json");
			const parsed = readPluginCacheJsonFile(packageJsonPath);
			return parsed.ok && isRecord(parsed.value) ? [parsed.value] : [];
		});
	} catch {
		return [];
	}
}
function readOfficialCatalogFileSync() {
	const bundledExternalEntries = BUNDLED_OFFICIAL_EXTERNAL_PLUGIN_CATALOG_ENTRIES.filter((entry) => typeof entry === "object" && entry !== null);
	for (const packageRoot of listPackageRoots()) {
		const candidate = path.join(packageRoot, OFFICIAL_CHANNEL_CATALOG_RELATIVE_PATH);
		const payload = readPluginCacheJsonFile(candidate);
		if (payload.ok && isRecord(payload.value)) {
			const entries = Array.isArray(payload.value.entries) ? payload.value.entries.filter((entry) => isRecord(entry)) : [];
			return [...bundledExternalEntries, ...entries];
		}
	}
	return bundledExternalEntries;
}
function isChannelCatalogEntryLike(entry) {
	return "openclaw" in entry;
}
function toBundledChannelEntry(entry) {
	const channel = isChannelCatalogEntryLike(entry) ? entry.openclaw?.channel : entry;
	const id = normalizeOptionalLowercaseString(channel?.id);
	if (!id || !channel) return null;
	return {
		id,
		channel,
		aliases: Array.isArray(channel.aliases) ? channel.aliases.map((alias) => normalizeOptionalLowercaseString(alias)).filter((alias) => Boolean(alias)) : [],
		order: typeof channel.order === "number" && Number.isFinite(channel.order) ? channel.order : Number.MAX_SAFE_INTEGER
	};
}
/**
* Lists bundled channel catalog entries from package manifests and generated catalog files.
*/
const turnHelperMemoEnabled = process.env.OPENCLAW_TURN_HELPER_MEMO !== "0";
let bundledChannelCatalogMemo;
function listBundledChannelCatalogEntries() {
	// turn-caches: one answer per microtask window and plugin cache
	if (!turnHelperMemoEnabled) return listBundledChannelCatalogEntriesKeyed();
	const catalogs = getPluginCache().metadata.bundledChannelCatalogs;
	if (bundledChannelCatalogMemo?.catalogs === catalogs) return bundledChannelCatalogMemo.value;
	const value = listBundledChannelCatalogEntriesKeyed();
	bundledChannelCatalogMemo = { catalogs, value };
	queueMicrotask(() => {
		bundledChannelCatalogMemo = void 0;
	});
	return value;
}
function listBundledChannelCatalogEntriesKeyed() {
	const pluginsDir = resolveBundledPluginsDir();
	const catalogs = getPluginCache().metadata.bundledChannelCatalogs;
	const key = JSON.stringify([process.cwd(), pluginsDir]);
	const cached = catalogs.get(key);
	if (cached) return cached;
	const entries = /* @__PURE__ */ new Map();
	for (const entry of readBundledExtensionCatalogEntriesSync(pluginsDir)) {
		const channelEntry = toBundledChannelEntry(entry);
		if (channelEntry) entries.set(channelEntry.id, channelEntry);
	}
	for (const entry of readOfficialCatalogFileSync()) {
		const channelEntry = toBundledChannelEntry(entry);
		if (channelEntry) entries.set(channelEntry.id, entries.get(channelEntry.id) ?? channelEntry);
	}
	const catalog = Array.from(entries.values()).toSorted((left, right) => left.order - right.order || left.id.localeCompare(right.id));
	catalogs.set(key, catalog);
	return catalog;
}
/** Finds bundled or generated channel metadata by id or alias. */
function findBundledChannelCatalogMetadata(channelId) {
	const normalized = normalizeOptionalLowercaseString(channelId);
	if (!normalized) return;
	return listBundledChannelCatalogEntries().find((entry) => entry.id === normalized || entry.aliases.includes(normalized))?.channel;
}
//#endregion
export { listBundledChannelCatalogEntries as n, findBundledChannelCatalogMetadata as t };
