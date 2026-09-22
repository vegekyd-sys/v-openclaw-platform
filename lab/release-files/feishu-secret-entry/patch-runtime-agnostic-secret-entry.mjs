#!/usr/bin/env node
// Makes Feishu secret-entry cards independent of the selected agent runtime.
//
// The v1 patches render channelData.vSecretEntry payloads correctly, but they
// depend on each runtime forwarding an onToolResult callback. External runtimes
// can create the Gateway question without forwarding that callback. This v2
// patch subscribes the Feishu monitor directly to the Gateway's validated
// question.requested lifecycle, resolves the originating Feishu target from the
// session store, and deduplicates the common delivery against the v1 callback.
//
// Shape-gated and idempotent. The Feishu target must already have v1 installed.

import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CORE_MARKER = "v-openclaw91-secret-entry-runtime-v2";
export const FEISHU_MARKER = "v-feishu-secret-entry-runtime-v2";
const FEISHU_V1_MARKER = "v-feishu-secret-entry-v1";

const CORE_SPECS = [
  {
    id: "question-channel-runtime",
    pattern: /^question-channel-runtime-[A-Za-z0-9_-]+\.js$/,
    sites: [
      {
        id: "requested-listener-runtime",
        find: `const handleQuestionChannelRequested = questionChannelRuntime.handleRequested;
const handleQuestionChannelResolved = questionChannelRuntime.handleResolved;
const registerQuestionChannelDelivery = questionChannelRuntime.registerDelivery;`,
        replace: `const vSecretEntryRequestedListeners = resolveGlobalSingleton(Symbol.for("openclaw.questionChannelRequestedListeners"), () => /* @__PURE__ */ new Set(), (listeners) => listeners.clear()); // ${CORE_MARKER}
function subscribeQuestionChannelRequested(listener) {
\tvSecretEntryRequestedListeners.add(listener);
\treturn () => vSecretEntryRequestedListeners.delete(listener);
}
const handleQuestionChannelRequested = (record) => {
\tquestionChannelRuntime.handleRequested(record);
\tfor (const listener of vSecretEntryRequestedListeners) try {
\t\tPromise.resolve(listener(record)).catch((error) => log.warn(\`question requested listener failed id=\${record.id}\`, { error: String(error) }));
\t} catch (error) {
\t\tlog.warn(\`question requested listener failed id=\${record.id}\`, { error: String(error) });
\t}
};
const handleQuestionChannelResolved = questionChannelRuntime.handleResolved;
const registerQuestionChannelDelivery = questionChannelRuntime.registerDelivery;`,
      },
      {
        id: "export-requested-listener",
        find: `export { handleQuestionChannelResolved as n, registerQuestionChannelDelivery as r, handleQuestionChannelRequested as t };`,
        replace: `export { handleQuestionChannelResolved as n, registerQuestionChannelDelivery as r, subscribeQuestionChannelRequested as s, handleQuestionChannelRequested as t };`,
      },
    ],
  },
  {
    id: "question-gateway-runtime",
    pattern: /^question-gateway-runtime-[A-Za-z0-9_-]+\.js$/,
    sites: [
      {
        id: "import-requested-listener",
        find: `import { r as registerQuestionChannelDelivery } from "./question-channel-runtime-BhJ40GDw.js";`,
        replace: `import { r as registerQuestionChannelDelivery, s as subscribeQuestionChannelRequested } from "./question-channel-runtime-BhJ40GDw.js"; // ${CORE_MARKER}`,
      },
      {
        id: "expose-requested-listener",
        find: `\tresolveReaction: resolveQuestionReactionOverGateway,
\tregisterChannelDelivery: registerQuestionChannelDelivery`,
        replace: `\tresolveReaction: resolveQuestionReactionOverGateway,
\tsubscribeRequested: subscribeQuestionChannelRequested,
\tregisterChannelDelivery: registerQuestionChannelDelivery`,
      },
    ],
  },
];

