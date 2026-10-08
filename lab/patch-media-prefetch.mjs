// Media understanding prefetch (首字): start a message's audio/video CLI analysis when the
// message is dispatched, before it waits for its session's reply admission ticket.
//
// Why: dispatchReplyFromConfigWithQueuePolicy reserves a per-session FIFO admission ticket,
// get-reply runs media understanding (reply.apply_media_understanding) only after the ticket
// wait, and runReplyAgent releases the ticket. So three videos sent together into one session
// are analysed one after another: V 2026-10-08 11:15, run start 36.6 / 79.4 / 113.5 s; private
// VLab candidate with a 30 s fake analysis CLI, worker-command-enter 30.6 / 60.9 / 91.2 s.
//
// How (two files, answer content unchanged by construction):
//   dispatch-from-config  at dispatch, for a message with local audio/video media and a CLI
//                         media model configured, run applyMediaUnderstanding on a shallow copy
//                         of its context inside an AsyncLocalStorage "prefetch" scope. The copy
//                         is thrown away; only the CLI runs it starts are kept. When the
//                         dispatch finishes, prefetched runs nobody used are dropped.
//   runner.entries        runCliEntry: once the argv is resolved, a prefetch scope starts the
//                         very same runCliEntry call (bypass scope, concurrency-limited) and
//                         caches its promise under a key of capability + argv (temp dirs
//                         normalised) + timeout + maxChars + file size/mtime + tools.media.
//                         The reply lane's own call looks the key up and awaits the cached
//                         result instead of running the CLI again; a failed prefetch falls back
//                         to running in the lane. Provider (API) entries never run in a
//                         prefetch scope, so nothing is paid for twice.
// The lane still runs every step of applyMediaUnderstanding itself (selection, decisions,
// merging into the context): only the CLI process result is reused, for the identical argv.
//
// OPENCLAW_MEDIA_PREFETCH=0 switches it off; OPENCLAW_MEDIA_PREFETCH_CONCURRENCY caps parallel
// prefetched CLI runs (default 3).

import assert from 'node:assert/strict';

export const MEDIA_PREFETCH_MARKER = 'media-prefetch-v1';
export const DEFAULT_CONCURRENCY = 3;
export const TTL_MS = 600000;
export const LANE_WAIT_MS = 3000;

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

// identical in both chunks: whichever runs first creates the shared state
const SHARED_STATE = `//#region ${MEDIA_PREFETCH_MARKER} shared state
function mediaCliPrefetchState() {
	const stateKey = Symbol.for("openclaw.mediaCliPrefetch.v1");
	let state = globalThis[stateKey];
	if (!state) {
		const { AsyncLocalStorage } = process.getBuiltinModule("node:async_hooks");
		state = {
			als: new AsyncLocalStorage(),
			entries: /* @__PURE__ */ new Map(),
			pending: /* @__PURE__ */ new Map(),
			active: 0,
			queue: [],
			log: void 0
		};
		globalThis[stateKey] = state;
	}
	return state;
}
/** Media of an inbound context: portable media facts (what media understanding reads) plus legacy fields. */
function mediaCliPrefetchMedia(ctx) {
	const facts = Array.isArray(ctx?.media) ? ctx.media : [];
	const paths = [...facts.map((fact) => fact?.path ?? fact?.url), ...Array.isArray(ctx?.MediaPaths) ? ctx.MediaPaths : [], ctx?.MediaPath].filter((p) => typeof p === "string" && p !== "");
	const types = [...facts.flatMap((fact) => [fact?.contentType, fact?.kind]), ...Array.isArray(ctx?.MediaTypes) ? ctx.MediaTypes : [], ctx?.MediaType].filter((t) => typeof t === "string" && t !== "");
	return { paths: [...new Set(paths)].sort(), types };
}
function mediaCliPrefetchMessageKey(ctx) {
	return JSON.stringify([ctx?.SessionKey ?? "", ctx?.MessageSid ?? "", mediaCliPrefetchMedia(ctx).paths]);
}
//#endregion ${MEDIA_PREFETCH_MARKER} shared state
`;

