#!/usr/bin/env node
// Renders OpenClaw `secrets` requests as a Feishu card with a masked input,
// and resolves the question straight from the card callback.
//
// Pairs with `patch-openclaw91-secret-entry.mjs`, which makes the core attach a
// `channelData.vSecretEntry` descriptor to the prompt instead of failing when no
// Control UI link exists. This patch teaches the Feishu monitor bundle to:
//   1. deliver that descriptor as a card (and turn the card grey when the
//      question expires or is cancelled);
//   2. intercept the card's form submission before the stock card-action
//      parser (which drops `form_value`), call `question.resolve` with the
//      `operator.questions` scope, and swap the form for a "saved" card.
//
// The secret value only travels card callback -> loopback Gateway RPC. It is
// never logged, echoed, or dispatched as a synthetic chat message.
//
// Shape-gated and idempotent, like the other Feishu patches: every anchor must
// match the live bundle exactly or nothing is written.

import { createHash } from "node:crypto";
import { copyFileSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const MARKER = "v-feishu-secret-entry-v1";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The card module, with `export` stripped so it can live inside the bundle. */
export function inlineCardModule(source = readFileSync(join(HERE, "feishu-secret-entry-card.mjs"), "utf8")) {
  const body = source.replace(/^export (const|function|async function) /gm, "$1 ");
  if (/^\s*(import|export)\s/m.test(body)) {
    throw new Error("feishu-secret-entry-card.mjs must stay free of imports/exports to be inlined");
  }
  return body;
}

const IMPORTS = `import { callGatewayFromCli as vSecretEntryCallGateway } from "openclaw/plugin-sdk/gateway-runtime";
import { questionGatewayRuntime as vSecretEntryQuestionRuntime } from "openclaw/plugin-sdk/question-gateway-runtime";
`;

// Runtime glue. Lives in the monitor bundle's module scope, so it can use the
// bundle's own sendCardFeishu / createFeishuClient / resolveFeishuRuntimeAccount.
const GLUE = `
const vSecretEntryDeliveries = new Map();
const vSecretEntryInflightTokens = new Map();
const V_SECRET_ENTRY_RETENTION_MS = 36e5;
function vSecretEntryPrune(now = Date.now()) {
	for (const [key, entry] of vSecretEntryDeliveries) if (now - entry.at > V_SECRET_ENTRY_RETENTION_MS) vSecretEntryDeliveries.delete(key);
	for (const [key, at] of vSecretEntryInflightTokens) if (now - at > 9e5) vSecretEntryInflightTokens.delete(key);
}
async function vSecretEntryPatchCard(params) {
	const account = resolveFeishuRuntimeAccount({ cfg: params.cfg, accountId: params.accountId });
	const client = createFeishuClient(account);
	const response = await client.im.message.patch({
		path: { message_id: params.messageId },
		data: { content: JSON.stringify(params.card) }
	});
	if (response?.code !== void 0 && response.code !== 0) throw new Error(\`Feishu card patch failed: \${response.code}\`);
}
async function vSecretEntryDeliver(params) {
	const request = readSecretEntryRequest(params.payload);
	const result = await sendCardFeishu({
		cfg: params.cfg,
		to: params.to,
		card: buildSecretEntryCard(request),
		replyToMessageId: params.replyToMessageId,
		replyInThread: params.replyInThread,
		allowTopLevelReplyFallback: params.allowTopLevelReplyFallback,
		accountId: params.accountId
	});
	vSecretEntryPrune();
	const messageId = result?.messageId;
	if (messageId) {
		const entry = { request, messageId, accountId: params.accountId, cfg: params.cfg, at: Date.now(), state: "pending" };
		vSecretEntryDeliveries.set(request.questionId, entry);
		try {
			vSecretEntryQuestionRuntime.registerChannelDelivery({
				questionId: request.questionId,
				deliveryId: \`feishu:\${params.accountId}:\${messageId}\`,
				finalize: async (statusLine) => {
					const state = secretEntryStateFromStatusLine(statusLine);
					if (!state || entry.state !== "pending") return;
					entry.state = state;
					await vSecretEntryPatchCard({ cfg: entry.cfg, accountId: entry.accountId, messageId, card: buildSecretEntryCard(request, state, { operatorOpenId: entry.operatorOpenId }) });
				}
			});
		} catch (error) {
			params.log?.(\`feishu[\${params.accountId}]: secret entry card for \${request.name} will not auto-expire: \${String(error?.message ?? error)}\`);
		}
	}
	return result;
}
function vSecretEntryErrorReason(error) {
	const details = error?.details;
	if (details && typeof details === "object" && typeof details.reason === "string") return details.reason;
	return typeof error?.gatewayCode === "string" ? error.gatewayCode : error?.name ?? "error";
}
async function vSecretEntryHandleSubmission(params) {
	const { cfg, accountId, submission, log } = params;
	if (submission.kind === "invalid") return secretEntryCallbackResponse("error", "这张卡片已失效，请让 V 重新发起。");
	if (submission.kind === "empty") return secretEntryCallbackResponse("warning", "请先粘贴密钥再保存。");
	if (submission.kind === "too-long") return secretEntryCallbackResponse("error", "密钥太长，无法保存。");
	vSecretEntryPrune();
	const entry = vSecretEntryDeliveries.get(submission.questionId);
	const request = entry?.request ?? { questionId: submission.questionId, name: submission.name, allowedHosts: [] };
	if (request.name !== submission.name) return secretEntryCallbackResponse("error", "这张卡片已失效，请让 V 重新发起。");
	if (entry && entry.state !== "pending") return secretEntryCallbackResponse("info", "这个请求已经结束了。", buildSecretEntryCard(request, entry.state, { operatorOpenId: entry.operatorOpenId }));
	const tokenKey = submission.token ? \`\${accountId}:\${submission.token}\` : void 0;
	if (tokenKey && vSecretEntryInflightTokens.has(tokenKey)) return secretEntryCallbackResponse("info", "正在保存…");
	if (tokenKey) vSecretEntryInflightTokens.set(tokenKey, Date.now());
	try {
		await vSecretEntryCallGateway("question.resolve", { config: cfg }, {
			id: submission.questionId,
			answers: { answers: { [V_SECRET_ENTRY_FIELD]: [submission.secret] } },
			...submission.operatorOpenId ? { resolvedBy: \`feishu:\${submission.operatorOpenId}\` } : {}
		}, { scopes: ["operator.questions"], progress: false, timeoutMs: 15e3 });
	} catch (error) {
		const reason = vSecretEntryErrorReason(error);
		log(\`feishu[\${accountId}]: secret entry for \${request.name} was not saved (\${reason})\`);
		if (reason === "QUESTION_ALREADY_TERMINAL" || reason === "QUESTION_NOT_FOUND") {
			const card = buildSecretEntryCard(request, "expired");
			if (entry) entry.state = "expired";
			return secretEntryCallbackResponse("info", "这个请求已经结束了。", card);
		}
		if (tokenKey) vSecretEntryInflightTokens.delete(tokenKey);
		return secretEntryCallbackResponse("error", "保存失败，请稍后重试。");
	}
	const card = buildSecretEntryCard(request, "saved", { operatorOpenId: submission.operatorOpenId });
	if (entry) {
		entry.state = "saved";
		entry.operatorOpenId = submission.operatorOpenId;
	}
	log(\`feishu[\${accountId}]: secret entry \${request.name} saved by \${submission.operatorOpenId ?? "unknown"}\`);
	const messageId = submission.messageId ?? entry?.messageId;
	if (messageId) vSecretEntryPatchCard({ cfg, accountId, messageId, card }).catch((error) => {
		log(\`feishu[\${accountId}]: secret entry card refresh failed: \${String(error?.message ?? error)}\`);
	});
	return secretEntryCallbackResponse("success", "已安全保存", card);
}
`;

const SITES = [
  {
    id: "deliver-secret-entry-card",
    find: `deliver: async (inputPayload, info) => {
\t\t\t\tconst prepared = await renderFeishuReplyPayload(inputPayload, {`,
    replace: `deliver: async (inputPayload, info) => {
\t\t\t\tif (readSecretEntryRequest(inputPayload)) {
\t\t\t\t\tconst vSecretEntryResult = await vSecretEntryDeliver({
\t\t\t\t\t\tcfg,
\t\t\t\t\t\tpayload: inputPayload,
\t\t\t\t\t\tto: sendTarget,
\t\t\t\t\t\treplyToMessageId: sendReplyToMessageId,
\t\t\t\t\t\treplyInThread: effectiveReplyInThread,
\t\t\t\t\t\tallowTopLevelReplyFallback,
\t\t\t\t\t\taccountId,
\t\t\t\t\t\tlog: params.runtime?.log
\t\t\t\t\t});
\t\t\t\t\tmarkVisibleReplySent();
\t\t\t\t\treturn createFeishuReplyDeliveryResult({
\t\t\t\t\t\tresults: [vSecretEntryResult],
\t\t\t\t\t\tvisibleReplySent: true,
\t\t\t\t\t\tcontent: "",
\t\t\t\t\t\tkind: "card"
\t\t\t\t\t});
\t\t\t\t}
\t\t\t\tconst prepared = await renderFeishuReplyPayload(inputPayload, {`,
  },
  {
    id: "card-action-secret-entry",
    find: `"card.action.trigger": async (data) => {
\t\t\ttry {
\t\t\t\tconst event = parseFeishuCardActionEventPayload(data);`,
    replace: `"card.action.trigger": async (data) => {
\t\t\tconst vSecretEntrySubmission = parseSecretEntrySubmission(data);
\t\t\tif (vSecretEntrySubmission) try {
\t\t\t\treturn await vSecretEntryHandleSubmission({
\t\t\t\t\tcfg,
\t\t\t\t\taccountId,
\t\t\t\t\tsubmission: vSecretEntrySubmission,
\t\t\t\t\tlog: runtime?.log ?? console.log
\t\t\t\t});
\t\t\t} catch (err) {
\t\t\t\terror(\`feishu[\${accountId}]: secret entry callback failed: \${String(err?.message ?? err)}\`);
\t\t\t\treturn secretEntryCallbackResponse("error", "保存失败，请稍后重试。");
\t\t\t}
\t\t\ttry {
\t\t\t\tconst event = parseFeishuCardActionEventPayload(data);`,
  },
];

const sha = (text) => createHash("sha256").update(text).digest("hex");

function countOccurrences(haystack, needle) {
  let count = 0;
  for (let index = haystack.indexOf(needle); index !== -1; index = haystack.indexOf(needle, index + needle.length)) count += 1;
  return count;
}

/** Patches the monitor bundle source. Throws unless every anchor matches exactly once. */
export function patchFeishuSecretEntryBundle(source, cardModule = inlineCardModule()) {
  if (source.includes(MARKER)) return { changed: false, source };
  if (source.includes("vSecretEntry")) throw new Error("bundle is partially patched with secret entry code; refusing to patch");
  for (const site of SITES) {
    const found = countOccurrences(source, site.find);
    if (found !== 1) throw new Error(`site ${site.id}: expected 1 match, found ${found}; refusing to patch`);
  }
  let patched = source;
  for (const site of SITES) patched = patched.replace(site.find, () => site.replace);
  const prelude = `// ${MARKER}\n${IMPORTS}${cardModule}${GLUE}// end ${MARKER}\n`;
  return { changed: true, source: prelude + patched };
}

function findBundle(pluginDir) {
  const distDir = join(pluginDir, "dist");
  const names = readdirSync(distDir).filter((name) => /^monitor\.account-[A-Za-z0-9_-]+\.js$/.test(name));
  if (names.length !== 1) throw new Error(`expected exactly one monitor.account-*.js in ${distDir}, found ${names.length}`);
  return join(distDir, names[0]);
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const outIndex = args.indexOf("--out");
  const out = outIndex === -1 ? undefined : args[outIndex + 1];
  const pluginDir = args.find((arg, index) => !arg.startsWith("--") && index !== outIndex + 1);
  if (!pluginDir || (outIndex !== -1 && !out)) {
    console.error("usage: patch-feishu-secret-entry.mjs [--check | --out <file>] <@openclaw/feishu dir>");
    process.exit(2);
  }
  try {
    const bundlePath = findBundle(pluginDir);
    const original = readFileSync(bundlePath, "utf8");
    const result = patchFeishuSecretEntryBundle(original);
    // --out writes the patched bytes elsewhere (release files); in-place keeps
    // a backup, which must not be left inside a fingerprinted VLab runtime.
    if (out) writeFileSync(out, result.source);
    else if (result.changed && !check) {
      copyFileSync(bundlePath, `${bundlePath}.bak-${MARKER}`);
      writeFileSync(bundlePath, result.source);
    }
    console.log(JSON.stringify({ ok: true, marker: MARKER, check, out, changed: result.changed, bundlePath, beforeSha: sha(original), afterSha: sha(result.source) }, null, 2));
  } catch (error) {
    console.error(JSON.stringify({ ok: false, reason: error.message }));
    process.exit(1);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
