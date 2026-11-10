import { F as resolveTimerTimeoutMs, n as MAX_TIMER_TIMEOUT_MS } from "../../number-coercion-CLj0HTDM.js";
import { i as resolveGlobalSingleton } from "../../global-singleton-Dc_stLtU.js";
import { l as toErrorObject, s as readErrorName } from "../../error-coercion-CwcmpTBO.js";
import { o as normalizeLowercaseStringOrEmpty } from "../../string-coerce-CIXf7egm.js";
import { b as uniqueValues, d as normalizeStringEntries, f as normalizeStringEntriesLower, y as uniqueStrings } from "../../string-normalization-DiSb4JeN.js";
import { r as truncateUtf16Safe } from "../../utf16-slice-D_ngcYKd.js";
import { c as resolveUserPath } from "../../home-dir-BPhrG-aM.js";
import { p as redactSensitiveText } from "../../redact-Df68iObN.js";
import { r as isPathInside } from "../../path-guards-Cp-mGr3-.js";
import { s as sleepWithAbort } from "../../src-BQ327IOM.js";
import { t as sleep } from "../../sleep-D7nua6TP.js";
import { t as formatErrorMessage } from "../../errors-u9zSVTak.js";
import { t as createSubsystemLogger } from "../../subsystem-bfHYmnCE.js";
import { u as runSqliteImmediateTransactionSync } from "../../node-sqlite-CL-d6drd.js";
import { n as resolveRuntimeWorkerUrl, t as resolveRuntimeWorkerArgv } from "../../runtime-worker-url-DJUUt97T.js";
import { t as retryAsync } from "../../retry-DIUON3ys.js";
import { c as resolveAgentConfig, m as resolveAgentWorkspaceDir, u as resolveAgentDir } from "../../agent-scope-config-CUiGBd59.js";
import { n as normalizeAgentId } from "../../agent-id-CeT3w4ap.js";
import { o as resolveSessionStorePathCore } from "../../paths-DDTeIhCT.js";
import { a as MEMORY_INDEX_META_TABLE, g as MEMORY_INDEX_CHUNK_RECALL_METADATA_TABLE, l as MEMORY_INDEX_FTS_TABLE, r as MEMORY_EMBEDDING_CACHE_TABLE, s as MEMORY_INDEX_VECTOR_TABLE, t as ensureMemoryIndexSchema, u as MEMORY_INDEX_PATHS_FTS_TABLE, y as MEMORY_INDEX_CHUNK_PROVENANCE_TABLE } from "../../memory-schema-BSs9MQgq.js";
import { k as readTranscriptStatsBatchReadOnlySync } from "../../session-accessor.sqlite-transcript-store-DV0WFe1a.js";
import { D as listSessionTranscriptArchivesReadOnly } from "../../session-accessor.sqlite-entry-BlklNPKQ.js";
import { r as onInternalSessionTranscriptUpdate } from "../../transcript-events-BMaG3A_w.js";
import { t as chunkItems } from "../../chunk-items-2QWieLm-.js";
import { t as loadSqliteVecExtension } from "../../sqlite-vec-Dt5GyplB.js";
import "../../sqlite-runtime-BYNq5dB7.js";
import { n as isFileMissingError } from "../../fs-utils-BgbE2uPY.js";
import { r as classifyMemoryMultimodalPath } from "../../multimodal-80SKCWO3.js";
import { t as resolveMemorySearchConfig } from "../../memory-search-BRniBajP.js";
import { r as listRegisteredMemoryEmbeddingProviderAdapters } from "../../memory-embedding-provider-runtime-C0Xv4ysG.js";
import "../../memory-core-host-engine-foundation-CaZngFdy.js";
import { r as vectorToBlob, t as isVectorKnnRow } from "../../manager-search-knn-NiSMMJUM.js";
import { t as vectorKnnProcessEntrypoint } from "../../manager-search-knn-entrypoint-D4BNu0VT.js";
import { _ as hasNonTextEmbeddingParts, a as cosineSimilarity, c as listMemoryFiles, f as parseEmbedding, i as chunkMarkdown, l as matchesExtraMemoryPathEntry, m as runMemoryHostTasksWithConcurrency, n as buildFileEntry, p as remapChunkLines, r as buildMultimodalChunkForIndexing, u as normalizeExtraMemoryPathEntries, v as estimateStructuredEmbeddingInputBytes, y as estimateUtf8Bytes } from "../../internal-CKQ1RDPZ.js";
import { n as retryTransientMemoryRead, r as hashText } from "../../read-retry-BdeoTeOo.js";
import { i as stripMemoryAnnotationCarriers, n as extractProjectKeysFromCuratedEntry, t as INVALID_PROJECT_ANNOTATION_KEY } from "../../curated-annotations-mTWgerpx.js";
import { n as readMemoryFile } from "../../read-file-CpjBk08Z.js";
import { a as readCuratedProjectMemoryCandidates, i as readCuratedMemoryTriggerCandidates, o as readMemoryRecallMetadata } from "../../engine-storage-C1hCjs4v.js";
import { t as extractKeywords } from "../../query-expansion-_C4ftD-k.js";
import "../../error-runtime-BmBsU1OI.js";
import "../../runtime-env-BIoctfDh.js";
import { t as expectDefined } from "../../expect-runtime-CJBt0Gq2.js";
import "../../number-runtime-Cy4drVnh.js";
import "../../string-coerce-runtime-GQa0ehRA.js";
import "../../retry-runtime-BdpQ8Am6.js";
import "../../routing-Ca5Ulw93.js";
import "../../session-store-paths-C-LIEgfP.js";
import "../../file-access-runtime-BBbjPFLE.js";
import "../../text-chunking-ACBUEghg.js";
import "../../agent-runtime-zPZ6yBNz.js";
import "../../security-runtime-D-LGLycn.js";
import "../../process-runtime-DeiS4nS9.js";
import "../../memory-core-host-embedding-registry-3UsvXmjW.js";
import { j as isEmbeddingBatchUnavailableError, u as enforceEmbeddingMaxInputTokens } from "../../memory-core-host-engine-embeddings-DjJyd3gF.js";
import { d as sessionPathForFile, f as sessionPathForSessionIdentity, m as listSessionTranscriptCorpusEntriesForAgent, p as statSessionEntrySync, r as buildSessionEntry } from "../../memory-core-host-engine-sessions-CAnvQ_5o.js";
import "../../memory-core-host-engine-storage-BNZxTLNx.js";
import { t as runInMemoryBackgroundContext } from "../../background-context-tbmmWTrm.js";
import { l as withMemoryWorkspaceLock } from "../../dreaming-dreams-file-DkDa0rC_.js";
import { i as listMemorySessionTombstones, n as hasMemorySessionTombstone } from "../../memory-entry-origins-D5UGT_E2.js";
import { n as textSimilarity, r as tokenize, t as jaccardSimilarity } from "../../tokenize-CfwNmyGX.js";
import { n as readSessionResetRecallCutoffMetadata } from "../../session-reset-recall-metadata-_gATHFyh.js";
import { _ as waitForMemoryReindexLock, a as resolveMemorySessionSyncPlan, c as closeMemoryDatabase, d as openMemoryDatabaseReadOnlyAtPath, f as publishMemoryDatabaseTables, g as tableExists, i as resolveMemorySessionStartupState, l as isMemoryDatabaseReadOnly, m as removeMemoryDatabaseFiles, n as logMemoryVectorDegradedWrite, o as MemoryIndexRevisionConflictError, p as readMemoryDatabaseRevision, r as isMemorySessionIndexable, s as cleanupAgedMemoryReindexTempFiles, u as openMemoryDatabaseAtPath, v as acquireMemoryIndexReadGeneration, y as withMemoryIndexPublishGeneration } from "../../manager-vector-warning-BHH19jrh.js";
import { a as resolveEmbeddingProviderIndexIdentity, i as resolveEmbeddingProviderFallbackRemote, n as resolveEmbeddingProviderAdapterTransport, r as resolveEmbeddingProviderFallbackModel, t as createEmbeddingProvider } from "../../embeddings-BLWA-UAO.js";
import { t as resolveMemoryPathClassification } from "../../memory-path-provenance-f7O_6cBf.js";
import fs from "node:fs";
import path from "node:path";
import { AsyncLocalStorage } from "node:async_hooks";
import fs$1 from "node:fs/promises";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import chokidar from "chokidar";
//#region extensions/memory-core/src/memory/manager-async-state.ts
function startAsyncSearchSync(params) {
	if (!params.enabled || !params.dirty && !params.sessionsDirty) return;
	try {
		return params.sync({ reason: "search" }).catch((err) => {
			params.onError(err);
		});
	} catch (err) {
		params.onError(err);
	}
}
async function awaitPendingManagerWork(params) {
	if (params.pendingSync) try {
		await params.pendingSync;
	} catch (err) {
		params.onError?.(err);
	}
	if (params.pendingProviderInit) try {
		await params.pendingProviderInit;
	} catch (err) {
		params.onError?.(err);
	}
}
function resetMemoryBatchFailureState(state) {
	return {
		...state,
		count: 0,
		lastError: void 0,
		lastProvider: void 0
	};
}
function recordMemoryBatchFailure(state, params) {
	if (!state.enabled) return state;
	const increment = params.forceDisable ? 2 : params.attempts;
	const count = state.count + increment;
	return {
		enabled: !(params.forceDisable || count >= 2),
		count,
		lastError: params.message,
		lastProvider: params.provider
	};
}
//#endregion
//#region extensions/memory-core/src/memory/manager-database-context.ts
var MemoryIndexDatabase = class {
	constructor(db) {
		this.db = db;
		this.vector = {
			enabled: false,
			available: null
		};
		this.fts = {
			enabled: false,
			available: false
		};
		this.vectorReady = null;
		this.lastMetaSerialized = null;
		this.vectorDegradedWriteWarningShown = false;
		this.closed = false;
	}
};
const reindexDatabase = new AsyncLocalStorage();
var MemoryManagerDatabaseContext = class {
	get database() {
		const context = reindexDatabase.getStore();
		const shadow = context?.manager === this ? context.database : void 0;
		if (shadow?.closed) throw new Error("Memory reindex database context is closed");
		return shadow ?? this.publishedDatabase;
	}
	get db() {
		return this.database.db;
	}
	get vector() {
		return this.database.vector;
	}
	get fts() {
		return this.database.fts;
	}
	withPublishedDatabase(run) {
		return reindexDatabase.exit(run);
	}
	withReindexDatabase(database, run) {
		return reindexDatabase.run({
			manager: this,
			database
		}, run);
	}
};
//#endregion
//#region extensions/memory-core/src/memory/manager-embedding-cache.ts
function loadMemoryEmbeddingCache(params) {
	if (!params.enabled || params.providerIdentities.length === 0 || params.hashes.length === 0) return /* @__PURE__ */ new Map();
	const unique = [];
	const seen = /* @__PURE__ */ new Set();
	for (const hash of params.hashes) {
		if (!hash || seen.has(hash)) continue;
		seen.add(hash);
		unique.push(hash);
	}
	if (unique.length === 0) return /* @__PURE__ */ new Map();
	const tableName = params.tableName ?? "memory_embedding_cache";
	const out = /* @__PURE__ */ new Map();
	const batchSize = 400;
	for (const identity of params.providerIdentities) {
		const baseParams = [
			identity.provider,
			identity.model,
			identity.providerKey
		];
		for (let start = 0; start < unique.length; start += batchSize) {
			const batch = unique.slice(start, start + batchSize);
			const placeholders = batch.map(() => "?").join(", ");
			const rows = params.db.prepare(`SELECT hash, embedding FROM ${tableName}\n WHERE provider = ? AND model = ? AND provider_key = ? AND hash IN (${placeholders})`).all(...baseParams, ...batch);
			for (const row of rows) if (!out.has(row.hash)) out.set(row.hash, parseEmbedding(row.embedding));
		}
	}
	return out;
}
function upsertMemoryEmbeddingCache(params) {
	const provider = params.provider;
	if (!params.enabled || !provider || !params.providerKey || params.entries.length === 0) return;
	const tableName = params.tableName ?? "memory_embedding_cache";
	const now = params.now ?? Date.now();
	const stmt = params.db.prepare(`INSERT INTO ${tableName} (provider, model, provider_key, hash, embedding, dims, updated_at)\n VALUES (?, ?, ?, ?, ?, ?, ?)\n ON CONFLICT(provider, model, provider_key, hash) DO UPDATE SET\n   embedding=excluded.embedding,\n   dims=excluded.dims,\n   updated_at=excluded.updated_at`);
	for (const entry of params.entries) {
		const embedding = entry.embedding ?? [];
		stmt.run(provider.id, provider.model, params.providerKey, entry.hash, JSON.stringify(embedding), embedding.length, now);
	}
}
function collectMemoryCachedEmbeddings(params) {
	const embeddings = Array.from({ length: params.chunks.length }, () => []);
	const missing = [];
	for (let index = 0; index < params.chunks.length; index += 1) {
		const chunk = params.chunks[index];
		const hit = chunk?.hash ? params.cached.get(chunk.hash) : void 0;
		if (hit && hit.length > 0) embeddings[index] = hit;
		else if (chunk) missing.push({
			index,
			chunk
		});
	}
	return {
		embeddings,
		missing
	};
}
//#endregion
//#region extensions/memory-core/src/memory/manager-embedding-errors.ts
const MEMORY_EMBEDDING_OPERATION_ERROR_CODE = "MEMORY_EMBEDDING_OPERATION_FAILED";
function createMemoryEmbeddingOperationError(params) {
	const message = formatErrorMessage(params.cause);
	const error = new Error(message);
	error.code = MEMORY_EMBEDDING_OPERATION_ERROR_CODE;
	error.operation = params.operation;
	if (params.providerId) error.providerId = params.providerId;
	error.cause = params.cause;
	return error;
}
function isMemoryEmbeddingOperationError(err) {
	return err instanceof Error && err.code === MEMORY_EMBEDDING_OPERATION_ERROR_CODE;
}
//#endregion
//#region extensions/memory-core/src/memory/manager-embedding-policy.ts
function filterNonEmptyMemoryChunks(chunks) {
	return chunks.filter((chunk) => chunk.text.trim().length > 0);
}
function buildMemoryEmbeddingBatches(chunks, maxTokens) {
	const batches = [];
	let current = [];
	let currentTokens = 0;
	for (const chunk of chunks) {
		const estimate = chunk.embeddingInput ? estimateStructuredEmbeddingInputBytes(chunk.embeddingInput) : estimateUtf8Bytes(chunk.text);
		if (current.length > 0 && currentTokens + estimate > maxTokens) {
			batches.push(current);
			current = [];
			currentTokens = 0;
		}
		if (current.length === 0 && estimate > maxTokens) {
			batches.push([chunk]);
			continue;
		}
		current.push(chunk);
		currentTokens += estimate;
	}
	if (current.length > 0) batches.push(current);
	return batches;
}
const RETRYABLE_MEMORY_EMBEDDING_SERVICE_ERROR_RE = /(rate[_ ]limit|too many requests|\b(?:429|5\d\d)\b|resource has been exhausted|cloudflare|tokens per day)/i;
const RETRYABLE_MEMORY_EMBEDDING_TRANSPORT_ERROR_RE = /(fetch failed|other side closed|ECONNRESET|ECONNREFUSED|ETIMEDOUT|EPIPE|UND_ERR_|socket hang up|socket terminated|network error|read ECONN|timed out|connection (?:reset|refused|aborted|timed out)|EHOSTUNREACH|ENETUNREACH|ECONNABORTED|EAI_AGAIN)/i;
const SPLITTABLE_MEMORY_EMBEDDING_BATCH_ERROR_RE = /(request_headers_too_large|request header fields too large|other side closed|ECONNRESET|EPIPE|UND_ERR_SOCKET|socket hang up|socket terminated|read ECONN|connection (?:reset|aborted)|\bembeddings (?:api input limit exceeded:\s*max\s+\d+\s*,\s*got\s+\d+|max input length is\s+\d+)\b)/i;
function isSplittableMemoryEmbeddingBatchError(message) {
	return SPLITTABLE_MEMORY_EMBEDDING_BATCH_ERROR_RE.test(message);
}
function isRetryableMemoryEmbeddingError(message) {
	return RETRYABLE_MEMORY_EMBEDDING_TRANSPORT_ERROR_RE.test(message) || !isSplittableMemoryEmbeddingBatchError(message) && RETRYABLE_MEMORY_EMBEDDING_SERVICE_ERROR_RE.test(message);
}
function resolveMemoryEmbeddingRetryDelay(delayMs, randomValue, maxDelayMs) {
	return Math.min(maxDelayMs, Math.round(delayMs * (1 + randomValue * .2)));
}
async function runMemoryEmbeddingRetryLoop(params) {
	return await retryAsync(params.run, {
		attempts: params.maxAttempts,
		minDelayMs: params.baseDelayMs,
		maxDelayMs: Number.MAX_SAFE_INTEGER,
		shouldRetry: (err) => !params.signal?.aborted && params.isRetryable(formatErrorMessage(err)),
		sleep: params.waitForRetry
	});
}
async function runMemoryEmbeddingBatchRetryWithSplit(params) {
	try {
		return await runMemoryEmbeddingRetryLoop({
			run: async () => await params.run(params.items),
			isRetryable: params.isRetryable,
			waitForRetry: params.waitForRetry,
			maxAttempts: params.maxAttempts,
			baseDelayMs: params.baseDelayMs
		});
	} catch (err) {
		const message = formatErrorMessage(err);
		if (params.items.length <= 1 || !params.isSplittable(message)) throw err;
		const splitAt = Math.ceil(params.items.length / 2);
		params.onSplit?.({
			itemCount: params.items.length,
			splitAt,
			message
		});
		const left = await runMemoryEmbeddingBatchRetryWithSplit({
			...params,
			items: params.items.slice(0, splitAt)
		});
		const right = await runMemoryEmbeddingBatchRetryWithSplit({
			...params,
			items: params.items.slice(splitAt)
		});
		return [...left, ...right];
	}
}
function buildTextEmbeddingInputs(chunks) {
	return chunks.map((chunk) => chunk.embeddingInput ?? { text: chunk.text });
}
//#endregion
//#region extensions/memory-core/src/memory/manager-fts-state.ts
function deleteMemoryFtsRows(params) {
	const tableName = params.tableName ?? "memory_index_chunks_fts";
	params.db.prepare(`DELETE FROM ${tableName} WHERE path = ? AND source = ?`).run(params.path, params.source);
}
function resolveMemoryIndexProviderIdentities(params) {
	const provider = params.provider ?? {
		id: "none",
		model: "fts-only"
	};
	const candidates = [{
		model: provider.model,
		cacheKeyData: params.cacheKeyData ?? {
			provider: provider.id,
			model: provider.model
		}
	}, ...params.provider ? params.aliases ?? [] : []];
	const seen = /* @__PURE__ */ new Set();
	const identities = [];
	for (const [index, candidate] of candidates.entries()) {
		const providerKey = hashText(JSON.stringify(candidate.cacheKeyData));
		const key = `${candidate.model}\u0000${providerKey}`;
		if (index > 0 && !candidate.model || seen.has(key)) continue;
		seen.add(key);
		identities.push({
			provider: provider.id,
			model: candidate.model,
			providerKey
		});
	}
	return identities;
}
function resolveConfiguredSourcesForMeta(sources) {
	const normalized = Array.from(sources).filter((source) => source === "memory" || source === "sessions").toSorted((left, right) => left.localeCompare(right));
	return normalized.length > 0 ? normalized : ["memory"];
}
function normalizeMetaSources(meta) {
	if (!Array.isArray(meta.sources)) return ["memory"];
	const normalized = Array.from(new Set(meta.sources.filter((source) => source === "memory" || source === "sessions"))).toSorted((left, right) => left.localeCompare(right));
	return normalized.length > 0 ? normalized : ["memory"];
}
function configuredMetaSourcesDiffer(params) {
	const metaSources = normalizeMetaSources(params.meta);
	if (metaSources.length !== params.configuredSources.length) return true;
	return metaSources.some((source, index) => source !== params.configuredSources[index]);
}
function openClawIndexMismatch(code, reason) {
	return {
		status: "mismatched",
		reason,
		code,
		owner: "openclaw"
	};
}
function configuredIndexMismatch(code, reason) {
	return {
		status: "mismatched",
		reason,
		code,
		owner: "configuration"
	};
}
function resolveConfiguredScopeHash(params) {
	const extraPaths = normalizeExtraMemoryPathEntries(params.workspaceDir, params.extraPaths).map((entry) => {
		const path = entry.path.replaceAll("\\", "/");
		return entry.pattern ? {
			path,
			pattern: entry.pattern
		} : path;
	}).toSorted((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)));
	return hashText(JSON.stringify({
		extraPaths,
		multimodal: {
			enabled: params.multimodal.enabled,
			modalities: [...params.multimodal.modalities].toSorted(),
			maxFileBytes: params.multimodal.maxFileBytes
		}
	}));
}
function resolveMemoryIndexIdentityState(params) {
	const { meta } = params;
	if (!meta) return {
		status: "missing",
		reason: "index metadata is missing",
		code: "metadata_missing",
		owner: "openclaw"
	};
	if (meta.provenanceVersion !== 1) return openClawIndexMismatch("provenance_version", "index provenance classifier changed");
	if (meta.chunkingVersion !== 3) return openClawIndexMismatch("chunking_version", "index chunking implementation changed");
	const expectedModel = params.provider && params.provider.model === void 0 ? void 0 : params.provider?.model?.trim() || "fts-only";
	const matchingModelIdentities = [{
		model: expectedModel,
		providerKey: params.providerKey
	}, ...params.providerAliases ?? []].filter((identity) => identity.model === meta.model);
	if (expectedModel !== void 0 && matchingModelIdentities.length === 0) return configuredIndexMismatch("model", `index was built for model ${meta.model}, expected ${expectedModel}`);
	const expectedProvider = params.provider ? params.provider.id : "none";
	if (meta.provider !== expectedProvider) return configuredIndexMismatch("provider", `index was built for provider ${meta.provider}, expected ${expectedProvider}`);
	if (expectedModel !== void 0 && params.providerKeyKnown !== false && !matchingModelIdentities.some((identity) => identity.providerKey === meta.providerKey)) return configuredIndexMismatch("provider_settings", "index provider settings changed");
	if (configuredMetaSourcesDiffer({
		meta,
		configuredSources: params.configuredSources
	})) return configuredIndexMismatch("sources", "index sources changed");
	if (meta.scopeHash !== params.configuredScopeHash) return configuredIndexMismatch("scope", "index scope changed");
	if (meta.chunkTokens !== params.chunkTokens || meta.chunkOverlap !== params.chunkOverlap) return configuredIndexMismatch("chunking", "index chunking changed");
	if (params.vectorReady && params.hasIndexedChunks !== false && !meta.vectorDims) return configuredIndexMismatch("vector_dims", "index vector dimensions are missing");
	if ((meta.ftsTokenizer ?? "unicode61") !== params.ftsTokenizer) return configuredIndexMismatch("fts_tokenizer", "index FTS tokenizer changed");
	return { status: "valid" };
}
//#endregion
//#region extensions/memory-core/src/memory/manager-reset-chunk-boundary.ts
function chunkSessionContentAtResetBoundary(params) {
	const cutoffIndex = params.cutoffLine !== void 0 && params.lineMap ? params.lineMap.findIndex((line) => line >= params.cutoffLine) : -1;
	if (cutoffIndex <= 0) return chunkMarkdown(params.content, params.chunking);
	const lines = params.content.split("\n");
	const chunkPartition = (content, lineOffset) => {
		const chunks = chunkMarkdown(content, params.chunking);
		for (const chunk of chunks) {
			chunk.startLine += lineOffset;
			chunk.endLine += lineOffset;
		}
		return chunks;
	};
	return [...chunkPartition(lines.slice(0, cutoffIndex).join("\n"), 0), ...chunkPartition(lines.slice(cutoffIndex).join("\n"), cutoffIndex)];
}
//#endregion
//#region extensions/memory-core/src/memory/manager-provider-state.ts
function createPendingMemoryProviderLifecycle(requestedProvider) {
	return {
		mode: "pending",
		requestedProvider
	};
}
function createDegradedMemoryProviderLifecycle(params) {
	return {
		mode: "degraded",
		providerId: params.providerId,
		reason: params.reason,
		...params.code ? { code: params.code } : {}
	};
}
function resolveProviderLifecycle(result) {
	if (result.provider && result.fallbackFrom) return {
		mode: "fallback-active",
		providerId: result.provider.id,
		fallbackFrom: result.fallbackFrom,
		reason: result.fallbackReason ?? "fallback activated"
	};
	if (result.provider) return {
		mode: "active",
		providerId: result.provider.id
	};
	return {
		mode: "fts-only",
		reason: result.providerUnavailableReason ?? "No embedding provider available",
		attemptedProviderId: result.requestedProvider
	};
}
function resolveFallbackCurrentProviderId(params) {
	if (params.provider) return params.provider.id;
	if (params.lifecycle.mode === "degraded") return params.lifecycle.providerId;
	return null;
}
function resolveMemoryPrimaryProviderRequest(params) {
	return {
		provider: params.settings.provider,
		model: params.settings.model,
		remote: params.settings.remote,
		inputType: params.settings.inputType,
		queryInputType: params.settings.queryInputType,
		documentInputType: params.settings.documentInputType,
		outputDimensionality: params.settings.outputDimensionality,
		fallback: params.settings.fallback,
		local: params.settings.local
	};
}
function resolveMemoryProviderState(result) {
	return {
		provider: result.provider,
		fallbackFrom: result.fallbackFrom,
		fallbackReason: result.fallbackReason,
		providerUnavailableReason: result.providerUnavailableReason,
		providerRuntime: result.runtime,
		lifecycle: resolveProviderLifecycle(result)
	};
}
function applyMemoryFallbackProviderState(params) {
	return {
		...params.current,
		fallbackFrom: params.fallbackFrom,
		fallbackReason: params.reason,
		providerUnavailableReason: void 0,
		provider: params.result.provider,
		providerRuntime: params.result.runtime,
		lifecycle: params.result.provider ? {
			mode: "fallback-active",
			providerId: params.result.provider.id,
			fallbackFrom: params.fallbackFrom,
			reason: params.reason
		} : {
			mode: "fts-only",
			reason: params.reason,
			attemptedProviderId: params.fallbackFrom
		}
	};
}
function resolveMemoryFallbackProviderRequest(params) {
	const fallback = params.settings.fallback;
	if (!fallback || fallback === "none" || !params.currentProviderId || fallback === params.currentProviderId) return null;
	return {
		provider: fallback,
		model: resolveEmbeddingProviderFallbackModel(fallback, params.settings.model, params.cfg),
		remote: resolveEmbeddingProviderFallbackRemote(params.settings.remote),
		inputType: params.settings.inputType,
		queryInputType: params.settings.queryInputType,
		documentInputType: params.settings.documentInputType,
		outputDimensionality: params.settings.outputDimensionality,
		fallback: "none",
		local: params.settings.local
	};
}
//#endregion
//#region extensions/memory-core/src/memory/manager-session-reindex.ts
function shouldSyncSessionsForReindex(params) {
	if (!params.hasSessionSource) return false;
	if (params.sync?.sessions?.some((session) => session.sessionId.trim().length > 0)) return true;
	if (params.sync?.archiveFiles?.some((sessionFile) => sessionFile.trim().length > 0)) return true;
	if (params.sync?.force) return true;
	if (params.needsFullReindex) return true;
	if (params.sessionsFullRetryDirty) return true;
	const reason = params.sync?.reason;
	if (reason === "session-start" || reason === "watch") return false;
	return params.sessionsDirty;
}
//#endregion
//#region extensions/memory-core/src/memory/manager-source-state.ts
const MEMORY_SOURCE_FILE_STATE_SQL = `SELECT path, hash, mtime, size FROM memory_index_sources WHERE source = ?`;
const MEMORY_SOURCE_FILE_HASH_SQL = `SELECT hash FROM memory_index_sources WHERE path = ? AND source = ?`;
/** Resolve exactly the entries eligible for indexing, including validated multimodal files. */
async function resolveMemorySourceFileEntries(params) {
	const files = await listMemoryFiles(params.workspaceDir, params.settings.extraPaths, params.settings.multimodal);
	return (await runMemoryHostTasksWithConcurrency(files.map((file) => async () => await buildFileEntry(file, params.workspaceDir, params.settings.multimodal)), params.concurrency)).filter((entry) => entry !== null);
}
/** Compare a resolved source snapshot with the persisted index without writing either side. */
function hasMemorySourceDrift(params) {
	const indexedByPath = new Map(params.indexedRows.map((row) => [row.path, row]));
	if (indexedByPath.size !== params.entries.length) return true;
	return params.entries.some((entry) => indexedByPath.get(entry.path)?.hash !== entry.hash);
}
async function inspectMemorySourceState(params) {
	const entries = await resolveMemorySourceFileEntries(params);
	const indexedRows = loadMemorySourceFileState({
		db: params.db,
		source: "memory"
	}).rows;
	return {
		source: "memory",
		dirty: hasMemorySourceDrift({
			entries,
			indexedRows
		}),
		eligible: entries.length,
		issues: entries.length === 0 ? ["no eligible memory files found"] : []
	};
}
function loadMemorySourceFileState(params) {
	const normalizedRows = params.db.prepare(MEMORY_SOURCE_FILE_STATE_SQL).all(params.source) ?? [];
	return {
		rows: normalizedRows,
		hashes: new Map(normalizedRows.map((row) => [row.path, row.hash]))
	};
}
function resolveMemorySourceExistingHash(params) {
	if (params.existingHashes) return params.existingHashes.get(params.path);
	return params.db.prepare(MEMORY_SOURCE_FILE_HASH_SQL).get(params.path, params.source)?.hash;
}
//#endregion
//#region extensions/memory-core/src/memory/manager-sync-outcome.ts
var MemorySyncOutcomeLedger = class {
	constructor() {
		this.failureRevision = 0;
		this.active = false;
	}
	async track(operation, active = false) {
		const failureAtStart = this.latestFailure?.revision;
		if (active) this.active = true;
		try {
			const incompleteReason = await operation();
			if (incompleteReason) this.recordFailure(incompleteReason);
			else if (failureAtStart !== void 0 && this.latestFailure?.revision === failureAtStart) this.latestFailure = void 0;
		} catch (error) {
			this.recordFailure(error);
			throw error;
		} finally {
			if (active) this.active = false;
		}
	}
	recordActiveFailure(error) {
		if (this.active) this.recordFailure(error);
	}
	get lastError() {
		return this.latestFailure?.reason;
	}
	recordFailure(error) {
		this.latestFailure = {
			revision: ++this.failureRevision,
			reason: redactSensitiveText(formatErrorMessage(error), { mode: "tools" })
		};
	}
};
//#endregion
//#region extensions/memory-core/src/memory/manager-vector-rebuild-state.ts
const VECTOR_REBUILD_META_KEY = "memory_vector_rebuild_v1";
function memoryTableExists(db, tableName) {
	return Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(tableName));
}
function markMemoryVectorIndexClean(db) {
	db.prepare(`INSERT INTO ${MEMORY_INDEX_META_TABLE} (key, value) VALUES (?, 'clean')
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(VECTOR_REBUILD_META_KEY);
}
function markMemoryVectorRebuildRequired(db) {
	db.prepare(`INSERT INTO ${MEMORY_INDEX_META_TABLE} (key, value) VALUES (?, '1')
     ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(VECTOR_REBUILD_META_KEY);
}
function requiresMemoryVectorRebuild(params) {
	const state = resolvePersistedMemoryVectorIndexState(params).state;
	return state === "incomplete" || state === "unverified";
}
function resolvePersistedMemoryVectorIndexState(params) {
	const row = params.db.prepare(`SELECT value FROM ${MEMORY_INDEX_META_TABLE} WHERE key = ?`).get(VECTOR_REBUILD_META_KEY);
	if (row?.value === "1") return { state: "incomplete" };
	if (!memoryTableExists(params.db, params.vectorTable)) return params.metaVectorDims && params.hasSemanticChunks ? { state: "incomplete" } : { state: "empty" };
	if (row?.value === "clean") return params.hasSemanticChunks ? { state: "complete" } : { state: "empty" };
	if (params.hasSemanticChunks && !params.metaVectorDims) return { state: "incomplete" };
	return { state: "unverified" };
}
//#endregion
//#region extensions/memory-core/src/memory/source-filter.ts
function buildMemorySourceFilter(alias, sources) {
	if (sources.length === 0) return {
		sql: "",
		params: []
	};
	return {
		sql: ` AND ${alias ? `${alias}.source` : "source"} IN (${sources.map(() => "?").join(", ")})`,
		params: [...sources]
	};
}
//#endregion
//#region extensions/memory-core/src/memory/manager-sync-base.ts
const MEMORY_INDEX_META_KEY = "memory_index_meta_v1";
const META_KEY = MEMORY_INDEX_META_KEY;
const VECTOR_TABLE$2 = MEMORY_INDEX_VECTOR_TABLE;
const LEGACY_VECTOR_TABLE = "chunks_vec";
const EMBEDDING_CACHE_TABLE$1 = MEMORY_EMBEDDING_CACHE_TABLE;
const EMBEDDING_CACHE_SEED_BATCH_SIZE = 100;
const VECTOR_LOAD_TIMEOUT_MS = 3e4;
const log$10 = createSubsystemLogger("memory");
var MemoryManagerSyncBase = class extends MemoryManagerDatabaseContext {
	constructor(..._args) {
		super(..._args);
		this.provider = null;
		this.sources = /* @__PURE__ */ new Set();
		this.sourceInspections = /* @__PURE__ */ new Map();
		this.providerKey = null;
		this.watcher = null;
		this.watchTimer = null;
		this.sessionWatchTimer = null;
		this.sessionUnsubscribe = null;
		this.intervalTimer = null;
		this.memoryWatchPressureStartupTimer = null;
		this.closed = false;
		this.dirty = false;
		this.syncOutcomes = new MemorySyncOutcomeLedger();
		this.memorySourceProvenanceRepairPending = false;
		this.memoryFullRetryDirty = false;
		this.pendingWatchPaths = /* @__PURE__ */ new Map();
		this.sessionsDirty = false;
		this.sessionsFullRetryDirty = false;
		this.sessionsReconcileDirty = false;
		this.sessionsDirtyFiles = /* @__PURE__ */ new Set();
		this.sessionPendingFiles = /* @__PURE__ */ new Set();
		this.sessionPendingTargets = /* @__PURE__ */ new Map();
	}
	async indexFiles(items) {
		for (const item of items) await this.indexFile(item.entry, { source: item.source });
	}
	emptySourceSyncPlan() {
		return {
			indexItems: [],
			finalize: () => {}
		};
	}
	snapshotReindexRetryState() {
		return {
			dirty: this.dirty,
			memoryFullRetryDirty: this.memoryFullRetryDirty,
			sessionsDirty: this.sessionsDirty,
			sessionsFullRetryDirty: this.sessionsFullRetryDirty,
			sessionsReconcileDirty: this.sessionsReconcileDirty,
			sessionsDirtyFiles: new Set(this.sessionsDirtyFiles)
		};
	}
	takeReindexRetryStateForMaintenance() {
		const snapshot = this.snapshotReindexRetryState();
		this.clearMemoryRetryState();
		this.clearSessionRetryState();
		return snapshot;
	}
	restoreReindexRetryState(snapshot) {
		this.dirty = snapshot.dirty || this.dirty;
		this.memoryFullRetryDirty = snapshot.memoryFullRetryDirty || this.memoryFullRetryDirty;
		this.sessionsFullRetryDirty = snapshot.sessionsFullRetryDirty || this.sessionsFullRetryDirty;
		this.sessionsReconcileDirty = snapshot.sessionsReconcileDirty || this.sessionsReconcileDirty;
		this.sessionsDirtyFiles = /* @__PURE__ */ new Set([...snapshot.sessionsDirtyFiles, ...this.sessionsDirtyFiles]);
		this.sessionsDirty = snapshot.sessionsDirty || this.sessionsDirty || this.sessionsFullRetryDirty || this.sessionsReconcileDirty || this.sessionsDirtyFiles.size > 0;
	}
	markFailedFullReindexRetry(params) {
		if (params.memory) {
			this.dirty = true;
			this.memoryFullRetryDirty = true;
		}
		if (params.sessions) {
			this.sessionsDirty = true;
			this.sessionsFullRetryDirty = true;
		}
	}
	clearSessionRetryState() {
		this.sessionsDirty = false;
		this.sessionsFullRetryDirty = false;
		this.sessionsReconcileDirty = false;
		this.sessionsDirtyFiles.clear();
	}
	clearMemoryRetryState() {
		this.dirty = false;
		this.memoryFullRetryDirty = false;
	}
	refreshSessionDirtyFlag() {
		this.sessionsDirty = this.sessionsFullRetryDirty || this.sessionsReconcileDirty || this.sessionsDirtyFiles.size > 0;
	}
	shouldDeferSourceWideBatch() {
		return Boolean(this.batch.enabled && this.provider && this.providerRuntime?.batchEmbed && this.providerRuntime.sourceWideBatchEmbed === true);
	}
	advanceSyncProgress(progress, count = 1) {
		if (!progress) return;
		progress.completed += count;
		progress.report({
			completed: progress.completed,
			total: progress.total
		});
	}
	async indexQueuedFiles(items, progress, label) {
		if (items.length === 0) return;
		if (progress && label) progress.report({
			completed: progress.completed,
			total: progress.total,
			label
		});
		await this.indexFiles(items);
		for (const item of items) item.afterIndex?.();
		this.advanceSyncProgress(progress, items.length);
	}
	async executeSourceSyncPlans(plans, progress) {
		const indexItems = plans.flatMap((plan) => plan.indexItems);
		const sources = new Set(indexItems.map((item) => item.source));
		await this.indexQueuedFiles(indexItems, progress, sources.size > 1 ? "Indexing memory sources (batch)..." : void 0);
		for (const plan of plans) await plan.finalize();
	}
	async executeSourceWideSync(params) {
		const memoryPlan = params.shouldSyncMemory ? await this.syncMemoryFiles({
			needsFullReindex: params.needsFullReindex,
			progress: params.progress,
			deferIndex: true
		}) : this.emptySourceSyncPlan();
		if (params.shouldSyncSessions) {
			await this.syncArchiveFiles({
				needsFullReindex: params.needsFullSessionReindex ?? params.needsFullReindex,
				targetArchiveFiles: params.targetArchiveFiles,
				progress: params.progress,
				deferIndex: true,
				prefixIndexItems: memoryPlan.indexItems
			});
			await memoryPlan.finalize();
			return;
		}
		await this.executeSourceSyncPlans([memoryPlan], params.progress);
	}
	hasIndexedChunks() {
		return this.db.prepare(`SELECT 1 as found FROM memory_index_chunks LIMIT 1`).get()?.found === 1;
	}
	hasSemanticChunks() {
		return this.db.prepare(`SELECT 1 as found FROM memory_index_chunks WHERE model != 'fts-only' LIMIT 1`).get()?.found === 1;
	}
	resolveCurrentIndexIdentityState(params) {
		const hasProviderOverride = params && "provider" in params;
		const configuredIndexIdentity = !hasProviderOverride && !this.provider && this.settings.provider !== "none" ? resolveEmbeddingProviderIndexIdentity({
			config: this.cfg,
			agentDir: resolveAgentDir(this.cfg, this.agentId),
			...resolveMemoryPrimaryProviderRequest({ settings: this.settings })
		}) : void 0;
		const configuredProvider = this.settings.provider === "none" ? null : {
			id: configuredIndexIdentity?.provider.id ?? this.settings.provider,
			model: (configuredIndexIdentity?.provider.model ?? this.settings.model.trim()) || void 0
		};
		const provider = hasProviderOverride ? params.provider : this.provider ? {
			id: this.provider.id,
			model: this.provider.model
		} : configuredProvider;
		const vectorReady = params && "vectorReady" in params ? Boolean(params.vectorReady) : this.vector.available === true;
		const initializedProviderIdentities = provider && this.provider && provider.id === this.provider.id && provider.model === this.provider.model ? this.resolveProviderIndexIdentities() : [];
		const configuredProviderIdentities = configuredIndexIdentity?.cacheKeyData ? resolveMemoryIndexProviderIdentities({
			provider: configuredIndexIdentity.provider,
			cacheKeyData: configuredIndexIdentity.cacheKeyData,
			aliases: configuredIndexIdentity.aliases
		}) : [];
		const providerIdentities = initializedProviderIdentities.length > 0 ? initializedProviderIdentities : configuredProviderIdentities;
		const configuredProviderKeyKnown = configuredProviderIdentities.length > 0;
		return resolveMemoryIndexIdentityState({
			meta: params && "meta" in params ? params.meta : this.readMeta(),
			provider,
			providerKey: configuredProviderKeyKnown ? providerIdentities[0]?.providerKey : params?.providerKeyKnown === false ? void 0 : this.providerKey ?? void 0,
			providerAliases: providerIdentities.slice(1),
			providerKeyKnown: configuredProviderKeyKnown ? true : params?.providerKeyKnown,
			configuredSources: resolveConfiguredSourcesForMeta(this.sources),
			configuredScopeHash: resolveConfiguredScopeHash({
				workspaceDir: this.workspaceDir,
				extraPaths: this.settings.extraPaths,
				multimodal: {
					enabled: this.settings.multimodal.enabled,
					modalities: this.settings.multimodal.modalities,
					maxFileBytes: this.settings.multimodal.maxFileBytes
				}
			}),
			chunkTokens: this.settings.chunking.tokens,
			chunkOverlap: this.settings.chunking.overlap,
			vectorReady,
			hasIndexedChunks: params && "hasIndexedChunks" in params ? Boolean(params.hasIndexedChunks) : this.hasIndexedChunks(),
			ftsTokenizer: this.settings.store.fts.tokenizer
		});
	}
	resetVectorState() {
		this.database.vectorReady = null;
		this.vector.available = null;
		this.vector.semanticAvailable = void 0;
		this.vector.loadError = void 0;
		this.vector.dims = void 0;
		this.database.vectorDegradedWriteWarningShown = false;
	}
	async ensureVectorReady(dimensions) {
		if (!this.vector.enabled) return false;
		if (!this.database.vectorReady) this.database.vectorReady = this.withTimeout(this.loadVectorExtension(), VECTOR_LOAD_TIMEOUT_MS, `sqlite-vec load timed out after ${Math.round(VECTOR_LOAD_TIMEOUT_MS / 1e3)}s`);
		let ready;
		try {
			ready = await this.database.vectorReady || false;
		} catch (err) {
			const message = formatErrorMessage(err);
			this.vector.available = false;
			this.vector.loadError = message;
			this.database.vectorReady = null;
			log$10.warn(`sqlite-vec unavailable: ${message}`);
			return false;
		}
		if (ready && typeof dimensions === "number" && dimensions > 0) {
			const persistedMeta = this.readMeta();
			if (persistedMeta && persistedMeta.vectorDims !== this.vector.dims) this.vector.dims = persistedMeta.vectorDims;
			this.ensureVectorTable(dimensions);
		}
		return ready;
	}
	async loadVectorExtension() {
		if (this.vector.available === true && this.hasVectorRebuildMarker()) {
			this.markConfiguredSourcesForFullReindex();
			return false;
		}
		if (this.vector.available !== null) return this.vector.available;
		if (!this.vector.enabled) {
			this.vector.available = false;
			return false;
		}
		try {
			const resolvedPath = this.vector.extensionPath?.trim() ? resolveUserPath(this.vector.extensionPath) : void 0;
			const loaded = await loadSqliteVecExtension({
				db: this.db,
				extensionPath: resolvedPath
			});
			if (!loaded.ok) throw new Error(loaded.error ?? "unknown sqlite-vec load error");
			this.vector.extensionPath = loaded.extensionPath;
			this.vector.available = true;
			if (this.hasVectorRebuildMarker()) {
				this.markConfiguredSourcesForFullReindex();
				return false;
			}
			if (!isMemoryDatabaseReadOnly(this.db) && this.dropLegacyVectorTable()) {
				this.dirty = true;
				this.memoryFullRetryDirty = true;
			}
			return true;
		} catch (err) {
			const message = formatErrorMessage(err);
			this.vector.available = false;
			this.vector.loadError = message;
			log$10.warn(`sqlite-vec unavailable: ${message}`);
			return false;
		}
	}
	deleteVectorRowsForSource(pathname, source) {
		if (!memoryTableExists(this.db, VECTOR_TABLE$2)) return;
		if (!this.vector.enabled || this.vector.available !== true) {
			this.markVectorRebuildRequired();
			return;
		}
		try {
			this.db.prepare(`DELETE FROM ${VECTOR_TABLE$2} WHERE id IN (
             SELECT id FROM memory_index_chunks WHERE path = ? AND source = ?
           )`).run(pathname, source);
		} catch {
			this.markVectorRebuildRequired();
		}
	}
	markVectorRebuildRequired() {
		markMemoryVectorRebuildRequired(this.db);
	}
	hasVectorRebuildMarker() {
		return requiresMemoryVectorRebuild({
			db: this.db,
			vectorTable: VECTOR_TABLE$2,
			metaVectorDims: this.readMeta()?.vectorDims,
			hasSemanticChunks: this.hasSemanticChunks()
		});
	}
	markConfiguredSourcesForFullReindex() {
		this.memoryFullRetryDirty = true;
		if (this.sources.has("memory")) this.dirty = true;
		if (this.sources.has("sessions")) {
			this.sessionsDirty = true;
			this.sessionsFullRetryDirty = true;
		}
	}
	ensureVectorTable(dimensions) {
		if (this.vector.dims === dimensions && memoryTableExists(this.db, VECTOR_TABLE$2)) return;
		if (!Number.isSafeInteger(dimensions) || dimensions < 1) throw new Error("Invalid memory vector dimensions");
		if (!this.dropVectorTable()) throw new Error(`Failed to reset ${VECTOR_TABLE$2} before rebuilding vector dimensions`);
		// Keep a vector blob below the ordinary SQLite page-cache budget (768 KiB).
		const chunkSize = Math.max(8, Math.min(1024, 2 ** Math.floor(Math.log2(786432 / (dimensions * 4)))));
		this.db.exec(`CREATE VIRTUAL TABLE IF NOT EXISTS ${VECTOR_TABLE$2} USING vec0(\n  id TEXT PRIMARY KEY,\n  embedding FLOAT[${dimensions}],\n  chunk_size=${chunkSize}\n)`);
		this.vector.dims = dimensions;
	}
	dropLegacyVectorTable() {
		if (!memoryTableExists(this.db, LEGACY_VECTOR_TABLE)) return false;
		try {
			this.db.exec(`DROP TABLE ${LEGACY_VECTOR_TABLE}`);
			return true;
		} catch (err) {
			log$10.debug(`Failed to drop ${LEGACY_VECTOR_TABLE}: ${formatErrorMessage(err)}`);
			return false;
		}
	}
	dropVectorTable() {
		try {
			this.db.exec(`DROP TABLE IF EXISTS ${VECTOR_TABLE$2}`);
			return true;
		} catch (err) {
			const message = formatErrorMessage(err);
			log$10.debug(`Failed to drop ${VECTOR_TABLE$2}: ${message}`);
			return false;
		}
	}
	buildSourceFilter(alias, sourcesOverride) {
		return buildMemorySourceFilter(alias, sourcesOverride ?? Array.from(this.sources));
	}
	openDatabase(readOnly = false) {
		const dbPath = resolveUserPath(this.settings.store.databasePath);
		const vectorEnabled = this.settings.store.vector.enabled;
		return readOnly ? openMemoryDatabaseReadOnlyAtPath(dbPath, vectorEnabled, this.agentId) : openMemoryDatabaseAtPath(dbPath, vectorEnabled, this.agentId);
	}
	async seedEmbeddingCache(sourceDb) {
		if (!this.cache.enabled) return;
		const selectBatch = sourceDb.prepare(`SELECT rowid, provider, model, provider_key, hash, embedding, dims, updated_at
       FROM ${EMBEDDING_CACHE_TABLE$1}
       WHERE rowid > ?
       ORDER BY rowid
       LIMIT ?`);
		const insert = this.db.prepare(`INSERT INTO ${EMBEDDING_CACHE_TABLE$1} (provider, model, provider_key, hash, embedding, dims, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(provider, model, provider_key, hash) DO UPDATE SET
         embedding=excluded.embedding,
         dims=excluded.dims,
         updated_at=excluded.updated_at`);
		let lastRowid = 0;
		while (true) {
			const batch = selectBatch.all(lastRowid, EMBEDDING_CACHE_SEED_BATCH_SIZE);
			if (batch.length === 0) return;
			runSqliteImmediateTransactionSync(this.db, () => {
				for (const row of batch) insert.run(row.provider, row.model, row.provider_key, row.hash, row.embedding, row.dims, row.updated_at);
			}, { operationLabel: "memory.embedding-cache.seed" });
			lastRowid = batch[batch.length - 1]?.rowid ?? lastRowid;
			if (batch.length < EMBEDDING_CACHE_SEED_BATCH_SIZE) return;
			await new Promise((resolve) => {
				setImmediate(resolve);
			});
		}
	}
	ensureSchema() {
		const result = ensureMemoryIndexSchema({
			db: this.db,
			cacheEnabled: this.cache.enabled,
			ftsEnabled: this.fts.enabled,
			ftsTokenizer: this.settings.store.fts.tokenizer
		});
		this.fts.available = result.ftsAvailable;
		if (result.ftsError) {
			this.fts.loadError = result.ftsError;
			if (this.fts.enabled) log$10.warn(`fts unavailable: ${result.ftsError}`);
		}
	}
	readMeta() {
		const row = this.db.prepare(`SELECT value FROM memory_index_meta WHERE key = ?`).get(META_KEY);
		if (!row?.value) {
			this.database.lastMetaSerialized = null;
			return null;
		}
		try {
			const parsed = JSON.parse(row.value);
			this.database.lastMetaSerialized = row.value;
			return parsed;
		} catch {
			this.database.lastMetaSerialized = null;
			return null;
		}
	}
	writeMeta(meta) {
		const value = JSON.stringify(meta);
		if (this.database.lastMetaSerialized === value) return;
		this.db.prepare(`INSERT INTO memory_index_meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value`).run(META_KEY, value);
		this.database.lastMetaSerialized = value;
	}
};
//#endregion
//#region extensions/memory-core/src/memory/watch-pressure.ts
const MEMORY_WATCH_PRESSURE_WARNING_THRESHOLD = 2e3;
function countChokidarWatchedEntries(watcher) {
	const watched = watcher.getWatched();
	let count = Object.keys(watched).length;
	for (const entries of Object.values(watched)) count += entries.length;
	return count;
}
function warnIfMemoryWatchPressureHigh(state, count, unit, pressureDetail, remediation, warn) {
	if (state.shown || count <= MEMORY_WATCH_PRESSURE_WARNING_THRESHOLD) return false;
	state.shown = true;
	warn(`Memory file watching is tracking ${count} ${unit}. ${pressureDetail} ${remediation}`);
	return true;
}
//#endregion
//#region extensions/memory-core/src/memory/watch-settle.ts
const MEMORY_WATCH_SETTLE_RECHECK_MS = 100;
function snapshotFromStats(stats) {
	if (!stats || stats.isDirectory?.()) return null;
	if (typeof stats.size !== "number" || typeof stats.mtimeMs !== "number") return null;
	return {
		size: stats.size,
		mtimeMs: stats.mtimeMs
	};
}
function snapshotsMatch(left, right) {
	if (left === null || right === null) return left === right;
	return left.size === right.size && left.mtimeMs === right.mtimeMs;
}
function snapshotPath(filePath) {
	try {
		const stats = fs.statSync(filePath);
		if (stats.isDirectory()) return null;
		return {
			size: stats.size,
			mtimeMs: stats.mtimeMs
		};
	} catch {
		return null;
	}
}
function recordMemoryWatchEventPath(queue, watchPath, stats) {
	if (!watchPath) return;
	const trimmed = watchPath.trim();
	if (!trimmed) return;
	queue.set(path.resolve(trimmed), snapshotFromStats(stats));
}
async function settleMemoryWatchEventPaths(queue) {
	if (queue.size === 0) return true;
	const entries = Array.from(queue.entries());
	queue.clear();
	const missingBaseline = [];
	for (const [filePath, previousSnapshot] of entries) {
		const currentSnapshot = snapshotPath(filePath);
		if (previousSnapshot === null) {
			if (currentSnapshot !== null) missingBaseline.push({
				filePath,
				snapshot: currentSnapshot
			});
			continue;
		}
		if (!snapshotsMatch(previousSnapshot, currentSnapshot)) queue.set(filePath, currentSnapshot);
	}
	if (missingBaseline.length > 0) {
		await sleep(MEMORY_WATCH_SETTLE_RECHECK_MS);
		for (const entry of missingBaseline) {
			const currentSnapshot = snapshotPath(entry.filePath);
			if (!snapshotsMatch(entry.snapshot, currentSnapshot)) queue.set(entry.filePath, currentSnapshot);
		}
	}
	return queue.size === 0;
}
//#endregion
//#region extensions/memory-core/src/memory/manager-watch-ops.ts
const MEMORY_WATCH_PRESSURE_STARTUP_CHECK_DELAY_MS = 1e4;
const IGNORED_MEMORY_WATCH_DIR_NAMES = /* @__PURE__ */ new Set([
	".git",
	"node_modules",
	".pnpm-store",
	".venv",
	"venv",
	".tox",
	"__pycache__"
]);
const log$9 = createSubsystemLogger("memory");
const TEST_MEMORY_WATCH_FACTORY_KEY = Symbol.for("openclaw.test.memoryWatchFactory");
const TEST_MEMORY_NATIVE_WATCH_FACTORY_KEY = Symbol.for("openclaw.test.memoryNativeWatchFactory");
function resolveMemoryWatchFactory() {
	if (process.env.VITEST === "true" || false) {
		const override = globalThis[TEST_MEMORY_WATCH_FACTORY_KEY];
		if (typeof override === "function") return override;
	}
	return chokidar.watch.bind(chokidar);
}
function resolveMemoryNativeWatchFactory() {
	if (process.env.VITEST === "true" || false) {
		const override = globalThis[TEST_MEMORY_NATIVE_WATCH_FACTORY_KEY];
		if (typeof override === "function") return override;
	}
	return fs.watch.bind(fs);
}
function shouldIgnoreMemoryWatchPath(watchPath, stats, multimodalSettings) {
	const normalized = path.normalize(watchPath);
	if (normalized.split(path.sep).map((segment) => normalizeLowercaseStringOrEmpty(segment)).some((segment) => IGNORED_MEMORY_WATCH_DIR_NAMES.has(segment))) return true;
	if (stats?.isDirectory?.()) return false;
	if (!stats) return false;
	const extension = normalizeLowercaseStringOrEmpty(path.extname(normalized));
	if (extension.length === 0 || extension === ".md") return false;
	if (!multimodalSettings) return true;
	return classifyMemoryMultimodalPath(normalized, multimodalSettings) === null;
}
function runDetachedMemorySync(sync, reason) {
	sync().catch((err) => {
		log$9.warn(`memory sync failed (${reason}): ${String(err)}`);
	});
}
var MemoryManagerWatchOps = class extends MemoryManagerSyncBase {
	constructor(..._args) {
		super(..._args);
		this.nativeMemoryWatchPairs = [];
		this.memoryWatchPressureWarning = { shown: false };
	}
	ensureWatcher() {
		if (!this.sources.has("memory") || !this.settings.sync.watch) return;
		if (this.watcher || this.nativeMemoryWatchPairs.length > 0) return;
		const fileWatchPaths = /* @__PURE__ */ new Set([path.join(this.workspaceDir, "MEMORY.md"), path.join(this.workspaceDir, "USER.md")]);
		const memoryDir = path.join(this.workspaceDir, "memory");
		const dirWatchPaths = /* @__PURE__ */ new Set([memoryDir]);
		const additionalPaths = normalizeExtraMemoryPathEntries(this.workspaceDir, this.settings.extraPaths);
		for (const entry of additionalPaths) try {
			const stat = fs.lstatSync(entry.path);
			if (stat.isSymbolicLink()) continue;
			if (stat.isDirectory()) {
				dirWatchPaths.add(entry.path);
				continue;
			}
			if (stat.isFile() && (normalizeLowercaseStringOrEmpty(entry.path).endsWith(".md") || classifyMemoryMultimodalPath(entry.path, this.settings.multimodal) !== null)) fileWatchPaths.add(entry.path);
		} catch {}
		const markDirty = (watchPath, stats) => {
			if (watchPath && stats && !stats.isDirectory?.()) {
				const normalizedWatchPath = path.resolve(watchPath);
				const matchingEntries = isPathInside(memoryDir, normalizedWatchPath) ? [] : additionalPaths.filter((entry) => isPathInside(entry.path, normalizedWatchPath));
				if (matchingEntries.length > 0 && !matchingEntries.some((entry) => matchesExtraMemoryPathEntry(entry, normalizedWatchPath))) return;
			}
			recordMemoryWatchEventPath(this.pendingWatchPaths, watchPath, stats);
			this.dirty = true;
			this.scheduleWatchSync();
		};
		const nativeRecursiveSupported = process.platform === "darwin" || process.platform === "win32";
		for (const dir of dirWatchPaths) if ((nativeRecursiveSupported ? this.attachNativeMemoryWatchForDir(dir, markDirty) : process.platform === "linux" ? this.attachLinuxMemoryDirectoryTreeWatchForDir(dir, markDirty) : "failed") !== "attached") fileWatchPaths.add(dir);
		if (fileWatchPaths.size > 0) this.attachMemoryChokidarPaths(Array.from(fileWatchPaths), markDirty);
		this.scheduleMemoryWatchPressureStartupCheck();
	}
	scheduleMemoryWatchPressureStartupCheck() {
		if (this.memoryWatchPressureStartupTimer || this.memoryWatchPressureWarning.shown || this.closed || this.nativeMemoryWatchPairs.length === 0 && !this.watcher) return;
		this.memoryWatchPressureStartupTimer = setTimeout(() => {
			this.memoryWatchPressureStartupTimer = null;
			if (this.closed || this.memoryWatchPressureWarning.shown) return;
			if (this.watcher) this.warnIfMemoryWatchPressure(countChokidarWatchedEntries(this.watcher), "paths");
			if (this.memoryWatchPressureWarning.shown) return;
			let directoryCount = 0;
			for (const pair of this.nativeMemoryWatchPairs) directoryCount += pair.treeWatchers?.size ?? 0;
			this.warnIfMemoryWatchPressure(directoryCount, "directories");
		}, MEMORY_WATCH_PRESSURE_STARTUP_CHECK_DELAY_MS);
	}
	warnIfMemoryWatchPressure(count, unit) {
		warnIfMemoryWatchPressureHigh(this.memoryWatchPressureWarning, count, unit, "Large memory folders or extraPaths can make OpenClaw run out of file watchers or open files.", "Remove large extraPaths, or set memory.search.sync.watch to false and refresh memory manually.", (message) => log$9.warn(message));
	}
	attachNativeMemoryWatchForDir(dir, markDirty) {
		if (this.closed) return "failed";
		let recordedInode;
		try {
			recordedInode = fs.statSync(dir).ino;
		} catch (err) {
			return isFileMissingError(err) ? "missing" : "failed";
		}
		const pair = {
			dir,
			main: null,
			parent: null
		};
		let mainWatcher;
		try {
			mainWatcher = resolveMemoryNativeWatchFactory()(dir, { recursive: true }, (_eventType, filename) => {
				if (this.closed || mainWatcher && pair.main !== mainWatcher) return;
				if (filename == null) {
					markDirty();
					return;
				}
				const full = path.join(dir, filename);
				let stats;
				try {
					stats = fs.lstatSync(full, { throwIfNoEntry: false }) ?? void 0;
				} catch {
					stats = void 0;
				}
				if (shouldIgnoreMemoryWatchPath(full, stats, this.settings.multimodal)) return;
				markDirty(full, stats);
			});
		} catch (err) {
			if (isFileMissingError(err)) return "missing";
			log$9.warn(`failed to start native recursive watcher on ${dir}: ${String(err)}; falling back to chokidar`);
			return "failed";
		}
		pair.main = mainWatcher;
		mainWatcher.on("error", (err) => {
			if (pair.main !== mainWatcher) return;
			const message = err instanceof Error ? err.message : String(err);
			log$9.warn(`memory native watcher error on ${dir}: ${message}`);
			this.closeNativeMemoryWatchPair(pair);
			if (this.closed) return;
			markDirty();
			this.attachMemoryChokidarFallback(dir, markDirty);
		});
		this.nativeMemoryWatchPairs.push(pair);
		this.attachNativeMemoryParentWatch(pair, recordedInode, markDirty, "native", () => this.attachNativeMemoryWatchForDir(dir, markDirty));
		return "attached";
	}
	attachNativeMemoryParentWatch(pair, recordedInode, markDirty, label, reattach) {
		const { dir } = pair;
		let watchedInode = recordedInode;
		try {
			const parentDir = path.dirname(dir);
			const baseName = path.basename(dir);
			const parentInode = fs.statSync(parentDir).ino;
			let parentWatcher = null;
			parentWatcher = resolveMemoryNativeWatchFactory()(parentDir, { recursive: false }, (_eventType, filename) => {
				if (this.closed || parentWatcher && pair.parent !== parentWatcher) return;
				if (filename !== null && filename !== baseName && (pair.main || filename !== path.basename(parentDir))) return;
				let currentInode = null;
				let result = "missing";
				try {
					currentInode = fs.statSync(dir).ino;
				} catch (err) {
					result = isFileMissingError(err) ? "missing" : "failed";
					if (result === "missing") try {
						if (fs.statSync(parentDir).ino !== parentInode) result = "failed";
					} catch {
						result = "failed";
					}
				}
				if (currentInode === watchedInode && result !== "failed") return;
				this.closeNativeMemoryWatchChildren(pair);
				watchedInode = null;
				markDirty();
				if (currentInode !== null) result = reattach();
				if (result === "missing") return;
				this.closeNativeMemoryWatchPair(pair);
				if (result === "failed") this.attachMemoryChokidarFallback(dir, markDirty);
			});
			const attachedParent = parentWatcher;
			attachedParent.on("error", (err) => {
				if (pair.parent !== attachedParent) return;
				const message = err instanceof Error ? err.message : String(err);
				log$9.warn(`memory ${label} parent watcher error on ${path.dirname(dir)}: ${message}`);
				try {
					attachedParent.close();
				} catch {}
				pair.parent = null;
				if (!pair.main) {
					this.closeNativeMemoryWatchPair(pair);
					if (!this.closed) {
						markDirty();
						this.attachMemoryChokidarFallback(dir, markDirty);
					}
				}
			});
			pair.parent = attachedParent;
		} catch (err) {
			log$9.warn(`memory ${label} parent watcher could not start on ${path.dirname(dir)}: ${String(err)}`);
		}
	}
	attachLinuxMemoryDirectoryTreeWatchForDir(dir, markDirty) {
		if (this.closed) return "failed";
		let recordedInode;
		try {
			recordedInode = fs.statSync(dir).ino;
		} catch (err) {
			return isFileMissingError(err) ? "missing" : "failed";
		}
		let pair = null;
		const treeWatchers = /* @__PURE__ */ new Map();
		let rootMissing = false;
		const closeAndFallback = (message) => {
			log$9.warn(message);
			if (pair) this.closeNativeMemoryWatchPair(pair);
			if (this.closed) return;
			markDirty();
			this.attachMemoryChokidarFallback(dir, markDirty);
		};
		const closeDirectorySubtree = (watchDir) => {
			const watchDirPrefix = `${watchDir}${path.sep}`;
			for (const [entryDir, entry] of Array.from(treeWatchers.entries())) {
				if (entryDir !== watchDir && !entryDir.startsWith(watchDirPrefix)) continue;
				try {
					entry.watcher.close();
				} catch {}
				treeWatchers.delete(entryDir);
			}
		};
		const attachDirectory = (watchDir) => {
			if (this.closed) return null;
			let currentInode;
			try {
				const currentStat = fs.statSync(watchDir);
				if (!currentStat.isDirectory()) return null;
				currentInode = currentStat.ino;
			} catch (err) {
				rootMissing ||= watchDir === dir && isFileMissingError(err);
				return null;
			}
			const existing = treeWatchers.get(watchDir);
			if (existing) {
				if (existing.ino === currentInode) return existing.watcher;
				closeDirectorySubtree(watchDir);
			}
			let watcher;
			try {
				watcher = resolveMemoryNativeWatchFactory()(watchDir, { recursive: false }, (eventType, filename) => {
					if (this.closed || watcher && treeWatchers.get(watchDir)?.watcher !== watcher) return;
					if (filename == null) {
						markDirty();
						if (!this.attachLinuxMemoryDirectoryTreeSubtree(watchDir, attachDirectory)) closeAndFallback(`failed to refresh Linux memory directory watchers under ${watchDir}; falling back to chokidar`);
						return;
					}
					const full = path.join(watchDir, filename);
					let stats;
					try {
						stats = fs.lstatSync(full, { throwIfNoEntry: false }) ?? void 0;
					} catch {
						stats = void 0;
					}
					if (!stats) closeDirectorySubtree(full);
					if (stats?.isDirectory()) {
						if (eventType === "rename") closeDirectorySubtree(full);
						if (!this.attachLinuxMemoryDirectoryTreeSubtree(full, attachDirectory)) {
							closeAndFallback(`failed to attach Linux memory directory watcher under ${full}; falling back to chokidar`);
							return;
						}
					}
					if (shouldIgnoreMemoryWatchPath(full, stats, this.settings.multimodal)) return;
					markDirty(full, stats);
				});
			} catch (err) {
				rootMissing ||= watchDir === dir && isFileMissingError(err);
				if (watchDir === dir && !rootMissing) log$9.warn(`failed to start Linux memory directory watcher on ${watchDir}: ${String(err)}; falling back to chokidar`);
				return null;
			}
			treeWatchers.set(watchDir, {
				watcher,
				ino: currentInode
			});
			watcher.on("error", (err) => {
				if (treeWatchers.get(watchDir)?.watcher !== watcher) return;
				const detail = err instanceof Error ? err.message : String(err);
				closeAndFallback(`memory Linux directory watcher error on ${watchDir}: ${detail}`);
			});
			return watcher;
		};
		const mainWatcher = attachDirectory(dir);
		if (!mainWatcher) return rootMissing ? "missing" : "failed";
		pair = {
			dir,
			main: mainWatcher,
			parent: null,
			treeWatchers
		};
		this.nativeMemoryWatchPairs.push(pair);
		let subtreeAttached = this.attachLinuxMemoryDirectoryTreeSubtree(dir, attachDirectory);
		try {
			subtreeAttached = fs.statSync(dir).ino === recordedInode && subtreeAttached;
		} catch (err) {
			this.closeNativeMemoryWatchPair(pair);
			if (!this.closed) markDirty();
			return isFileMissingError(err) ? "missing" : "failed";
		}
		if (!subtreeAttached) {
			closeAndFallback(`failed to attach Linux memory directory watcher subtree under ${dir}; falling back to chokidar`);
			return "attached";
		}
		this.attachNativeMemoryParentWatch(pair, recordedInode, markDirty, "Linux", () => this.attachLinuxMemoryDirectoryTreeWatchForDir(dir, markDirty));
		return "attached";
	}
	attachLinuxMemoryDirectoryTreeSubtree(root, attachDirectory) {
		let rootStats;
		try {
			rootStats = fs.lstatSync(root, { throwIfNoEntry: false }) ?? void 0;
		} catch {
			return false;
		}
		if (!rootStats?.isDirectory() || shouldIgnoreMemoryWatchPath(root, rootStats, this.settings.multimodal)) return true;
		if (!attachDirectory(root)) return false;
		let entries;
		try {
			entries = fs.readdirSync(root, { withFileTypes: true });
		} catch {
			return false;
		}
		for (const entry of entries) {
			if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
			if (!this.attachLinuxMemoryDirectoryTreeSubtree(path.join(root, entry.name), attachDirectory)) return false;
		}
		return true;
	}
	closeNativeMemoryWatchChildren(pair) {
		if (pair.treeWatchers) {
			for (const entry of pair.treeWatchers.values()) try {
				entry.watcher.close();
			} catch {}
			pair.treeWatchers.clear();
		} else try {
			pair.main?.close();
		} catch {}
		pair.main = null;
	}
	closeNativeMemoryWatchPair(pair) {
		this.closeNativeMemoryWatchChildren(pair);
		if (pair.parent) {
			try {
				pair.parent.close();
			} catch {}
			pair.parent = null;
		}
		this.removeNativeMemoryWatchPair(pair);
	}
	closeNativeMemoryWatchPairs() {
		while (this.nativeMemoryWatchPairs.length > 0) {
			const pair = this.nativeMemoryWatchPairs[0];
			if (!pair) return;
			this.closeNativeMemoryWatchPair(pair);
		}
	}
	removeNativeMemoryWatchPair(pair) {
		const idx = this.nativeMemoryWatchPairs.indexOf(pair);
		if (idx >= 0) this.nativeMemoryWatchPairs.splice(idx, 1);
	}
	attachMemoryChokidarFallback(dir, markDirty) {
		if (this.closed) return;
		try {
			this.attachMemoryChokidarPaths(dir, markDirty);
		} catch (err) {
			log$9.warn(`failed to attach chokidar fallback for ${dir}: ${String(err)}`);
		}
	}
	attachMemoryChokidarPaths(paths, markDirty) {
		if (this.watcher) {
			this.watcher.add(paths);
			return;
		}
		const watcher = resolveMemoryWatchFactory()(typeof paths === "string" ? [paths] : paths, {
			ignoreInitial: true,
			ignored: (watchPath, stats) => shouldIgnoreMemoryWatchPath(watchPath, stats, this.settings.multimodal)
		});
		this.watcher = watcher;
		watcher.on("add", markDirty);
		watcher.on("change", markDirty);
		watcher.on("unlink", markDirty);
		watcher.on("unlinkDir", markDirty);
		watcher.on("error", (err) => {
			const message = err instanceof Error ? err.message : String(err);
			log$9.warn(`memory watcher error: ${message}`);
		});
		watcher.once("ready", () => {
			this.warnIfMemoryWatchPressure(countChokidarWatchedEntries(watcher), "paths");
		});
	}
	ensureIntervalSync() {
		const minutes = this.settings.sync.intervalMinutes;
		if (!minutes || minutes <= 0 || this.intervalTimer) return;
		const ms = resolveTimerTimeoutMs(minutes * 60 * 1e3, 0, 0);
		if (ms <= 0) return;
		this.intervalTimer = setInterval(() => {
			runDetachedMemorySync(() => this.sync({ reason: "interval" }), "interval");
		}, ms);
	}
	scheduleWatchSync() {
		if (!this.sources.has("memory") || !this.settings.sync.watch) return;
		if (this.watchTimer) clearTimeout(this.watchTimer);
		this.watchTimer = setTimeout(() => {
			this.watchTimer = null;
			runDetachedMemorySync(async () => {
				if (this.closed) return;
				if (!await settleMemoryWatchEventPaths(this.pendingWatchPaths)) {
					if (!this.closed) this.scheduleWatchSync();
					return;
				}
				if (this.closed) return;
				await this.sync({ reason: "watch" });
			}, "watch");
		}, this.settings.sync.watchDebounceMs);
	}
};
//#endregion
//#region extensions/memory-core/src/memory/manager-session-sync-ops.ts
const SESSION_DIRTY_DEBOUNCE_MS = 5e3;
const log$8 = createSubsystemLogger("memory");
var MemoryManagerSessionSyncOps = class extends MemoryManagerWatchOps {
	async inspectDiagnosticSourceState() {
		if (this.sources.has("memory")) try {
			const inspection = await inspectMemorySourceState({
				db: this.db,
				workspaceDir: this.workspaceDir,
				settings: this.settings,
				concurrency: this.getIndexConcurrency()
			});
			this.sourceInspections.set("memory", inspection);
			this.dirty ||= inspection.dirty;
		} catch (error) {
			this.sourceInspections.set("memory", {
				eligible: null,
				issues: [String(error)]
			});
			this.dirty = true;
		}
		if (this.sources.has("sessions")) try {
			await this.markSessionStartupCatchupDirtyFiles(true);
		} catch (error) {
			this.sourceInspections.set("sessions", {
				eligible: null,
				issues: [String(error)]
			});
			this.sessionsDirty = true;
		}
	}
	async listSessionCorpusEntries() {
		const readOnly = isMemoryDatabaseReadOnly(this.db);
		const entries = await listSessionTranscriptCorpusEntriesForAgent(this.agentId, {
			includeContentRevision: !readOnly,
			readOnly
		});
		const archivedSessions = new Map(listSessionTranscriptArchivesReadOnly({
			agentId: this.agentId,
			storePath: resolveSessionStorePathCore(this.cfg.session?.store, { agentId: this.agentId }),
			sessionIds: entries.filter((entry) => entry.artifactKind === "archive-artifact").map((entry) => entry.sessionId)
		}).map((archive) => [archive.archiveName, archive]));
		const forgottenSessions = new Set(listMemorySessionTombstones({
			agentId: this.agentId,
			sessionIds: entries.map((entry) => entry.sessionId)
		}).map((entry) => entry.sessionId));
		return entries.filter((entry) => {
			const archive = archivedSessions.get(path.basename(entry.sessionFile));
			const archivedSessionKey = archive?.sessionId === entry.sessionId ? archive.sessionKey : void 0;
			return !forgottenSessions.has(entry.sessionId) && isMemorySessionIndexable(entry, archivedSessionKey);
		});
	}
	sessionPathForCorpusEntry(entry) {
		return entry.transcriptSource === "sqlite" ? sessionPathForSessionIdentity(entry.agentId, entry.sessionId) : sessionPathForFile(entry.sessionFile);
	}
	legacyExtensionlessSessionPathForIdentity(agentId, sessionId) {
		return path.join("sessions", normalizeAgentId(agentId), sessionId).replace(/\\/g, "/");
	}
	buildSessionEntryOptions(entry) {
		return {
			generatedByDreamingNarrative: entry.generatedByDreamingNarrative === true,
			generatedByCronRun: entry.generatedByCronRun === true,
			...entry.sessionKind ? { sessionKind: entry.sessionKind } : {},
			...entry.transcriptSource === "sqlite" && entry.storePath ? {
				agentId: entry.agentId,
				sessionId: entry.sessionId,
				storePath: entry.storePath
			} : {},
			...entry.sessionKey ? { sessionKey: entry.sessionKey } : {},
			...entry.updatedAtMs !== void 0 ? { updatedAtMs: entry.updatedAtMs } : {}
		};
	}
	ensureSessionListener() {
		if (!this.sources.has("sessions") || this.sessionUnsubscribe) return;
		this.sessionUnsubscribe = this.subscribeSessionTranscriptUpdates((update) => runInMemoryBackgroundContext(() => {
			if (this.closed) return;
			const target = this.resolveSessionTranscriptUpdateSyncTarget(update);
			if (target) {
				this.scheduleSessionDirty(target);
				return;
			}
			if (update.sessionFile) this.scheduleCorpusSessionFileDirty(update.sessionFile).catch((err) => {
				log$8.warn(`memory session corpus update failed: ${String(err)}`);
			});
		}));
	}
	subscribeSessionTranscriptUpdates(listener) {
		return onInternalSessionTranscriptUpdate(listener);
	}
	async scheduleCorpusSessionFileDirty(sessionFile) {
		const resolvedSessionFile = path.resolve(sessionFile);
		if ((await this.listSessionCorpusEntries()).some((entry) => entry.transcriptSource !== "sqlite" && path.resolve(entry.sessionFile) === resolvedSessionFile)) this.scheduleSessionDirty(resolvedSessionFile);
	}
	ensureSessionStartupCatchup() {
		if (!this.sources.has("sessions")) return;
		this.runSessionStartupCatchup().catch((err) => {
			log$8.warn("memory session startup catch-up failed: " + String(err));
		});
	}
	async markSessionStartupCatchupDirtyFiles(inspectSources = false) {
		if (!this.sources.has("sessions") || this.closed) return [];
		const corpusEntries = await this.listSessionCorpusEntries();
		if (this.closed) return [];
		const existingRows = loadMemorySourceFileState({
			db: this.db,
			source: "sessions"
		}).rows;
		const readOnly = isMemoryDatabaseReadOnly(this.db);
		const sqliteCorpusEntries = readOnly ? corpusEntries.filter((entry) => entry.transcriptSource === "sqlite") : [];
		const readOnlyStats = readOnly ? readTranscriptStatsBatchReadOnlySync(sqliteCorpusEntries.map((entry) => ({
			agentId: entry.agentId,
			sessionId: entry.sessionId,
			...entry.sessionKey ? { sessionKey: entry.sessionKey } : {},
			...entry.storePath ? { storePath: entry.storePath } : {}
		}))) : [];
		const readOnlyStatsByEntry = new Map(sqliteCorpusEntries.map((entry, index) => [entry, readOnlyStats[index]]));
		const fileStates = (await runMemoryHostTasksWithConcurrency(corpusEntries.map((corpusEntry) => async () => {
			if (corpusEntry.transcriptSource === "sqlite") {
				if (readOnly) {
					const stats = readOnlyStatsByEntry.get(corpusEntry);
					return stats ? {
						absPath: corpusEntry.sessionFile,
						path: sessionPathForSessionIdentity(corpusEntry.agentId, corpusEntry.sessionId),
						mtimeMs: corpusEntry.updatedAtMs ?? stats.maxSeq,
						size: stats.sizeBytes
					} : null;
				}
				return statSessionEntrySync(corpusEntry.sessionFile, this.buildSessionEntryOptions(corpusEntry));
			}
			const file = corpusEntry.sessionFile;
			try {
				const stat = await fs$1.stat(file);
				if (!stat.isFile()) return null;
				return {
					absPath: file,
					path: this.sessionPathForCorpusEntry(corpusEntry),
					mtimeMs: stat.mtimeMs,
					size: stat.size
				};
			} catch (err) {
				if (isFileMissingError(err)) return null;
				throw err;
			}
		}), this.getIndexConcurrency())).filter((file) => file !== null);
		const { dirtyFiles, hasStaleIndexedPaths } = resolveMemorySessionStartupState({
			files: fileStates,
			existingRows
		});
		if (inspectSources) this.sourceInspections.set("sessions", {
			eligible: fileStates.length,
			issues: fileStates.length === 0 ? ["no eligible session transcripts found"] : []
		});
		if (this.closed) return dirtyFiles;
		if (hasStaleIndexedPaths) {
			this.sessionsDirty = true;
			this.sessionsReconcileDirty = true;
		}
		for (const file of dirtyFiles) this.sessionsDirtyFiles.add(file);
		if (dirtyFiles.length > 0) this.sessionsDirty = true;
		return dirtyFiles;
	}
	async runSessionStartupCatchup() {
		const dirtyFiles = await this.markSessionStartupCatchupDirtyFiles();
		if (!this.sessionsDirty || this.closed) return dirtyFiles;
		this.sync({ reason: "session-startup-catchup" }).catch((err) => {
			log$8.warn("memory sync failed (session-startup-catchup): " + String(err));
		});
		return dirtyFiles;
	}
	scheduleSessionDirty(target) {
		if (typeof target === "string") this.sessionPendingFiles.add(target);
		else this.sessionPendingTargets.set(this.memorySessionSyncTargetKey(target), target);
		if (this.sessionWatchTimer) return;
		this.sessionWatchTimer = setTimeout(() => {
			this.sessionWatchTimer = null;
			this.processSessionUpdateBatch().catch((err) => {
				log$8.warn(`memory session update failed: ${String(err)}`);
			});
		}, SESSION_DIRTY_DEBOUNCE_MS);
	}
	async processSessionUpdateBatch() {
		if (this.sessionPendingFiles.size === 0 && this.sessionPendingTargets.size === 0) return;
		const pending = Array.from(this.sessionPendingFiles);
		const pendingTargets = Array.from(this.sessionPendingTargets.values());
		this.sessionPendingFiles.clear();
		this.sessionPendingTargets.clear();
		pending.push(...Array.from(await this.resolveArchiveFilesForSyncTargets(pendingTargets)));
		for (const sessionFile of pending) this.sessionsDirtyFiles.add(sessionFile);
		if (pending.length > 0) {
			this.sessionsDirty = true;
			this.sync({
				reason: "session-delta",
				sessions: pendingTargets,
				archiveFiles: pending
			}).catch((err) => {
				log$8.warn(`memory sync failed (session update): ${String(err)}`);
			});
		}
	}
	resolveSessionTranscriptUpdateSyncTarget(update) {
		if (!update.target) return null;
		const agentId = update.target.agentId.trim();
		const sessionId = update.target.sessionId.trim();
		const sessionKey = update.target.sessionKey.trim();
		if (!agentId || !sessionId || normalizeAgentId(agentId) !== normalizeAgentId(this.agentId)) return null;
		return {
			agentId,
			sessionId,
			...sessionKey ? { sessionKey } : {}
		};
	}
	normalizeTargetArchiveFiles(archiveFiles, corpusEntries = [], includeSqlite = false) {
		if (!archiveFiles || archiveFiles.length === 0) return null;
		const normalized = /* @__PURE__ */ new Set();
		const corpusPaths = new Map(corpusEntries.filter((entry) => includeSqlite || entry.transcriptSource !== "sqlite").map((entry) => [entry.transcriptSource === "sqlite" ? entry.sessionFile : path.resolve(entry.sessionFile), entry.sessionFile]));
		for (const sessionFile of archiveFiles) {
			const trimmed = sessionFile.trim();
			if (!trimmed) continue;
			const corpusPath = corpusPaths.get(trimmed) ?? corpusPaths.get(path.resolve(trimmed));
			if (corpusPath) normalized.add(corpusPath);
		}
		return normalized.size > 0 ? normalized : null;
	}
	async resolveArchiveFilesForSyncTargets(sessions, knownCorpusEntries) {
		const files = /* @__PURE__ */ new Set();
		const targets = Array.from(sessions ?? []);
		if (targets.length === 0) return files;
		const corpusEntries = knownCorpusEntries ?? await this.listSessionCorpusEntries();
		for (const rawSession of targets) {
			const sessionId = rawSession.sessionId.trim();
			const agentId = rawSession.agentId?.trim() || this.agentId;
			if (!sessionId || normalizeAgentId(agentId) !== normalizeAgentId(this.agentId)) continue;
			const sessionKey = rawSession.sessionKey?.trim();
			const matchingEntries = corpusEntries.filter((entry) => normalizeAgentId(entry.agentId) === normalizeAgentId(this.agentId) && entry.sessionId === sessionId && (!sessionKey || entry.sessionKey === sessionKey));
			for (const entry of matchingEntries) files.add(entry.transcriptSource === "sqlite" ? entry.sessionFile : path.resolve(entry.sessionFile));
		}
		return files;
	}
	async resolveTargetSessionSyncPlan(params) {
		const files = /* @__PURE__ */ new Set();
		const corpusEntries = await this.listSessionCorpusEntries();
		for (const file of this.normalizeTargetArchiveFiles(params.archiveFiles, corpusEntries) ?? []) files.add(file);
		for (const file of await this.resolveArchiveFilesForSyncTargets(params.sessions, corpusEntries)) files.add(file);
		return files.size > 0 ? {
			corpusEntries,
			targetArchiveFiles: files
		} : null;
	}
	memorySessionSyncTargetKey(target) {
		return [
			target.agentId ?? "",
			target.sessionId,
			target.sessionKey ?? ""
		].join("\0");
	}
	shouldSyncSessions(params, needsFullReindex = false) {
		return shouldSyncSessionsForReindex({
			hasSessionSource: this.sources.has("sessions"),
			sessionsDirty: this.sessionsDirty,
			sessionsFullRetryDirty: this.sessionsFullRetryDirty,
			sync: params,
			needsFullReindex
		});
	}
};
//#endregion
//#region extensions/memory-core/src/memory/manager-source-sync-ops.ts
const FTS_TABLE$3 = MEMORY_INDEX_FTS_TABLE;
const SESSION_SYNC_YIELD_EVERY = 10;
const SOURCE_WIDE_SESSION_INDEX_FLUSH_FILES = 128;
const log$7 = createSubsystemLogger("memory");
function createSessionSyncYield(total) {
	let completed = 0;
	return async () => {
		completed += 1;
		if (completed < total && completed % SESSION_SYNC_YIELD_EVERY === 0) await new Promise((resolve) => {
			setImmediate(resolve);
		});
	};
}
var MemoryManagerSourceSyncOps = class extends MemoryManagerSessionSyncOps {
	async syncMemoryFiles(params) {
		const deleteFileByPathAndSource = this.db.prepare(`DELETE FROM memory_index_sources WHERE path = ? AND source = ?`);
		const deleteChunksByPathAndSource = this.db.prepare(`DELETE FROM memory_index_chunks WHERE path = ? AND source = ?`);
		const deleteFtsRowsByPathAndSource = this.fts.enabled && this.fts.available ? this.db.prepare(`DELETE FROM ${FTS_TABLE$3} WHERE path = ? AND source = ?`) : null;
		const fileEntries = await resolveMemorySourceFileEntries({
			workspaceDir: this.workspaceDir,
			settings: this.settings,
			concurrency: this.getIndexConcurrency()
		});
		log$7.debug("memory sync: indexing memory files", {
			files: fileEntries.length,
			needsFullReindex: params.needsFullReindex,
			batch: this.batch.enabled,
			concurrency: this.getIndexConcurrency()
		});
		const existingState = loadMemorySourceFileState({
			db: this.db,
			source: "memory"
		});
		const existingRows = existingState.rows;
		const existingHashes = existingState.hashes;
		const activePaths = new Set(fileEntries.map((entry) => entry.path));
		if (params.progress) {
			params.progress.total += fileEntries.length;
			params.progress.report({
				completed: params.progress.completed,
				total: params.progress.total,
				label: this.batch.enabled ? "Indexing memory files (batch)..." : "Indexing memory files…"
			});
		}
		const deleteStaleRows = async () => {
			for (const stale of existingRows) {
				if (activePaths.has(stale.path)) continue;
				deleteFileByPathAndSource.run(stale.path, "memory");
				this.deleteVectorRowsForSource(stale.path, "memory");
				deleteChunksByPathAndSource.run(stale.path, "memory");
				if (deleteFtsRowsByPathAndSource) try {
					deleteFtsRowsByPathAndSource.run(stale.path, "memory");
				} catch {}
			}
		};
		if (this.batch.enabled) {
			const dirtyEntries = [];
			for (const entry of fileEntries) {
				if (!params.needsFullReindex && existingHashes.get(entry.path) === entry.hash) {
					this.advanceSyncProgress(params.progress);
					continue;
				}
				dirtyEntries.push(entry);
			}
			const indexItems = dirtyEntries.map((entry) => ({
				entry,
				source: "memory"
			}));
			if (params.deferIndex) return {
				indexItems,
				finalize: deleteStaleRows
			};
			await this.indexQueuedFiles(indexItems, params.progress);
		} else {
			const tasks = fileEntries.map((entry) => async () => {
				if (!params.needsFullReindex && existingHashes.get(entry.path) === entry.hash) {
					this.advanceSyncProgress(params.progress);
					return;
				}
				await this.indexFile(entry, { source: "memory" });
				this.advanceSyncProgress(params.progress);
			});
			await runMemoryHostTasksWithConcurrency(tasks, this.getIndexConcurrency());
		}
		await deleteStaleRows();
		return this.emptySourceSyncPlan();
	}
	async syncArchiveFiles(params) {
		const deleteFileByPathAndSource = this.db.prepare(`DELETE FROM memory_index_sources WHERE path = ? AND source = ?`);
		const deleteChunksByPathAndSource = this.db.prepare(`DELETE FROM memory_index_chunks WHERE path = ? AND source = ?`);
		const updateUnchangedSessionSourceMetadata = this.db.prepare(`UPDATE memory_index_sources
       SET mtime = ?, size = ?
       WHERE path = ? AND source = 'sessions' AND hash = ?`);
		const refreshUnchangedSessionSourceMetadata = (entry) => {
			return updateUnchangedSessionSourceMetadata.run(entry.mtimeMs, entry.size, entry.path, entry.hash).changes === 1;
		};
		const canSkipUnchangedSessionEntry = (entry, absPath, existingHash) => {
			if (params.needsFullReindex || existingHash !== entry.hash) return false;
			return !this.sessionsDirtyFiles.has(absPath) || refreshUnchangedSessionSourceMetadata(entry);
		};
		const deleteFtsRowsByPathAndSource = this.fts.enabled && this.fts.available ? this.db.prepare(`DELETE FROM ${FTS_TABLE$3} WHERE path = ? AND source = ?`) : null;
		const corpusEntries = params.corpusEntries ?? await this.listSessionCorpusEntries();
		const targetArchiveFiles = params.needsFullReindex ? null : this.normalizeTargetArchiveFiles(params.targetArchiveFiles, corpusEntries, true);
		const corpusEntryByPath = new Map(corpusEntries.map((entry) => [entry.sessionFile, entry]));
		const corpusEntryForPath = (file) => {
			const entry = corpusEntryByPath.get(file);
			if (!entry) throw new Error(`Missing session corpus entry for ${file}`);
			return entry;
		};
		const files = targetArchiveFiles ? Array.from(targetArchiveFiles) : corpusEntries.map((entry) => entry.sessionFile);
		const { activePaths, existingRows, existingHashes, indexAll } = resolveMemorySessionSyncPlan({
			needsFullReindex: params.needsFullReindex,
			files,
			targetSessionFiles: targetArchiveFiles,
			existingRows: targetArchiveFiles ? null : loadMemorySourceFileState({
				db: this.db,
				source: "sessions"
			}).rows,
			sessionPathForFile: (file) => this.sessionPathForCorpusEntry(corpusEntryForPath(file))
		});
		log$7.debug("memory sync: indexing session files", {
			files: files.length,
			indexAll,
			dirtyFiles: this.sessionsDirtyFiles.size,
			targetedFiles: targetArchiveFiles?.size ?? 0,
			batch: this.batch.enabled,
			concurrency: this.getIndexConcurrency()
		});
		if (params.progress) {
			params.progress.total += files.length;
			params.progress.report({
				completed: params.progress.completed,
				total: params.progress.total,
				label: this.batch.enabled ? "Indexing session files (batch)..." : "Indexing session files…"
			});
		}
		const yieldAfterSessionFile = createSessionSyncYield(files.length);
		const deleteIndexedSessionPath = (memoryPath) => {
			deleteFileByPathAndSource.run(memoryPath, "sessions");
			this.deleteVectorRowsForSource(memoryPath, "sessions");
			deleteChunksByPathAndSource.run(memoryPath, "sessions");
			if (deleteFtsRowsByPathAndSource) try {
				deleteFtsRowsByPathAndSource.run(memoryPath, "sessions");
			} catch {}
		};
		const deleteStaleRows = async () => {
			if (activePaths === null) return;
			const staleRows = existingRows ?? [];
			const yieldAfterStaleSessionRow = createSessionSyncYield(staleRows.length);
			for (const stale of staleRows) try {
				if (activePaths.has(stale.path)) continue;
				deleteIndexedSessionPath(stale.path);
			} finally {
				await yieldAfterStaleSessionRow();
			}
		};
		const deleteTargetArchiveStaleLiveRows = () => {
			if (!targetArchiveFiles) return;
			const activeCorpusPaths = new Set(corpusEntries.filter((entry) => entry.artifactKind === "active-session").map((entry) => this.sessionPathForCorpusEntry(entry)));
			const existingSessionPaths = new Set(loadMemorySourceFileState({
				db: this.db,
				source: "sessions"
			}).rows.map((row) => row.path));
			for (const file of targetArchiveFiles) {
				const corpusEntry = corpusEntryForPath(file);
				const staleAgentId = corpusEntry.agentId;
				const staleLivePaths = [sessionPathForSessionIdentity(staleAgentId, corpusEntry.sessionId), this.legacyExtensionlessSessionPathForIdentity(staleAgentId, corpusEntry.sessionId)];
				for (const staleLivePath of staleLivePaths) {
					if (activeCorpusPaths.has(staleLivePath) || !existingSessionPaths.has(staleLivePath)) continue;
					deleteIndexedSessionPath(staleLivePath);
				}
			}
		};
		const resolveSessionIndexEntry = async (absPath) => {
			if (!indexAll && !this.sessionsDirtyFiles.has(absPath)) {
				this.advanceSyncProgress(params.progress);
				return null;
			}
			const entry = await buildSessionEntry(absPath, this.buildSessionEntryOptions(corpusEntryForPath(absPath)));
			if (!entry) {
				this.advanceSyncProgress(params.progress);
				return null;
			}
			if (!isMemorySessionIndexable(entry)) {
				deleteIndexedSessionPath(entry.path);
				this.advanceSyncProgress(params.progress);
				return null;
			}
			const existingHash = resolveMemorySourceExistingHash({
				db: this.db,
				source: "sessions",
				path: entry.path,
				existingHashes
			});
			if (canSkipUnchangedSessionEntry(entry, absPath, existingHash)) {
				this.advanceSyncProgress(params.progress);
				return null;
			}
			return {
				...entry,
				sessionId: corpusEntryForPath(absPath).sessionId
			};
		};
		if (params.deferIndex) {
			const pendingIndexItems = [...params.prefixIndexItems ?? []];
			const flushPendingIndexItems = async () => {
				if (pendingIndexItems.length === 0) return;
				const current = pendingIndexItems.splice(0);
				const sources = new Set(current.map((item) => item.source));
				await this.indexQueuedFiles(current, params.progress, sources.size > 1 ? "Indexing memory sources (batch)..." : void 0);
			};
			for (let start = 0; start < files.length; start += SOURCE_WIDE_SESSION_INDEX_FLUSH_FILES) {
				const fileBatch = files.slice(start, start + SOURCE_WIDE_SESSION_INDEX_FLUSH_FILES);
				const dirtyEntries = (await runMemoryHostTasksWithConcurrency(fileBatch.map((absPath) => async () => {
					try {
						return await resolveSessionIndexEntry(absPath);
					} finally {
						await yieldAfterSessionFile();
					}
				}), this.getIndexConcurrency())).filter((entry) => entry !== null);
				pendingIndexItems.push(...dirtyEntries.map((entry) => ({
					entry,
					source: "sessions"
				})));
				if (pendingIndexItems.length >= SOURCE_WIDE_SESSION_INDEX_FLUSH_FILES) await flushPendingIndexItems();
			}
			await flushPendingIndexItems();
			deleteTargetArchiveStaleLiveRows();
			await deleteStaleRows();
			return this.emptySourceSyncPlan();
		}
		if ((params.prefixIndexItems?.length ?? 0) > 0) throw new Error("Memory session sync prefix requires deferred source-wide indexing.");
		const tasks = files.map((absPath) => async () => {
			try {
				const entry = await resolveSessionIndexEntry(absPath);
				if (!entry) return;
				await this.indexFile(entry, {
					source: "sessions",
					content: entry.content
				});
				this.advanceSyncProgress(params.progress);
			} finally {
				await yieldAfterSessionFile();
			}
		});
		await runMemoryHostTasksWithConcurrency(tasks, this.getIndexConcurrency());
		deleteTargetArchiveStaleLiveRows();
		await deleteStaleRows();
		return this.emptySourceSyncPlan();
	}
};
//#endregion
//#region extensions/memory-core/src/memory/manager-targeted-sync.ts
function clearMemorySyncedArchiveFiles(params) {
	if (!params.targetArchiveFiles) params.sessionsDirtyFiles.clear();
	else for (const targetArchiveFile of params.targetArchiveFiles) params.sessionsDirtyFiles.delete(targetArchiveFile);
	return params.sessionsDirtyFiles.size > 0;
}
function markMemoryTargetArchiveFilesDirty(params) {
	if (params.targetArchiveFiles) for (const targetArchiveFile of params.targetArchiveFiles) params.sessionsDirtyFiles.add(targetArchiveFile);
	return params.sessionsDirtyFiles.size > 0;
}
async function runMemoryTargetedSessionSync(params) {
	const hasPendingSessionWork = (hasDirtyFiles = params.sessionsDirtyFiles.size > 0) => params.sessionsFullRetryDirty || params.sessionsReconcileDirty || hasDirtyFiles;
	if (!params.hasSessionSource || !params.targetArchiveFiles) return {
		handled: false,
		sessionsDirty: hasPendingSessionWork()
	};
	try {
		await params.syncArchiveFiles({
			needsFullReindex: false,
			targetArchiveFiles: Array.from(params.targetArchiveFiles),
			progress: params.progress
		});
		return {
			handled: true,
			sessionsDirty: hasPendingSessionWork(clearMemorySyncedArchiveFiles({
				sessionsDirtyFiles: params.sessionsDirtyFiles,
				targetArchiveFiles: params.targetArchiveFiles
			}))
		};
	} catch (err) {
		const reason = formatErrorMessage(err);
		if (!(params.shouldFallbackOnError(err) && await params.activateFallbackProvider(reason))) throw err;
		return {
			handled: true,
			sessionsDirty: hasPendingSessionWork(markMemoryTargetArchiveFilesDirty({
				sessionsDirtyFiles: params.sessionsDirtyFiles,
				targetArchiveFiles: params.targetArchiveFiles
			})),
			failure: { error: err }
		};
	}
}
//#endregion
//#region extensions/memory-core/src/memory/manager-sync-ops.ts
const log$6 = createSubsystemLogger("memory");
var MemoryManagerSyncOps = class extends MemoryManagerSourceSyncOps {
	constructor(..._args) {
		super(..._args);
		this.fallbackProviderInitPromise = null;
		this.syncProviderGeneration = null;
	}
	beginSyncProviderGeneration(_options) {}
	endSyncProviderGeneration() {}
	shouldDeferSourceWideBatch() {
		const generation = this.syncProviderGeneration;
		const provider = generation ? generation.provider : this.provider;
		const providerRuntime = generation ? generation.kind === "semantic" ? generation.runtime : void 0 : this.providerRuntime;
		return Boolean(this.batch.enabled && provider && providerRuntime?.batchEmbed && providerRuntime.sourceWideBatchEmbed === true);
	}
	async retireCurrentProvider() {
		const provider = this.provider;
		this.provider = null;
		this.providerRuntime = void 0;
		await provider?.close?.();
	}
	createSyncProgress(onProgress) {
		const state = {
			completed: 0,
			total: 0,
			label: void 0,
			report: (update) => {
				if (update.label) state.label = update.label;
				const label = update.total > 0 && state.label ? `${state.label} ${update.completed}/${update.total}` : state.label;
				onProgress({
					completed: update.completed,
					total: update.total,
					label
				});
			}
		};
		return state;
	}
	assertFtsOnlySyncAllowed() {
		if (this.syncProviderGeneration ? this.syncProviderGeneration.provider : this.provider) return;
		this.assertRequiredProviderAvailable("sync");
		const existingMeta = this.readMeta();
		if (!existingMeta || existingMeta.model === "fts-only" || !this.settings.provider || this.settings.provider === "none") return;
		this.resetProviderInitializationForRetry();
		throw new Error(`Memory sync aborted: embedding provider "${this.settings.provider}" is configured but unavailable. Refusing to run sync in fts-only fallback mode to protect existing vector index (current model: ${existingMeta.model}).`);
	}
	async runSync(params) {
		const hasTargetSessionRequest = this.hasRequestedTargetSessionSync(params);
		let needsFullReindex = Boolean(params?.force && !hasTargetSessionRequest);
		try {
			this.assertFtsOnlySyncAllowed();
			const syncProvider = this.syncProviderGeneration ? this.syncProviderGeneration.provider : this.provider;
			const progress = params?.progress ? this.createSyncProgress(params.progress) : void 0;
			if (progress) progress.report({
				completed: progress.completed,
				total: progress.total,
				label: "Loading vector extension…"
			});
			const vectorReady = syncProvider ? await this.ensureVectorReady() : false;
			const meta = this.readMeta();
			const targetSessionSync = hasTargetSessionRequest ? await this.resolveTargetSessionSyncPlan({
				sessions: params?.sessions,
				archiveFiles: params?.archiveFiles
			}) : null;
			const targetArchiveFiles = targetSessionSync?.targetArchiveFiles ?? null;
			const hasTargetArchiveFiles = targetArchiveFiles !== null;
			if (hasTargetSessionRequest && !hasTargetArchiveFiles) return;
			if (params?.reason === "cli" && !params.force && !hasTargetArchiveFiles) await this.markSessionStartupCatchupDirtyFiles();
			const syncProviderKey = this.syncProviderGeneration ? this.syncProviderGeneration.providerKey : this.providerKey;
			const syncProviderIdentities = this.syncProviderGeneration?.identities ?? this.resolveProviderIndexIdentities();
			const indexIdentity = resolveMemoryIndexIdentityState({
				meta,
				provider: syncProvider ? {
					id: syncProvider.id,
					model: syncProvider.model
				} : null,
				providerKey: syncProviderKey ?? void 0,
				providerAliases: syncProviderIdentities.slice(1),
				configuredSources: resolveConfiguredSourcesForMeta(this.sources),
				configuredScopeHash: resolveConfiguredScopeHash({
					workspaceDir: this.workspaceDir,
					extraPaths: this.settings.extraPaths,
					multimodal: {
						enabled: this.settings.multimodal.enabled,
						modalities: this.settings.multimodal.modalities,
						maxFileBytes: this.settings.multimodal.maxFileBytes
					}
				}),
				chunkTokens: this.settings.chunking.tokens,
				chunkOverlap: this.settings.chunking.overlap,
				vectorReady,
				hasIndexedChunks: this.hasIndexedChunks(),
				ftsTokenizer: this.settings.store.fts.tokenizer
			});
			const hasIndexedChunks = this.hasIndexedChunks();
			const needsInitialIndex = indexIdentity.status !== "valid" && !hasIndexedChunks;
			const hasOnlyFtsChunks = indexIdentity.status === "missing" && hasIndexedChunks && syncProvider === null && Boolean(this.settings.provider) && this.settings.provider !== "none" && !this.hasSemanticChunks();
			const canRebuildMissingIdentity = syncProvider !== null || !this.settings.provider || this.settings.provider === "none" || hasOnlyFtsChunks;
			const needsMissingIdentityReindex = indexIdentity.status === "missing" && !hasTargetArchiveFiles && canRebuildMissingIdentity;
			const needsExplicitIdentityReindex = params?.reason === "cli" && indexIdentity.status !== "valid" && !hasTargetArchiveFiles;
			const needsChunkingVersionReindex = meta !== null && meta.chunkingVersion !== 3 && !hasTargetArchiveFiles;
			const canRunRetryFullReindex = indexIdentity.status !== "missing" || needsInitialIndex || canRebuildMissingIdentity;
			needsFullReindex = params?.force && !hasTargetArchiveFiles || needsInitialIndex || needsMissingIdentityReindex || needsExplicitIdentityReindex || needsChunkingVersionReindex || this.memoryFullRetryDirty && canRunRetryFullReindex || this.sessionsFullRetryDirty && indexIdentity.status !== "valid" && canRunRetryFullReindex;
			const needsFullSessionReindex = needsFullReindex || this.sessionsFullRetryDirty;
			if (indexIdentity.status !== "valid" && !needsFullReindex) {
				this.dirty = true;
				if (markMemoryTargetArchiveFilesDirty({
					sessionsDirtyFiles: this.sessionsDirtyFiles,
					targetArchiveFiles
				})) this.sessionsDirty = true;
				return;
			}
			if (!needsFullSessionReindex) {
				const targetedSessionSync = await runMemoryTargetedSessionSync({
					hasSessionSource: this.sources.has("sessions"),
					targetArchiveFiles,
					reason: params?.reason,
					progress: progress ?? void 0,
					sessionsFullRetryDirty: this.sessionsFullRetryDirty,
					sessionsReconcileDirty: this.sessionsReconcileDirty,
					sessionsDirtyFiles: this.sessionsDirtyFiles,
					syncArchiveFiles: async (targetedParams) => {
						await this.syncArchiveFiles({
							...targetedParams,
							corpusEntries: targetSessionSync?.corpusEntries
						});
					},
					shouldFallbackOnError: (err) => this.shouldFallbackOnError(err),
					activateFallbackProvider: async (reason) => {
						this.endSyncProviderGeneration();
						return await this.activateFallbackProvider(reason);
					}
				});
				if (targetedSessionSync.handled) {
					this.sessionsDirty = targetedSessionSync.sessionsDirty;
					if (targetedSessionSync.failure) this.syncOutcomes.recordActiveFailure(targetedSessionSync.failure.error);
					return;
				}
			}
			try {
				if (needsFullReindex) {
					await this.runInPlaceReindex({
						reason: params?.reason,
						force: params?.force,
						progress: progress ?? void 0
					});
					return;
				}
				const shouldSyncMemory = this.sources.has("memory") && this.dirty;
				const shouldSyncSessions = this.shouldSyncSessions(params, needsFullReindex);
				if (this.shouldDeferSourceWideBatch()) {
					await this.executeSourceWideSync({
						shouldSyncMemory,
						shouldSyncSessions,
						needsFullReindex,
						needsFullSessionReindex,
						targetArchiveFiles: targetArchiveFiles ? Array.from(targetArchiveFiles) : void 0,
						progress: progress ?? void 0
					});
					if (shouldSyncMemory) this.clearMemoryRetryState();
					if (shouldSyncSessions) this.clearSessionRetryState();
					else this.refreshSessionDirtyFlag();
				} else {
					if (shouldSyncMemory) {
						await this.syncMemoryFiles({
							needsFullReindex,
							progress: progress ?? void 0
						});
						this.clearMemoryRetryState();
					}
					if (shouldSyncSessions) {
						await this.syncArchiveFiles({
							needsFullReindex: needsFullSessionReindex,
							targetArchiveFiles: targetArchiveFiles ? Array.from(targetArchiveFiles) : void 0,
							progress: progress ?? void 0
						});
						this.clearSessionRetryState();
					} else this.refreshSessionDirtyFlag();
				}
			} catch (err) {
				const reason = formatErrorMessage(err);
				const shouldFallback = this.shouldFallbackOnError(err);
				if (shouldFallback) this.endSyncProviderGeneration();
				if (shouldFallback && await this.activateFallbackProvider(reason)) {
					if (needsFullReindex && !hasTargetArchiveFiles) {
						this.beginSyncProviderGeneration();
						await this.runInPlaceReindex({
							reason: params?.reason ?? "fallback",
							force: true,
							progress: progress ?? void 0
						});
					}
					return;
				}
				if (!this.provider && this.fts.enabled && this.shouldFallbackOnError(err)) {
					this.syncOutcomes.recordActiveFailure(err);
					log$6.warn(`memory embeddings unavailable; leaving memory index dirty: ${reason}`);
					return;
				}
				throw err;
			}
		} finally {
			if (!needsFullReindex) this.pruneEmbeddingCacheIfNeeded();
		}
	}
	shouldFallbackOnError(err) {
		return isMemoryEmbeddingOperationError(err);
	}
	hasRequestedTargetSessionSync(params) {
		return Boolean(params?.sessions?.some((session) => session.sessionId.trim().length > 0) || params?.archiveFiles?.some((sessionFile) => sessionFile.trim().length > 0));
	}
	resolveBatchConfig() {
		const batch = this.settings.remote?.batch;
		return {
			enabled: Boolean(batch?.enabled && this.provider && this.providerRuntime?.batchEmbed),
			wait: batch?.wait ?? true,
			concurrency: Math.max(1, batch?.concurrency ?? 2),
			pollIntervalMs: batch?.pollIntervalMs ?? 2e3,
			timeoutMs: resolveTimerTimeoutMs((batch?.timeoutMinutes ?? 60) * 60 * 1e3, 36e5)
		};
	}
	async activateFallbackProvider(reason) {
		if (this.closed) return false;
		const pending = this.fallbackProviderInitPromise;
		if (pending) return await pending;
		const activation = this.activateFallbackProviderOnce(reason);
		this.fallbackProviderInitPromise = activation;
		try {
			return await activation;
		} finally {
			if (this.fallbackProviderInitPromise === activation) this.fallbackProviderInitPromise = null;
		}
	}
	getPendingFallbackProviderInitialization() {
		return this.fallbackProviderInitPromise;
	}
	async activateFallbackProviderOnce(reason) {
		const currentProviderId = resolveFallbackCurrentProviderId({
			provider: this.provider,
			lifecycle: this.providerLifecycle
		});
		const fallbackRequest = resolveMemoryFallbackProviderRequest({
			cfg: this.cfg,
			settings: this.settings,
			currentProviderId
		});
		if (!fallbackRequest || !currentProviderId) return false;
		if (this.fallbackFrom) return false;
		const currentState = {
			provider: this.provider,
			fallbackFrom: this.fallbackFrom,
			fallbackReason: this.fallbackReason,
			providerUnavailableReason: void 0,
			providerRuntime: this.providerRuntime,
			lifecycle: this.providerLifecycle
		};
		this.providerLifecycle = {
			mode: "degraded",
			providerId: currentProviderId,
			reason
		};
		await this.retireCurrentProvider();
		if (this.closed) return false;
		let fallbackResult;
		try {
			fallbackResult = await createEmbeddingProvider({
				config: this.cfg,
				agentDir: resolveAgentDir(this.cfg, this.agentId),
				...this.acquireLocalService ? { acquireLocalService: this.acquireLocalService } : {},
				...fallbackRequest
			});
		} catch (err) {
			this.resetProviderInitializationForRetry();
			throw err;
		}
		if (!fallbackResult.provider) {
			this.resetProviderInitializationForRetry();
			return false;
		}
		const fallbackState = applyMemoryFallbackProviderState({
			current: currentState,
			fallbackFrom: currentProviderId,
			reason,
			result: fallbackResult
		});
		this.fallbackFrom = fallbackState.fallbackFrom;
		this.fallbackReason = fallbackState.fallbackReason;
		this.provider = fallbackState.provider;
		this.providerRuntime = fallbackState.providerRuntime;
		this.providerUnavailableReason = fallbackState.providerUnavailableReason;
		this.providerLifecycle = fallbackState.lifecycle;
		this.providerKey = this.computeProviderKey();
		this.batch = this.resolveBatchConfig();
		log$6.warn(`memory embeddings: switched to fallback provider (${fallbackRequest.provider})`, { reason });
		return true;
	}
	async runInPlaceReindex(params) {
		const dbPath = resolveUserPath(this.settings.store.databasePath);
		const tempDbPath = `${dbPath}.memory-reindex-${randomUUID()}`;
		const originalDb = this.db;
		let tempDb;
		let tempDbClosed = false;
		const originalRetryState = this.snapshotReindexRetryState();
		const shouldRetryMemoryOnFailure = this.sources.has("memory");
		const shouldRetrySessionsOnFailure = this.shouldSyncSessions({
			reason: params.reason,
			force: params.force
		}, true);
		try {
			cleanupAgedMemoryReindexTempFiles(dbPath);
			const originalRevision = readMemoryDatabaseRevision(originalDb);
			tempDb = openMemoryDatabaseAtPath(tempDbPath, this.settings.store.vector.enabled);
			const shadow = new MemoryIndexDatabase(tempDb);
			shadow.vector.enabled = this.vector.enabled;
			shadow.vector.extensionPath = this.vector.extensionPath;
			shadow.fts.enabled = this.fts.enabled;
			const rebuilt = await this.withReindexDatabase(shadow, async () => {
				try {
					this.ensureSchema();
					await this.seedEmbeddingCache(originalDb);
					const shouldSyncMemory = shouldRetryMemoryOnFailure;
					const shouldSyncSessions = shouldRetrySessionsOnFailure;
					if (this.shouldDeferSourceWideBatch()) {
						await this.executeSourceWideSync({
							shouldSyncMemory,
							shouldSyncSessions,
							needsFullReindex: true,
							progress: params.progress
						});
						if (shouldSyncMemory) this.clearMemoryRetryState();
						if (shouldSyncSessions) this.clearSessionRetryState();
						else this.refreshSessionDirtyFlag();
					} else {
						if (shouldSyncMemory) {
							await this.syncMemoryFiles({
								needsFullReindex: true,
								progress: params.progress
							});
							this.clearMemoryRetryState();
						}
						if (shouldSyncSessions) {
							await this.syncArchiveFiles({
								needsFullReindex: true,
								progress: params.progress
							});
							this.clearSessionRetryState();
						} else this.refreshSessionDirtyFlag();
					}
					if (!shouldSyncMemory) this.clearMemoryRetryState();
					const syncProvider = this.syncProviderGeneration ? this.syncProviderGeneration.provider : this.provider;
					const vectorIndexComplete = syncProvider === null || this.vector.available === true;
					const nextMeta = {
						model: syncProvider?.model ?? "fts-only",
						provider: syncProvider?.id ?? "none",
						providerKey: this.syncProviderGeneration ? this.syncProviderGeneration.providerKey : this.providerKey,
						sources: resolveConfiguredSourcesForMeta(this.sources),
						scopeHash: resolveConfiguredScopeHash({
							workspaceDir: this.workspaceDir,
							extraPaths: this.settings.extraPaths,
							multimodal: {
								enabled: this.settings.multimodal.enabled,
								modalities: this.settings.multimodal.modalities,
								maxFileBytes: this.settings.multimodal.maxFileBytes
							}
						}),
						chunkTokens: this.settings.chunking.tokens,
						chunkOverlap: this.settings.chunking.overlap,
						chunkingVersion: 3,
						ftsTokenizer: this.settings.store.fts.tokenizer,
						provenanceVersion: 1
					};
					if (this.vector.available && this.vector.dims) nextMeta.vectorDims = this.vector.dims;
					this.writeMeta(nextMeta);
					this.pruneEmbeddingCacheIfNeeded();
					return {
						nextMeta,
						vectorIndexComplete
					};
				} finally {
					shadow.closed = true;
				}
			});
			closeMemoryDatabase(tempDb);
			tempDbClosed = true;
			await withMemoryWorkspaceLock(this.workspaceDir, async () => {
				await withMemoryIndexPublishGeneration(dbPath, async () => {
					await publishMemoryDatabaseTables({
						targetDb: originalDb,
						sourcePath: tempDbPath,
						metaKey: MEMORY_INDEX_META_KEY,
						expectedRevision: originalRevision,
						vectorExtensionPath: shadow.vector.extensionPath
					});
				});
			});
			if (rebuilt.vectorIndexComplete) markMemoryVectorIndexClean(originalDb);
			this.database.lastMetaSerialized = null;
			this.resetVectorState();
			this.fts.available = shadow.fts.available;
			this.fts.loadError = shadow.fts.loadError;
			this.vector.dims = rebuilt.nextMeta.vectorDims;
		} catch (err) {
			if (tempDb && !tempDbClosed) try {
				closeMemoryDatabase(tempDb);
				tempDbClosed = true;
			} catch {}
			this.restoreReindexRetryState(originalRetryState);
			this.markFailedFullReindexRetry({
				memory: shouldRetryMemoryOnFailure,
				sessions: shouldRetrySessionsOnFailure
			});
			throw err;
		} finally {
			if (tempDb && !tempDbClosed) try {
				closeMemoryDatabase(tempDb);
			} catch {}
			try {
				removeMemoryDatabaseFiles(tempDbPath);
			} catch (err) {
				log$6.warn(`failed to remove memory reindex shadow database: ${formatErrorMessage(err)}`);
			}
		}
	}
};
//#endregion
//#region extensions/memory-core/src/memory/manager-vector-write.ts
function replaceMemoryVectorRow(params) {
	const tableName = params.tableName ?? "memory_index_chunks_vec";
	try {
		params.db.prepare(`DELETE FROM ${tableName} WHERE id = ?`).run(params.id);
	} catch {}
	params.db.prepare(`INSERT INTO ${tableName} (id, embedding) VALUES (?, ?)`).run(params.id, vectorToBlob(params.embedding));
}
//#endregion
//#region extensions/memory-core/src/memory/manager-embedding-ops.ts
const VECTOR_TABLE$1 = MEMORY_INDEX_VECTOR_TABLE;
const FTS_TABLE$2 = MEMORY_INDEX_FTS_TABLE;
const EMBEDDING_CACHE_TABLE = MEMORY_EMBEDDING_CACHE_TABLE;
const EMBEDDING_BATCH_MAX_TOKENS = 8e3;
const EMBEDDING_INDEX_CONCURRENCY = 4;
const EMBEDDING_RETRY_MAX_ATTEMPTS = 3;
const EMBEDDING_RETRY_BASE_DELAY_MS = 500;
const EMBEDDING_RETRY_MAX_DELAY_MS = 8e3;
const EMBEDDING_QUERY_TIMEOUT_REMOTE_MS = 6e4;
const EMBEDDING_QUERY_TIMEOUT_LOCAL_MS = 3e5;
const EMBEDDING_BATCH_TIMEOUT_REMOTE_MS = 12e4;
const EMBEDDING_BATCH_TIMEOUT_LOCAL_MS = 6e5;
const SOURCE_WIDE_BATCH_MAX_FILES = 2048;
const SOURCE_WIDE_BATCH_MAX_REQUESTS = 5e4;
const log$5 = createSubsystemLogger("memory");
function resolveEmbeddingSecondsTimeoutMs(seconds) {
	if (!Number.isFinite(seconds)) return MAX_TIMER_TIMEOUT_MS;
	const timeoutMs = Math.floor(seconds * 1e3);
	return resolveTimerTimeoutMs(Number.isFinite(timeoutMs) ? timeoutMs : MAX_TIMER_TIMEOUT_MS, MAX_TIMER_TIMEOUT_MS);
}
function resolveChunkRecallMetadata(params) {
	if (!params.curatedRoot && !params.projectScopeEligible || params.content === void 0) return {
		importance: null,
		triggers: null,
		projectKey: null
	};
	const phrases = /* @__PURE__ */ new Set();
	let importance = null;
	const lines = params.content.replace(/\r\n/gu, "\n").split("\n");
	const annotationStartLine = params.chunk.entryStartLine ?? params.chunk.startLine;
	const annotationEndLine = params.chunk.entryEndLine ?? params.chunk.endLine;
	const annotationLines = lines.slice(annotationStartLine - 1, annotationEndLine);
	const projectAnnotations = params.projectScopeEligible ? extractProjectKeysFromCuratedEntry(annotationLines.join("\n")) : {
		annotated: false,
		valid: true,
		keys: []
	};
	for (const line of annotationLines) {
		const annotationSuffix = line.match(/(?:\s*<!--\s*(?:trigger|importance|project)\s*:[\s\S]*?-->\s*)+$/iu)?.[0];
		if (!annotationSuffix) continue;
		for (const match of annotationSuffix.matchAll(/<!--\s*(trigger|importance|project)\s*:\s*([\s\S]*?)\s*-->/giu)) {
			const kind = match[1]?.toLowerCase();
			const value = match[2]?.trim() ?? "";
			if (kind === "trigger") {
				if (!params.curatedRoot) continue;
				for (const phrase of value.split(/[,;]/u).map((entry) => entry.trim())) if (phrase) phrases.add(phrase);
				continue;
			}
			if (kind === "project") continue;
			if (!params.curatedRoot) continue;
			if (/^\d+$/u.test(value)) {
				const parsed = Number.parseInt(value, 10);
				if (parsed >= 1 && parsed <= 10) importance = Math.max(importance ?? parsed, parsed);
			}
		}
	}
	return {
		importance,
		triggers: phrases.size > 0 ? [...phrases].join("; ") : null,
		projectKey: projectAnnotations.annotated && !projectAnnotations.valid ? INVALID_PROJECT_ANNOTATION_KEY : projectAnnotations.keys.length > 0 ? projectAnnotations.keys.join("; ") : null
	};
}
function countBatchSources(items) {
	const counts = {};
	for (const item of items) counts[item.source] = (counts[item.source] ?? 0) + 1;
	return counts;
}
function formatBatchSourceLabel(counts) {
	const sources = Object.keys(counts).toSorted();
	return sources.length > 0 ? sources.join("+") : "unknown";
}
function formatBatchSourceCounts(counts) {
	return Object.entries(counts).toSorted(([left], [right]) => left.localeCompare(right)).map(([source, count]) => `${source}=${count}`).join(",") || "none";
}
function splitSourceWideEmbeddingChunks(chunks, maxRequests) {
	return chunkItems(chunks, Math.max(1, Math.floor(maxRequests)));
}
function resolveEmbeddingTimeoutMs(params) {
	if (params.kind === "query") {
		const runtimeTimeoutMs = params.providerRuntime?.inlineQueryTimeoutMs;
		if (typeof runtimeTimeoutMs === "number" && runtimeTimeoutMs > 0) return resolveTimerTimeoutMs(runtimeTimeoutMs, EMBEDDING_QUERY_TIMEOUT_REMOTE_MS);
		return params.providerId === "local" ? EMBEDDING_QUERY_TIMEOUT_LOCAL_MS : EMBEDDING_QUERY_TIMEOUT_REMOTE_MS;
	}
	const configuredTimeoutSeconds = params.configuredBatchTimeoutSeconds;
	if (typeof configuredTimeoutSeconds === "number" && configuredTimeoutSeconds > 0) return resolveEmbeddingSecondsTimeoutMs(configuredTimeoutSeconds);
	const runtimeTimeoutMs = params.providerRuntime?.inlineBatchTimeoutMs;
	if (typeof runtimeTimeoutMs === "number" && runtimeTimeoutMs > 0) return resolveTimerTimeoutMs(runtimeTimeoutMs, EMBEDDING_BATCH_TIMEOUT_REMOTE_MS);
	return params.providerId === "local" ? EMBEDDING_BATCH_TIMEOUT_LOCAL_MS : EMBEDDING_BATCH_TIMEOUT_REMOTE_MS;
}
function resolveMemoryIndexConcurrency(params) {
	if (params.batch.enabled) return params.batch.concurrency;
	const configured = params.configuredNonBatchConcurrency;
	if (typeof configured === "number" && Number.isFinite(configured)) return Math.max(1, Math.floor(configured));
	return params.providerId === "ollama" ? 1 : EMBEDDING_INDEX_CONCURRENCY;
}
async function runEmbeddingOperationWithTimeout(params) {
	const controller = new AbortController();
	const signal = params.signal ? AbortSignal.any([params.signal, controller.signal]) : controller.signal;
	if (!Number.isFinite(params.timeoutMs) || params.timeoutMs <= 0) return await params.run(signal);
	const timeoutMs = resolveTimerTimeoutMs(params.timeoutMs, 1);
	const timeoutError = new Error(params.message);
	const deadlineStartedAt = Date.now();
	let timer = null;
	const timeoutPromise = new Promise((_, reject) => {
		timer = setTimeout(() => {
			reject(timeoutError);
			controller.abort(timeoutError);
		}, timeoutMs);
	});
	try {
		const operation = params.run(signal);
		const result = await Promise.race([operation, timeoutPromise]);
		params.signal?.throwIfAborted();
		if (Date.now() - deadlineStartedAt >= timeoutMs) {
			controller.abort(timeoutError);
			throw timeoutError;
		}
		return result;
	} finally {
		if (timer) clearTimeout(timer);
	}
}
var MemoryManagerEmbeddingOps = class extends MemoryManagerSyncOps {
	constructor(..._args) {
		super(..._args);
		this.activeProviderUses = /* @__PURE__ */ new Map();
		this.providerIdleWaiters = /* @__PURE__ */ new Map();
		this.syncProviderGenerationRelease = null;
		this.syncProviderGenerationOwners = 0;
	}
	acquireProviderUse(provider) {
		this.activeProviderUses.set(provider, (this.activeProviderUses.get(provider) ?? 0) + 1);
		let released = false;
		return () => {
			if (released) return;
			released = true;
			const remaining = (this.activeProviderUses.get(provider) ?? 1) - 1;
			if (remaining > 0) {
				this.activeProviderUses.set(provider, remaining);
				return;
			}
			this.activeProviderUses.delete(provider);
			const waiters = this.providerIdleWaiters.get(provider);
			this.providerIdleWaiters.delete(provider);
			for (const resolve of waiters ?? []) resolve();
		};
	}
	async withProviderUse(provider, run) {
		const release = this.acquireProviderUse(provider);
		try {
			return await run();
		} finally {
			release();
		}
	}
	async awaitProviderIdle(provider) {
		if (!this.activeProviderUses.has(provider)) return;
		await new Promise((resolve) => {
			const waiters = this.providerIdleWaiters.get(provider) ?? /* @__PURE__ */ new Set();
			waiters.add(resolve);
			this.providerIdleWaiters.set(provider, waiters);
		});
	}
	beginSyncProviderGeneration(options) {
		if (this.syncProviderGeneration) {
			this.syncProviderGenerationOwners += 1;
			return;
		}
		const provider = options?.forceFtsOnly ? null : this.provider;
		const runtime = provider ? this.providerRuntime : void 0;
		const identities = resolveMemoryIndexProviderIdentities({
			provider,
			cacheKeyData: runtime?.cacheKeyData,
			aliases: runtime?.indexIdentityAliases
		});
		const providerKey = expectDefined(identities.at(0), "primary memory provider identity").providerKey;
		this.syncProviderGeneration = provider ? {
			kind: "semantic",
			database: this.db,
			provider,
			...runtime ? { runtime } : {},
			providerKey,
			identities
		} : {
			kind: "fts-only",
			database: this.db,
			provider: null,
			providerKey,
			identities
		};
		this.syncProviderGenerationRelease = provider ? this.acquireProviderUse(provider) : null;
		this.syncProviderGenerationOwners = 1;
	}
	endSyncProviderGeneration() {
		if (this.syncProviderGenerationOwners > 1) {
			this.syncProviderGenerationOwners -= 1;
			return;
		}
		this.syncProviderGenerationOwners = 0;
		this.syncProviderGeneration = null;
		this.syncProviderGenerationRelease?.();
		this.syncProviderGenerationRelease = null;
	}
	pruneEmbeddingCacheIfNeeded() {
		if (!this.cache.enabled) return;
		const max = this.cache.maxEntries;
		if (!max || max <= 0) return;
		const count = this.db.prepare(`SELECT COUNT(*) as c FROM ${EMBEDDING_CACHE_TABLE}`).get()?.c ?? 0;
		if (count <= max) return;
		const excess = count - max;
		this.db.prepare(`DELETE FROM ${EMBEDDING_CACHE_TABLE}\n WHERE rowid IN (\n   SELECT rowid FROM ${EMBEDDING_CACHE_TABLE}\n   ORDER BY updated_at ASC\n   LIMIT ?\n )`).run(excess);
	}
	async embedChunksInBatches(chunks, generation) {
		if (chunks.length === 0) return [];
		const { embeddings, missing } = this.collectCachedEmbeddings(chunks, generation);
		if (missing.length === 0) return embeddings;
		const batches = buildMemoryEmbeddingBatches(missing.map((m) => m.chunk), EMBEDDING_BATCH_MAX_TOKENS);
		let cursor = 0;
		for (const batch of batches) {
			const inputs = buildTextEmbeddingInputs(batch);
			const batchEmbeddings = inputs.some((input) => hasNonTextEmbeddingParts(input)) ? await this.embedBatchInputsWithRetry(inputs, generation) : await this.embedBatchWithRetry(batch.map((chunk) => chunk.text), generation);
			for (let i = 0; i < batch.length; i += 1) {
				const item = missing[cursor + i];
				const embedding = batchEmbeddings[i] ?? [];
				if (item) embeddings[item.index] = embedding;
			}
			cursor += batch.length;
		}
		return embeddings;
	}
	computeProviderKey() {
		return expectDefined(this.resolveProviderIndexIdentities().at(0), "primary memory provider identity").providerKey;
	}
	resolveProviderIndexIdentities() {
		return resolveMemoryIndexProviderIdentities({
			provider: this.provider,
			cacheKeyData: this.providerRuntime?.cacheKeyData,
			aliases: this.providerRuntime?.indexIdentityAliases
		});
	}
	buildBatchDebug(source, chunks, context = {}) {
		return (message, data) => log$5.debug(message, data ? {
			...data,
			source,
			chunks: chunks.length,
			...context
		} : {
			source,
			chunks: chunks.length,
			...context
		});
	}
	async embedChunksWithBatch(chunks, source, generation, debugContext = {}) {
		const provider = generation.provider;
		const batchEmbed = generation.runtime?.batchEmbed;
		if (!batchEmbed) return this.embedChunksInBatches(chunks, generation);
		if (chunks.length === 0) return [];
		const { embeddings, missing } = this.collectCachedEmbeddings(chunks, generation);
		if (missing.length === 0) return embeddings;
		const missingChunks = missing.map((item) => item.chunk);
		const batchResult = await this.runBatchWithFallback({
			provider: provider.id,
			run: async () => await batchEmbed({
				agentId: this.agentId,
				chunks: missingChunks,
				wait: this.batch.wait,
				concurrency: this.batch.concurrency,
				pollIntervalMs: this.batch.pollIntervalMs,
				timeoutMs: this.batch.timeoutMs,
				debug: this.buildBatchDebug(source, chunks, debugContext)
			}),
			fallback: async () => await this.embedChunksInBatches(missingChunks, generation)
		});
		if (!batchResult) return this.embedChunksInBatches(chunks, generation);
		for (let index = 0; index < missing.length; index += 1) {
			const item = missing[index];
			const embedding = batchResult[index] ?? [];
			if (!item) continue;
			embeddings[item.index] = embedding;
		}
		return embeddings;
	}
	collectCachedEmbeddings(chunks, generation) {
		return collectMemoryCachedEmbeddings({
			chunks,
			cached: loadMemoryEmbeddingCache({
				db: this.db,
				enabled: this.cache.enabled,
				providerIdentities: generation.identities,
				hashes: chunks.map((chunk) => chunk.hash),
				tableName: EMBEDDING_CACHE_TABLE
			})
		});
	}
	async embedBatchWithRetry(texts, generation) {
		return await this.runProviderBatchWithRetry({
			items: texts,
			generation,
			operation: "batch",
			run: async (provider, batchTexts, signal) => await provider.embedBatch(batchTexts, {
				signal,
				inputType: "document"
			})
		});
	}
	async embedBatchInputsWithRetry(inputs, generation) {
		if (inputs.length === 0) return [];
		return await this.runProviderBatchWithRetry({
			items: inputs,
			generation,
			operation: "structured-batch",
			run: async (provider, batchInputs, signal) => await provider.embedBatch(batchInputs, {
				signal,
				inputType: "document"
			})
		});
	}
	async runProviderBatchWithRetry(params) {
		if (params.items.length === 0) return [];
		const provider = params.generation?.provider ?? this.provider;
		if (!provider) throw new Error("Cannot embed batch in FTS-only mode (no embedding provider)");
		const structured = params.operation === "structured-batch";
		const label = structured ? "structured batch" : "batch";
		try {
			return await this.withProviderUse(provider, async () => await runMemoryEmbeddingBatchRetryWithSplit({
				items: params.items,
				run: async (batchItems) => {
					const timeoutMs = this.resolveEmbeddingTimeout("batch", provider, params.generation?.runtime);
					log$5.debug(`memory embeddings: ${label} start`, {
						provider: provider.id,
						items: batchItems.length,
						timeoutMs
					});
					const result = await runEmbeddingOperationWithTimeout({
						timeoutMs,
						message: `memory embeddings batch timed out after ${Math.round(timeoutMs / 1e3)}s`,
						run: async (signal) => await params.run(provider, batchItems, signal)
					});
					if (!structured) log$5.debug("memory embeddings: batch completed", {
						provider: provider.id,
						items: batchItems.length
					});
					return result;
				},
				isRetryable: isRetryableMemoryEmbeddingError,
				isSplittable: isSplittableMemoryEmbeddingBatchError,
				waitForRetry: async (delayMs) => {
					await this.waitForEmbeddingRetry(delayMs, structured ? "retrying structured batch" : "retrying");
				},
				maxAttempts: EMBEDDING_RETRY_MAX_ATTEMPTS,
				baseDelayMs: EMBEDDING_RETRY_BASE_DELAY_MS,
				onSplit: ({ itemCount, splitAt }) => {
					log$5.warn(`memory embeddings ${label} failed; splitting ${itemCount} inputs into ${splitAt} + ${itemCount - splitAt}`);
				}
			}));
		} catch (err) {
			if (!structured) log$5.debug("memory embeddings: batch failed", {
				provider: provider.id,
				error: formatErrorMessage(err)
			});
			this.markLocalEmbeddingProviderDegraded(err);
			throw createMemoryEmbeddingOperationError({
				operation: params.operation,
				providerId: provider.id,
				cause: err
			});
		}
	}
	async waitForEmbeddingRetry(delayMs, action, signal) {
		const waitMs = resolveMemoryEmbeddingRetryDelay(delayMs, Math.random(), EMBEDDING_RETRY_MAX_DELAY_MS);
		log$5.warn(`memory embeddings retryable error; ${action} in ${waitMs}ms`);
		await sleepWithAbort(waitMs, signal);
	}
	resolveEmbeddingTimeout(kind, provider = this.provider, providerRuntime = this.providerRuntime) {
		return resolveEmbeddingTimeoutMs({
			kind,
			providerId: provider?.id,
			providerRuntime,
			configuredBatchTimeoutSeconds: this.settings.sync.embeddingBatchTimeoutSeconds
		});
	}
	async embedQueryWithRetry(text, signal, providerOverride, markDegraded = true, providerRuntimeOverride) {
		const provider = providerOverride ?? this.provider;
		const providerRuntime = providerOverride ? providerRuntimeOverride : this.providerRuntime;
		if (!provider) throw new Error("Cannot embed query in FTS-only mode (no embedding provider)");
		try {
			return await this.withProviderUse(provider, async () => await runMemoryEmbeddingRetryLoop({
				run: async () => {
					signal?.throwIfAborted();
					const timeoutMs = this.resolveEmbeddingTimeout("query", provider, providerRuntime);
					log$5.debug("memory embeddings: query start", {
						provider: provider.id,
						timeoutMs
					});
					return await runEmbeddingOperationWithTimeout({
						timeoutMs,
						message: `memory embeddings query timed out after ${Math.round(timeoutMs / 1e3)}s`,
						signal,
						run: async (opSignal) => await provider.embed(text, {
							signal: opSignal,
							inputType: "query"
						})
					});
				},
				signal,
				isRetryable: isRetryableMemoryEmbeddingError,
				waitForRetry: async (delayMs) => {
					await this.waitForEmbeddingRetry(delayMs, "retrying query", signal);
				},
				maxAttempts: EMBEDDING_RETRY_MAX_ATTEMPTS,
				baseDelayMs: EMBEDDING_RETRY_BASE_DELAY_MS
			}));
		} catch (err) {
			if (markDegraded) this.markLocalEmbeddingProviderDegraded(err);
			throw createMemoryEmbeddingOperationError({
				operation: "query",
				providerId: provider.id,
				cause: err
			});
		}
	}
	async withTimeout(promise, timeoutMs, message) {
		return await runEmbeddingOperationWithTimeout({
			timeoutMs,
			message,
			run: () => promise
		});
	}
	async withBatchFailureLock(fn) {
		let release;
		const wait = this.batchFailureLock;
		this.batchFailureLock = new Promise((resolve) => {
			release = resolve;
		});
		await wait;
		try {
			return await fn();
		} finally {
			release();
		}
	}
	async resetBatchFailureCount() {
		await this.withBatchFailureLock(async () => {
			if (this.batchFailureCount > 0) log$5.debug("memory embeddings: batch recovered; resetting failure count");
			const nextState = resetMemoryBatchFailureState({
				enabled: this.batch.enabled,
				count: this.batchFailureCount,
				lastError: this.batchFailureLastError,
				lastProvider: this.batchFailureLastProvider
			});
			this.batch.enabled = nextState.enabled;
			this.batchFailureCount = nextState.count;
			this.batchFailureLastError = nextState.lastError;
			this.batchFailureLastProvider = nextState.lastProvider;
		});
	}
	async recordBatchFailure(params) {
		return await this.withBatchFailureLock(async () => {
			if (!this.batch.enabled) return {
				disabled: true,
				count: this.batchFailureCount
			};
			const nextState = recordMemoryBatchFailure({
				enabled: this.batch.enabled,
				count: this.batchFailureCount,
				lastError: this.batchFailureLastError,
				lastProvider: this.batchFailureLastProvider
			}, params);
			this.batch.enabled = nextState.enabled;
			this.batchFailureCount = nextState.count;
			this.batchFailureLastError = nextState.lastError;
			this.batchFailureLastProvider = nextState.lastProvider;
			return {
				disabled: !nextState.enabled,
				count: nextState.count
			};
		});
	}
	async runBatchWithTimeoutRetry(params) {
		try {
			return {
				kind: "success",
				value: await params.run()
			};
		} catch (error) {
			if (!/timed out|timeout/i.test(formatErrorMessage(error))) return {
				kind: "failure",
				error,
				attempts: 1
			};
		}
		log$5.warn(`memory embeddings: ${params.provider} batch timed out; retrying once`);
		try {
			return {
				kind: "success",
				value: await params.run()
			};
		} catch (error) {
			return {
				kind: "failure",
				error,
				attempts: 2
			};
		}
	}
	async runBatchWithFallback(params) {
		if (!this.batch.enabled) return await params.fallback();
		const result = await this.runBatchWithTimeoutRetry({
			provider: params.provider,
			run: params.run
		});
		if (result.kind === "success") {
			await this.resetBatchFailureCount();
			return result.value;
		}
		const message = formatErrorMessage(result.error);
		const forceDisable = isEmbeddingBatchUnavailableError(result.error);
		const failure = await this.recordBatchFailure({
			provider: params.provider,
			message,
			attempts: result.attempts,
			forceDisable
		});
		const suffix = failure.disabled ? "disabling batch" : "keeping batch enabled";
		log$5.warn(`memory embeddings: ${params.provider} batch failed (${failure.count}/2); ${suffix}; falling back to non-batch embeddings: ${message}`);
		return await params.fallback();
	}
	getIndexConcurrency() {
		return resolveMemoryIndexConcurrency({
			batch: this.batch,
			configuredNonBatchConcurrency: this.settings.remote?.nonBatchConcurrency,
			providerId: this.syncProviderGeneration ? this.syncProviderGeneration.provider?.id : this.provider?.id
		});
	}
	clearIndexedFileData(pathname, source) {
		this.deleteVectorRowsForSource(pathname, source);
		if (this.fts.enabled && this.fts.available) try {
			deleteMemoryFtsRows({
				db: this.db,
				tableName: FTS_TABLE$2,
				path: pathname,
				source,
				currentModel: this.provider?.model
			});
		} catch {}
		this.db.prepare(`DELETE FROM memory_index_chunks WHERE path = ? AND source = ?`).run(pathname, source);
	}
	upsertFileRecord(entry, source) {
		this.db.prepare(`INSERT INTO memory_index_sources (path, source, hash, mtime, size) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(path, source) DO UPDATE SET
           hash=excluded.hash,
           mtime=excluded.mtime,
           size=excluded.size`).run(entry.path, source, entry.hash, entry.mtimeMs, entry.size);
	}
	deleteFileRecord(pathname, source) {
		this.db.prepare(`DELETE FROM memory_index_sources WHERE path = ? AND source = ?`).run(pathname, source);
	}
	assertMemoryFileSnapshot(entry, currentHash) {
		if (currentHash === entry.hash) return;
		this.markFailedFullReindexRetry({
			memory: true,
			sessions: false
		});
		throw new Error(`Memory source ${entry.path} changed while indexing; retry the memory index.`);
	}
	async writeChunks({ entry, source, chunks }, generation, embeddings, vectorReady) {
		await withMemoryWorkspaceLock(this.workspaceDir, async () => {
			if (source === "memory") {
				const current = await buildFileEntry(entry.absPath, this.workspaceDir, this.settings.multimodal);
				this.assertMemoryFileSnapshot(entry, current?.hash);
			}
			const now = Date.now();
			const model = generation?.provider?.model ?? "fts-only";
			const needsVectorRebuild = !vectorReady && embeddings.some((embedding) => embedding.length > 0);
			runSqliteImmediateTransactionSync(this.db, () => {
				if (source === "sessions") {
					const sessionId = expectDefined(entry.sessionId, "memory index session identity");
					if (hasMemorySessionTombstone(generation?.database ?? this.db, this.agentId, sessionId)) {
						this.markFailedFullReindexRetry({
							memory: false,
							sessions: true
						});
						throw new Error("A session was forgotten while memory indexing was running; retry the memory index.");
					}
				}
				this.clearIndexedFileData(entry.path, source);
				for (const [i, chunk] of chunks.entries()) {
					const embedding = embeddings[i] ?? [];
					const id = hashText(`${source}:${entry.path}:${chunk.startLine}:${chunk.endLine}:${chunk.hash}:${model}`);
					this.db.prepare(`INSERT INTO memory_index_chunks (id, path, source, start_line, end_line, hash, model, text, embedding, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 hash=excluded.hash,
                 model=excluded.model,
                 text=excluded.text,
                 embedding=excluded.embedding,
                 updated_at=excluded.updated_at`).run(id, entry.path, source, chunk.startLine, chunk.endLine, chunk.hash, model, chunk.text, JSON.stringify(embedding), now);
					this.db.prepare(`INSERT INTO ${MEMORY_INDEX_CHUNK_RECALL_METADATA_TABLE} (
                 chunk_id, importance, triggers, project_key
               ) VALUES (?, ?, ?, ?)
               ON CONFLICT(chunk_id) DO UPDATE SET
                 importance=excluded.importance,
                 triggers=excluded.triggers,
                 project_key=excluded.project_key`).run(id, chunk.importance, chunk.triggers, chunk.projectKey);
					const provenance = chunk.provenance ?? {
						originClass: "untrusted",
						sessionKind: "unknown",
						observedAt: now
					};
					this.db.prepare(`INSERT INTO ${MEMORY_INDEX_CHUNK_PROVENANCE_TABLE} (
                 chunk_id, origin_class, session_kind, observed_at, supersedes_key
               ) VALUES (?, ?, ?, ?, ?)
               ON CONFLICT(chunk_id) DO UPDATE SET
                 origin_class=excluded.origin_class,
                 session_kind=excluded.session_kind,
                 observed_at=excluded.observed_at,
                 supersedes_key=excluded.supersedes_key`).run(id, provenance.originClass, provenance.sessionKind, provenance.observedAt, provenance.supersedesKey ?? null);
					if (vectorReady && embedding.length > 0) replaceMemoryVectorRow({
						db: this.db,
						tableName: VECTOR_TABLE$1,
						id,
						embedding
					});
					if (this.fts.enabled && this.fts.available) this.db.prepare(`INSERT INTO ${FTS_TABLE$2} (text, id, path, source, model, start_line, end_line)\n VALUES (?, ?, ?, ?, ?, ?, ?)`).run(chunk.text, id, entry.path, source, model, chunk.startLine, chunk.endLine);
				}
				upsertMemoryEmbeddingCache({
					db: this.db,
					enabled: this.cache.enabled,
					provider: generation?.provider ?? null,
					providerKey: generation?.providerKey ?? null,
					entries: chunks.map((chunk, index) => ({
						hash: chunk.hash,
						embedding: embeddings[index] ?? []
					})),
					now,
					tableName: EMBEDDING_CACHE_TABLE
				});
				this.upsertFileRecord(entry, source);
				if (needsVectorRebuild) this.markVectorRebuildRequired();
			});
			this.database.vectorDegradedWriteWarningShown = logMemoryVectorDegradedWrite({
				vectorEnabled: this.vector.enabled,
				vectorReady,
				chunkCount: chunks.length,
				warningShown: this.database.vectorDegradedWriteWarningShown,
				loadError: this.vector.loadError,
				warn: (message) => log$5.warn(message)
			});
		});
	}
	async prepareIndexEntry(entry, options, generation) {
		return await withMemoryWorkspaceLock(this.workspaceDir, async () => {
			const pathClassification = await resolveMemoryPathClassification({
				absolutePath: entry.absPath,
				source: options.source,
				workspaceDir: this.workspaceDir
			});
			if ("kind" in entry && entry.kind === "multimodal") {
				const multimodalChunk = await buildMultimodalChunkForIndexing(entry);
				if (!multimodalChunk) {
					this.clearIndexedFileData(entry.path, options.source);
					this.deleteFileRecord(entry.path, options.source);
					return null;
				}
				const chunk = {
					...multimodalChunk.chunk,
					importance: null,
					triggers: null,
					projectKey: null
				};
				chunk.provenance = this.resolveChunkProvenance(entry, options.source, chunk, pathClassification.originClass);
				return {
					entry,
					source: options.source,
					chunks: [chunk],
					structuredInputBytes: multimodalChunk.structuredInputBytes
				};
			}
			const content = options.content ?? entry.content ?? await retryTransientMemoryRead(() => fs$1.readFile(entry.absPath, "utf-8"), `read memory markdown for indexing ${entry.absPath}`);
			if (options.source === "memory") this.assertMemoryFileSnapshot(entry, hashText(content));
			const normalizedEntryPath = entry.path.replaceAll("\\", "/");
			const perEntry = options.source === "memory" && (normalizedEntryPath === "MEMORY.md" || normalizedEntryPath === "USER.md");
			const indexingContent = options.source === "memory" ? stripMemoryAnnotationCarriers(content) : content;
			const chunkOptions = {
				...this.settings.chunking,
				perEntry
			};
			const baseChunks = filterNonEmptyMemoryChunks(options.source === "sessions" ? chunkSessionContentAtResetBoundary({
				content: indexingContent,
				cutoffLine: (() => {
					const cutoff = readSessionResetRecallCutoffMetadata(entry);
					return cutoff.state === "valid" ? cutoff.cutoffLine : void 0;
				})(),
				lineMap: entry.lineMap,
				chunking: chunkOptions
			}) : chunkMarkdown(indexingContent, chunkOptions));
			for (const chunk of baseChunks) chunk.provenance = this.resolveChunkProvenance(entry, options.source, chunk, pathClassification.originClass);
			const chunks = (generation?.kind === "semantic" ? enforceEmbeddingMaxInputTokens(generation.provider, baseChunks, EMBEDDING_BATCH_MAX_TOKENS) : baseChunks).map((chunk) => Object.assign(chunk, resolveChunkRecallMetadata({
				curatedRoot: pathClassification.curatedRoot,
				projectScopeEligible: options.source === "memory" && normalizedEntryPath.toUpperCase() !== "USER.MD",
				content,
				chunk
			})));
			if (options.source === "sessions" && "lineMap" in entry) remapChunkLines(chunks, entry.lineMap);
			return {
				entry,
				source: options.source,
				chunks
			};
		});
	}
	resolveChunkProvenance(entry, source, chunk, pathOriginClass) {
		const lineProvenance = entry.lineProvenance?.slice(chunk.startLine - 1, chunk.endLine) ?? [];
		if (source === "sessions" && lineProvenance.length > 0) {
			const originClass = [
				"owner",
				"agent",
				"system",
				"untrusted"
			].findLast((origin) => lineProvenance.some((item) => item.originClass === origin));
			const sessionKinds = new Set(lineProvenance.map((item) => item.sessionKind));
			const supersedesKeys = new Set(lineProvenance.flatMap((item) => item.supersedesKey ? [item.supersedesKey] : []));
			return {
				originClass: originClass ?? "untrusted",
				sessionKind: sessionKinds.size === 1 ? lineProvenance[0]?.sessionKind ?? "unknown" : "unknown",
				observedAt: Math.max(...lineProvenance.map((item) => item.observedAt)),
				...supersedesKeys.size === 1 ? { supersedesKey: [...supersedesKeys][0] } : {}
			};
		}
		return {
			originClass: pathOriginClass,
			sessionKind: "unknown",
			observedAt: Math.max(0, Math.floor(entry.mtimeMs))
		};
	}
	async indexFiles(items) {
		if (items.length === 0) return;
		this.beginSyncProviderGeneration();
		try {
			await this.indexFilesWithGeneration(items, this.syncProviderGeneration);
		} finally {
			this.endSyncProviderGeneration();
		}
	}
	async indexFilesWithGeneration(items, generation) {
		const batchEmbed = generation?.kind === "semantic" ? generation.runtime?.batchEmbed : void 0;
		if (generation?.kind !== "semantic" || !this.batch.enabled || !batchEmbed || generation.runtime?.sourceWideBatchEmbed !== true) {
			await runMemoryHostTasksWithConcurrency(items.map((item) => async () => await this.indexFileWithGeneration(item.entry, { source: item.source }, generation)), this.getIndexConcurrency());
			return;
		}
		const itemSourceCounts = countBatchSources(items);
		log$5.debug(`memory embeddings: source-wide batch prepare files=${items.length} sources=${formatBatchSourceCounts(itemSourceCounts)} maxFiles=${SOURCE_WIDE_BATCH_MAX_FILES} maxRequests=${SOURCE_WIDE_BATCH_MAX_REQUESTS}`, {
			files: items.length,
			sources: itemSourceCounts,
			maxFiles: SOURCE_WIDE_BATCH_MAX_FILES,
			maxRequests: SOURCE_WIDE_BATCH_MAX_REQUESTS
		});
		let prepared = [];
		let preparedRequestCount = 0;
		let sourceWideBatchGroup = 0;
		const flushPrepared = async (reason) => {
			if (prepared.length === 0) return;
			const current = prepared;
			const chunks = current.flatMap((item) => item.chunks);
			const sourceCounts = countBatchSources(current);
			const source = formatBatchSourceLabel(sourceCounts);
			sourceWideBatchGroup += 1;
			const chunkBatches = splitSourceWideEmbeddingChunks(chunks, SOURCE_WIDE_BATCH_MAX_REQUESTS);
			log$5.debug(`memory embeddings: source-wide batch submit group=${sourceWideBatchGroup} source=${source} files=${current.length} chunks=${chunks.length} requests=${chunkBatches.length} sources=${formatBatchSourceCounts(sourceCounts)} reason=${reason}`, {
				source,
				files: current.length,
				chunks: chunks.length,
				requests: chunkBatches.length,
				sources: sourceCounts,
				group: sourceWideBatchGroup,
				reason,
				maxFiles: SOURCE_WIDE_BATCH_MAX_FILES,
				maxRequests: SOURCE_WIDE_BATCH_MAX_REQUESTS
			});
			const embeddings = [];
			for (let requestIndex = 0; requestIndex < chunkBatches.length; requestIndex += 1) {
				const chunkBatch = chunkBatches[requestIndex] ?? [];
				embeddings.push(...await this.embedChunksWithBatch(chunkBatch, source, generation, {
					sourceWideFiles: current.length,
					sourceWideSources: sourceCounts,
					sourceWideBatchGroup,
					sourceWideRequestGroup: requestIndex + 1,
					sourceWideRequestGroups: chunkBatches.length
				}));
			}
			const sample = embeddings.find((embedding) => embedding.length > 0);
			const vectorReady = sample ? await this.ensureVectorReady(sample.length) : false;
			let offset = 0;
			for (const item of current) {
				const fileEmbeddings = embeddings.slice(offset, offset + item.chunks.length);
				offset += item.chunks.length;
				await this.writeChunks(item, generation, fileEmbeddings, vectorReady);
			}
			prepared = [];
			preparedRequestCount = 0;
		};
		for (const item of items) {
			if ("kind" in item.entry && item.entry.kind === "multimodal") {
				await this.indexFileWithGeneration(item.entry, { source: item.source }, generation);
				continue;
			}
			const preparedEntry = await this.prepareIndexEntry(item.entry, { source: item.source }, generation);
			if (!preparedEntry) continue;
			const nextWouldExceedFiles = prepared.length >= SOURCE_WIDE_BATCH_MAX_FILES;
			const nextWouldExceedRequests = preparedRequestCount + preparedEntry.chunks.length > SOURCE_WIDE_BATCH_MAX_REQUESTS;
			if (prepared.length > 0 && (nextWouldExceedFiles || nextWouldExceedRequests)) await flushPrepared(nextWouldExceedFiles ? "max-files" : "max-requests");
			prepared.push(preparedEntry);
			preparedRequestCount += preparedEntry.chunks.length;
			if (prepared.length >= SOURCE_WIDE_BATCH_MAX_FILES || preparedRequestCount >= SOURCE_WIDE_BATCH_MAX_REQUESTS) await flushPrepared(prepared.length >= SOURCE_WIDE_BATCH_MAX_FILES ? "max-files" : "max-requests");
		}
		await flushPrepared("end");
	}
	async indexFile(entry, options) {
		this.beginSyncProviderGeneration();
		try {
			await this.indexFileWithGeneration(entry, options, this.syncProviderGeneration);
		} finally {
			this.endSyncProviderGeneration();
		}
	}
	async indexFileWithGeneration(entry, options, generation) {
		if (generation?.kind !== "semantic" && "kind" in entry && entry.kind === "multimodal") return;
		const prepared = await this.prepareIndexEntry(entry, options, generation);
		if (!prepared) return;
		if (generation?.kind !== "semantic") {
			await this.writeChunks(prepared, generation, [], false);
			return;
		}
		let embeddings;
		try {
			embeddings = this.batch.enabled ? await this.embedChunksWithBatch(prepared.chunks, options.source, generation) : await this.embedChunksInBatches(prepared.chunks, generation);
		} catch (err) {
			const message = formatErrorMessage(err);
			if ("kind" in entry && entry.kind === "multimodal" && /(413|payload too large|request too large|input too large|too many tokens|input limit|request size)/i.test(message)) {
				log$5.warn("memory embeddings: skipping multimodal file rejected as too large", {
					path: entry.path,
					bytes: prepared.structuredInputBytes,
					provider: generation.provider.id,
					model: generation.provider.model,
					error: message
				});
				await this.writeChunks({
					...prepared,
					chunks: []
				}, generation, [], false);
				return;
			}
			throw err;
		}
		const sample = embeddings.find((embedding) => embedding.length > 0);
		const vectorReady = sample ? await this.ensureVectorReady(sample.length) : false;
		await this.writeChunks(prepared, generation, embeddings, vectorReady);
	}
};
//#endregion
//#region extensions/memory-core/src/memory/manager-provider-lifecycle.ts
const EMBEDDING_PROBE_CACHE_TTL_MS = 3e4;
const log$4 = createSubsystemLogger("memory");
const EMBEDDING_PROBE_CACHE = /* @__PURE__ */ new Map();
function clearMemoryEmbeddingProbeCache() {
	EMBEDDING_PROBE_CACHE.clear();
}
function resolveEffectiveMemorySearchSettings(settings) {
	if (settings.provider !== "none" || !settings.store.vector.enabled) return settings;
	return {
		...settings,
		store: {
			...settings.store,
			vector: {
				...settings.store.vector,
				enabled: false
			}
		}
	};
}
function resolveConfiguredMemoryEmbeddingProvider(params) {
	return resolveAgentConfig(params.cfg, normalizeAgentId(params.agentId))?.memory?.search?.provider ?? params.cfg.memory?.search?.provider;
}
function resolveMemoryEmbeddingProviderRequirement(params) {
	const configuredProvider = resolveConfiguredMemoryEmbeddingProvider(params)?.trim();
	if (params.settings.provider === "none" || configuredProvider === "none") return {
		mode: "fts-only",
		provider: params.settings.provider
	};
	const adapterTransport = resolveEmbeddingProviderAdapterTransport(params.settings.provider, params.cfg);
	if (!configuredProvider || configuredProvider === "auto" || adapterTransport === "local") return {
		mode: "optional",
		provider: params.settings.provider
	};
	return {
		mode: "required",
		provider: params.settings.provider,
		configuredProvider
	};
}
var MemoryProviderLifecycle = class extends MemoryManagerEmbeddingOps {
	applyProviderResult(providerResult) {
		const providerState = resolveMemoryProviderState(providerResult);
		this.provider = providerState.provider;
		this.fallbackFrom = providerState.fallbackFrom;
		this.fallbackReason = providerState.fallbackReason;
		this.providerUnavailableReason = providerState.providerUnavailableReason;
		this.providerLifecycle = providerState.lifecycle;
		this.providerRuntime = providerState.providerRuntime;
		this.providerInitialized = true;
	}
	markEmbeddingBootstrapFailure(err, options) {
		const rawErrorName = readErrorName(err).trim();
		const errorName = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(rawErrorName) ? rawErrorName : "";
		const message = redactSensitiveText(formatErrorMessage(err), { mode: "tools" }).trim() || "embedding provider initialization failed";
		const reason = redactSensitiveText(errorName && errorName !== "Error" ? `${errorName}: ${message}` : message, { mode: "tools" });
		const provider = options?.provider ?? this.provider?.id ?? this.settings.provider;
		const debug = {
			ok: false,
			provider,
			reason,
			degradedTo: "keyword-only"
		};
		if (!options?.retainProvider) {
			this.provider = null;
			this.providerRuntime = void 0;
		}
		this.providerInitialized = true;
		this.providerUnavailableReason = reason;
		this.providerLifecycle = createDegradedMemoryProviderLifecycle({
			providerId: provider,
			reason
		});
		this.embeddingBootstrapFailure = debug;
		this.providerKey = this.computeProviderKey();
		this.batch = this.resolveBatchConfig();
		this.vector.semanticAvailable = false;
		this.cacheProbeResult({
			ok: false,
			error: reason
		});
		return debug;
	}
	async ensureEmbeddingProviderForSearch(onDebug) {
		const failure = this.embeddingBootstrapFailure;
		if (failure) {
			if (this.getCachedEmbeddingAvailability()?.ok === false) {
				onDebug?.({
					backend: "builtin",
					embeddingBootstrap: failure
				});
				return true;
			}
		}
		try {
			await this.ensureProviderInitialized();
		} catch (err) {
			if (this.providerRequirement.mode !== "optional") throw err;
			const nextFailure = this.markEmbeddingBootstrapFailure(err);
			onDebug?.({
				backend: "builtin",
				embeddingBootstrap: nextFailure
			});
			return true;
		}
		if (!failure) return false;
		if (!this.provider) {
			const nextFailure = {
				...failure,
				reason: this.providerUnavailableReason ?? failure.reason
			};
			this.embeddingBootstrapFailure = nextFailure;
			this.cacheProbeResult({
				ok: false,
				error: nextFailure.reason
			});
			onDebug?.({
				backend: "builtin",
				embeddingBootstrap: nextFailure
			});
			return true;
		}
		const currentIdentity = this.refreshIndexIdentityDirty({ providerKeyKnown: true });
		let activeFailure = failure;
		if (currentIdentity.status !== "valid") try {
			await this.syncAdmitted({
				reason: "search",
				force: true
			});
		} catch (err) {
			const message = redactSensitiveText(formatErrorMessage(err), { mode: "tools" });
			log$4.warn(`memory sync failed (embedding-bootstrap-recovery): ${message}`);
			activeFailure = this.markEmbeddingBootstrapFailure(err, { retainProvider: true });
		}
		if (this.refreshIndexIdentityDirty({ providerKeyKnown: true }).status === "valid" && await this.confirmEmbeddingBootstrapRecovery()) {
			this.vector.semanticAvailable = await this.probeVectorStoreAvailabilityAdmitted();
			this.clearEmbeddingBootstrapFailureAfterRecovery();
			return false;
		}
		activeFailure = this.embeddingBootstrapFailure ?? activeFailure;
		onDebug?.({
			backend: "builtin",
			embeddingBootstrap: activeFailure
		});
		return true;
	}
	clearEmbeddingBootstrapFailureAfterRecovery() {
		this.embeddingBootstrapFailure = void 0;
		this.providerUnavailableReason = void 0;
		if (this.provider) this.providerLifecycle = this.fallbackFrom ? {
			mode: "fallback-active",
			providerId: this.provider.id,
			fallbackFrom: this.fallbackFrom,
			reason: this.fallbackReason ?? "fallback activated"
		} : {
			mode: "active",
			providerId: this.provider.id
		};
		EMBEDDING_PROBE_CACHE.delete(this.cacheKey);
	}
	async adoptPublishedFallbackProviderIfMatched() {
		if (this.fallbackFrom || !this.provider) return false;
		const currentProviderId = resolveFallbackCurrentProviderId({
			provider: this.provider,
			lifecycle: this.providerLifecycle
		});
		const fallbackRequest = resolveMemoryFallbackProviderRequest({
			cfg: this.cfg,
			settings: this.settings,
			currentProviderId
		});
		const meta = this.readMeta();
		if (!fallbackRequest || !meta || meta.provider !== fallbackRequest.provider || meta.model !== fallbackRequest.model) return false;
		return await this.activateFallbackProvider("published memory index uses the configured fallback provider") && this.refreshIndexIdentityDirty({ providerKeyKnown: this.providerInitialized }).status === "valid";
	}
	async confirmEmbeddingBootstrapRecovery() {
		const cached = this.getCachedEmbeddingAvailability();
		if (cached) return cached.ok;
		if (!this.provider) return false;
		try {
			await this.embedBatchWithRetry(["ping"]);
			this.cacheProbeResult({ ok: true });
			return true;
		} catch (err) {
			this.markEmbeddingBootstrapFailure(err, {
				retainProvider: true,
				provider: this.provider.id
			});
			return false;
		}
	}
	async ensureProviderInitialized() {
		if (this.providerInitialized) {
			if (!(this.embeddingBootstrapFailure !== void 0 && !this.provider && this.getCachedEmbeddingAvailability() === null)) {
				await this.getPendingFallbackProviderInitialization()?.catch(() => void 0);
				return;
			}
			this.resetProviderInitializationForRetry();
		}
		if (this.settings.provider === "none") {
			this.applyProviderResult({
				provider: null,
				requestedProvider: "none",
				providerUnavailableReason: "No embedding provider available (FTS-only mode)"
			});
			this.providerKey = this.computeProviderKey();
			this.batch = this.resolveBatchConfig();
			return;
		}
		if (!this.providerInitPromise) this.providerInitPromise = (async () => {
			await this.getPendingFallbackProviderInitialization()?.catch(() => void 0);
			await this.retireCurrentProvider();
			if (this.closed) return;
			const providerResult = await createEmbeddingProvider({
				config: this.cfg,
				agentDir: resolveAgentDir(this.cfg, this.agentId),
				...this.acquireLocalService ? { acquireLocalService: this.acquireLocalService } : {},
				...resolveMemoryPrimaryProviderRequest({ settings: this.settings })
			});
			this.applyProviderResult(providerResult);
			this.providerKey = this.computeProviderKey();
			this.batch = this.resolveBatchConfig();
		})();
		try {
			await this.providerInitPromise;
		} catch (err) {
			this.providerInitPromise = null;
			throw err;
		} finally {
			if (this.providerInitialized) this.providerInitPromise = null;
		}
	}
	resetProviderInitializationForRetry() {
		this.retireCurrentProvider();
		this.providerInitialized = false;
		this.providerInitPromise = null;
		this.providerUnavailableReason = void 0;
		this.providerLifecycle = createPendingMemoryProviderLifecycle(this.requestedProvider);
	}
	markLocalEmbeddingProviderDegraded(err) {
		if (this.provider?.id !== "local") return;
		const message = formatErrorMessage(err);
		const degradedProvider = this.provider;
		this.retireCurrentProvider();
		this.providerUnavailableReason = `Local embeddings degraded: ${message}`;
		this.providerLifecycle = createDegradedMemoryProviderLifecycle({
			providerId: degradedProvider.id,
			reason: message
		});
		EMBEDDING_PROBE_CACHE.delete(this.cacheKey);
		this.providerKey = this.computeProviderKey();
		this.batch = this.resolveBatchConfig();
		this.vector.semanticAvailable = false;
		log$4.warn("memory embeddings: local provider degraded after transport failure", { error: message });
	}
	retireCurrentProvider() {
		const provider = this.provider;
		if (provider) {
			this.provider = null;
			this.providerRuntime = void 0;
			this.providersPendingRetirement.add(provider);
		}
		if (this.providersPendingRetirement.size === 0) return this.providerRetirementPromise;
		const retirement = this.providerRetirementPromise.catch(() => {}).then(async () => {
			let firstError;
			let closeFailed = false;
			for (const pendingProvider of this.providersPendingRetirement) try {
				await this.awaitProviderIdle(pendingProvider);
				await pendingProvider.close?.();
				this.providersPendingRetirement.delete(pendingProvider);
			} catch (err) {
				if (!closeFailed) firstError = err;
				closeFailed = true;
			}
			if (closeFailed) throw toErrorObject(firstError, "Embedding provider retirement failed");
		});
		this.providerRetirementPromise = retirement;
		retirement.catch((err) => {
			log$4.warn(`memory embeddings: failed to close previous provider: ${formatErrorMessage(err)}`);
		});
		return retirement;
	}
	async drainPendingProviderRetirements() {
		const errors = [];
		for (let attempt = 0; attempt < 2 && (this.provider !== null || this.providersPendingRetirement.size > 0); attempt += 1) try {
			await this.retireCurrentProvider();
		} catch (err) {
			errors.push(err);
			log$4.warn(`memory close: pending manager work failed: ${formatErrorMessage(err)}`);
		}
		return errors;
	}
	isRequiredProviderUnavailable() {
		return this.providerRequirement.mode === "required" && !this.provider;
	}
	buildRequiredProviderUnavailableError(operation) {
		const registeredProviderIds = listRegisteredMemoryEmbeddingProviderAdapters().map((adapter) => adapter.id).toSorted();
		const registeredProviders = registeredProviderIds.length > 0 ? registeredProviderIds.join(",") : "none";
		const reason = this.providerUnavailableReason ?? (this.providerLifecycle.mode === "fts-only" ? this.providerLifecycle.reason : "provider is unavailable");
		return /* @__PURE__ */ new Error(`Memory ${operation} unavailable: embedding provider "${this.settings.provider}" is configured but unavailable. Reason: ${reason}. agentId=${this.agentId} purpose=${this.purpose} lifecycle=${JSON.stringify(this.providerLifecycle)} registeredMemoryEmbeddingProviders=${registeredProviders}`);
	}
	assertRequiredProviderAvailable(operation) {
		if (this.isRequiredProviderUnavailable()) {
			const error = this.buildRequiredProviderUnavailableError(operation);
			this.resetProviderInitializationForRetry();
			throw error;
		}
	}
	refreshIndexIdentityDirty(params) {
		const provider = this.settings.provider === "none" ? null : this.providerInitialized ? this.provider ? {
			id: this.provider.id,
			model: this.provider.model
		} : null : void 0;
		const state = this.resolveCurrentIndexIdentityState({
			...provider !== void 0 ? { provider } : {},
			providerKeyKnown: params?.providerKeyKnown
		});
		this.indexIdentityState = state;
		this.indexIdentityDirty = state.status === "mismatched" || state.status === "missing" && (this.sources.has("memory") || this.hasIndexedChunks());
		return state;
	}
	refreshKeywordFallbackIndexIdentity() {
		const meta = this.readMeta();
		const state = this.resolveCurrentIndexIdentityState({
			meta,
			provider: meta && meta.provider !== "none" ? {
				id: meta.provider,
				model: meta.model
			} : null,
			providerKeyKnown: false,
			vectorReady: false
		});
		this.indexIdentityState = state;
		this.indexIdentityDirty = state.status === "mismatched" || state.status === "missing" && (this.sources.has("memory") || this.hasIndexedChunks());
		return state;
	}
	async withManagerOperation(run) {
		if (this.closing || this.closed) throw new Error("Memory index manager is closed");
		this.activeManagerOperations += 1;
		try {
			return await this.withPublishedDatabase(run);
		} finally {
			this.activeManagerOperations -= 1;
			if (this.activeManagerOperations === 0) {
				const waiters = Array.from(this.managerIdleWaiters);
				this.managerIdleWaiters.clear();
				for (const resolve of waiters) resolve();
			}
		}
	}
	async awaitManagerIdle() {
		if (this.activeManagerOperations > 0) await new Promise((resolve) => {
			this.managerIdleWaiters.add(resolve);
		});
		while (this.purpose !== "cli" && this.activeBackgroundSearchSyncs.size > 0) await Promise.all(Array.from(this.activeBackgroundSearchSyncs));
	}
	async probeVectorAvailability() {
		return await this.withManagerOperation(async () => {
			if (!this.vector.enabled) {
				this.vector.semanticAvailable = false;
				return false;
			}
			await this.ensureProviderInitialized();
			if (!this.provider) {
				this.vector.semanticAvailable = false;
				return false;
			}
			const ready = await this.probeVectorStoreAvailabilityAdmitted();
			this.vector.semanticAvailable = ready;
			return ready;
		});
	}
	async probeVectorStoreAvailability() {
		return await this.withManagerOperation(async () => await this.probeVectorStoreAvailabilityAdmitted());
	}
	async probeVectorStoreAvailabilityAdmitted() {
		if (!this.vector.enabled) {
			this.vector.available = false;
			return false;
		}
		return await this.ensureVectorReady();
	}
	cacheProbeResult(result) {
		const checkedAtMs = Date.now();
		EMBEDDING_PROBE_CACHE.set(this.cacheKey, {
			result,
			checkedAtMs,
			expireAtMs: checkedAtMs + EMBEDDING_PROBE_CACHE_TTL_MS
		});
		return result;
	}
	getCachedEmbeddingAvailability() {
		const cached = EMBEDDING_PROBE_CACHE.get(this.cacheKey);
		if (!cached) return null;
		if (Date.now() >= cached.expireAtMs) {
			EMBEDDING_PROBE_CACHE.delete(this.cacheKey);
			return null;
		}
		return {
			...cached.result,
			checked: true,
			cached: true,
			checkedAtMs: cached.checkedAtMs,
			cacheExpiresAtMs: cached.expireAtMs
		};
	}
	async probeEmbeddingAvailability() {
		return await this.withManagerOperation(async () => {
			const cached = this.getCachedEmbeddingAvailability();
			if (cached) return cached;
			await this.ensureProviderInitialized();
			if (!this.provider) return this.cacheProbeResult({
				ok: false,
				error: this.providerUnavailableReason ?? "No embedding provider available (FTS-only mode)"
			});
			try {
				await this.embedBatchWithRetry(["ping"]);
				return this.cacheProbeResult({ ok: true });
			} catch (err) {
				const message = formatErrorMessage(err);
				return this.cacheProbeResult({
					ok: false,
					error: message
				});
			}
		});
	}
};
//#endregion
//#region extensions/memory-core/src/memory/manager-provider-runtime-facts.ts
const LOCAL_EMBEDDING_RUNTIME_FACTS = Symbol.for("openclaw.localEmbeddingRuntimeFacts");
function getLocalEmbeddingRuntimeFacts(provider) {
	if (!provider) return;
	const getRuntimeFacts = Reflect.get(provider, LOCAL_EMBEDDING_RUNTIME_FACTS);
	return typeof getRuntimeFacts === "function" ? getRuntimeFacts() : void 0;
}
//#endregion
//#region extensions/memory-core/src/memory/embedding-local-service.ts
const LOCAL_SERVICE_HOST_IDENTITIES = resolveGlobalSingleton(Symbol.for("openclaw.memoryLocalServiceHostIdentities"), () => ({
	ids: /* @__PURE__ */ new WeakMap(),
	nextId: 1
}));
function resolveMemoryCoreLocalServiceHostIdentity(acquireLocalService) {
	if (!acquireLocalService) return "none";
	let id = LOCAL_SERVICE_HOST_IDENTITIES.ids.get(acquireLocalService);
	if (id === void 0) {
		id = LOCAL_SERVICE_HOST_IDENTITIES.nextId;
		LOCAL_SERVICE_HOST_IDENTITIES.nextId += 1;
		LOCAL_SERVICE_HOST_IDENTITIES.ids.set(acquireLocalService, id);
	}
	return String(id);
}
//#endregion
//#region extensions/memory-core/src/memory/manager-cache.ts
function resolveSingletonManagedCache(cacheKey) {
	const resolved = resolveGlobalSingleton(cacheKey, () => ({
		cache: /* @__PURE__ */ new Map(),
		pending: /* @__PURE__ */ new Map()
	}));
	if (typeof resolved === "object" && resolved !== null && resolved.cache instanceof Map && resolved.pending instanceof Map) return resolved;
	const repaired = {
		cache: /* @__PURE__ */ new Map(),
		pending: /* @__PURE__ */ new Map()
	};
	globalThis[cacheKey] = repaired;
	return repaired;
}
async function getOrCreateManagedCacheEntry(params) {
	if (params.bypassCache) return await params.create();
	const existing = params.cache.get(params.key);
	if (existing) return existing;
	const pending = params.pending.get(params.key);
	if (pending) return pending;
	const createPromise = (async () => {
		const refreshed = params.cache.get(params.key);
		if (refreshed) return refreshed;
		const entry = await params.create();
		params.cache.set(params.key, entry);
		return entry;
	})();
	params.pending.set(params.key, createPromise);
	try {
		return await createPromise;
	} finally {
		if (params.pending.get(params.key) === createPromise) params.pending.delete(params.key);
	}
}
//#endregion
//#region extensions/memory-core/src/memory/manager-registry.ts
const MEMORY_INDEX_MANAGER_CACHE_KEY = Symbol.for("openclaw.memoryIndexManagerCache");
const MEMORY_INDEX_MANAGER_SCOPE_CLOSES_KEY = Symbol.for("openclaw.memoryIndexManagerScopeCloses");
const MEMORY_INDEX_MANAGER_GLOBAL_LIFECYCLE_KEY = Symbol.for("openclaw.memoryIndexManagerGlobalLifecycle.v3");
const log$3 = createSubsystemLogger("memory");
function isTransientMemoryIndexManagerPurpose(purpose) {
	return purpose !== "default";
}
function normalizeMemoryIndexManagerPurpose(purpose) {
	return purpose === "status" || purpose === "cli" || purpose === "maintenance" || purpose === "search" ? purpose : "default";
}
function resolveMemoryIndexManagerCacheKey(params) {
	return [
		params.agentId,
		params.workspaceDir,
		JSON.stringify(params.settings),
		JSON.stringify(params.providerRequirement),
		resolveMemoryCoreLocalServiceHostIdentity(params.acquireLocalService),
		params.purpose
	].join(":");
}
var MemoryManagerRegistry = class {
	constructor() {
		const managedCache = resolveSingletonManagedCache(MEMORY_INDEX_MANAGER_CACHE_KEY);
		this.cache = managedCache.cache;
		this.pending = managedCache.pending;
		this.scopeOperations = resolveGlobalSingleton(MEMORY_INDEX_MANAGER_SCOPE_CLOSES_KEY, () => /* @__PURE__ */ new Map());
		this.globalLifecycle = resolveGlobalSingleton(MEMORY_INDEX_MANAGER_GLOBAL_LIFECYCLE_KEY, () => ({
			closePromise: null,
			closeFailed: false
		}));
	}
	async acquire(params, callbacks) {
		if (params.purpose === "maintenance" && (this.globalLifecycle.closePromise || this.globalLifecycle.closeFailed)) return null;
		return await this.runScopeOperation(params, async () => {
			if (this.globalLifecycle.closeFailed) await this.retryFailedGlobalClose(callbacks.close);
			const prepared = await callbacks.prepare();
			if (!prepared) return null;
			const transient = isTransientMemoryIndexManagerPurpose(params.purpose);
			const getOrCreate = async () => await getOrCreateManagedCacheEntry({
				cache: this.cache,
				pending: this.pending,
				key: prepared.key,
				bypassCache: transient,
				create: prepared.create
			});
			if (transient) return await getOrCreate();
			const cachedManager = this.cache.get(prepared.key);
			await this.closeScopeUnlocked({
				agentId: params.agentId,
				purpose: params.purpose,
				...cachedManager && prepared.reuse(cachedManager) ? { exceptKey: prepared.key } : {}
			}, callbacks.close);
			return await getOrCreate();
		});
	}
	async closeAll(close) {
		await this.runGlobalClose(async () => {
			try {
				await this.closeAllUnlocked(close);
				this.globalLifecycle.closeFailed = false;
			} catch (err) {
				this.globalLifecycle.closeFailed = true;
				throw err;
			}
		});
	}
	async closeForAgent(params) {
		const scope = {
			agentId: normalizeAgentId(params.agentId),
			purpose: params.purpose
		};
		await this.runScopeOperation(scope, async () => {
			await this.closeScopeUnlocked(scope, params.close);
		});
	}
	deleteIfCurrent(key, manager) {
		if (this.cache.get(key) === manager) this.cache.delete(key);
	}
	async retryFailedGlobalClose(close) {
		try {
			await this.closeAllUnlocked(close);
			this.globalLifecycle.closeFailed = false;
		} catch (err) {
			this.globalLifecycle.closeFailed = true;
			throw err;
		}
	}
	async runGlobalClose(operation) {
		const closePromise = (this.globalLifecycle.closePromise ?? Promise.resolve()).then(operation, operation);
		this.globalLifecycle.closePromise = closePromise;
		await closePromise;
		if (this.globalLifecycle.closePromise === closePromise) this.globalLifecycle.closePromise = null;
	}
	async runScopeOperation(params, operation) {
		while (this.globalLifecycle.closePromise) {
			const globalClose = this.globalLifecycle.closePromise;
			try {
				await globalClose;
			} catch {
				if (this.globalLifecycle.closePromise === globalClose) await this.closeAll(async (manager) => await manager.close());
			}
		}
		const scopeKey = JSON.stringify([params.agentId, params.purpose]);
		const result = (this.scopeOperations.get(scopeKey) ?? Promise.resolve()).then(operation, operation);
		const tail = result.then(() => void 0, () => void 0);
		this.scopeOperations.set(scopeKey, tail);
		try {
			return await result;
		} finally {
			if (this.scopeOperations.get(scopeKey) === tail) this.scopeOperations.delete(scopeKey);
		}
	}
	async closeAllUnlocked(close) {
		const scopedOperations = Array.from(this.scopeOperations.values());
		if (scopedOperations.length > 0) await Promise.allSettled(scopedOperations);
		const pending = Array.from(this.pending.values());
		if (pending.length > 0) await Promise.allSettled(pending);
		await this.closeEntries(Array.from(this.cache.entries()), close);
	}
	async closeScopeUnlocked(params, close) {
		const isScopedKey = (key) => key !== params.exceptKey && key.startsWith(`${params.agentId}:`) && key.endsWith(`:${params.purpose}`);
		const pending = Array.from(this.pending.entries()).filter(([key]) => isScopedKey(key)).map(([, value]) => value);
		if (pending.length > 0) await Promise.allSettled(pending);
		await this.closeEntries(Array.from(this.cache.entries()).filter(([key]) => isScopedKey(key)), close, params.agentId);
	}
	async closeEntries(entries, close, agentId) {
		let firstError;
		for (const [key, manager] of entries) try {
			await close(manager);
			this.deleteIfCurrent(key, manager);
		} catch (err) {
			firstError ??= err;
			const scope = agentId ? ` for agent ${agentId}` : "";
			log$3.warn(`failed to close memory index manager${scope}: ${String(err)}`);
		}
		if (firstError !== void 0) throw toErrorObject(firstError, "Failed to close memory index manager");
	}
};
//#endregion
//#region extensions/memory-core/src/memory/manager-search-maintenance.ts
async function runMemorySearchMaintenance(params) {
	const dirtyGeneration = params.takeDirtyGeneration();
	let manager;
	try {
		manager = await params.acquireManager();
	} catch (err) {
		params.restoreDirtyGeneration(dirtyGeneration);
		throw toErrorObject(err, "Memory search maintenance manager acquisition failed");
	}
	if (!manager) {
		params.restoreDirtyGeneration(dirtyGeneration);
		return;
	}
	let maintenanceError;
	let incompleteReason;
	try {
		manager.adoptReindexRetryState(dirtyGeneration);
		try {
			await manager.sync({ reason: params.reason });
		} catch (err) {
			if (!(err instanceof MemoryIndexRevisionConflictError)) throw err;
			await manager.sync({ reason: params.reason });
		}
		const status = manager.status();
		if (status.dirty === true) {
			params.restoreDirtyGeneration(dirtyGeneration);
			incompleteReason = status.lastSyncError;
		}
	} catch (err) {
		params.restoreDirtyGeneration(dirtyGeneration);
		maintenanceError = toErrorObject(err, "Memory search maintenance failed");
	}
	try {
		await manager.close();
	} catch (err) {
		maintenanceError ??= toErrorObject(err, "Memory search maintenance close failed");
	}
	if (maintenanceError) throw maintenanceError;
	return incompleteReason;
}
//#endregion
//#region extensions/memory-core/src/memory/importance.ts
function importanceMultiplier(importance) {
	if (importance === null || importance === void 0) return 1;
	return .75 + Math.max(1, Math.min(10, Math.floor(importance))) * .05;
}
function applyImportanceMultiplier(results) {
	return results.map(applyEntryImportance);
}
function applyEntryImportance(entry) {
	return {
		...entry,
		score: entry.score * importanceMultiplier(entry.importance)
	};
}
//#endregion
//#region extensions/memory-core/src/memory/mmr.ts
const DEFAULT_MMR_CONFIG = {
	enabled: false,
	lambda: .7
};
/**
* Compute MMR score for a candidate item.
* MMR = λ * relevance - (1-λ) * max_similarity_to_selected
*/
function computeMMRScore(relevance, maxSimilarity, lambda) {
	return lambda * relevance - (1 - lambda) * maxSimilarity;
}
/**
* Re-rank items using Maximal Marginal Relevance (MMR).
*
* The algorithm iteratively selects items that balance relevance with diversity:
* 1. Start with the highest-scoring item
* 2. For each remaining slot, select the item that maximizes the MMR score
* 3. MMR score = λ * relevance - (1-λ) * max_similarity_to_already_selected
*
* @param items - Items to re-rank, must have score and content
* @param config - MMR configuration (lambda, enabled)
* @returns Re-ranked items in MMR order
*/
function mmrRerank(items, config = {}) {
	const { enabled = DEFAULT_MMR_CONFIG.enabled, lambda = DEFAULT_MMR_CONFIG.lambda } = config;
	if (!enabled || items.length <= 1) return [...items];
	const clampedLambda = Math.max(0, Math.min(1, lambda));
	if (clampedLambda === 1) return [...items].toSorted((a, b) => b.score - a.score);
	const tokenCache = /* @__PURE__ */ new Map();
	for (const item of items) tokenCache.set(item.id, tokenize(item.content));
	const maxScore = Math.max(...items.map((i) => i.score));
	const minScore = Math.min(...items.map((i) => i.score));
	const scoreRange = maxScore - minScore;
	const normalizeScore = (score) => {
		if (scoreRange === 0) return 1;
		return (score - minScore) / scoreRange;
	};
	const selected = [];
	const remaining = new Set(items);
	const maxSimilarityByItem = /* @__PURE__ */ new Map();
	while (remaining.size > 0) {
		let bestItem = null;
		let bestMMRScore = -Infinity;
		for (const candidate of remaining) {
			const mmrScore = computeMMRScore(normalizeScore(candidate.score), maxSimilarityByItem.get(candidate) ?? 0, clampedLambda);
			if (mmrScore > bestMMRScore || mmrScore === bestMMRScore && candidate.score > (bestItem?.score ?? -Infinity)) {
				bestMMRScore = mmrScore;
				bestItem = candidate;
			}
		}
		if (bestItem) {
			selected.push(bestItem);
			remaining.delete(bestItem);
			const selectedTokens = tokenCache.get(bestItem.id) ?? tokenize(bestItem.content);
			for (const candidate of remaining) {
				const candidateTokens = tokenCache.get(candidate.id) ?? tokenize(candidate.content);
				const similarity = candidateTokens.size === 0 && selectedTokens.size === 0 ? textSimilarity(candidate.content, bestItem.content) : jaccardSimilarity(candidateTokens, selectedTokens);
				if (similarity > (maxSimilarityByItem.get(candidate) ?? 0)) maxSimilarityByItem.set(candidate, similarity);
			}
		} else break;
	}
	return selected;
}
/**
* Apply MMR re-ranking to hybrid search results.
* Adapts the generic MMR function to work with the hybrid search result format.
*/
function applyMMRToHybridResults(results, config = {}) {
	if (results.length === 0) return results;
	const itemById = /* @__PURE__ */ new Map();
	return mmrRerank(results.map((r, index) => {
		const id = `${r.path}:${r.startLine}:${index}`;
		itemById.set(id, r);
		return {
			id,
			score: r.score,
			content: r.snippet
		};
	}), config).map((item) => itemById.get(item.id));
}
//#endregion
//#region extensions/memory-core/src/memory/project-ranking.ts
function projectScoreMultiplier(projectKey, activeProjectKeys) {
	if (!projectKey || !activeProjectKeys || activeProjectKeys.length === 0) return 1;
	const active = new Set(activeProjectKeys);
	return projectKey.split(";").map((key) => key.trim()).filter(Boolean).every((key) => active.has(key)) ? 1.15 : .9;
}
function applyProjectRanking(results, activeProjectKeys) {
	const eligible = results.filter((entry) => !entry.projectKey?.split(";").map((key) => key.trim()).includes(INVALID_PROJECT_ANNOTATION_KEY));
	if (!activeProjectKeys || activeProjectKeys.length === 0) return eligible;
	return eligible.map((entry) => Object.assign({}, entry, { score: entry.score * projectScoreMultiplier(entry.projectKey, activeProjectKeys) })).toSorted((left, right) => right.score - left.score || left.path.localeCompare(right.path) || left.startLine - right.startLine || left.endLine - right.endLine);
}
//#endregion
//#region extensions/memory-core/src/memory/temporal-decay.ts
const DEFAULT_TEMPORAL_DECAY_CONFIG = {
	enabled: false,
	halfLifeDays: 30
};
const DAY_MS = 864e5;
const DATED_MEMORY_PATH_RE = /(?:^|\/)memory\/(?:[^/]+\/)*(\d{4})-(\d{2})-(\d{2})(?:-[^/]+)?\.md$/;
function toDecayLambda(halfLifeDays) {
	if (!Number.isFinite(halfLifeDays) || halfLifeDays <= 0) return 0;
	return Math.LN2 / halfLifeDays;
}
function calculateTemporalDecayMultiplier(params) {
	const lambda = toDecayLambda(params.halfLifeDays);
	const clampedAge = Math.max(0, params.ageInDays);
	if (lambda <= 0 || !Number.isFinite(clampedAge)) return 1;
	return Math.exp(-lambda * clampedAge);
}
function applyTemporalDecayToScore(params) {
	return params.score * calculateTemporalDecayMultiplier(params);
}
function parseMemoryDateFromPath(filePath) {
	const normalized = filePath.replaceAll("\\", "/").replace(/^\.\//, "");
	const match = DATED_MEMORY_PATH_RE.exec(normalized);
	if (!match) return null;
	const year = Number(match[1]);
	const month = Number(match[2]);
	const day = Number(match[3]);
	if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return null;
	const timestamp = Date.UTC(year, month - 1, day);
	const parsed = new Date(timestamp);
	if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
	return parsed;
}
function isEvergreenMemoryPath(filePath) {
	const normalized = filePath.replaceAll("\\", "/").replace(/^\.\//, "");
	if (normalized === "MEMORY.md" || normalized === "USER.md") return true;
	if (!normalized.startsWith("memory/")) return false;
	return !DATED_MEMORY_PATH_RE.test(normalized);
}
async function extractTimestamp(params) {
	const fromPath = parseMemoryDateFromPath(params.filePath);
	if (fromPath) return fromPath;
	if (params.source === "memory" && isEvergreenMemoryPath(params.filePath)) return null;
	if (!params.workspaceDir) return null;
	const absolutePath = path.isAbsolute(params.filePath) ? params.filePath : path.resolve(params.workspaceDir, params.filePath);
	try {
		const stat = await fs$1.stat(absolutePath);
		if (!Number.isFinite(stat.mtimeMs)) return null;
		return new Date(stat.mtimeMs);
	} catch {
		return null;
	}
}
function ageInDaysFromTimestamp(timestamp, nowMs) {
	return Math.max(0, nowMs - timestamp.getTime()) / DAY_MS;
}
async function applyTemporalDecayToHybridResults(params) {
	const config = {
		...DEFAULT_TEMPORAL_DECAY_CONFIG,
		...params.temporalDecay
	};
	if (!config.enabled) return [...params.results];
	const nowMs = params.nowMs ?? Date.now();
	const timestampPromiseCache = /* @__PURE__ */ new Map();
	return Promise.all(params.results.map(async (entry) => {
		const cacheKey = `${entry.source}:${entry.path}`;
		let timestampPromise = timestampPromiseCache.get(cacheKey);
		if (!timestampPromise) {
			timestampPromise = extractTimestamp({
				filePath: entry.path,
				source: entry.source,
				workspaceDir: params.workspaceDir
			});
			timestampPromiseCache.set(cacheKey, timestampPromise);
		}
		const timestamp = await timestampPromise;
		if (!timestamp) return entry;
		const decayedScore = applyTemporalDecayToScore({
			score: entry.score,
			ageInDays: ageInDaysFromTimestamp(timestamp, nowMs),
			halfLifeDays: config.halfLifeDays
		});
		return {
			...entry,
			score: decayedScore
		};
	}));
}
//#endregion
//#region extensions/memory-core/src/memory/hybrid.ts
function buildFtsQuery(raw) {
	const tokens = normalizeStringEntries(raw.match(/[\p{L}\p{N}_]+/gu) ?? []);
	if (tokens.length === 0) return null;
	return tokens.map((t) => `"${t.replaceAll("\"", "")}"`).join(" AND ");
}
function bm25RankToScore(rank) {
	if (!Number.isFinite(rank)) return 1 / 1e3;
	if (rank < 0) {
		const relevance = -rank;
		return relevance / (1 + relevance);
	}
	return 1 / (1 + rank);
}
function scoreExactPathTieForTemporalDecay(contentScore) {
	return (1 + Math.max(0, Math.min(1, contentScore))) / 2;
}
async function mergeHybridResults(params) {
	const byId = /* @__PURE__ */ new Map();
	for (const r of params.vector) byId.set(r.id, {
		id: r.id,
		path: r.path,
		startLine: r.startLine,
		endLine: r.endLine,
		source: r.source,
		snippet: r.snippet,
		vectorScore: r.vectorScore,
		textScore: 0,
		rankingScore: 0,
		pathScore: 0,
		exactPathSpecificity: r.exactPathSpecificity ?? 0,
		hasBodyMatch: false,
		hasVector: true,
		hasKeyword: false,
		importance: r.importance,
		triggers: r.triggers,
		projectKey: r.projectKey,
		...r.provenance ? { provenance: r.provenance } : {}
	});
	for (const r of params.keyword) {
		const exactPathSpecificity = r.exactPathSpecificity ?? 0;
		const existing = byId.get(r.id);
		if (existing) {
			existing.textScore = r.textScore;
			existing.hasBodyMatch = r.hasBodyMatch ?? r.textScore > 0;
			existing.rankingScore = r.rankingScore ?? r.textScore;
			existing.pathScore = r.pathScore ?? 0;
			existing.exactPathSpecificity = Math.max(existing.exactPathSpecificity, exactPathSpecificity);
			existing.hasKeyword = true;
			existing.importance ??= r.importance;
			existing.triggers ??= r.triggers;
			existing.projectKey ??= r.projectKey;
			if (!existing.provenance && r.provenance) existing.provenance = r.provenance;
			if (r.snippet && r.snippet.length > 0) existing.snippet = r.snippet;
		} else byId.set(r.id, {
			id: r.id,
			path: r.path,
			startLine: r.startLine,
			endLine: r.endLine,
			source: r.source,
			snippet: r.snippet,
			vectorScore: 0,
			textScore: r.textScore,
			rankingScore: r.rankingScore ?? r.textScore,
			pathScore: r.pathScore ?? 0,
			exactPathSpecificity,
			hasBodyMatch: r.hasBodyMatch ?? r.textScore > 0,
			hasVector: false,
			hasKeyword: true,
			importance: r.importance,
			triggers: r.triggers,
			projectKey: r.projectKey,
			...r.provenance ? { provenance: r.provenance } : {}
		});
	}
	const temporalDecayConfig = {
		...DEFAULT_TEMPORAL_DECAY_CONFIG,
		...params.temporalDecay
	};
	const rankable = applyProjectRanking(applyImportanceMultiplier(await applyTemporalDecayToHybridResults({
		results: Array.from(byId.values()).map((entry) => {
			const keywordScore = entry.textScore > 0 ? entry.rankingScore : entry.exactPathSpecificity > 0 ? 0 : entry.pathScore;
			const contentScore = entry.hasVector && !entry.hasKeyword && params.vectorWeight > 0 && params.isNonTextMediaPath?.(entry.path) === true ? entry.vectorScore : params.vectorWeight * entry.vectorScore + params.textWeight * keywordScore;
			const hasWeightedContentRelevance = contentScore > 0;
			const lexicalRank = entry.hasBodyMatch && entry.textScore === 0 ? entry.rankingScore : 0;
			const weightedScore = entry.exactPathSpecificity > 0 ? temporalDecayConfig.enabled ? scoreExactPathTieForTemporalDecay(contentScore) : hasWeightedContentRelevance ? contentScore : 1 : contentScore;
			const result = {
				path: entry.path,
				startLine: entry.startLine,
				endLine: entry.endLine,
				score: weightedScore,
				vectorScore: entry.vectorScore,
				textScore: entry.textScore,
				exactPathSpecificity: entry.exactPathSpecificity,
				hasWeightedContentRelevance,
				lexicalRank,
				snippet: entry.snippet,
				source: entry.source,
				importance: entry.importance,
				triggers: entry.triggers,
				projectKey: entry.projectKey
			};
			if (entry.provenance) Object.assign(result, { provenance: entry.provenance });
			return result;
		}),
		temporalDecay: temporalDecayConfig,
		workspaceDir: params.workspaceDir,
		nowMs: params.nowMs
	})), params.activeProjectKeys).map((entry) => {
		const exactPathTieScore = entry.score;
		return Object.assign(entry, {
			exactPathTieScore,
			score: entry.exactPathSpecificity > 0 ? projectScoreMultiplier(entry.projectKey, params.activeProjectKeys) : entry.score
		});
	});
	const nonExact = rankable.filter((entry) => entry.exactPathSpecificity === 0).toSorted((a, b) => b.score - a.score || b.lexicalRank - a.lexicalRank || a.path.localeCompare(b.path) || a.startLine - b.startLine || a.endLine - b.endLine);
	const mmrConfig = {
		...DEFAULT_MMR_CONFIG,
		...params.mmr
	};
	const rerankExactGroup = (entries) => {
		if (!mmrConfig.enabled) return entries;
		return applyMMRToHybridResults(entries.map((entry) => Object.assign(entry, { score: entry.exactPathTieScore })), mmrConfig).map((entry) => Object.assign(entry, { score: projectScoreMultiplier(entry.projectKey, params.activeProjectKeys) }));
	};
	const compareExactTieScores = (a, b) => b.exactPathTieScore - a.exactPathTieScore || b.lexicalRank - a.lexicalRank || a.path.localeCompare(b.path) || a.startLine - b.startLine || a.endLine - b.endLine;
	return [...[
		3,
		2,
		1
	].flatMap((specificity) => {
		const tier = rankable.filter((entry) => entry.exactPathSpecificity === specificity).toSorted(compareExactTieScores);
		if (temporalDecayConfig.enabled) return rerankExactGroup(tier);
		const contentBacked = tier.filter((entry) => entry.hasWeightedContentRelevance || entry.lexicalRank > 0);
		const pathOnly = tier.filter((entry) => !entry.hasWeightedContentRelevance && entry.lexicalRank === 0);
		return rerankExactGroup(contentBacked).concat(rerankExactGroup(pathOnly));
	}), ...mmrConfig.enabled ? applyMMRToHybridResults(nonExact, mmrConfig) : nonExact].map(({ exactPathSpecificity: _exactPathSpecificity, exactPathTieScore: _exactPathTieScore, hasWeightedContentRelevance: _hasWeightedContentRelevance, lexicalRank: _lexicalRank, ...entry }) => entry);
}
function hybridResultRangeKey(entry) {
	return `${entry.source}:${entry.path}:${entry.startLine}:${entry.endLine}`;
}
function selectHybridSearchResults(params) {
	const strict = params.merged.filter((entry) => entry.score >= params.minScore);
	const selected = strict.slice(0, params.maxResults);
	if (params.keyword.length === 0 || selected.length === params.maxResults) return selected;
	const keywordKeys = new Set(params.keyword.map((entry) => hybridResultRangeKey(entry)));
	if (strict.length === 0) return params.merged.filter((entry) => entry.score >= 0 && keywordKeys.has(hybridResultRangeKey(entry))).slice(0, params.maxResults);
	const seen = new Set(selected.map((entry) => hybridResultRangeKey(entry)));
	for (const entry of params.merged) {
		if (selected.length === params.maxResults) break;
		const key = hybridResultRangeKey(entry);
		if (entry.score < params.minScore && entry.vectorScore === 0 && keywordKeys.has(key) && !seen.has(key)) {
			seen.add(key);
			selected.push(entry);
		}
	}
	return selected;
}
//#endregion
//#region extensions/memory-core/src/memory/manager-search.ts
const FTS_QUERY_TOKEN_RE = /[\p{L}\p{N}_]+/gu;
const SHORT_CJK_TRIGRAM_RE = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u3131-\u3163]/u;
const EXACT_PATH_SPECIFICITY_SQL_FUNCTION = "openclaw_memory_exact_path_specificity";
const NORMALIZED_PATH_CONTAINS_SQL_FUNCTION = "openclaw_memory_normalized_path_contains";
const FALLBACK_VECTOR_BATCH_SIZE = 256;
function yieldToEventLoop() {
	return new Promise((resolve) => {
		setImmediate(resolve);
	});
}
const MEMORY_ORIGIN_CLASSES = /* @__PURE__ */ new Set([
	"owner",
	"agent",
	"untrusted",
	"system"
]);
const MEMORY_SESSION_KINDS = /* @__PURE__ */ new Set([
	"interactive",
	"cron",
	"heartbeat",
	"subagent",
	"unknown"
]);
function readChunkProvenance(db, chunkId) {
	const row = db.prepare(`SELECT origin_class, session_kind, observed_at, supersedes_key
       FROM memory_index_chunk_provenance WHERE chunk_id = ?`).get(chunkId);
	if (!row || typeof row.origin_class !== "string" || !MEMORY_ORIGIN_CLASSES.has(row.origin_class) || typeof row.session_kind !== "string" || !MEMORY_SESSION_KINDS.has(row.session_kind) || typeof row.observed_at !== "number") return {};
	return { provenance: {
		originClass: row.origin_class,
		sessionKind: row.session_kind,
		observedAt: row.observed_at,
		...typeof row.supersedes_key === "string" && row.supersedes_key.trim() ? { supersedesKey: row.supersedes_key } : {}
	} };
}
function comparePathKeywordSearchResults(left, right) {
	const specificityDelta = right.exactPathSpecificity - left.exactPathSpecificity;
	if (specificityDelta !== 0) return specificityDelta;
	if (left.exactPathSpecificity === 0) {
		const pathDelta = right.pathScore - left.pathScore;
		if (pathDelta !== 0) return pathDelta;
	}
	return left.path.localeCompare(right.path) || left.startLine - right.startLine || left.id.localeCompare(right.id);
}
function normalizeSearchTokens(raw) {
	return normalizeStringEntriesLower(raw.match(FTS_QUERY_TOKEN_RE) ?? []);
}
function scoreFallbackKeywordResult(params) {
	const queryTokens = uniqueStrings(normalizeSearchTokens(params.query));
	if (queryTokens.length === 0) return params.ftsScore;
	const textTokens = normalizeSearchTokens(params.text);
	const textTokenSet = new Set(textTokens);
	const pathLower = params.path.toLowerCase();
	const overlap = queryTokens.filter((token) => textTokenSet.has(token)).length;
	const uniqueQueryOverlap = overlap / Math.max(new Set(queryTokens).size, 1);
	const density = overlap / Math.max(textTokenSet.size, 1);
	const pathBoost = queryTokens.reduce((score, token) => score + (pathLower.includes(token) ? .18 : 0), 0);
	const textLengthBoost = Math.min(params.text.length / 160, .18);
	const lexicalBoost = uniqueQueryOverlap * .45 + density * .2 + pathBoost + textLengthBoost;
	return Math.min(1, params.ftsScore + lexicalBoost);
}
function escapeLikePattern(term) {
	return term.replaceAll("\\", "\\\\").replaceAll("%", "\\%").replaceAll("_", "\\_");
}
function isAscii(value) {
	for (const codePoint of value) if ((codePoint.codePointAt(0) ?? 0) > 127) return false;
	return true;
}
function resolveUnicodeCandidateAnchors(value) {
	const firstNonAsciiCodePoint = Array.from(value).find((codePoint) => !isAscii(codePoint));
	if (!firstNonAsciiCodePoint) return [];
	return [.../* @__PURE__ */ new Set([
		firstNonAsciiCodePoint,
		firstNonAsciiCodePoint.toLowerCase(),
		firstNonAsciiCodePoint.toUpperCase()
	])];
}
function normalizePathIdentifier(value) {
	return value.trim().replaceAll("\\", "/").replace(/^\.\//, "").normalize("NFC").toLowerCase();
}
function resolveExactPathSpecificity(query, candidatePath) {
	const normalizedQuery = normalizePathIdentifier(query);
	const normalizedPath = normalizePathIdentifier(candidatePath);
	if (!normalizedQuery || normalizedQuery === ".") return 0;
	if (normalizedQuery === normalizedPath) return 3;
	if (normalizedQuery.includes("/")) return 0;
	const basename = normalizedPath.split("/").at(-1) ?? normalizedPath;
	if (normalizedQuery === basename) return 2;
	const extensionIndex = basename.lastIndexOf(".");
	return normalizedQuery === (extensionIndex > 0 ? basename.slice(0, extensionIndex) : basename) ? 1 : 0;
}
function registerPathSearchSqlFunctions(db) {
	db.function(EXACT_PATH_SPECIFICITY_SQL_FUNCTION, { deterministic: true }, (candidatePath, query) => typeof candidatePath === "string" && typeof query === "string" ? resolveExactPathSpecificity(query, candidatePath) : 0);
	db.function(NORMALIZED_PATH_CONTAINS_SQL_FUNCTION, { deterministic: true }, (candidatePath, query) => typeof candidatePath === "string" && typeof query === "string" ? Number(candidatePath.normalize("NFC").toLowerCase().includes(query.normalize("NFC").toLowerCase())) : 0);
}
function buildPathSubstringFilter(params) {
	const candidateClauses = [];
	const candidateParams = [];
	const normalizedClauses = [];
	const normalizedParams = [];
	for (const term of params.terms) {
		if (isAscii(term)) {
			candidateClauses.push(`${params.candidatePathColumn} LIKE ? ESCAPE '\\'`);
			candidateParams.push(`%${escapeLikePattern(term)}%`);
			continue;
		}
		const anchors = resolveUnicodeCandidateAnchors(term);
		if (anchors.length === 0) continue;
		candidateClauses.push(`(${anchors.map(() => `${params.candidatePathColumn} LIKE ? ESCAPE '\\'`).join(" OR ")})`);
		candidateParams.push(...anchors.map((anchor) => `%${escapeLikePattern(anchor)}%`));
		normalizedClauses.push(`${NORMALIZED_PATH_CONTAINS_SQL_FUNCTION}(${params.normalizedPathColumn}, ?) = 1`);
		normalizedParams.push(term);
	}
	return {
		candidateClause: candidateClauses.map((clause) => ` AND ${clause}`).join(""),
		candidateParams,
		normalizedClause: normalizedClauses.map((clause) => ` AND ${clause}`).join(""),
		normalizedParams
	};
}
function buildExactPathCandidatePatterns(query) {
	const normalized = query.trim().replaceAll("\\", "/").replace(/^\.\//, "");
	if (!normalized || normalized === ".") return [];
	const canonicalForms = [normalized.normalize("NFC"), normalized.normalize("NFD")];
	const forms = new Set(canonicalForms);
	if (!isAscii(normalized)) for (const form of canonicalForms) {
		forms.add(form.toLowerCase());
		forms.add(form.toUpperCase());
	}
	const patterns = /* @__PURE__ */ new Set();
	for (const form of forms) {
		const escaped = escapeLikePattern(form);
		if (normalized.includes("/")) {
			patterns.add(escaped);
			continue;
		}
		patterns.add(escaped);
		patterns.add(`${escaped}.%`);
		patterns.add(`%/${escaped}`);
		patterns.add(`%/${escaped}.%`);
	}
	if (!isAscii(normalized)) {
		const asciiAnchor = normalized.normalize("NFD").toLowerCase().match(/[a-z0-9_]+/g)?.toSorted((left, right) => right.length - left.length)[0];
		if (asciiAnchor) patterns.add(`%${escapeLikePattern(asciiAnchor)}%`);
		if (normalized.toLowerCase() !== normalized.toUpperCase()) for (const anchor of resolveUnicodeCandidateAnchors(normalized)) patterns.add(`%${escapeLikePattern(anchor)}%`);
	}
	return [...patterns];
}
function buildMatchQueryFromTerms(terms) {
	if (terms.length === 0) return null;
	return terms.map((term) => `"${term.replaceAll("\"", "")}"`).join(" AND ");
}
function resolveProviderModels(primary, aliases) {
	return Array.from(/* @__PURE__ */ new Set([primary, ...(aliases ?? []).filter(Boolean)]));
}
function buildModelFilter(column, models) {
	return models.length === 1 ? `${column} = ?` : `${column} IN (${models.map(() => "?").join(", ")})`;
}
function planKeywordSearch(params) {
	if (params.ftsTokenizer !== "trigram") return {
		matchQuery: params.buildFtsQuery(params.query),
		substringTerms: []
	};
	const tokenPattern = params.includeCombiningMarks ? /[\p{L}\p{M}\p{N}_]+/gu : FTS_QUERY_TOKEN_RE;
	const tokens = normalizeStringEntries(params.query.match(tokenPattern) ?? []);
	if (tokens.length === 0) return {
		matchQuery: null,
		substringTerms: []
	};
	const matchTerms = [];
	const substringTerms = [];
	for (const token of tokens) {
		if (Array.from(token).length < 3 && (params.includeAllShortTrigramTerms || SHORT_CJK_TRIGRAM_RE.test(token))) {
			substringTerms.push(token);
			continue;
		}
		matchTerms.push(token);
	}
	return {
		matchQuery: buildMatchQueryFromTerms(matchTerms),
		substringTerms
	};
}
function planPathKeywordSearch(params) {
	const forms = params.ftsTokenizer === "trigram" ? /* @__PURE__ */ new Set([params.query.normalize("NFC"), params.query.normalize("NFD")]) : /* @__PURE__ */ new Set([params.query]);
	const seen = /* @__PURE__ */ new Set();
	const plans = [];
	const addPlan = (query, plan) => {
		const key = JSON.stringify([plan.matchQuery, plan.substringTerms]);
		if (!seen.has(key)) {
			seen.add(key);
			plans.push({
				query,
				...plan
			});
		}
	};
	for (const query of forms) addPlan(query, planKeywordSearch({
		...params,
		query,
		includeAllShortTrigramTerms: true,
		includeCombiningMarks: true
	}));
	if (params.ftsTokenizer !== "trigram") for (const query of /* @__PURE__ */ new Set([params.query.normalize("NFC"), params.query.normalize("NFD")])) {
		const tokens = normalizeStringEntries(query.match(/[\p{L}\p{M}\p{N}_]+/gu) ?? []);
		const substringTerms = tokens.filter((token) => !isAscii(token));
		if (substringTerms.length > 0) addPlan(query, {
			matchQuery: buildMatchQueryFromTerms(tokens.filter(isAscii)),
			substringTerms
		});
	}
	return plans;
}
async function searchVector(params) {
	if (params.queryVec.length === 0 || params.limit <= 0) return [];
	params.signal?.throwIfAborted();
	const providerModels = resolveProviderModels(params.providerModel, params.providerModelAliases);
	const searchFallback = () => searchChunksByEmbedding({
		db: params.db,
		providerModel: params.providerModel,
		providerModelAliases: params.providerModelAliases,
		sourceFilter: params.sourceFilterChunks,
		queryVec: params.queryVec,
		limit: params.limit,
		snippetMaxChars: params.snippetMaxChars,
		signal: params.signal
	});
	const vectorReady = await params.ensureVectorReady(params.queryVec.length);
	params.signal?.throwIfAborted();
	if (vectorReady) {
		if (!params.runVectorKnn) throw new Error("memory vector KNN subprocess is unavailable");
		const response = await params.runVectorKnn({
			vectorTable: params.vectorTable,
			providerModels,
			queryVec: params.queryVec,
			limit: params.limit,
			snippetMaxChars: params.snippetMaxChars,
			sourceFilter: params.sourceFilterVec
		}, params.signal);
		if (response.fallbackScanRequired) return await searchFallback();
		return response.rows.map((row) => Object.assign({
			id: row.id,
			path: row.path,
			startLine: row.start_line,
			endLine: row.end_line,
			score: 1 - row.dist,
			snippet: truncateUtf16Safe(row.text, params.snippetMaxChars),
			source: row.source
		}, readChunkProvenance(params.db, row.id)));
	}
	return await searchFallback();
}
async function searchChunksByEmbedding(params) {
	if (params.limit <= 0) return [];
	const providerModels = resolveProviderModels(params.providerModel, params.providerModelAliases);
	const modelFilter = buildModelFilter("model", providerModels);
	const stmt = params.db.prepare(`SELECT rowid, id, path, start_line, end_line, text, embedding, source
  FROM memory_index_chunks
 WHERE ${modelFilter} AND rowid > ?${params.sourceFilter.sql}\n ORDER BY rowid ASC\n LIMIT ?`);
	const topResults = [];
	let lastRowid = 0;
	while (true) {
		const batch = stmt.all(...providerModels, lastRowid, ...params.sourceFilter.params, FALLBACK_VECTOR_BATCH_SIZE);
		if (batch.length === 0) break;
		for (const row of batch) {
			const score = cosineSimilarity(params.queryVec, parseEmbedding(row.embedding));
			if (Number.isFinite(score)) {
				const result = {
					id: row.id,
					path: row.path,
					startLine: row.start_line,
					endLine: row.end_line,
					score,
					snippet: truncateUtf16Safe(row.text, params.snippetMaxChars),
					source: row.source
				};
				if (topResults.length < params.limit) {
					topResults.push(result);
					if (topResults.length === params.limit) topResults.sort((a, b) => b.score - a.score);
				} else {
					const lowest = topResults.at(-1);
					if (lowest && result.score > lowest.score) {
						topResults[topResults.length - 1] = result;
						topResults.sort((a, b) => b.score - a.score);
					}
				}
			}
		}
		const nextRowid = batch.at(-1)?.rowid;
		lastRowid = typeof nextRowid === "bigint" ? Number(nextRowid) : nextRowid ?? lastRowid;
		if (batch.length < FALLBACK_VECTOR_BATCH_SIZE) break;
		await yieldToEventLoop();
		params.signal?.throwIfAborted();
	}
	topResults.sort((a, b) => b.score - a.score);
	for (const result of topResults) Object.assign(result, readChunkProvenance(params.db, result.id));
	return topResults;
}
async function searchKeyword(params) {
	if (params.limit <= 0) return [];
	const plan = planKeywordSearch({
		query: params.query,
		ftsTokenizer: params.ftsTokenizer,
		buildFtsQuery: params.buildFtsQuery
	});
	if (!plan.matchQuery && plan.substringTerms.length === 0) return [];
	const liveChunkClause = ` AND EXISTS (SELECT 1 FROM memory_index_chunks c WHERE c.id = ${params.ftsTable}.id)`;
	const substringClause = plan.substringTerms.map(() => " AND text LIKE ? ESCAPE '\\'").join("");
	const substringParams = plan.substringTerms.map((term) => `%${escapeLikePattern(term)}%`);
	let rows;
	let usedMatch = false;
	if (plan.matchQuery) try {
		rows = params.db.prepare(`SELECT id, path, source, start_line, end_line, text,\n       bm25(${params.ftsTable}) AS rank\n  FROM ${params.ftsTable}\n WHERE ${params.ftsTable} MATCH ?${substringClause}${liveChunkClause}${params.sourceFilter.sql}\n ORDER BY rank ASC\n LIMIT ?`).all(plan.matchQuery, ...substringParams, ...params.sourceFilter.params, params.limit);
		usedMatch = true;
	} catch (matchErr) {
		console.warn(`memory search: FTS5 MATCH failed, falling back to LIKE: ${String(matchErr)}`);
		const queryTokens = normalizeStringEntries(params.query.match(FTS_QUERY_TOKEN_RE) ?? []);
		const allTerms = uniqueStrings([...queryTokens, ...plan.substringTerms]);
		const fallbackLikeClause = allTerms.map(() => " AND text LIKE ? ESCAPE '\\'").join("");
		const fallbackLikeParams = allTerms.map((term) => `%${escapeLikePattern(term)}%`);
		rows = params.db.prepare(`SELECT id, path, source, start_line, end_line, text,
       0 AS rank
  FROM ${params.ftsTable}\n WHERE 1=1${fallbackLikeClause}${liveChunkClause}${params.sourceFilter.sql}\n LIMIT ?`).all(...fallbackLikeParams, ...params.sourceFilter.params, params.limit);
	}
	else rows = params.db.prepare(`SELECT id, path, source, start_line, end_line, text,
       0 AS rank
  FROM ${params.ftsTable}\n WHERE 1=1${substringClause}${liveChunkClause}${params.sourceFilter.sql}\n LIMIT ?`).all(...substringParams, ...params.sourceFilter.params, params.limit);
	return rows.map((row) => {
		const textScore = usedMatch ? params.bm25RankToScore(row.rank) : 0;
		const score = params.boostFallbackRanking ? scoreFallbackKeywordResult({
			query: params.rankingQuery ?? params.query,
			path: row.path,
			text: row.text,
			ftsScore: textScore
		}) : textScore;
		return Object.assign({
			id: row.id,
			path: row.path,
			startLine: row.start_line,
			endLine: row.end_line,
			score,
			textScore,
			hasBodyMatch: true,
			snippet: truncateUtf16Safe(row.text, params.snippetMaxChars),
			source: row.source
		}, readChunkProvenance(params.db, row.id));
	});
}
async function searchPathKeyword(params) {
	if (params.limit <= 0) return [];
	const pathColumn = `${params.pathFtsTable}.path`;
	const pathPlans = planPathKeywordSearch({
		query: params.query,
		ftsTokenizer: params.ftsTokenizer,
		buildFtsQuery: params.buildFtsQuery
	});
	const plan = pathPlans[0] ?? {
		query: params.query,
		matchQuery: null,
		substringTerms: []
	};
	const planSubstringFilter = buildPathSubstringFilter({
		terms: plan.substringTerms,
		candidatePathColumn: pathColumn,
		normalizedPathColumn: "path"
	});
	registerPathSearchSqlFunctions(params.db);
	const exactPathQuery = params.exactPathQuery ?? params.query;
	const hasExplicitExactPathHeadroom = params.exactPathLimit !== void 0;
	const exactPathLimit = Math.max(0, Math.floor(params.exactPathLimit ?? params.limit));
	const exactCandidatePatterns = buildExactPathCandidatePatterns(exactPathQuery);
	const loadExactRows = (useLexicalCandidates) => {
		const qualifiedPatternClause = exactCandidatePatterns.map(() => `${pathColumn} LIKE ? ESCAPE '\\'`).join(" OR ");
		const candidateCtes = useLexicalCandidates ? `candidates AS MATERIALIZED (\n  SELECT ${params.pathFtsTable}.path, ${params.pathFtsTable}.source\n    FROM ${params.pathFtsTable}\n   WHERE ${plan.matchQuery ? `${params.pathFtsTable} MATCH ?` : "1=1"}${planSubstringFilter.candidateClause}${params.sourceFilter.sql}\n), pattern_candidates AS MATERIALIZED (\n  SELECT path, source FROM candidates\n   WHERE (${exactCandidatePatterns.map(() => "path LIKE ? ESCAPE '\\'").join(" OR ")})\n)` : `pattern_candidates AS MATERIALIZED (\n  SELECT ${params.pathFtsTable}.path, ${params.pathFtsTable}.source\n    FROM ${params.pathFtsTable}\n   WHERE (${qualifiedPatternClause})${params.sourceFilter.sql}\n)`;
		const candidateParams = useLexicalCandidates ? [
			...plan.matchQuery ? [plan.matchQuery] : [],
			...planSubstringFilter.candidateParams,
			...params.sourceFilter.params,
			...exactCandidatePatterns
		] : [...exactCandidatePatterns, ...params.sourceFilter.params];
		return params.db.prepare(`WITH ${candidateCtes}, scored_paths AS MATERIALIZED (\n  SELECT path, source,\n         ${EXACT_PATH_SPECIFICITY_SQL_FUNCTION}(path, ?) AS exact_path_specificity\n    FROM pattern_candidates\n), exact_paths AS MATERIALIZED (\n  SELECT path, source, exact_path_specificity FROM scored_paths\n   WHERE exact_path_specificity > 0\n)\nSELECT c.id, exact_paths.path, exact_paths.source,\n       c.start_line, c.end_line, c.text, exact_paths.exact_path_specificity\n  FROM exact_paths\n  JOIN memory_index_chunks c ON c.id = (\n    SELECT candidate.id FROM memory_index_chunks candidate\n     WHERE candidate.path = exact_paths.path\n       AND candidate.source = exact_paths.source\n     ORDER BY candidate.start_line, candidate.end_line, candidate.id\n     LIMIT 1\n  )\n ORDER BY exact_paths.exact_path_specificity DESC,\n          exact_paths.path ASC, exact_paths.source ASC\n LIMIT ?`).all(...candidateParams, exactPathQuery, exactPathLimit);
	};
	const useLexicalExactCandidates = isAscii(exactPathQuery) && (plan.matchQuery !== null || plan.substringTerms.length > 0);
	let exactRows = [];
	if (exactCandidatePatterns.length > 0 && exactPathLimit > 0) try {
		exactRows = loadExactRows(useLexicalExactCandidates);
	} catch (err) {
		if (!useLexicalExactCandidates) throw err;
		exactRows = loadExactRows(false);
	}
	const exactResults = exactRows.map((row) => {
		const result = {
			id: row.id,
			path: row.path,
			startLine: row.start_line,
			endLine: row.end_line,
			score: 0,
			textScore: 0,
			pathScore: 0,
			exactPathSpecificity: row.exact_path_specificity,
			hasBodyMatch: false,
			snippet: truncateUtf16Safe(row.text, params.snippetMaxChars),
			source: row.source
		};
		const provenance = readChunkProvenance(params.db, row.id);
		if ("provenance" in provenance) result.provenance = provenance.provenance;
		return result;
	});
	if (!pathPlans.some((entry) => entry.matchQuery || entry.substringTerms.length > 0)) return exactResults;
	const loadFilteredLexicalRows = (matchQuery, terms, specificity, resultLimit) => {
		const filter = buildPathSubstringFilter({
			terms,
			candidatePathColumn: pathColumn,
			normalizedPathColumn: "path"
		});
		const specificityOperator = specificity === "exact" ? ">" : "=";
		const qualifiedSpecificityClause = ` AND ${EXACT_PATH_SPECIFICITY_SQL_FUNCTION}(${pathColumn}, ?) ${specificityOperator} 0`;
		const normalizedSpecificityClause = ` AND ${EXACT_PATH_SPECIFICITY_SQL_FUNCTION}(path, ?) ${specificityOperator} 0`;
		const queryParams = [
			...matchQuery ? [matchQuery] : [],
			...filter.candidateParams,
			...params.sourceFilter.params
		];
		if (!filter.normalizedClause) return params.db.prepare(`SELECT c.id, ${params.pathFtsTable}.path, ${params.pathFtsTable}.source,\n       c.start_line, c.end_line, c.text,\n       ${matchQuery ? `bm25(${params.pathFtsTable})` : "0"} AS rank\n  FROM ${params.pathFtsTable}\n  JOIN memory_index_chunks c ON c.id = (\n    SELECT candidate.id FROM memory_index_chunks candidate\n     WHERE candidate.path = ${params.pathFtsTable}.path\n       AND candidate.source = ${params.pathFtsTable}.source\n     ORDER BY candidate.start_line, candidate.end_line, candidate.id\n     LIMIT 1\n  )\n WHERE ${matchQuery ? `${params.pathFtsTable} MATCH ?` : "1=1"}${filter.candidateClause}${params.sourceFilter.sql}${qualifiedSpecificityClause}\n ORDER BY rank ASC, ${params.pathFtsTable}.path ASC, ${params.pathFtsTable}.source ASC\n LIMIT ?`).all(...queryParams, exactPathQuery, resultLimit);
		return params.db.prepare(`WITH path_candidates AS MATERIALIZED (\n  SELECT ${params.pathFtsTable}.path, ${params.pathFtsTable}.source,\n         ${matchQuery ? `bm25(${params.pathFtsTable})` : "0"} AS rank\n    FROM ${params.pathFtsTable}\n   WHERE ${matchQuery ? `${params.pathFtsTable} MATCH ?` : "1=1"}${filter.candidateClause}${params.sourceFilter.sql}\n), normalized_paths AS MATERIALIZED (\n  SELECT path, source, rank FROM path_candidates\n   WHERE 1=1${filter.normalizedClause}${normalizedSpecificityClause}\n)\nSELECT c.id, normalized_paths.path, normalized_paths.source,\n       c.start_line, c.end_line, c.text, normalized_paths.rank\n  FROM normalized_paths\n  JOIN memory_index_chunks c ON c.id = (\n    SELECT candidate.id FROM memory_index_chunks candidate\n     WHERE candidate.path = normalized_paths.path\n       AND candidate.source = normalized_paths.source\n     ORDER BY candidate.start_line, candidate.end_line, candidate.id\n     LIMIT 1\n  )\n ORDER BY normalized_paths.rank ASC, normalized_paths.path ASC, normalized_paths.source ASC\n LIMIT ?`).all(...queryParams, ...filter.normalizedParams, exactPathQuery, resultLimit);
	};
	const loadLexicalRows = (lexicalPlan) => {
		const loadPartitions = (matchQuery, terms) => [...exactPathLimit > 0 ? loadFilteredLexicalRows(matchQuery, terms, "exact", exactPathLimit) : [], ...loadFilteredLexicalRows(matchQuery, terms, "non-exact", params.limit)];
		if (lexicalPlan.matchQuery) try {
			return {
				rows: loadPartitions(lexicalPlan.matchQuery, lexicalPlan.substringTerms),
				usedMatch: true
			};
		} catch (matchErr) {
			console.warn(`memory search: path FTS5 MATCH failed, falling back to LIKE: ${String(matchErr)}`);
			const queryTokens = normalizeStringEntries(lexicalPlan.query.match(/[\p{L}\p{M}\p{N}_]+/gu) ?? []);
			return {
				rows: loadPartitions(null, uniqueStrings([...queryTokens, ...lexicalPlan.substringTerms])),
				usedMatch: false
			};
		}
		return {
			rows: loadPartitions(null, lexicalPlan.substringTerms),
			usedMatch: false
		};
	};
	const lexicalById = /* @__PURE__ */ new Map();
	for (const lexicalPlan of pathPlans) {
		if (!lexicalPlan.matchQuery && lexicalPlan.substringTerms.length === 0) continue;
		const { rows, usedMatch } = loadLexicalRows(lexicalPlan);
		for (const row of rows) {
			const pathScore = usedMatch ? params.bm25RankToScore(row.rank) : 1;
			const exactPathSpecificity = resolveExactPathSpecificity(exactPathQuery, row.path);
			const result = {
				id: row.id,
				path: row.path,
				startLine: row.start_line,
				endLine: row.end_line,
				score: pathScore,
				textScore: 0,
				pathScore,
				exactPathSpecificity,
				hasBodyMatch: false,
				snippet: truncateUtf16Safe(row.text, params.snippetMaxChars),
				source: row.source
			};
			Object.assign(result, readChunkProvenance(params.db, row.id));
			const existing = lexicalById.get(result.id);
			if (!existing) {
				lexicalById.set(result.id, result);
				continue;
			}
			existing.pathScore = Math.max(existing.pathScore, result.pathScore);
			existing.score = Math.max(existing.score, result.score);
			existing.exactPathSpecificity = Math.max(existing.exactPathSpecificity, result.exactPathSpecificity);
		}
	}
	const byId = new Map(exactResults.map((entry) => [entry.id, entry]));
	let nonExactCount = 0;
	for (const entry of [...lexicalById.values()].toSorted(comparePathKeywordSearchResults)) {
		const exact = byId.get(entry.id);
		if (entry.exactPathSpecificity > 0) {
			if (!exact) continue;
			exact.pathScore = Math.max(exact.pathScore, entry.pathScore);
			exact.score = Math.max(exact.score, entry.score);
			exact.exactPathSpecificity = Math.max(exact.exactPathSpecificity, entry.exactPathSpecificity);
			continue;
		}
		if (nonExactCount >= params.limit) continue;
		byId.set(entry.id, entry);
		nonExactCount += 1;
	}
	const resultLimit = hasExplicitExactPathHeadroom ? exactPathLimit + params.limit : params.limit;
	return [...byId.values()].toSorted(comparePathKeywordSearchResults).slice(0, resultLimit);
}
//#endregion
//#region extensions/memory-core/src/memory/manager-keyword-retrieval.ts
const SNIPPET_MAX_CHARS$1 = 700;
const FTS_TABLE$1 = MEMORY_INDEX_FTS_TABLE;
const PATH_FTS_TABLE = MEMORY_INDEX_PATHS_FTS_TABLE;
const KEYWORD_FALLBACK_SEARCH_TERM_LIMIT = 6;
const EXACT_PATH_CANDIDATE_LIMIT = 200;
const log$2 = createSubsystemLogger("memory");
function keywordHitHasBody(hit) {
	return hit.hasBodyMatch;
}
function compareKeywordSearchHits(a, b, preferExactBody = true) {
	const specificityDelta = b.exactPathSpecificity - a.exactPathSpecificity;
	if (specificityDelta !== 0) return specificityDelta;
	if (preferExactBody && a.exactPathSpecificity > 0) {
		const bodyPresenceDelta = Number(keywordHitHasBody(b)) - Number(keywordHitHasBody(a));
		if (bodyPresenceDelta !== 0) return bodyPresenceDelta;
	}
	const relevanceDelta = b.score - a.score;
	if (relevanceDelta !== 0) return relevanceDelta;
	const textDelta = b.textScore - a.textScore;
	if (textDelta !== 0) return textDelta;
	if (a.exactPathSpecificity === 0) {
		const pathDelta = b.pathScore - a.pathScore;
		if (pathDelta !== 0) return pathDelta;
	}
	return a.path.localeCompare(b.path) || a.startLine - b.startLine || a.id.localeCompare(b.id);
}
var MemoryKeywordRetrieval = class extends MemoryProviderLifecycle {
	selectScoredResults(results, maxResults, minScore, relaxedMinScore = minScore) {
		const strict = results.filter((entry) => entry.score >= minScore);
		if (strict.length > 0) return strict.slice(0, maxResults);
		return results.filter((entry) => entry.score >= relaxedMinScore).slice(0, maxResults);
	}
	async listTriggerCandidates(opts) {
		const limit = Math.max(1, Math.min(512, Math.floor(opts?.limit ?? 512)));
		return await this.readCuratedMemoryCandidates(() => readCuratedMemoryTriggerCandidates(this.db, limit, opts?.activeProjectKeys));
	}
	async listCuratedProjectCandidates(opts) {
		const limit = Math.max(1, Math.min(512, Math.floor(opts.limit ?? 48)));
		return await this.readCuratedMemoryCandidates(() => readCuratedProjectMemoryCandidates(this.db, limit, opts.activeProjectKeys, opts));
	}
	async readCuratedMemoryCandidates(read) {
		return await this.withManagerOperation(async () => {
			if (this.memorySourceProvenanceRepairPending) {
				this.memorySourceProvenanceRepairPending = this.db.prepare(`SELECT 1 FROM memory_index_sources
               WHERE source = 'memory' AND hash = '' LIMIT 1`).get() !== void 0;
				if (this.memorySourceProvenanceRepairPending) {
					// v-project-memory-readonly-20260909: readonly candidates must never start index writes.
					if (this.purpose === "status") return [];
					this.withManagerOperation(() => this.syncAdmitted({ reason: "search" }, { allowEmbeddingBootstrapFallback: true })).catch((err) => {
						log$2.warn(`memory sync failed (automatic candidates): ${formatErrorMessage(err)}`);
					});
					return [];
				}
			}
			return this.toCuratedMemorySearchResults(read());
		});
	}
	toCuratedMemorySearchResults(rows) {
		return rows.map((row) => {
			const result = {
				path: row.path,
				startLine: row.start_line,
				endLine: row.end_line,
				score: 0,
				snippet: row.text,
				source: "memory"
			};
			if (typeof row.importance === "number") result.importance = row.importance;
			if (typeof row.triggers === "string" && row.triggers.trim()) result.triggers = row.triggers.trim();
			if (typeof row.project_key === "string" && row.project_key.trim()) result.projectKey = row.project_key.trim();
			result.provenance = {
				originClass: row.origin_class,
				sessionKind: row.session_kind,
				observedAt: row.observed_at,
				...typeof row.supersedes_key === "string" ? { supersedesKey: row.supersedes_key } : {}
			};
			return result;
		});
	}
	rankKeywordOnlyResults(results, preferExactBody = true) {
		return results.toSorted((left, right) => compareKeywordSearchHits(left, right, preferExactBody)).map((entry) => entry.exactPathSpecificity > 0 ? Object.assign(entry, { score: 1 }) : entry);
	}
	async finalizeKeywordOnlyResults(params) {
		const appliesTemporalDecay = params.temporalDecay?.enabled === true;
		const decayed = await applyTemporalDecayToHybridResults({
			results: appliesTemporalDecay ? params.results.map((entry) => {
				if (entry.exactPathSpecificity === 0) return entry;
				const contentScore = keywordHitHasBody(entry) ? entry.score : 0;
				return {
					...entry,
					score: scoreExactPathTieForTemporalDecay(contentScore)
				};
			}) : params.results,
			temporalDecay: params.temporalDecay,
			workspaceDir: this.workspaceDir
		});
		const ranked = applyProjectRanking(this.rankKeywordOnlyResults(applyImportanceMultiplier(decayed), !appliesTemporalDecay), params.activeProjectKeys);
		return this.toMemorySearchResults(this.selectScoredResults(ranked, params.maxResults, params.minScore, 0));
	}
	attachRecallMetadata(results) {
		if (results.length === 0) return results;
		const metadataById = readMemoryRecallMetadata(this.db, results.map((entry) => entry.id));
		return results.map((entry) => {
			const row = metadataById.get(entry.id);
			return {
				...entry,
				...typeof row?.importance === "number" ? { importance: row.importance } : {},
				...typeof row?.triggers === "string" && row.triggers.trim() ? { triggers: row.triggers.trim() } : {},
				...typeof row?.project_key === "string" && row.project_key.trim() ? { projectKey: row.project_key.trim() } : {}
			};
		});
	}
	async searchKeyword(query, limit, options, sourceFilterList) {
		if (!this.fts.enabled || !this.fts.available) return [];
		const bodySearch = searchKeyword({
			db: this.db,
			ftsTable: FTS_TABLE$1,
			query,
			ftsTokenizer: this.settings.store.fts.tokenizer,
			limit,
			snippetMaxChars: SNIPPET_MAX_CHARS$1,
			sourceFilter: this.buildSourceFilter(void 0, sourceFilterList),
			buildFtsQuery,
			bm25RankToScore,
			boostFallbackRanking: options?.boostFallbackRanking,
			rankingQuery: options?.rankingQuery
		}).catch((err) => {
			log$2.warn(`memory search: body keyword query failed: ${formatErrorMessage(err)}`);
			return [];
		});
		const exactPathQuery = options?.exactPathQuery ?? query;
		const pathSearch = searchPathKeyword({
			db: this.db,
			pathFtsTable: PATH_FTS_TABLE,
			query,
			exactPathQuery,
			exactPathLimit: EXACT_PATH_CANDIDATE_LIMIT,
			ftsTokenizer: this.settings.store.fts.tokenizer,
			limit,
			snippetMaxChars: SNIPPET_MAX_CHARS$1,
			sourceFilter: this.buildSourceFilter(PATH_FTS_TABLE, sourceFilterList),
			buildFtsQuery,
			bm25RankToScore
		}).catch((err) => {
			log$2.warn(`memory search: path keyword query failed: ${formatErrorMessage(err)}`);
			return [];
		});
		const [bodyResults, pathResults] = await Promise.all([bodySearch, pathSearch]);
		const merged = this.mergeKeywordSearchHits([bodyResults.map((entry) => Object.assign(entry, {
			exactPathSpecificity: resolveExactPathSpecificity(exactPathQuery, entry.path),
			pathScore: 0
		})), pathResults], exactPathQuery);
		return this.attachRecallMetadata(this.limitKeywordSearchHits(merged, limit));
	}
	async searchKeywordWithFallback(query, limit, options, sourceFilterList) {
		const fullQueryResults = await this.searchKeyword(query, limit, options, sourceFilterList).catch(() => []);
		if (fullQueryResults.filter((result) => result.exactPathSpecificity === 0).length >= limit) return fullQueryResults;
		const fallbackTerms = this.resolveKeywordFallbackTerms(query);
		if (fallbackTerms.length === 0) return fullQueryResults;
		const strictFtsQuery = buildFtsQuery(query)?.toLowerCase();
		const keywordFtsQuery = buildFtsQuery(fallbackTerms.join(" "))?.toLowerCase();
		if (fullQueryResults.length > 0 && strictFtsQuery === keywordFtsQuery) return fullQueryResults;
		const resultSets = await Promise.all(fallbackTerms.map((term) => this.searchKeyword(term, limit, {
			...options,
			exactPathQuery: query,
			rankingQuery: query
		}, sourceFilterList).catch(() => [])));
		return this.limitKeywordSearchHits(this.mergeKeywordSearchHits([fullQueryResults, ...resultSets], query), limit);
	}
	resolveKeywordFallbackTerms(query) {
		const normalizedQuery = query.trim().toLowerCase();
		return extractKeywords(query, { ftsTokenizer: this.settings.store.fts.tokenizer }).filter((term) => term !== normalizedQuery).slice(0, KEYWORD_FALLBACK_SEARCH_TERM_LIMIT);
	}
	mergeKeywordSearchHits(resultSets, exactPathQuery) {
		const seenIds = /* @__PURE__ */ new Map();
		for (const results of resultSets) for (const result of results) {
			const existing = seenIds.get(result.id);
			if (!existing) {
				seenIds.set(result.id, result);
				continue;
			}
			const existingHasBody = keywordHitHasBody(existing);
			const resultHasBody = keywordHitHasBody(result);
			const existingBodyScore = existingHasBody ? existing.score : 0;
			const resultBodyScore = resultHasBody ? result.score : 0;
			existing.textScore = Math.max(existing.textScore, result.textScore);
			existing.pathScore = Math.max(existing.pathScore, result.pathScore);
			existing.exactPathSpecificity = Math.max(existing.exactPathSpecificity, result.exactPathSpecificity);
			existing.hasBodyMatch ||= result.hasBodyMatch;
			const bodyScore = Math.max(existingBodyScore, resultBodyScore);
			existing.score = bodyScore > 0 ? bodyScore : existing.pathScore;
			if (resultHasBody && !existingHasBody || resultHasBody === existingHasBody && result.snippet.length > existing.snippet.length) existing.snippet = result.snippet;
		}
		const merged = [...seenIds.values()];
		if (exactPathQuery !== void 0) for (const result of merged) result.exactPathSpecificity = resolveExactPathSpecificity(exactPathQuery, result.path);
		for (const result of merged) if (!keywordHitHasBody(result)) result.score = result.exactPathSpecificity > 0 ? 1 : result.pathScore;
		return merged.toSorted(compareKeywordSearchHits);
	}
	limitKeywordSearchHits(results, nonExactLimit) {
		const ranked = results.toSorted(compareKeywordSearchHits);
		const exactBody = ranked.filter((entry) => entry.exactPathSpecificity > 0 && keywordHitHasBody(entry)).slice(0, nonExactLimit);
		const exactPathOnly = ranked.filter((entry) => entry.exactPathSpecificity > 0 && !keywordHitHasBody(entry));
		const boundedExact = exactBody.concat(exactPathOnly).toSorted(compareKeywordSearchHits);
		const selectedPathKeys = /* @__PURE__ */ new Set();
		for (const entry of boundedExact) {
			selectedPathKeys.add(`${entry.source}:${entry.path}`);
			if (selectedPathKeys.size === EXACT_PATH_CANDIDATE_LIMIT) break;
		}
		const exact = boundedExact.filter((entry) => selectedPathKeys.has(`${entry.source}:${entry.path}`));
		const nonExact = ranked.filter((entry) => entry.exactPathSpecificity === 0).slice(0, nonExactLimit);
		return exact.concat(nonExact);
	}
	toMemorySearchResults(results) {
		return results.map(({ id: _id, pathScore: _pathScore, exactPathSpecificity: _exactPathSpecificity, hasBodyMatch: _hasBodyMatch, ...result }) => result);
	}
};
//#endregion
//#region extensions/memory-core/src/memory/manager-search-knn-subprocess.ts
const MAX_STDIN_BYTES = 1048576;
const MAX_STDOUT_BYTES = 2097152;
const MAX_STDERR_BYTES = 65536;
const KILL_EXIT_TIMEOUT_MS = 2e3;
const MAX_CONCURRENT_VECTOR_KNN_CHILDREN = 2;
var VectorKnnSubprocessError = class extends Error {
	constructor(message, code) {
		super(message);
		this.code = code;
		this.name = "VectorKnnSubprocessError";
	}
};
function buildChildEnv(env = process.env) {
	const childEnv = {};
	for (const name of [
		"PATH",
		"SystemRoot",
		"SYSTEMROOT",
		"WINDIR",
		"TEMP",
		"TMP",
		"TMPDIR"
	]) if (env[name]) childEnv[name] = env[name];
	return childEnv;
}
function toAbortError(signal) {
	return signal.reason instanceof Error ? signal.reason : /* @__PURE__ */ new Error("memory vector KNN aborted");
}
function createVectorKnnAdmission(maxConcurrent) {
	let active = 0;
	const waiters = [];
	const releaseNext = () => {
		while (waiters.length > 0) {
			const next = waiters.shift();
			next.signal?.removeEventListener("abort", next.abort);
			if (next.signal?.aborted) {
				next.reject(toAbortError(next.signal));
				continue;
			}
			next.resolve(createRelease());
			return;
		}
		active -= 1;
	};
	const createRelease = () => {
		let released = false;
		return () => {
			if (released) return;
			released = true;
			releaseNext();
		};
	};
	return { acquire: async (signal) => {
		if (signal?.aborted) throw toAbortError(signal);
		if (active < maxConcurrent) {
			active += 1;
			return createRelease();
		}
		return await new Promise((resolve, reject) => {
			const waiter = {
				signal,
				resolve,
				reject,
				abort: () => {
					const index = waiters.indexOf(waiter);
					if (index >= 0) waiters.splice(index, 1);
					reject(toAbortError(signal));
				}
			};
			waiters.push(waiter);
			signal?.addEventListener("abort", waiter.abort, { once: true });
			if (signal?.aborted) waiter.abort();
		});
	} };
}
const vectorKnnAdmission = createVectorKnnAdmission(MAX_CONCURRENT_VECTOR_KNN_CHILDREN);
function parseChildResult(output, maxRows) {
	let parsed;
	try {
		parsed = JSON.parse(output.toString("utf8"));
	} catch {
		throw new VectorKnnSubprocessError("memory vector KNN child returned malformed JSON", "protocol");
	}
	if (!parsed || typeof parsed !== "object" || !("status" in parsed)) throw new VectorKnnSubprocessError("memory vector KNN child returned an invalid envelope", "protocol");
	const result = parsed;
	if (result.status === "failed") throw new VectorKnnSubprocessError(result.error || "memory vector KNN child failed", "failed");
	if (result.status !== "ok" || !result.value || !Array.isArray(result.value.rows) || result.value.rows.length > maxRows || result.value.rows.some((row) => !isVectorKnnRow(row)) || typeof result.value.fallbackScanRequired !== "boolean") throw new VectorKnnSubprocessError("memory vector KNN child returned an invalid result", "protocol");
	return result.value;
}
// One pre-spawned child waits on stdin so a search skips the Node start of a fresh one.
let spareVectorKnnChild;
function spawnVectorKnnChild() {
	const childUrl = resolveRuntimeWorkerUrl(vectorKnnProcessEntrypoint);
	return spawn(process.execPath, resolveRuntimeWorkerArgv(childUrl), {
		env: buildChildEnv(),
		shell: false,
		stdio: [
			"pipe",
			"pipe",
			"pipe"
		],
		windowsHide: true
	});
}
function takeSpareVectorKnnChild() {
	const child = spareVectorKnnChild;
	spareVectorKnnChild = void 0;
	if (!child || child.exitCode !== null || child.signalCode !== null || child.killed) return void 0;
	child.ref();
	for (const stream of [child.stdin, child.stdout, child.stderr]) stream?.ref?.();
	return child;
}
function prepareSpareVectorKnnChild() {
	if (spareVectorKnnChild) return;
	try {
		const child = spawnVectorKnnChild();
		const forget = () => {
			if (spareVectorKnnChild === child) spareVectorKnnChild = void 0;
		};
		child.on("error", forget);
		child.on("exit", forget);
		child.unref();
		for (const stream of [child.stdin, child.stdout, child.stderr]) stream?.unref?.();
		spareVectorKnnChild = child;
	} catch {}
}
/** Run one file-backed KNN query in a bounded, OS-killable child process. */
async function runVectorKnnInSubprocess(params) {
	if (params.signal?.aborted) throw toAbortError(params.signal);
	const input = {
		databasePath: params.databasePath,
		extensionPath: params.extensionPath,
		request: params.request
	};
	const inputPayload = Buffer.from(JSON.stringify(input), "utf8");
	if (inputPayload.byteLength > MAX_STDIN_BYTES) throw new VectorKnnSubprocessError("memory vector KNN child input is too large", "protocol");
	const releaseAdmission = await vectorKnnAdmission.acquire(params.signal);
	if (params.signal?.aborted) {
		releaseAdmission();
		throw toAbortError(params.signal);
	}
	let child;
	try {
		child = takeSpareVectorKnnChild() ?? spawnVectorKnnChild();
		prepareSpareVectorKnnChild();
	} catch (error) {
		releaseAdmission();
		throw new VectorKnnSubprocessError(error instanceof Error ? error.message : String(error), "unavailable");
	}
	return await new Promise((resolve, reject) => {
		const stdoutChunks = [];
		const stderrChunks = [];
		let stdoutBytes = 0;
		let stderrBytes = 0;
		let closed = false;
		let callerSettled = false;
		let terminationReason;
		let killExitTimer;
		const clearKillExitTimer = () => {
			if (killExitTimer) {
				clearTimeout(killExitTimer);
				killExitTimer = void 0;
			}
		};
		const settleCaller = (action) => {
			if (callerSettled) return;
			callerSettled = true;
			params.signal?.removeEventListener("abort", abort);
			action();
		};
		const releaseClosedChild = () => {
			clearKillExitTimer();
			params.signal?.removeEventListener("abort", abort);
			releaseAdmission();
		};
		const requestTermination = (reason) => {
			if (terminationReason || closed) return;
			terminationReason = reason;
			child.stdin.destroy();
			child.kill("SIGKILL");
			killExitTimer = setTimeout(() => {
				if (!closed) {
					child.stdin.destroy();
					child.stdout.destroy();
					child.stderr.destroy();
					child.unref();
					settleCaller(() => reject(new VectorKnnSubprocessError("memory vector KNN child did not exit after SIGKILL", "termination-timeout")));
				}
			}, KILL_EXIT_TIMEOUT_MS);
		};
		const abort = () => {
			requestTermination(toAbortError(params.signal));
		};
		params.signal?.addEventListener("abort", abort, { once: true });
		if (params.signal?.aborted) abort();
		child.stdout.on("data", (chunk) => {
			stdoutBytes += chunk.byteLength;
			if (stdoutBytes > MAX_STDOUT_BYTES) {
				const failure = new VectorKnnSubprocessError("memory vector KNN child stdout exceeded its limit", "protocol");
				stdoutChunks.length = 0;
				requestTermination(failure);
				return;
			}
			stdoutChunks.push(chunk);
		});
		child.stderr.on("data", (chunk) => {
			stderrBytes += chunk.byteLength;
			if (stderrBytes > MAX_STDERR_BYTES) {
				const failure = new VectorKnnSubprocessError("memory vector KNN child stderr exceeded its limit", "protocol");
				requestTermination(failure);
				return;
			}
			stderrChunks.push(chunk);
		});
		child.stdin.on("error", (error) => {
			if (!terminationReason && error.code !== "EPIPE") requestTermination(new VectorKnnSubprocessError(error.message, "failed"));
		});
		child.once("error", (error) => {
			requestTermination(new VectorKnnSubprocessError(error.message, "unavailable"));
		});
		child.once("close", (code, signal) => {
			closed = true;
			releaseClosedChild();
			settleCaller(() => {
				if (terminationReason) {
					reject(terminationReason);
					return;
				}
				if (code !== 0 || signal) {
					const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
					reject(new VectorKnnSubprocessError(`memory vector KNN child exited before returning a result (code ${code}, signal ${signal ?? "none"})${stderr ? `: ${stderr}` : ""}`, "failed"));
					return;
				}
				try {
					resolve(parseChildResult(Buffer.concat(stdoutChunks), params.request.limit));
				} catch (error) {
					reject(error instanceof Error ? error : new VectorKnnSubprocessError(String(error), "protocol"));
				}
			});
		});
		child.stdin.end(inputPayload);
	});
}
//#endregion
//#region extensions/memory-core/src/memory/manager-search-preflight.ts
function resolveMemorySearchPreflight(params) {
	const normalizedQuery = params.query.trim();
	if (!normalizedQuery) return {
		normalizedQuery,
		shouldInitializeProvider: false,
		shouldSearch: false
	};
	if (!params.hasIndexedContent) return {
		normalizedQuery,
		shouldInitializeProvider: false,
		shouldSearch: false
	};
	return {
		normalizedQuery,
		shouldInitializeProvider: true,
		shouldSearch: true
	};
}
//#endregion
//#region extensions/memory-core/src/memory/manager-search-orchestration.ts
const SNIPPET_MAX_CHARS = 700;
const VECTOR_TABLE = MEMORY_INDEX_VECTOR_TABLE;
const FTS_TABLE = MEMORY_INDEX_FTS_TABLE;
const log$1 = createSubsystemLogger("memory");
var MemorySearchOrchestration = class extends MemoryKeywordRetrieval {
	claimSessionWarmSync(sessionKey) {
		if (!this.settings.sync.onSessionStart) return false;
		const key = sessionKey?.trim() || "";
		if (key && this.sessionWarm.has(key)) return false;
		if (key) this.sessionWarm.add(key);
		return this.dirty || this.sessionsDirty;
	}
	async search(query, opts) {
		const normalizedQuery = query.trim();
		if (!normalizedQuery) return [];
		const maxResults = opts?.maxResults ?? this.settings.query.maxResults;
		const minScore = opts?.minScore ?? this.settings.query.minScore;
		const hasActiveProject = (opts?.activeProjectKeys?.length ?? 0) > 0;
		const candidateMaxResults = hasActiveProject ? Math.min(200, Math.max(maxResults, maxResults * 4)) : maxResults;
		const candidateMinScore = hasActiveProject ? minScore / 1.15 : minScore;
		const results = await this.searchCandidates(normalizedQuery, {
			...opts,
			maxResults: candidateMaxResults,
			minScore: candidateMinScore
		});
		return hasActiveProject ? results.filter((entry) => entry.score >= minScore).slice(0, maxResults) : results;
	}
	async searchCandidates(normalizedQuery, opts) {
		let releaseGeneration;
		return await this.withManagerOperation(async () => {
			opts?.onDebug?.({ backend: "builtin" });
			if (this.providerRequirement.mode === "required") {
				await this.ensureProviderInitialized();
				this.assertRequiredProviderAvailable("search");
			}
			let hasIndexedContent = this.hasIndexedContent();
			if (!hasIndexedContent && this.purpose === "search") return [];
			if (!hasIndexedContent) {
				try {
					await this.syncAdmitted({
						reason: "search",
						force: true
					}, { allowEmbeddingBootstrapFallback: true });
				} catch (err) {
					if (this.providerRequirement.mode === "optional" && this.shouldFallbackOnError(err)) {
						const failedProvider = this.provider?.id ?? this.settings.provider;
						await this.retireCurrentProvider().catch((retireErr) => {
							const message = redactSensitiveText(formatErrorMessage(retireErr), { mode: "tools" });
							log$1.warn(`memory search-bootstrap: failed to retire embedding provider: ${message}`);
						});
						this.markEmbeddingBootstrapFailure(err, { provider: failedProvider });
						await this.syncAdmitted({
							reason: "search",
							force: true
						}).catch((fallbackErr) => {
							const message = redactSensitiveText(formatErrorMessage(fallbackErr), { mode: "tools" });
							log$1.warn(`memory sync failed (search-bootstrap-fallback): ${message}`);
						});
					} else log$1.warn(`memory sync failed (search-bootstrap): ${String(err)}`);
				}
				hasIndexedContent = this.hasIndexedContent();
			}
			const preflight = resolveMemorySearchPreflight({
				query: normalizedQuery,
				hasIndexedContent
			});
			if (!preflight.shouldSearch) {
				if (this.embeddingBootstrapFailure) opts?.onDebug?.({
					backend: "builtin",
					embeddingBootstrap: this.embeddingBootstrapFailure
				});
				return [];
			}
			const cleaned = preflight.normalizedQuery;
			const embeddingBootstrapKeywordOnly = await this.ensureEmbeddingProviderForSearch(opts?.onDebug);
			const sessionStartSync = this.claimSessionWarmSync(opts?.sessionKey);
			if (!embeddingBootstrapKeywordOnly && preflight.shouldInitializeProvider && !this.provider && (this.providerLifecycle.mode === "pending" || this.providerLifecycle.mode === "degraded" && this.providerLifecycle.providerId !== this.settings.provider)) {
				this.resetProviderInitializationForRetry();
				await this.ensureProviderInitialized();
			}
			this.assertRequiredProviderAvailable("search");
			if (!embeddingBootstrapKeywordOnly && !this.provider && this.providerLifecycle.mode === "degraded") {
				if (await this.activateFallbackProvider(this.providerLifecycle.reason).catch((fallbackErr) => {
					log$1.warn(`memory search: failed to activate fallback provider: ${formatErrorMessage(fallbackErr)}`);
					return false;
				})) this.refreshIndexIdentityDirty({ providerKeyKnown: this.providerInitialized });
			}
			const indexIdentity = embeddingBootstrapKeywordOnly ? this.refreshKeywordFallbackIndexIdentity() : this.refreshIndexIdentityDirty({ providerKeyKnown: this.providerInitialized });
			const canRepairMissingIdentity = indexIdentity.status === "missing" && hasIndexedContent && this.purpose !== "search";
			if (canRepairMissingIdentity) await this.syncAdmitted({
				reason: "search",
				force: true
			}, { allowEmbeddingBootstrapFallback: true }).catch((err) => {
				log$1.warn(`memory sync failed (search-identity-repair): ${formatErrorMessage(err)}`);
			});
			let repairedIndexIdentity = canRepairMissingIdentity ? embeddingBootstrapKeywordOnly ? this.refreshKeywordFallbackIndexIdentity() : this.refreshIndexIdentityDirty({ providerKeyKnown: this.providerInitialized }) : indexIdentity;
			if (repairedIndexIdentity.status === "mismatched" && !embeddingBootstrapKeywordOnly && await this.adoptPublishedFallbackProviderIfMatched()) repairedIndexIdentity = this.refreshIndexIdentityDirty({ providerKeyKnown: this.providerInitialized });
			if (repairedIndexIdentity.status !== "valid") return [];
			const backgroundSearchSync = startAsyncSearchSync({
				enabled: (this.settings.sync.onSearch || sessionStartSync) && (this.purpose === "default" || this.purpose === "cli"),
				dirty: this.dirty,
				sessionsDirty: this.sessionsDirty,
				sync: async (params) => await this.syncPublishedIndexInBackground(params),
				onError: (err) => {
					log$1.warn(`memory sync failed (search): ${String(err)}`);
				}
			});
			if (backgroundSearchSync) {
				const trackedSearchSync = backgroundSearchSync.finally(() => {
					this.activeBackgroundSearchSyncs.delete(trackedSearchSync);
				});
				this.activeBackgroundSearchSyncs.add(trackedSearchSync);
			}
			for (let identityAttempt = 0; identityAttempt < 2; identityAttempt += 1) {
				releaseGeneration = await acquireMemoryIndexReadGeneration(this.settings.store.databasePath, opts?.signal);
				if (embeddingBootstrapKeywordOnly) break;
				const leasedIdentity = this.refreshIndexIdentityDirty({ providerKeyKnown: this.providerInitialized });
				if (leasedIdentity.status === "valid") break;
				releaseGeneration();
				releaseGeneration = void 0;
				if (identityAttempt > 0 || leasedIdentity.status !== "mismatched" || !await this.adoptPublishedFallbackProviderIfMatched()) return [];
			}
			const minScore = opts?.minScore ?? this.settings.query.minScore;
			const maxResults = opts?.maxResults ?? this.settings.query.maxResults;
			const searchSources = opts?.sources && opts.sources.length > 0 ? uniqueValues(opts.sources).filter((s) => this.sources.has(s)) : void 0;
			if (opts?.sources && opts.sources.length > 0 && (!searchSources || searchSources.length === 0)) return [];
			const sourceFilterList = searchSources ?? this.settings.searchSources;
			const hybrid = this.settings.query.hybrid;
			const candidates = Math.min(200, Math.max(1, Math.floor(maxResults * hybrid.candidateMultiplier)));
			if (embeddingBootstrapKeywordOnly || !this.provider) {
				this.assertRequiredProviderAvailable("search");
				if (!this.fts.enabled || !this.fts.available) {
					log$1.warn("memory search: no provider and FTS unavailable");
					return [];
				}
				const keywordResults = await this.searchKeywordWithFallback(cleaned, candidates, { boostFallbackRanking: true }, sourceFilterList).catch((err) => {
					log$1.warn(`memory search: FTS keyword query failed: ${formatErrorMessage(err)}`);
					return [];
				});
				return await this.finalizeKeywordOnlyResults({
					results: keywordResults,
					temporalDecay: hybrid.temporalDecay,
					maxResults,
					minScore,
					activeProjectKeys: opts?.activeProjectKeys
				});
			}
			let semanticProvider = this.provider;
			let semanticProviderRuntime = this.providerRuntime;
			let vectorProviderIdentity = {
				model: semanticProvider.model,
				aliases: this.resolveProviderIndexIdentities().slice(1).map((identity) => identity.model)
			};
			const loadKeywordResults = async () => hybrid.enabled && this.fts.enabled && this.fts.available ? await this.searchKeywordWithFallback(cleaned, candidates, { boostFallbackRanking: true }, sourceFilterList).catch((err) => {
				log$1.warn(`memory search: FTS hybrid keyword query failed: ${formatErrorMessage(err)}`);
				return [];
			}) : [];
			let keywordResults = [];
			let queryVec;
			const releaseSemanticProvider = this.acquireProviderUse(semanticProvider);
			try {
				const pendingQueryVec = opts?.lexicalOnly ? void 0 : this.embedQueryWithRetry(cleaned, opts?.signal, semanticProvider, false, semanticProviderRuntime);
				pendingQueryVec?.catch(() => {});
				keywordResults = await loadKeywordResults();
				if (opts?.lexicalOnly) return await this.finalizeKeywordOnlyResults({
					results: keywordResults,
					temporalDecay: hybrid.temporalDecay,
					maxResults,
					minScore,
					activeProjectKeys: opts?.activeProjectKeys
				});
				try {
					queryVec = await pendingQueryVec;
				} catch (err) {
					releaseSemanticProvider();
					if (opts?.signal?.aborted) throw err;
					this.markLocalEmbeddingProviderDegraded(err);
					const message = formatErrorMessage(err);
					if (this.shouldFallbackOnError(err) ? await this.activateFallbackProvider(message).catch((fallbackErr) => {
						log$1.warn(`memory search: failed to activate fallback provider: ${formatErrorMessage(fallbackErr)}`);
						return false;
					}) : false) {
						if (this.refreshIndexIdentityDirty({ providerKeyKnown: this.providerInitialized }).status !== "valid") return [];
						if (!this.provider) return [];
						semanticProvider = this.provider;
						semanticProviderRuntime = this.providerRuntime;
						vectorProviderIdentity = {
							model: semanticProvider.model,
							aliases: this.resolveProviderIndexIdentities().slice(1).map((identity) => identity.model)
						};
						const releaseFallbackProvider = this.acquireProviderUse(semanticProvider);
						try {
							keywordResults = await loadKeywordResults();
							queryVec = await this.embedQueryWithRetry(cleaned, opts?.signal, semanticProvider, false, semanticProviderRuntime);
						} catch (fallbackErr) {
							releaseFallbackProvider();
							if (!opts?.signal?.aborted) this.markLocalEmbeddingProviderDegraded(fallbackErr);
							throw fallbackErr;
						} finally {
							releaseFallbackProvider();
						}
					} else if (!this.provider && this.fts.enabled && this.fts.available) {
						this.assertRequiredProviderAvailable("search");
						log$1.warn(`memory search: embeddings unavailable; using keyword-only results: ${message}`);
						return await this.finalizeKeywordOnlyResults({
							results: keywordResults,
							temporalDecay: hybrid.temporalDecay,
							maxResults,
							minScore,
							activeProjectKeys: opts?.activeProjectKeys
						});
					} else throw err;
				}
			} finally {
				releaseSemanticProvider();
			}
			const vectorResults = queryVec.some((v) => v !== 0) ? await this.searchVector(queryVec, candidates, sourceFilterList, vectorProviderIdentity, opts?.signal).catch((err) => {
				opts?.signal?.throwIfAborted();
				log$1.warn(`memory search: vector query failed: ${formatErrorMessage(err)}`);
				return [];
			}) : [];
			if (!hybrid.enabled || !this.fts.enabled || !this.fts.available) return applyProjectRanking(applyImportanceMultiplier(await applyTemporalDecayToHybridResults({
				results: vectorResults,
				temporalDecay: hybrid.temporalDecay,
				workspaceDir: this.workspaceDir
			})), opts?.activeProjectKeys).filter((entry) => entry.score >= minScore).slice(0, maxResults);
			return selectHybridSearchResults({
				merged: await this.mergeHybridResults({
					query: cleaned,
					vector: vectorResults,
					keyword: keywordResults,
					vectorWeight: hybrid.vectorWeight,
					textWeight: hybrid.textWeight,
					mmr: hybrid.mmr,
					temporalDecay: hybrid.temporalDecay,
					activeProjectKeys: opts?.activeProjectKeys
				}),
				keyword: keywordResults,
				maxResults,
				minScore
			});
		}).finally(() => {
			releaseGeneration?.();
		});
	}
	hasIndexedContent() {
		if (this.db.prepare(`SELECT 1 as found FROM memory_index_chunks LIMIT 1`).get()?.found === 1) return true;
		if (!this.fts.enabled || !this.fts.available) return false;
		return this.db.prepare(`SELECT 1 as found FROM ${FTS_TABLE} LIMIT 1`).get()?.found === 1;
	}
	async searchVector(queryVec, limit, sourceFilterList, providerIdentity, signal) {
		const results = await searchVector({
			db: this.db,
			vectorTable: VECTOR_TABLE,
			providerModel: providerIdentity.model,
			providerModelAliases: providerIdentity.aliases,
			queryVec,
			limit,
			snippetMaxChars: SNIPPET_MAX_CHARS,
			signal,
			ensureVectorReady: async (dimensions) => await this.ensureVectorReady(dimensions),
			runVectorKnn: async (request, knnSignal) => await runVectorKnnInSubprocess({
				databasePath: resolveUserPath(this.settings.store.databasePath),
				extensionPath: this.vector.extensionPath,
				request,
				signal: knnSignal
			}),
			sourceFilterVec: this.buildSourceFilter("c", sourceFilterList),
			sourceFilterChunks: this.buildSourceFilter(void 0, sourceFilterList)
		});
		return this.attachRecallMetadata(results.map((entry) => entry));
	}
	mergeHybridResults(params) {
		return mergeHybridResults({
			vector: params.vector.map((r) => ({
				id: r.id,
				path: r.path,
				startLine: r.startLine,
				endLine: r.endLine,
				source: r.source,
				snippet: r.snippet,
				vectorScore: r.score,
				importance: r.importance,
				triggers: r.triggers,
				projectKey: r.projectKey,
				exactPathSpecificity: resolveExactPathSpecificity(params.query, r.path),
				...r.provenance ? { provenance: r.provenance } : {}
			})),
			keyword: params.keyword.map((r) => ({
				id: r.id,
				path: r.path,
				startLine: r.startLine,
				endLine: r.endLine,
				source: r.source,
				snippet: r.snippet,
				textScore: r.textScore,
				hasBodyMatch: r.hasBodyMatch,
				importance: r.importance,
				triggers: r.triggers,
				projectKey: r.projectKey,
				rankingScore: r.score,
				pathScore: r.pathScore,
				exactPathSpecificity: r.exactPathSpecificity,
				...r.provenance ? { provenance: r.provenance } : {}
			})),
			vectorWeight: params.vectorWeight,
			textWeight: params.textWeight,
			isNonTextMediaPath: (path) => classifyMemoryMultimodalPath(path, this.settings.multimodal) !== null,
			mmr: params.mmr,
			temporalDecay: params.temporalDecay,
			activeProjectKeys: params.activeProjectKeys,
			workspaceDir: this.workspaceDir
		});
	}
};
//#endregion
//#region extensions/memory-core/src/memory/manager-status-state.ts
function resolveStatusProviderInfo(params) {
	if (params.provider) return {
		provider: params.provider.id,
		model: params.provider.model,
		searchMode: "hybrid"
	};
	if (params.providerInitialized) return {
		provider: "none",
		model: void 0,
		searchMode: "fts-only"
	};
	return {
		provider: params.requestedProvider,
		model: params.configuredModel || void 0,
		searchMode: "hybrid"
	};
}
function collectMemoryStatusAggregate(params) {
	const totals = {
		files: 0,
		chunks: 0
	};
	const emptyCounts = {
		...totals,
		...params.includeChunkBytes ? { chunkBytes: 0 } : {}
	};
	const bySource = /* @__PURE__ */ new Map();
	const chunkBytes = params.includeChunkBytes ? "COALESCE(SUM(octet_length(text) + octet_length(embedding)), 0)" : "NULL";
	const sourceFilterSql = params.sourceFilterSql ?? "";
	const query = `SELECT 'files' AS kind, source, COUNT(*) as c, 0 AS bytes FROM memory_index_sources WHERE 1=1${sourceFilterSql} GROUP BY source\nUNION ALL\nSELECT 'chunks' AS kind, source, COUNT(*) as c, ${chunkBytes} AS bytes FROM memory_index_chunks WHERE 1=1${sourceFilterSql} GROUP BY source`;
	const filterParams = params.sourceFilterParams ?? [];
	const rows = params.db.prepare(query).all(...filterParams, ...filterParams);
	for (const row of rows) {
		const entry = bySource.get(row.source) ?? { ...emptyCounts };
		entry[row.kind] = row.c;
		totals[row.kind] += row.c;
		if (row.kind === "chunks" && row.bytes !== null) entry.chunkBytes = row.bytes;
		bySource.set(row.source, entry);
	}
	return {
		...totals,
		sourceCounts: Array.from(params.sources, (source) => Object.assign({
			source,
			...emptyCounts
		}, bySource.get(source)))
	};
}
//#endregion
//#region extensions/memory-core/src/memory/manager-sync-control.ts
function hasTargetedSessionSyncParams(params) {
	return Boolean(params?.sessions?.some((session) => session.sessionId.trim().length > 0) || params?.archiveFiles?.some((sessionFile) => sessionFile.trim().length > 0));
}
function enqueueMemoryTargetedSessionSync(state, targets) {
	const queuedArchiveFiles = state.getQueuedArchiveFiles();
	for (const sessionFile of targets?.archiveFiles ?? []) {
		const trimmed = sessionFile.trim();
		if (trimmed) queuedArchiveFiles.add(trimmed);
	}
	const queuedSessions = state.getQueuedSessions();
	for (const session of targets?.sessions ?? []) {
		const normalized = normalizeQueuedMemorySessionSyncTarget(session);
		if (normalized) queuedSessions.set(memorySessionSyncTargetKey(normalized), normalized);
	}
	if (queuedArchiveFiles.size === 0 && queuedSessions.size === 0) return state.getSyncing() ?? Promise.resolve();
	if (targets?.force) state.setQueuedForce(true);
	if (targets?.progress) state.getQueuedProgressCallbacks().add(targets.progress);
	if (!state.getQueuedSessionSync()) state.setQueuedSessionSync((async () => {
		try {
			await state.getSyncing()?.catch(() => void 0);
			while (!state.isClosed() && (state.getQueuedArchiveFiles().size > 0 || state.getQueuedSessions().size > 0)) {
				const pendingArchiveFiles = Array.from(state.getQueuedArchiveFiles());
				const pendingSessions = Array.from(state.getQueuedSessions().values());
				const pendingForce = state.getQueuedForce();
				const pendingProgressCallbacks = Array.from(state.getQueuedProgressCallbacks());
				state.getQueuedArchiveFiles().clear();
				state.getQueuedSessions().clear();
				state.setQueuedForce(false);
				state.getQueuedProgressCallbacks().clear();
				const progress = pendingProgressCallbacks.length > 0 ? (update) => {
					for (const callback of pendingProgressCallbacks) callback(update);
				} : void 0;
				try {
					await state.sync({
						reason: "queued-sessions",
						...pendingForce ? { force: true } : {},
						sessions: pendingSessions,
						archiveFiles: pendingArchiveFiles,
						...progress ? { progress } : {}
					});
				} catch (err) {
					for (const archiveFile of pendingArchiveFiles) state.getQueuedArchiveFiles().add(archiveFile);
					for (const session of pendingSessions) state.getQueuedSessions().set(memorySessionSyncTargetKey(session), session);
					if (pendingForce) state.setQueuedForce(true);
					state.getQueuedProgressCallbacks().clear();
					throw err;
				}
			}
		} finally {
			if (state.isClosed()) {
				state.getQueuedArchiveFiles().clear();
				state.getQueuedSessions().clear();
				state.setQueuedForce(false);
				state.getQueuedProgressCallbacks().clear();
			}
			state.setQueuedSessionSync(null);
		}
	})());
	return state.getQueuedSessionSync() ?? Promise.resolve();
}
function normalizeQueuedMemorySessionSyncTarget(target) {
	const sessionId = target.sessionId.trim();
	if (!sessionId) return null;
	const agentId = target.agentId?.trim();
	const sessionKey = target.sessionKey?.trim();
	return {
		...agentId ? { agentId } : {},
		sessionId,
		...sessionKey ? { sessionKey } : {}
	};
}
function memorySessionSyncTargetKey(target) {
	return [
		target.agentId ?? "",
		target.sessionId,
		target.sessionKey ?? ""
	].join("\0");
}
//#endregion
//#region extensions/memory-core/src/memory/manager.ts
const log = createSubsystemLogger("memory");
// v-memory-preparation-observe-20260909
function measureMemoryPreparation(label, fn) {
 const start=performance.now();
 try { return fn(); } finally { console.error('[memory-preparation] '+JSON.stringify({pid:process.pid,stage:label,ms:Math.round((performance.now()-start)*10)/10})); }
}
const INDEX_MANAGER_REGISTRY = new MemoryManagerRegistry();
async function closeAllMemoryIndexManagers() {
	clearMemoryEmbeddingProbeCache();
	await INDEX_MANAGER_REGISTRY.closeAll(async (manager) => await manager.close());
}
async function closeMemoryIndexManagersForAgent(params) {
	await INDEX_MANAGER_REGISTRY.closeForAgent({
		agentId: params.agentId,
		purpose: "default",
		close: async (manager) => await manager.close()
	});
	await INDEX_MANAGER_REGISTRY.closeForAgent({
		agentId: params.agentId,
		purpose: "maintenance",
		close: async (manager) => await manager.close()
	});
}
var MemoryIndexManager = class MemoryIndexManager extends MemorySearchOrchestration {
	static async get(params) {
		const agentId = normalizeAgentId(params.agentId);
		const purpose = normalizeMemoryIndexManagerPurpose(params.purpose);
		return await INDEX_MANAGER_REGISTRY.acquire({
			agentId,
			purpose
		}, {
			prepare: () => {
				const settings = resolveMemorySearchConfig(params.cfg, agentId);
				if (!settings) return null;
				const workspaceDir = resolveAgentWorkspaceDir(params.cfg, agentId);
				const providerRequirement = resolveMemoryEmbeddingProviderRequirement({
					cfg: params.cfg,
					agentId,
					settings
				});
				const key = resolveMemoryIndexManagerCacheKey({
					agentId,
					workspaceDir,
					settings,
					providerRequirement,
					purpose,
					acquireLocalService: params.acquireLocalService
				});
				return {
					key,
					create: async () => {
						const manager = new MemoryIndexManager({
							cacheKey: key,
							cfg: params.cfg,
							agentId,
							workspaceDir,
							settings,
							providerRequirement,
							purpose,
							acquireLocalService: params.acquireLocalService
						});
						if (params.inspectSources) await manager.inspectDiagnosticSourceState();
						return manager;
					},
					reuse: (manager) => !manager.closing && !manager.closed
				};
			},
			close: async (manager) => await manager.close()
		});
	}
	constructor(params) {
		super();
		this.providerInitPromise = null;
		this.providerInitialized = false;
		this.providerRetirementPromise = Promise.resolve();
		this.providersPendingRetirement = /* @__PURE__ */ new Set();
		this.closePromise = null;
		this.closeTeardownComplete = false;
		this.closing = false;
		this.activeManagerOperations = 0;
		this.managerIdleWaiters = /* @__PURE__ */ new Set();
		this.activeBackgroundSearchSyncs = /* @__PURE__ */ new Set();
		this.batchFailureCount = 0;
		this.batchFailureLock = Promise.resolve();
		this.indexIdentityDirty = false;
		this.sessionWarm = /* @__PURE__ */ new Set();
		this.syncing = null;
		this.queuedArchiveFiles = /* @__PURE__ */ new Set();
		this.queuedSessions = /* @__PURE__ */ new Map();
		this.queuedForce = false;
		this.queuedProgressCallbacks = /* @__PURE__ */ new Set();
		this.queuedSessionSync = null;
		const effectiveSettings = resolveEffectiveMemorySearchSettings(params.settings);
		this.cacheKey = params.cacheKey;
		this.acquireLocalService = params.acquireLocalService;
		this.purpose = params.purpose;
		this.cfg = params.cfg;
		this.agentId = params.agentId;
		this.workspaceDir = params.workspaceDir;
		this.settings = effectiveSettings;
		this.providerRequirement = params.providerRequirement;
		this.requestedProvider = effectiveSettings.provider;
		this.providerLifecycle = createPendingMemoryProviderLifecycle(this.requestedProvider);
		for (const source of effectiveSettings.sources) this.sources.add(source);
		this.publishedDatabase = new MemoryIndexDatabase(measureMemoryPreparation("database-open:"+this.purpose, () => this.openDatabase(this.purpose === "status")));
		try {
			this.providerKey = this.computeProviderKey();
			this.cache = {
				enabled: effectiveSettings.cache.enabled,
				maxEntries: effectiveSettings.cache.maxEntries
			};
			this.fts.enabled = effectiveSettings.query.hybrid.enabled;
			if (this.purpose === "status") this.fts.available = this.fts.enabled && tableExists(this.db, "main", "memory_index_chunks_fts");
			else measureMemoryPreparation("memory-schema:"+this.purpose, () => this.ensureSchema());
			this.vector.enabled = effectiveSettings.store.vector.enabled;
			this.vector.extensionPath = effectiveSettings.store.vector.extensionPath;
			const meta = this.readMeta();
			if (meta?.vectorDims) this.vector.dims = meta.vectorDims;
			const initialIndexIdentity = this.resolveCurrentIndexIdentityState({
				meta,
				providerKeyKnown: false
			});
			this.indexIdentityState = initialIndexIdentity;
			this.indexIdentityDirty = initialIndexIdentity.status === "mismatched" || initialIndexIdentity.status === "missing" && this.sources.has("memory");
			const transient = isTransientMemoryIndexManagerPurpose(this.purpose);
			const invalidatedSources = new Set(this.db.prepare("SELECT DISTINCT source FROM memory_index_sources WHERE hash = ''").all().flatMap((row) => row.source === "memory" || row.source === "sessions" ? [row.source] : []));
			this.memorySourceProvenanceRepairPending = this.sources.has("memory") && invalidatedSources.has("memory");
			this.dirty = this.sources.has("memory") && (!transient || !meta) || this.memorySourceProvenanceRepairPending;
			if (this.sources.has("sessions") && invalidatedSources.has("sessions")) {
				this.sessionsDirty = true;
				this.sessionsFullRetryDirty = true;
			}
			this.batch = this.resolveBatchConfig();
			if (!transient) runInMemoryBackgroundContext(() => {
				measureMemoryPreparation("watcher", () => this.ensureWatcher());
				this.ensureSessionListener();
				this.ensureIntervalSync();
				measureMemoryPreparation("session-catchup-start", () => this.ensureSessionStartupCatchup());
			});
		} catch (err) {
			closeMemoryDatabase(this.db);
			throw err;
		}
	}
	async sync(params) {
		if (this.purpose === "status") throw new Error("Memory status managers are read-only");
		return await this.withPublishedDatabase(() => this.syncPublished(params));
	}
	adoptReindexRetryState(snapshot) {
		this.restoreReindexRetryState(snapshot);
	}
	async syncPublished(params) {
		if (this.closing || this.closed) return;
		if (hasTargetedSessionSyncParams(params) && (this.queuedSessionSync !== null || this.queuedArchiveFiles.size > 0 || this.queuedSessions.size > 0)) return await this.enqueueTargetedSessionSync(params);
		return await this.syncAdmitted(params);
	}
	async syncPublishedIndexInBackground(params) {
		await this.syncOutcomes.track(async () => await runMemorySearchMaintenance({
			reason: params.reason,
			takeDirtyGeneration: () => this.takeReindexRetryStateForMaintenance(),
			restoreDirtyGeneration: (generation) => this.restoreReindexRetryState(generation),
			acquireManager: async () => await MemoryIndexManager.get({
				cfg: this.cfg,
				agentId: this.agentId,
				purpose: "maintenance",
				acquireLocalService: this.acquireLocalService
			})
		}));
	}
	async syncAdmitted(params, options) {
		if (this.syncing) {
			if (hasTargetedSessionSyncParams(params)) {
				if (options?.queuedSessionOwner) {
					await this.syncing.catch(() => void 0);
					if (this.closing || this.closed) return;
					return await this.syncAdmitted(params, options);
				}
				return this.enqueueTargetedSessionSync(params);
			}
			try {
				return await this.syncing;
			} catch (err) {
				if (options?.allowEmbeddingBootstrapFallback && this.providerRequirement.mode === "optional" && (!this.providerInitialized || this.embeddingBootstrapFailure !== void 0)) {
					if (!this.embeddingBootstrapFailure) this.markEmbeddingBootstrapFailure(err);
					return await this.syncAdmitted(params, options);
				}
				throw err;
			}
		}
		const run = async () => {
			const hadBootstrapFailure = this.embeddingBootstrapFailure !== void 0;
			let forceFtsOnly = this.embeddingBootstrapFailure !== void 0 && this.getCachedEmbeddingAvailability()?.ok === false;
			if (!forceFtsOnly) {
				try {
					await this.ensureProviderInitialized();
				} catch (err) {
					if (this.providerRequirement.mode !== "optional" || !options?.allowEmbeddingBootstrapFallback && !hadBootstrapFailure) throw err;
					this.markEmbeddingBootstrapFailure(err);
					forceFtsOnly = true;
				}
				if (hadBootstrapFailure && !this.provider) {
					const failure = this.embeddingBootstrapFailure;
					const nextFailure = {
						...failure,
						reason: this.providerUnavailableReason ?? failure.reason
					};
					this.embeddingBootstrapFailure = nextFailure;
					this.cacheProbeResult({
						ok: false,
						error: nextFailure.reason
					});
					forceFtsOnly = true;
				}
			}
			const runGeneration = async (keywordOnly) => {
				const lock = await waitForMemoryReindexLock(resolveUserPath(this.settings.store.databasePath));
				try {
					this.beginSyncProviderGeneration({ forceFtsOnly: keywordOnly });
					try {
						await this.runSync(params);
					} finally {
						this.endSyncProviderGeneration();
					}
				} finally {
					lock.release();
				}
			};
			try {
				await runGeneration(forceFtsOnly);
			} catch (err) {
				if (!(this.providerRequirement.mode === "optional" && (options?.allowEmbeddingBootstrapFallback || hadBootstrapFailure) && this.shouldFallbackOnError(err))) throw err;
				const failedProvider = this.provider?.id ?? this.settings.provider;
				this.markEmbeddingBootstrapFailure(err, {
					retainProvider: this.provider !== null,
					provider: failedProvider
				});
				forceFtsOnly = true;
				await runGeneration(true);
			}
			if (hadBootstrapFailure && !forceFtsOnly && this.provider && this.refreshIndexIdentityDirty({ providerKeyKnown: true }).status === "valid" && await this.confirmEmbeddingBootstrapRecovery()) this.clearEmbeddingBootstrapFailureAfterRecovery();
		};
		this.syncing = this.syncOutcomes.track(run, true).finally(() => {
			this.syncing = null;
		});
		return this.syncing ?? Promise.resolve();
	}
	enqueueTargetedSessionSync(targets) {
		return enqueueMemoryTargetedSessionSync({
			isClosed: () => this.closing || this.closed,
			getSyncing: () => this.syncing,
			getQueuedArchiveFiles: () => this.queuedArchiveFiles,
			getQueuedSessions: () => this.queuedSessions,
			getQueuedForce: () => this.queuedForce,
			setQueuedForce: (value) => {
				this.queuedForce = value;
			},
			getQueuedProgressCallbacks: () => this.queuedProgressCallbacks,
			getQueuedSessionSync: () => this.queuedSessionSync,
			setQueuedSessionSync: (value) => {
				this.queuedSessionSync = value;
			},
			sync: async (params) => await this.syncAdmitted(params, { queuedSessionOwner: true })
		}, targets);
	}
	async readFile(params) {
		return await readMemoryFile({
			workspaceDir: this.workspaceDir,
			extraPaths: this.settings.extraPaths,
			relPath: params.relPath,
			from: params.from,
			lines: params.lines
		});
	}
	status() {
		return this.withPublishedDatabase(() => this.publishedStatus());
	}
	publishedStatus() {
		if (this.embeddingBootstrapFailure) this.refreshKeywordFallbackIndexIdentity();
		else this.refreshIndexIdentityDirty({ providerKeyKnown: this.providerInitialized });
		const sourceFilter = this.buildSourceFilter();
		const aggregateState = collectMemoryStatusAggregate({
			db: this.db,
			sources: this.sources,
			sourceFilterSql: sourceFilter.sql,
			sourceFilterParams: sourceFilter.params,
			includeChunkBytes: this.sourceInspections.size > 0
		});
		const providerInfo = resolveStatusProviderInfo({
			provider: this.embeddingBootstrapFailure ? null : this.provider,
			providerInitialized: this.embeddingBootstrapFailure ? true : this.providerInitialized,
			requestedProvider: this.requestedProvider,
			configuredModel: this.settings.model || void 0
		});
		return {
			backend: "builtin",
			files: aggregateState.files,
			chunks: aggregateState.chunks,
			dirty: this.dirty || this.sessionsDirty || this.indexIdentityDirty || this.activeBackgroundSearchSyncs.size > 0,
			lastSyncError: this.syncOutcomes.lastError,
			workspaceDir: this.workspaceDir,
			dbPath: this.settings.store.databasePath,
			provider: providerInfo.provider,
			model: providerInfo.model,
			requestedProvider: this.requestedProvider,
			sources: Array.from(this.sources),
			extraPaths: this.settings.extraPaths,
			sourceCounts: aggregateState.sourceCounts.map((entry) => Object.assign(entry, this.sourceInspections.get(entry.source) ?? {})),
			cache: this.cache.enabled ? {
				enabled: true,
				entries: this.db.prepare(`SELECT COUNT(*) as c FROM memory_embedding_cache`).get()?.c ?? 0,
				maxEntries: this.cache.maxEntries
			} : {
				enabled: false,
				maxEntries: this.cache.maxEntries
			},
			fts: {
				enabled: this.fts.enabled,
				available: this.fts.available,
				error: this.fts.loadError
			},
			fallback: this.fallbackReason ? {
				from: this.fallbackFrom ?? "local",
				reason: this.fallbackReason
			} : void 0,
			vector: {
				enabled: this.vector.enabled,
				index: resolvePersistedMemoryVectorIndexState({
					db: this.db,
					vectorTable: MEMORY_INDEX_VECTOR_TABLE,
					metaVectorDims: this.vector.dims,
					hasSemanticChunks: this.hasSemanticChunks()
				}),
				storeAvailable: this.vector.available ?? void 0,
				semanticAvailable: this.vector.semanticAvailable,
				available: this.vector.semanticAvailable,
				extensionPath: this.vector.extensionPath,
				loadError: this.vector.loadError,
				dims: this.vector.dims
			},
			batch: {
				enabled: this.batch.enabled,
				failures: this.batchFailureCount,
				limit: 2,
				wait: this.batch.wait,
				concurrency: this.batch.concurrency,
				pollIntervalMs: this.batch.pollIntervalMs,
				timeoutMs: this.batch.timeoutMs,
				lastError: this.batchFailureLastError,
				lastProvider: this.batchFailureLastProvider
			},
			custom: {
				llamaCppRuntime: getLocalEmbeddingRuntimeFacts(this.provider),
				searchMode: providerInfo.searchMode,
				providerState: this.providerLifecycle,
				providerUnavailableReason: this.providerUnavailableReason,
				indexIdentity: this.indexIdentityState
			}
		};
	}
	async close() {
		const existingClose = this.closePromise;
		if (existingClose) {
			await existingClose;
			return;
		}
		const closeOperation = this.withPublishedDatabase(() => this.closeTeardownComplete ? this.retryFailedClose() : this.closeOnce());
		this.closePromise = closeOperation;
		try {
			await closeOperation;
		} catch (err) {
			if (this.closePromise === closeOperation) this.closePromise = null;
			throw err;
		}
	}
	async retryFailedClose() {
		const retirementErrors = await this.drainPendingProviderRetirements();
		if (this.providersPendingRetirement.size > 0) throw toErrorObject(retirementErrors.at(-1), "Embedding provider retirement failed");
		INDEX_MANAGER_REGISTRY.deleteIfCurrent(this.cacheKey, this);
	}
	async closeOnce() {
		this.closing = true;
		this.queuedArchiveFiles.clear();
		this.queuedSessions.clear();
		this.queuedForce = false;
		this.queuedProgressCallbacks.clear();
		await this.awaitManagerIdle();
		this.closed = true;
		const pendingProviderInit = this.providerInitPromise;
		const pendingFallbackInit = this.getPendingFallbackProviderInitialization();
		if (this.watchTimer) {
			clearTimeout(this.watchTimer);
			this.watchTimer = null;
		}
		if (this.sessionWatchTimer) {
			clearTimeout(this.sessionWatchTimer);
			this.sessionWatchTimer = null;
		}
		if (this.intervalTimer) {
			clearInterval(this.intervalTimer);
			this.intervalTimer = null;
		}
		if (this.memoryWatchPressureStartupTimer) {
			clearTimeout(this.memoryWatchPressureStartupTimer);
			this.memoryWatchPressureStartupTimer = null;
		}
		if (this.watcher) {
			await this.watcher.close();
			this.watcher = null;
		}
		this.closeNativeMemoryWatchPairs();
		if (this.sessionUnsubscribe) {
			this.sessionUnsubscribe();
			this.sessionUnsubscribe = null;
		}
		const closeErrors = /* @__PURE__ */ new Map();
		const providersToClose = /* @__PURE__ */ new Set();
		const rememberCurrentProvider = () => {
			const provider = this.provider;
			if (!provider) return;
			providersToClose.add(provider);
		};
		const closeProvider = async (provider) => {
			try {
				await provider.close?.();
				closeErrors.delete(provider);
				if (this.provider === provider) this.provider = null;
			} catch (err) {
				closeErrors.set(provider, err);
				providersToClose.add(provider);
			} finally {
				rememberCurrentProvider();
			}
		};
		const drainTrackedProviders = async () => {
			for (let attempt = 0; attempt < 2 && providersToClose.size > 0; attempt += 1) {
				const providers = Array.from(providersToClose);
				providersToClose.clear();
				try {
					for (const provider of providers) await closeProvider(provider);
				} finally {
					rememberCurrentProvider();
				}
			}
		};
		const reportPendingWorkError = (err) => {
			log.warn(`memory close: pending manager work failed: ${formatErrorMessage(err)}`);
		};
		const awaitCurrentSync = async () => {
			const pendingSync = this.syncing;
			if (!pendingSync) return;
			await awaitPendingManagerWork({
				pendingSync,
				onError: reportPendingWorkError
			});
		};
		await awaitPendingManagerWork({
			pendingProviderInit,
			onError: reportPendingWorkError
		});
		await awaitPendingManagerWork({
			pendingProviderInit: pendingFallbackInit?.then(() => void 0),
			onError: reportPendingWorkError
		});
		await awaitCurrentSync();
		const retirementErrors = await this.drainPendingProviderRetirements();
		rememberCurrentProvider();
		try {
			rememberCurrentProvider();
			await drainTrackedProviders();
		} finally {
			closeMemoryDatabase(this.db);
			this.closeTeardownComplete = true;
		}
		const closeError = (this.providersPendingRetirement.size > 0 ? retirementErrors.at(-1) : void 0) ?? closeErrors.values().next().value;
		if (closeError) throw toErrorObject(closeError, "Non-Error thrown");
		INDEX_MANAGER_REGISTRY.deleteIfCurrent(this.cacheKey, this);
	}
};
//#endregion
export { MemoryIndexManager, closeAllMemoryIndexManagers, closeMemoryIndexManagersForAgent };