const FEISHU_SITES = [
  {
    id: "runtime-listener-and-route",
    find: `function vSecretEntryPrune(now = Date.now()) {
\tfor (const [key, entry] of vSecretEntryDeliveries) if (now - entry.at > V_SECRET_ENTRY_RETENTION_MS) vSecretEntryDeliveries.delete(key);
\tfor (const [key, at] of vSecretEntryInflightTokens) if (now - at > 9e5) vSecretEntryInflightTokens.delete(key);
}`,
    replace: `function vSecretEntryPrune(now = Date.now()) {
\tfor (const [key, entry] of vSecretEntryDeliveries) if (now - entry.at > V_SECRET_ENTRY_RETENTION_MS) vSecretEntryDeliveries.delete(key);
\tfor (const [key, at] of vSecretEntryInflightTokens) if (now - at > 9e5) vSecretEntryInflightTokens.delete(key);
}
const vSecretEntryDeliveryPromises = new Map(); // ${FEISHU_MARKER}
function vSecretEntryPayloadFromQuestion(record) {
\tif (!record || typeof record !== "object" || typeof record.id !== "string" || !Array.isArray(record.questions) || record.questions.length !== 1) return;
\tconst question = record.questions[0];
\tconst binding = question?.secretStore;
\tif (!question?.isSecret || !binding || typeof binding.name !== "string" || !binding.name.trim()) return;
\tconst name = binding.name.trim();
\treturn {
\t\ttext: \`🔑 V 需要凭据 \${name}，请在卡片里安全录入。\`,
\t\tchannelData: {
\t\t\taskUser: { questionId: record.id },
\t\t\tvSecretEntry: {
\t\t\t\tquestionId: record.id,
\t\t\t\tname,
\t\t\t\t...(typeof binding.reason === "string" && binding.reason.trim() ? { reason: binding.reason.trim() } : {}),
\t\t\t\tallowedHosts: Array.isArray(binding.allowedHosts) ? binding.allowedHosts.filter((host) => typeof host === "string" && host.trim()).map((host) => host.trim()) : []
\t\t\t}
\t\t}
\t};
}
function vSecretEntryRouteFromQuestion(record, cfg, accountId) {
\tconst sessionKey = typeof record?.sessionKey === "string" ? record.sessionKey.trim() : "";
\tconst agentId = /^agent:([^:]+):/u.exec(sessionKey)?.[1];
\tif (!sessionKey || !agentId) return;
\ttry {
\t\tconst entry = getSessionEntry({ storePath: resolveStorePath(cfg.session?.store, { agentId }), sessionKey, readConsistency: "latest" });
\t\tconst delivery = entry?.deliveryContext;
\t\tconst channel = String(delivery?.channel ?? entry?.lastChannel ?? entry?.channel ?? "").trim().toLowerCase();
\t\tconst to = String(delivery?.to ?? entry?.lastTo ?? "").trim();
\t\tconst routeAccountId = normalizeAccountId(delivery?.accountId ?? entry?.lastAccountId);
\t\tif (channel !== "feishu" || !to || routeAccountId !== normalizeAccountId(accountId)) return;
\t\tconst threadId = String(delivery?.threadId ?? entry?.lastThreadId ?? "").trim();
\t\treturn { to, ...(threadId ? { replyToMessageId: threadId, replyInThread: true } : {}) };
\t} catch {
\t\treturn;
\t}
}
function vSecretEntrySubscribeRequested(params) {
\tconst unsubscribe = vSecretEntryQuestionRuntime.subscribeRequested((record) => {
\t\tconst payload = vSecretEntryPayloadFromQuestion(record);
\t\tconst route = payload ? vSecretEntryRouteFromQuestion(record, params.cfg, params.accountId) : void 0;
\t\tif (!payload || !route) return;
\t\tvSecretEntryDeliver({
\t\t\tcfg: params.cfg,
\t\t\tpayload,
\t\t\tto: route.to,
\t\t\treplyToMessageId: route.replyToMessageId,
\t\t\treplyInThread: route.replyInThread,
\t\t\tallowTopLevelReplyFallback: true,
\t\t\taccountId: params.accountId,
\t\t\tlog: params.log
\t\t}).catch((error) => params.log?.(\`feishu[\${params.accountId}]: secret entry lifecycle delivery failed: \${String(error?.message ?? error)}\`));
\t});
\tparams.abortSignal?.addEventListener("abort", unsubscribe, { once: true });
\treturn unsubscribe;
}`,
  },
  {
    id: "deduplicate-card-delivery",
    find: `async function vSecretEntryDeliver(params) {
\tconst request = readSecretEntryRequest(params.payload);
\tconst result = await sendCardFeishu({`,
    replace: `async function vSecretEntryDeliver(params) {
\tconst request = readSecretEntryRequest(params.payload);
\tconst existing = request?.questionId ? vSecretEntryDeliveryPromises.get(request.questionId) : void 0;
\tif (existing) return await existing;
\tconst pending = vSecretEntryDeliverOnce(params);
\tif (request?.questionId) {
\t\tvSecretEntryDeliveryPromises.set(request.questionId, pending);
\t\tconst cleanupTimer = setTimeout(() => vSecretEntryDeliveryPromises.delete(request.questionId), V_SECRET_ENTRY_RETENTION_MS);
\t\tcleanupTimer.unref?.();
\t}
\ttry {
\t\treturn await pending;
\t} catch (error) {
\t\tif (request?.questionId && vSecretEntryDeliveryPromises.get(request.questionId) === pending) vSecretEntryDeliveryPromises.delete(request.questionId);
\t\tthrow error;
\t}
}
async function vSecretEntryDeliverOnce(params) {
\tconst request = readSecretEntryRequest(params.payload);
\tconst result = await sendCardFeishu({`,
  },
  {
    id: "monitor-subscription-lifecycle",
    find: `\tconst warmupCount = await warmupDedupFromPluginState(accountId, log);
\tif (warmupCount > 0) log(\`feishu[\${accountId}]: dedup warmup loaded \${warmupCount} entries from plugin state\`);
\tlet threadBindingManager;`,
    replace: `\tconst warmupCount = await warmupDedupFromPluginState(accountId, log);
\tif (warmupCount > 0) log(\`feishu[\${accountId}]: dedup warmup loaded \${warmupCount} entries from plugin state\`);
\tconst vSecretEntryUnsubscribe = vSecretEntrySubscribeRequested({ cfg, accountId, abortSignal, log });
\tlet threadBindingManager;`,
  },
  {
    id: "monitor-unsubscribe",
    find: `\t} finally {
\t\tthreadBindingManager?.stop();
\t}
}
//#endregion
export { FeishuRetryableSyntheticEventError, monitorSingleAccount, resolveReactionSyntheticEvent };`,
    replace: `\t} finally {
\t\tvSecretEntryUnsubscribe();
\t\tthreadBindingManager?.stop();
\t}
}
//#endregion
export { FeishuRetryableSyntheticEventError, monitorSingleAccount, resolveReactionSyntheticEvent };`,
  },
];