// ---- runner.entries ----
const RUNNER_HELPERS = `${SHARED_STATE}//#region ${MEDIA_PREFETCH_MARKER} runner
const MEDIA_CLI_PREFETCH_TTL_MS = ${TTL_MS};
const MEDIA_CLI_PREFETCH_LANE_WAIT_MS = ${LANE_WAIT_MS};
function mediaCliPrefetchEnabled(env = process.env) {
	return env.OPENCLAW_MEDIA_PREFETCH !== "0";
}
function mediaCliPrefetchConcurrency(env = process.env) {
	const value = Number(env.OPENCLAW_MEDIA_PREFETCH_CONCURRENCY);
	return Number.isFinite(value) && value >= 1 ? Math.floor(value) : ${DEFAULT_CONCURRENCY};
}
/** Runs at most mediaCliPrefetchConcurrency() prefetched CLI runs at once, the rest wait in order. */
function mediaCliPrefetchLimit(state, run) {
	return new Promise((resolve, reject) => {
		const start = () => {
			state.active += 1;
			Promise.resolve().then(run).then(resolve, reject).finally(() => {
				state.active -= 1;
				state.queue.shift()?.();
			});
		};
		if (state.active < mediaCliPrefetchConcurrency()) start();
		else state.queue.push(start);
	});
}
/** Same CLI, same arguments (temp output dir normalised), same limits, same file bytes, same media config. */
function mediaCliPrefetchKey(params) {
	const argv = params.argv.map((part) => params.outputDir ? String(part).split(params.outputDir).join("{{OutputDir}}") : String(part));
	return process.getBuiltinModule("node:crypto").createHash("sha256").update(JSON.stringify({
		capability: params.capability,
		argv,
		timeoutMs: params.timeoutMs,
		maxChars: params.maxChars,
		size: params.size,
		mtimeMs: params.mtimeMs,
		media: params.mediaConfig ?? null
	})).digest("hex");
}
function mediaCliPrefetchPurge(state, now = Date.now()) {
	for (const [key, entry] of state.entries) if (now - entry.at > MEDIA_CLI_PREFETCH_TTL_MS) state.entries.delete(key);
}
function mediaCliPrefetchLog(state, fields) {
	state.log?.info(\`[media-prefetch.1] \${JSON.stringify(fields)}\`);
}
/**
* runCliEntry, after the argv is resolved. Prefetch scope: start (or join) the identical call and
* return its result. Reply lane: use a prefetched result for this exact call if there is one,
* waiting briefly for a prefetch of the same message that has not registered yet. undefined: run.
*/
async function mediaCliPrefetchLookup(params) {
	const state = mediaCliPrefetchState();
	const store = state.als.getStore();
	if (store?.bypass || !mediaCliPrefetchEnabled()) return { handled: false };
	let key;
	try {
		const stat = await fs$1.stat(params.mediaPath);
		key = mediaCliPrefetchKey({
			capability: params.capability,
			argv: params.argv,
			outputDir: params.outputDir,
			timeoutMs: params.timeoutMs,
			maxChars: params.maxChars,
			size: stat.size,
			mtimeMs: stat.mtimeMs,
			mediaConfig: params.cfg?.tools?.media
		});
	} catch {
		key = void 0;
	}
	if (store?.prefetch) {
		if (!key || params.capability === "image") throw new Error("media prefetch: entry is not prefetched");
		mediaCliPrefetchPurge(state);
		let entry = state.entries.get(key);
		if (!entry) {
			entry = {
				at: Date.now(),
				promise: mediaCliPrefetchLimit(state, () => state.als.run({ bypass: true }, () => runCliEntry(params.entryParams)))
			};
			entry.promise.catch(() => {});
			state.entries.set(key, entry);
			store.keys?.add(key);
			mediaCliPrefetchLog(state, { phase: "started", capability: params.capability });
		}
		store.onRegistered?.(params.capability);
		return { handled: true, value: await entry.promise };
	}
	if (!key) return { handled: false };
	let entry = state.entries.get(key);
	if (!entry) {
		const pending = state.pending.get(mediaCliPrefetchMessageKey(params.ctx));
		const registered = pending?.registered?.get(params.capability);
		if (registered) {
			await Promise.race([registered, new Promise((resolve) => setTimeout(resolve, MEDIA_CLI_PREFETCH_LANE_WAIT_MS).unref?.())]);
			entry = state.entries.get(key);
		}
	}
	if (!entry) return { handled: false };
	state.entries.delete(key);
	const lookupAt = Date.now();
	try {
		const value = await entry.promise;
		mediaCliPrefetchLog(state, { phase: "hit", capability: params.capability, aheadMs: lookupAt - entry.at, waitedMs: Date.now() - lookupAt });
		return { handled: true, value };
	} catch (error) {
		mediaCliPrefetchLog(state, { phase: "fallback", capability: params.capability, error: error instanceof Error ? error.name : typeof error });
		return { handled: false };
	}
}
//#endregion ${MEDIA_PREFETCH_MARKER} runner
`;

const CLI_ENTRY_BEFORE = 'async function runCliEntry(params) {\n';
const CLI_ENTRY_AFTER = `${RUNNER_HELPERS}${CLI_ENTRY_BEFORE}`;

