#!/usr/bin/env node
// Streams the session progress card into the Feishu reply card, the same way
// for every agent runtime.
//
// Before: the Feishu monitor only saw a `progress_card` tool call as a tool
// status line ("🖼️ Progress Card"); its plan and note were dropped. Each
// runtime also reports that call differently (codex dynamic tool, native Codex
// plan, claude-cli `mcp__openclaw__progress_card`, V worker over Gateway RPC),
// so reading it from reply callbacks would mean one adapter per runtime.
//
// All of them end in the Gateway's `progressCard.put`. Like the secret-entry v2
// patch, this subscribes the Feishu monitor to that single Gateway lifecycle
// instead of to per-runtime callbacks:
//   core   `progress-card-*.js`: after a successful put, notify in-process
//          listeners registered on a global symbol, next to the existing
//          `progressCard.changed` broadcast.
//   feishu `monitor.account-*.js`: each reply dispatcher, from reply start to
//          cleanup, listens for its own session's card and renders it into the
//          streaming card body under the commentary. The tool status line for
//          progress-card calls is dropped, since the card itself is now shown.
//          The block is only shown while the reply streams; the final card
//          keeps just the answer.
//
// Shape-gated and idempotent: every anchor must match exactly once or nothing
// is written. The two files are independent at runtime (either one alone is a
// no-op), but ship them together.

import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const CORE_MARKER = "v-progress-card-changed-listeners-v1";
export const FEISHU_MARKER = "v-feishu-progress-stream-v2";
export const LISTENERS_SYMBOL = "openclaw.v.progressCardChangedListeners";

const HERE = dirname(fileURLToPath(import.meta.url));

/** The render module, with `export` stripped so it can live inside the bundle. */
export function inlineRenderModule(source = readFileSync(join(HERE, "feishu-progress-stream-render.mjs"), "utf8")) {
  const body = source.replace(/^export (const|function|async function) /gm, "$1 ");
  if (/^\s*(import|export)\s/m.test(body)) {
    throw new Error("feishu-progress-stream-render.mjs must stay free of imports/exports to be inlined");
  }
  return body;
}

export const CORE_PRELUDE = `// ${CORE_MARKER}
const vProgressCardChangedListeners = globalThis[Symbol.for("${LISTENERS_SYMBOL}")] ??= new Set();
function vProgressCardNotifyChanged(sessionKey, card) {
	for (const listener of vProgressCardChangedListeners) try {
		Promise.resolve(listener({ sessionKey, card })).catch(() => {});
	} catch {}
}
`;

const CORE_SITES = [
  {
    id: "prelude",
    find: `//#region src/session-cards/progress-card-store.ts\n`,
    replace: `${CORE_PRELUDE}//#region src/session-cards/progress-card-store.ts\n`,
  },
  {
    id: "notify-after-put",
    find: `				if (params.expectedRevision === void 0 || result.card === null) context.broadcast("progressCard.changed", {
					sessionKey,
					revision: result.card?.revision ?? null
				});`,
    replace: `				if (params.expectedRevision === void 0 || result.card === null) context.broadcast("progressCard.changed", {
					sessionKey,
					revision: result.card?.revision ?? null
				});
				if (params.expectedRevision === void 0 || result.card === null) vProgressCardNotifyChanged(sessionKey, result.card ?? null);`,
  },
];