const sha = (text) => createHash("sha256").update(text).digest("hex");

function countOccurrences(haystack, needle) {
  let count = 0;
  for (let index = haystack.indexOf(needle); index !== -1; index = haystack.indexOf(needle, index + needle.length)) count += 1;
  return count;
}

function patchSites(source, sites, marker, label) {
  if (source.includes(marker)) return { changed: false, source };
  for (const site of sites) {
    const count = countOccurrences(source, site.find);
    if (count !== 1) throw new Error(`${label} site ${site.id}: expected 1 match, found ${count}`);
  }
  let patched = source;
  for (const site of sites) patched = patched.replace(site.find, () => site.replace);
  return { changed: true, source: patched };
}

function findOne(dir, pattern, label) {
  const matches = readdirSync(dir).filter((name) => pattern.test(name));
  if (matches.length !== 1) throw new Error(`${label}: expected exactly one file in ${dir}, found ${matches.length}`);
  return join(dir, matches[0]);
}

export function patchRuntimeAgnosticCore(fileId, source) {
  const spec = CORE_SPECS.find((entry) => entry.id === fileId);
  if (!spec) throw new Error(`unknown core file id: ${fileId}`);
  return patchSites(source, spec.sites, CORE_MARKER, fileId);
}

export function patchRuntimeAgnosticFeishu(source) {
  if (!source.includes(FEISHU_V1_MARKER)) throw new Error("Feishu secret-entry v1 must be installed before runtime v2");
  return patchSites(source, FEISHU_SITES, FEISHU_MARKER, "feishu monitor");
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const outIndex = args.indexOf("--out-dir");
  const outDir = outIndex === -1 ? undefined : args[outIndex + 1];
  const positional = args.filter((arg, index) => !arg.startsWith("--") && index !== outIndex + 1);
  const [coreDist, feishuDir] = positional;
  if (!coreDist || !feishuDir || (outIndex !== -1 && !outDir)) {
    console.error("usage: patch-runtime-agnostic-secret-entry.mjs [--check | --out-dir <dir>] <openclaw dist> <@openclaw/feishu dir>");
    process.exit(2);
  }
  try {
    const plans = CORE_SPECS.map((spec) => {
      const path = findOne(coreDist, spec.pattern, spec.id);
      const original = readFileSync(path, "utf8");
      return { id: spec.id, path, original, ...patchRuntimeAgnosticCore(spec.id, original) };
    });
    const feishuDist = join(feishuDir, "dist");
    const feishuPath = findOne(feishuDist, /^monitor\.account-[A-Za-z0-9_-]+\.js$/, "feishu monitor");
    const feishuOriginal = readFileSync(feishuPath, "utf8");
    plans.push({ id: "feishu-monitor", path: feishuPath, original: feishuOriginal, ...patchRuntimeAgnosticFeishu(feishuOriginal) });
    if (outDir) mkdirSync(outDir, { recursive: true });
    const report = [];
    for (const plan of plans) {
      if (outDir) writeFileSync(join(outDir, basename(plan.path)), plan.source);
      else if (plan.changed && !check) {
        copyFileSync(plan.path, `${plan.path}.bak-${plan.id}-${Date.now()}`);
        writeFileSync(plan.path, plan.source);
      }
      report.push({ id: plan.id, file: basename(plan.path), changed: plan.changed, beforeSha: sha(plan.original), afterSha: sha(plan.source) });
    }
    console.log(JSON.stringify({ ok: true, check, outDir, coreMarker: CORE_MARKER, feishuMarker: FEISHU_MARKER, files: report }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, reason: error.message }));
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