const CLI_ARGV_BEFORE = '\t\tconst argv = [command, ...args].map((part, index) => index === 0 ? part : applyTemplate(part, templCtx));\n';
const CLI_ARGV_AFTER = `${CLI_ARGV_BEFORE}\t\t// ${MEDIA_PREFETCH_MARKER}: a prefetched run of this exact call, or start one in a prefetch scope
\t\tconst mediaPrefetch = await mediaCliPrefetchLookup({
\t\t\tentryParams: params,
\t\t\tctx,
\t\t\tcfg,
\t\t\tcapability,
\t\t\targv,
\t\t\toutputDir,
\t\t\tmediaPath,
\t\t\ttimeoutMs,
\t\t\tmaxChars
\t\t});
\t\tif (mediaPrefetch.handled) return mediaPrefetch.value;
`;

const PROVIDER_ENTRY_BEFORE = 'async function runProviderEntry(params) {\n';
const PROVIDER_ENTRY_AFTER = `${PROVIDER_ENTRY_BEFORE}\t// ${MEDIA_PREFETCH_MARKER}: provider (API) entries run in the reply lane only, never twice
\tif (mediaCliPrefetchState().als.getStore()?.prefetch) throw new Error("media prefetch: provider entries run in the reply lane only");
`;

export function patchRunnerEntries(source) {
  assert(!source.includes(MEDIA_PREFETCH_MARKER), 'runner.entries is already patched');
  let out = replaceExactlyOnce(source, CLI_ENTRY_BEFORE, CLI_ENTRY_AFTER, 'runCliEntry declaration');
  out = replaceExactlyOnce(out, CLI_ARGV_BEFORE, CLI_ARGV_AFTER, 'runCliEntry argv');
  out = replaceExactlyOnce(out, PROVIDER_ENTRY_BEFORE, PROVIDER_ENTRY_AFTER, 'runProviderEntry declaration');
  return out;
}

// ---- dispatch-from-config ----
const DISPATCH_IMPORT_BEFORE = 'import { c as resolveAgentConfig, m as resolveAgentWorkspaceDir } from "./agent-scope-config-CUiGBd59.js";\n';
const DISPATCH_IMPORT_AFTER = 'import { c as resolveAgentConfig, m as resolveAgentWorkspaceDir, u as resolveAgentDir } from "./agent-scope-config-CUiGBd59.js";\n';

const DISPATCH_HELPERS = `${SHARED_STATE}//#region ${MEDIA_PREFETCH_MARKER} dispatch
function mediaPrefetchHasCliEntry(media) {
	const isCli = (entry, capability) => entry?.type === "cli" && (capability !== void 0 || (Array.isArray(entry.capabilities) && entry.capabilities.some((c) => c === "audio" || c === "video")));
	return (Array.isArray(media?.models) ? media.models : []).some((entry) => isCli(entry)) || ["audio", "video"].some((capability) => (Array.isArray(media?.[capability]?.models) ? media[capability].models : []).some((entry) => isCli(entry, capability)));
}
/**
* Start this message's audio/video CLI analysis now instead of after the session's admission
* ticket. Fire and forget: the reply lane uses the result if it is the identical CLI call and
* otherwise runs as before. Returns a handle that drops unused results when the dispatch ends.
*/
function startMediaUnderstandingPrefetch(params) {
	// OPENCLAW_MEDIA_PREFETCH_DEBUG=1 logs why a message was not prefetched
	const skip = (reason) => {
		if (process.env.OPENCLAW_MEDIA_PREFETCH_DEBUG === "1") {
			const state = mediaCliPrefetchState();
			state.log ??= createSubsystemLogger("auto-reply/media-prefetch");
			state.log.info(\`[media-prefetch.1] \${JSON.stringify({ phase: "skipped", reason })}\`);
		}
	};
	try {
		if (process.env.OPENCLAW_MEDIA_PREFETCH === "0") return skip("disabled");
		const raw = params?.ctx;
		const cfg = params?.cfg;
		const media = cfg?.tools?.media;
		if (!raw || !cfg) return skip("no-context");
		if (!mediaPrefetchHasCliEntry(media)) return skip("no-cli-media-model");
		// the context get-reply analyses is the finalized one (portable media -> MediaPaths); finalize a copy
		const copy = {
			...raw,
			...Array.isArray(raw.media) ? { media: raw.media.map((item) => ({ ...item })) } : {},
			...Array.isArray(raw.MediaPaths) ? { MediaPaths: [...raw.MediaPaths] } : {},
			...Array.isArray(raw.MediaTypes) ? { MediaTypes: [...raw.MediaTypes] } : {},
			...Array.isArray(raw.MediaUrls) ? { MediaUrls: [...raw.MediaUrls] } : {}
		};
		const ctx = isFinalizedInboundContext(copy) ? copy : finalizeInboundContext(copy);
		const { paths, types } = mediaCliPrefetchMedia(ctx);
		if (paths.length === 0) return skip("no-media-paths");
		if (normalizeOptionalString(ctx.MediaRemoteHost)) return skip("remote-media");
		if (!types.some((type) => /^(audio|video)(\\/|$)/iu.test(type))) return skip("not-audio-or-video");
		// an audio transcript echo would send a message from the throwaway context
		if (media?.audio?.echoTranscript === true) return skip("transcript-echo");
		const state = mediaCliPrefetchState();
		state.log ??= createSubsystemLogger("auto-reply/media-prefetch");
		const messageKey = mediaCliPrefetchMessageKey(ctx);
		if (state.pending.has(messageKey)) return skip("already-prefetching");
		const keys = /* @__PURE__ */ new Set();
		const resolvers = /* @__PURE__ */ new Map();
		const registered = /* @__PURE__ */ new Map();
		for (const capability of ["audio", "video"]) registered.set(capability, new Promise((resolve) => resolvers.set(capability, resolve)));
		const pending = { registered, at: Date.now() };
		state.pending.set(messageKey, pending);
		const releaseRegistrations = () => {
			for (const resolve of resolvers.values()) resolve();
		};
		const agentId = resolveSessionAgentId({
			sessionKey: ctx.SessionKey,
			config: cfg,
			fallbackAgentId: ctx.AgentId
		});
		const snapshot = ctx;
		state.als.run({
			prefetch: true,
			keys,
			onRegistered: (capability) => resolvers.get(capability)?.()
		}, () => {
			(async () => {
				const { applyMediaUnderstanding } = await import("./media-understanding/apply.runtime.js");
				await applyMediaUnderstanding({
					ctx: snapshot,
					cfg,
					agentId,
					agentDir: resolveAgentDir(cfg, agentId),
					workspaceDir: resolveAgentWorkspaceDir(cfg, agentId),
					activeModel: void 0,
					selfServeLocalPaths: false
				});
			})().catch(() => {}).finally(releaseRegistrations);
		});
		return { dropUnconsumed() {
			releaseRegistrations();
			if (state.pending.get(messageKey) === pending) state.pending.delete(messageKey);
			for (const key of keys) if (state.entries.delete(key)) state.log?.info(\`[media-prefetch.1] \${JSON.stringify({ phase: "unused" })}\`);
		} };
	} catch (error) {
		return skip(\`error:\${error instanceof Error ? error.name : typeof error}\`);
	}
}
//#endregion ${MEDIA_PREFETCH_MARKER} dispatch
`;

