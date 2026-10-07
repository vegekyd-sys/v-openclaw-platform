import assert from 'node:assert/strict';

// Feishu: serve an expired sender name / group name at once and refresh it in the background.
//
// Before a message reaches the agent, V's Feishu monitor awaits two Feishu lookups that only
// label the prompt: the sender's name (contact.user.get, cached 10 min) and, in groups, the
// group's name (im.chat.get, cached 30 min). Once the cache entry expires, the next message
// from that person or group waits a full Feishu API round trip before dispatch, and both
// lookups run in series. V's real traffic is sporadic (a person comes back after more than
// 10 min), so the first message of most conversations pays this wait in front of 首字.
//
// With this patch an entry that has expired less than 24 h ago is returned immediately and a
// single background lookup refreshes it (one in flight per sender/group). Answers are not
// affected: the agent sees the same name; after a rename, at most the first message still
// carries the old name. A failed background refresh keeps the old name instead of dropping it.
// Messages with no cache entry at all still wait for the lookup, as before.
// Off switch: OPENCLAW_FEISHU_NAME_SWR=0 restores the blocking behaviour.

export const MARKER = 'v-feishu-name-swr-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchFeishuMonitor(source) {
  assert(!source.includes(MARKER), 'already patched');
  let out = source;
  out = replaceExactlyOnce(out,
    'const GROUP_NAME_CACHE_MAX_SIZE = 500;\n',
    `const GROUP_NAME_CACHE_MAX_SIZE = 500;
// ${MARKER}: expired sender/group names are served while one background lookup refreshes them
const V_FEISHU_NAME_STALE_MAX_MS = 864e5;
const vFeishuNameSwrEnabled = () => process.env.OPENCLAW_FEISHU_NAME_SWR !== "0";
const vGroupNameRefreshing = /* @__PURE__ */ new Set();
const vSenderNameRefreshing = /* @__PURE__ */ new Set();
`, 'group name cache size');
  // keep recently expired group names for the stale window instead of evicting them
  out = replaceExactlyOnce(out,
    '\t\tif (expiresAt === void 0 || expiresAt <= now) feishuGroupNameCache.delete(key);\n',
    '\t\tif (expiresAt === void 0 || expiresAt + (vFeishuNameSwrEnabled() ? V_FEISHU_NAME_STALE_MAX_MS : 0) <= now) feishuGroupNameCache.delete(key);\n',
    'group name eviction');
  out = replaceExactlyOnce(out,
    '\t\tif (now !== void 0 && expiresAt !== void 0 && expiresAt > now) return cached.name || void 0;\n\t\tfeishuGroupNameCache.delete(cacheKey);\n',
    `\t\tif (now !== void 0 && expiresAt !== void 0 && expiresAt > now) return cached.name || void 0;
\t\tif (cached.name && !params.vNameSwrRefresh && vFeishuNameSwrEnabled() && now !== void 0 && expiresAt !== void 0 && now - expiresAt < V_FEISHU_NAME_STALE_MAX_MS) {
\t\t\tif (!vGroupNameRefreshing.has(cacheKey)) {
\t\t\t\tvGroupNameRefreshing.add(cacheKey);
\t\t\t\tresolveGroupName({ ...params, vNameSwrRefresh: true }).catch(() => {}).finally(() => vGroupNameRefreshing.delete(cacheKey));
\t\t\t}
\t\t\treturn cached.name;
\t\t}
\t\tif (!params.vNameSwrRefresh) feishuGroupNameCache.delete(cacheKey);
`, 'group name cache read');
  out = replaceExactlyOnce(out,
    '\t\tlog(`feishu[${account.accountId}]: getChatInfo failed for ${chatId}: ${String(err)}`);\n\t\tsetCacheEntry(cacheKey, "");\n',
    '\t\tlog(`feishu[${account.accountId}]: getChatInfo failed for ${chatId}: ${String(err)}`);\n\t\tif (!params.vNameSwrRefresh) setCacheEntry(cacheKey, "");\n',
    'group name lookup failure');
  out = replaceExactlyOnce(out,
    '\tif (cached && now !== void 0 && cachedExpireAt !== void 0 && cachedExpireAt > now) return cached.kind === "resolved" ? { name: cached.name } : {};\n\tif (cached) senderNameCache.delete(cacheKey);\n',
    `\tif (cached && now !== void 0 && cachedExpireAt !== void 0 && cachedExpireAt > now) return cached.kind === "resolved" ? { name: cached.name } : {};
\tif (cached?.kind === "resolved" && !params.vNameSwrRefresh && vFeishuNameSwrEnabled() && now !== void 0 && cachedExpireAt !== void 0 && now - cachedExpireAt < V_FEISHU_NAME_STALE_MAX_MS) {
\t\tif (!vSenderNameRefreshing.has(cacheKey)) {
\t\t\tvSenderNameRefreshing.add(cacheKey);
\t\t\tresolveFeishuSenderName({ ...params, vNameSwrRefresh: true }).catch(() => {}).finally(() => vSenderNameRefreshing.delete(cacheKey));
\t\t}
\t\treturn { name: cached.name };
\t}
\tif (cached && !params.vNameSwrRefresh) senderNameCache.delete(cacheKey);
`, 'sender name cache read');
  return out;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import('node:fs');
  const [input, output] = process.argv.slice(2);
  assert(input && output, 'usage: patch-feishu-name-swr.mjs <monitor.account-*.js> <out>');
  fs.writeFileSync(output, patchFeishuMonitor(fs.readFileSync(input, 'utf8')));
}