// Module-scope glue in the Feishu monitor bundle. One global listener per
// module instance, attached while any dispatcher is listening, so a reloaded
// plugin does not leave a live duplicate behind.
export const FEISHU_GLUE = `
const V_PROGRESS_LISTENERS_KEY = Symbol.for("${LISTENERS_SYMBOL}");
const V_PROGRESS_MAX_HANDLERS_PER_SESSION = 4;
const vProgressHandlers = new Map();
let vProgressGlobalListener = null;
let vProgressDispatcherSeq = 0;
function vProgressSessionKey(sessionKey) {
	return typeof sessionKey === "string" ? sessionKey.trim().toLowerCase() : "";
}
function vProgressSubscribe(sessionKey, handler) {
	const key = vProgressSessionKey(sessionKey);
	if (!key) return () => {};
	let handlers = vProgressHandlers.get(key);
	if (!handlers) vProgressHandlers.set(key, handlers = new Set());
	handlers.add(handler);
	while (handlers.size > V_PROGRESS_MAX_HANDLERS_PER_SESSION) handlers.delete(handlers.values().next().value);
	if (!vProgressGlobalListener) {
		vProgressGlobalListener = (event) => {
			const matched = vProgressHandlers.get(vProgressSessionKey(event?.sessionKey));
			if (!matched) return;
			for (const each of [...matched]) try {
				each(event.card ?? null);
			} catch {}
		};
		(globalThis[V_PROGRESS_LISTENERS_KEY] ??= new Set()).add(vProgressGlobalListener);
	}
	return () => {
		handlers.delete(handler);
		if (handlers.size === 0 && vProgressHandlers.get(key) === handlers) vProgressHandlers.delete(key);
		if (vProgressHandlers.size === 0 && vProgressGlobalListener) {
			globalThis[V_PROGRESS_LISTENERS_KEY]?.delete(vProgressGlobalListener);
			vProgressGlobalListener = null;
		}
	};
}
`;