const DISPATCH_ENTRY_BEFORE = 'async function dispatchReplyFromConfig(params) {\n';
const DISPATCH_ENTRY_AFTER = `${DISPATCH_HELPERS}${DISPATCH_ENTRY_BEFORE}`;

const DISPATCH_TICKET_BEFORE = '\tconst ticket = reserveReplyAdmissionTicket([params.ctx.SessionKey, params.ctx.CommandTargetSessionKey]);\n';
const DISPATCH_TICKET_AFTER = `\t// ${MEDIA_PREFETCH_MARKER}: before the admission ticket wait, so media of queued messages is analysed in parallel
\tconst mediaPrefetch = startMediaUnderstandingPrefetch(params);
${DISPATCH_TICKET_BEFORE}`;

const DISPATCH_RELEASE_BEFORE = '\t} finally {\n\t\tticket?.release();\n\t}\n}\nasync function dispatchReplyFromConfigInner(';
const DISPATCH_RELEASE_AFTER = `\t} finally {\n\t\tticket?.release();\n\t\tmediaPrefetch?.dropUnconsumed();\n\t}\n}\nasync function dispatchReplyFromConfigInner(`;

export function patchDispatchFromConfig(source) {
  assert(!source.includes(MEDIA_PREFETCH_MARKER), 'dispatch-from-config is already patched');
  let out = replaceExactlyOnce(source, DISPATCH_IMPORT_BEFORE, DISPATCH_IMPORT_AFTER, 'agent-scope-config import');
  out = replaceExactlyOnce(out, DISPATCH_ENTRY_BEFORE, DISPATCH_ENTRY_AFTER, 'dispatchReplyFromConfig declaration');
  out = replaceExactlyOnce(out, DISPATCH_TICKET_BEFORE, DISPATCH_TICKET_AFTER, 'admission ticket reservation');
  out = replaceExactlyOnce(out, DISPATCH_RELEASE_BEFORE, DISPATCH_RELEASE_AFTER, 'admission ticket release');
  return out;
}

/** The injected regions, for tests that evaluate them against fakes. */
export function extractRegion(source, name) {
  const start = source.indexOf(`//#region ${MEDIA_PREFETCH_MARKER} ${name}`);
  const endMarker = `//#endregion ${MEDIA_PREFETCH_MARKER} ${name}`;
  const end = source.indexOf(endMarker);
  assert(start >= 0 && end > start, `${name} region not found`);
  return source.slice(start, end + endMarker.length);
}