const FEISHU_SITES = [
  {
    id: "dispatcher-state",
    find: `\tlet statusLine = "";\n`,
    replace: `\tlet statusLine = "";\n\tlet vProgressText = "";\n`,
  },
  {
    // The checklist sits at the very bottom, under the commentary and the tool
    // status line, below a markdown rule. Omitted rule when it is the whole card.
    id: "combined-text-includes-progress",
    find: `\t\tif (statusLine) parts.push(parts.length > 0 ? \`\\n\\n\${statusLine}\` : statusLine);\n\t\treturn parts.join("");`,
    replace: `\t\tif (statusLine) parts.push(parts.length > 0 ? \`\\n\\n\${statusLine}\` : statusLine);\n\t\tif (vProgressText) parts.push(parts.length > 0 ? \`\\n\\n---\\n\\n\${vProgressText}\` : vProgressText);\n\t\treturn parts.join("");`,
  },
  {
    id: "reset-clears-progress",
    find: `\t\treasoningText = "";\n\t\tstatusLine = "";\n\t\tsnapshotBaseText = "";`,
    replace: `\t\treasoningText = "";\n\t\tstatusLine = "";\n\t\tvProgressText = "";\n\t\tsnapshotBaseText = "";`,
  },
  {
    // The block is working state, like the status line: the closed card keeps
    // only the answer.
    id: "final-card-drops-progress",
    find: `\t\t\t\tstatusLine = "";\n\t\t\t\tconst text = buildCombinedStreamText(finalizedReasoningText, finalizedAnswerText);`,
    replace: `\t\t\t\tstatusLine = "";\n\t\t\t\tvProgressText = "";\n\t\t\t\tconst text = buildCombinedStreamText(finalizedReasoningText, finalizedAnswerText);`,
  },
  {
    id: "dispatcher-listener",
    find: `\tconst sendChunkedTextReply = async (paramsLocal) => {`,
    replace: `\tlet vProgressUnsubscribe = null;
\tconst vProgressDispatcherId = ++vProgressDispatcherSeq;
\tconst vProgressAttach = () => {
\t\tif (vProgressUnsubscribe || !previewStreamingEnabled) return;
\t\tvProgressUnsubscribe = vProgressSubscribe(params.sessionKey, (card) => {
\t\t\tconst next = renderFeishuProgressMarkdown(card);
\t\t\tconst live = Boolean(streaming?.isActive() || streamingStartPromise);
\t\t\tparams.runtime.log?.(\`feishu[\${account.accountId}] progress-stream dispatcher=\${vProgressDispatcherId} rev=\${card?.revision ?? "cleared"} steps=\${card?.steps?.length ?? 0} live=\${live} idle=\${idleRequestedForReply} changed=\${next !== vProgressText}\`);
\t\t\tif (next === vProgressText) return;
\t\t\tvProgressText = next;
\t\t\t// Never open a fresh card for progress once this reply has gone idle.
\t\t\tif (!live && (!next || idleRequestedForReply)) return;
\t\t\tstartStreaming();
\t\t\tflushStreamingCardUpdate(buildCombinedStreamText(reasoningText, streamText));
\t\t});
\t};
\tconst vProgressDetach = () => {
\t\tvProgressUnsubscribe?.();
\t\tvProgressUnsubscribe = null;
\t};
\tconst sendChunkedTextReply = async (paramsLocal) => {`,
  },
  {
    id: "attach-on-reply-start",
    find: `\t\t\tif (previewStreamingEnabled && renderMode === "card") startStreaming();\n\t\t\tawait Promise.resolve(typingCallbacks?.onReplyStart?.());`,
    replace: `\t\t\tvProgressAttach();\n\t\t\tif (previewStreamingEnabled && renderMode === "card") startStreaming();\n\t\t\tawait Promise.resolve(typingCallbacks?.onReplyStart?.());`,
  },
  {
    id: "detach-on-cleanup",
    find: `\t\tonCleanup: () => {\n\t\t\ttypingCallbacks?.onCleanup?.();\n\t\t}`,
    replace: `\t\tonCleanup: () => {\n\t\t\tvProgressDetach();\n\t\t\ttypingCallbacks?.onCleanup?.();\n\t\t}`,
  },
  {
    id: "no-status-line-for-progress-card",
    find: `\t\t\tonToolStart: previewStreamingEnabled ? (payload) => {\n`,
    replace: `\t\t\tonToolStart: previewStreamingEnabled ? (payload) => {\n\t\t\t\tif (isFeishuProgressCardToolName(payload.name)) return false;\n`,
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

export function patchProgressCardCore(source) {
  return patchSites(source, CORE_SITES, CORE_MARKER, "core progress-card");
}

export function patchFeishuProgressStream(source, renderModule = inlineRenderModule()) {
  const result = patchSites(source, FEISHU_SITES, FEISHU_MARKER, "feishu monitor");
  if (!result.changed) return result;
  return { changed: true, source: `// ${FEISHU_MARKER}\n${renderModule}${FEISHU_GLUE}${result.source}` };
}

function findOne(dir, pattern, label) {
  const matches = readdirSync(dir).filter((name) => pattern.test(name));
  if (matches.length !== 1) throw new Error(`${label}: expected exactly one file in ${dir}, found ${matches.length}`);
  return join(dir, matches[0]);
}

function main() {
  const args = process.argv.slice(2);
  const check = args.includes("--check");
  const outIndex = args.indexOf("--out-dir");
  const outDir = outIndex === -1 ? undefined : args[outIndex + 1];
  const positional = args.filter((arg, index) => !arg.startsWith("--") && index !== outIndex + 1);
  const [coreDist, feishuDir] = positional;
  if (!coreDist || !feishuDir || (outIndex !== -1 && !outDir)) {
    console.error("usage: patch-feishu-progress-stream.mjs [--check | --out-dir <dir>] <openclaw dist> <@openclaw/feishu dir>");
    process.exit(2);
  }
  try {
    const corePath = findOne(coreDist, /^progress-card-[A-Za-z0-9_-]+\.js$/, "core progress-card");
    const coreOriginal = readFileSync(corePath, "utf8");
    const feishuPath = findOne(join(feishuDir, "dist"), /^monitor\.account-[A-Za-z0-9_-]+\.js$/, "feishu monitor");
    const feishuOriginal = readFileSync(feishuPath, "utf8");
    // Plan both before writing either.
    const plans = [
      { id: "core-progress-card", path: corePath, original: coreOriginal, ...patchProgressCardCore(coreOriginal) },
      { id: "feishu-monitor", path: feishuPath, original: feishuOriginal, ...patchFeishuProgressStream(feishuOriginal) },
    ];
    if (outDir) mkdirSync(outDir, { recursive: true });
    const report = [];
    for (const plan of plans) {
      if (outDir) writeFileSync(join(outDir, basename(plan.path)), plan.source);
      else if (plan.changed && !check) {
        copyFileSync(plan.path, `${plan.path}.bak-${FEISHU_MARKER}-${Date.now()}`);
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
