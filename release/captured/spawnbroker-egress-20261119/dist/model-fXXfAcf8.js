import { l as normalizeOptionalString, p as normalizeStringifiedOptionalString } from "./string-coerce-CIXf7egm.js";
import { r as defaultRuntime } from "./runtime-V1VdbWVS.js";
import { n as getRuntimeConfig } from "./io.runtime-CKu7Rw0j.js";
import { u as resolveAgentDir } from "./agent-scope-config-CUiGBd59.js";
import { r as DEFAULT_PROVIDER } from "./defaults-CdX9UGcX.js";
import { o as resolveAgentEffectiveModelPrimary } from "./agent-scope-CSlN0kZb.js";
import { c as loadManifestMetadataSnapshot } from "./manifest-contract-eligibility-BRbQGAZ5.js";
import { s as normalizeThinkLevel } from "./thinking.shared-bHYuuc1L.js";
import { t as getProviderEnvVars } from "./provider-env-vars-BMbvepMk.js";
import { t as planEffectiveModelCatalogRows } from "./model-catalog-APWJJyRm.js";
import { t as ADMIN_SCOPE } from "./operator-scopes-Dw7Gu2cA.js";
import { i as GATEWAY_CLIENT_NAMES, r as GATEWAY_CLIENT_MODES } from "./client-info-B1bPgeKr.js";
import "./config-Cv60gBux.js";
import { g as randomIdempotencyKey, o as callGateway } from "./call-DcwkiOeW.js";
import { S as updateAuthProfileStoreWithLock, f as loadAuthProfileStoreForRuntime } from "./store-CZzbMlii.js";
import { n as listProfilesForProvider } from "./profile-list-sI6O2eVg.js";
import { d as normalizeMimeType, n as detectMime } from "./mime-BxTGWg2e.js";
import { i as convertHeicToJpeg } from "./image-ops-CkENcywK.js";
import "./thinking-DxxV8Ztb.js";
import { a as loadPreparedModelCatalog } from "./prepared-model-catalog-BSfJgEXd.js";
import "./media-services-BySSkTCE.js";
import "./auth-profiles-DvLkLvBr.js";
import { t as canonicalizeCaseOnlyCatalogModelRef } from "./model-selection-DG2dN6VK.js";
import { t as buildExplicitSessionIdSessionKey } from "./session-CEfQoC2g.js";
import { u as getModelsCommandSecretTargetIds } from "./command-secret-targets-esC7Faew.js";
import { r as prepareSimpleCompletionModelForAgent, t as completeWithPreparedSimpleCompletionModel } from "./simple-completion-runtime-D9F09LT6.js";
import { n as runCommandWithRuntime } from "./cli-utils-CExnPwgX.js";
import { c as providerSummaryText, d as resolveCapabilityProviderAgentId, f as resolveLocalCapabilityRuntimeConfig, h as resolveTransport, l as requireProviderModelOverride, m as resolveSelectedProviderFromModelRef, n as formatEnvelopeForText, s as providerHasGenericConfig, t as emitJsonOrText, u as resolveCapabilityAgentOption } from "./shared-Beq6KEVC.js";
import { t as collectOption } from "./helpers-B-LqXQ3Z.js";
import path from "node:path";
import fs from "node:fs/promises";
import { randomUUID } from "node:crypto";
//#region src/cli/capability-cli/model.ts
const LOCAL_MODEL_RUN_SYSTEM_PROMPT = "You are a personal assistant running inside OpenClaw.";
const HEIC_MODEL_RUN_MIMES = /* @__PURE__ */ new Set([
	"image/heic",
	"image/heic-sequence",
	"image/heif",
	"image/heif-sequence"
]);
async function loadModelCatalogForInspection(cfg, agentId) {
	const prepared = await loadPreparedModelCatalog({
		config: cfg,
		agentId,
		readOnly: true
	});
	const metadataSnapshot = loadManifestMetadataSnapshot({
		config: cfg,
		env: process.env
	});
	const manifest = planEffectiveModelCatalogRows({
		registry: metadataSnapshot.manifestRegistry,
		config: cfg
	}).rows;
	const entries = /* @__PURE__ */ new Map();
	for (const entry of manifest) entries.set(`${entry.provider}\0${entry.id}`, entry);
	for (const entry of prepared) entries.set(`${entry.provider}\0${entry.id}`, entry);
	return [...entries.values()].toSorted((a, b) => a.provider.localeCompare(b.provider) || a.id.localeCompare(b.id));
}
async function canonicalizeModelRunRef(params) {
	return await canonicalizeCaseOnlyCatalogModelRef({
		cfg: params.cfg,
		raw: params.raw,
		defaultProvider: DEFAULT_PROVIDER,
		loadCatalog: () => loadPreparedModelCatalog({
			config: params.cfg,
			readOnly: true
		}),
		preserveAuthProfile: params.preserveAuthProfile
	});
}
function collectModelRunText(content) {
	return content.map((block) => block.type === "text" && typeof block.text === "string" ? block.text : "").join("").trim();
}
function requireModelRunPrompt(value) {
	if (typeof value !== "string" || normalizeOptionalString(value) === void 0) throw new Error("--prompt cannot be empty or whitespace-only.");
	return value;
}
async function readModelRunImageFiles(files) {
	if (!files || files.length === 0) return [];
	return await Promise.all(files.map(async (filePath) => {
		const resolvedPath = path.resolve(filePath);
		const buffer = await fs.readFile(resolvedPath);
		const mimeType = normalizeMimeType(await detectMime({
			buffer,
			filePath: resolvedPath
		}));
		if (!mimeType?.startsWith("image/")) throw new Error(`Unsupported --file for model run: ${resolvedPath}. Only image files are supported; use infer audio transcribe for audio files.`);
		if (HEIC_MODEL_RUN_MIMES.has(mimeType)) {
			const converted = await convertHeicToJpeg(buffer);
			return {
				path: resolvedPath,
				fileName: path.basename(resolvedPath),
				mimeType: "image/jpeg",
				data: converted.toString("base64")
			};
		}
		return {
			path: resolvedPath,
			fileName: path.basename(resolvedPath),
			mimeType,
			data: buffer.toString("base64")
		};
	}));
}
function normalizeModelRunThinking(value) {
	if (value === void 0) return;
	if (typeof value !== "string") throw new Error("--thinking must be a string.");
	const normalized = normalizeThinkLevel(value);
	if (!normalized) throw new Error("Invalid thinking level. Use one of: off, minimal, low, medium, high, adaptive, xhigh, max.");
	return normalized;
}
async function runModelRun(params) {
	const explicitModelOverride = requireProviderModelOverride(params.model);
	const cfg = params.transport === "local" ? await resolveLocalCapabilityRuntimeConfig({
		commandName: "infer model run",
		targetIds: getModelsCommandSecretTargetIds()
	}) : getRuntimeConfig();
	const agentId = resolveCapabilityProviderAgentId(cfg, params.agent, "infer model run");
	const modelRef = await canonicalizeModelRunRef({
		raw: params.model,
		cfg,
		preserveAuthProfile: params.transport === "local"
	});
	const hasExplicitProviderModelOverride = Boolean(explicitModelOverride);
	const imageFiles = await readModelRunImageFiles(params.files);
	const messageContent = imageFiles.length > 0 ? [{
		type: "text",
		text: params.prompt
	}, ...imageFiles.map((image) => ({
		type: "image",
		data: image.data,
		mimeType: image.mimeType
	}))] : params.prompt;
	if (params.transport === "local") {
		const prepared = await prepareSimpleCompletionModelForAgent({
			cfg,
			agentId,
			modelRef,
			allowMissingApiKeyModes: ["aws-sdk"],
			...hasExplicitProviderModelOverride ? { allowBundledStaticCatalogFallback: true } : {},
			skipAgentDiscovery: true,
			runtimePluginScope: "provider" // infer-latency: a one-shot completion loads the provider's plugins only
		});
		if ("error" in prepared) throw new Error(prepared.error);
		if (prepared.selection.provider === "codex") throw new Error("The codex provider is served by the Codex app-server agent runtime, not the local simple-completion transport. Use an openai/<model> ref with provider/model agentRuntime.id: \"codex\", run through the gateway, or use /codex commands.");
		const localModelRunSystemPrompt = prepared.model.api === "openai-chatgpt-responses" ? LOCAL_MODEL_RUN_SYSTEM_PROMPT : void 0;
		const result = await completeWithPreparedSimpleCompletionModel({
			model: prepared.model,
			auth: prepared.auth,
			cfg,
			context: {
				...localModelRunSystemPrompt ? { systemPrompt: localModelRunSystemPrompt } : {},
				messages: [{
					role: "user",
					content: messageContent,
					timestamp: Date.now()
				}]
			},
			options: {
				maxTokens: typeof prepared.model.maxTokens === "number" && Number.isFinite(prepared.model.maxTokens) ? prepared.model.maxTokens : void 0,
				...params.thinking ? { reasoning: params.thinking } : {}
			}
		});
		const text = collectModelRunText(result.content);
		if (!text) {
			const providerErrorMessage = result.errorMessage;
			const detail = typeof providerErrorMessage === "string" && providerErrorMessage.trim() ? `: ${providerErrorMessage.trim()}` : "";
			throw new Error(`No text output returned for provider "${prepared.selection.provider}" model "${prepared.selection.modelId}"${detail}.`);
		}
		return {
			ok: true,
			capability: "model.run",
			transport: "local",
			provider: prepared.selection.provider,
			model: prepared.selection.modelId,
			attempts: [],
			...imageFiles.length > 0 ? { inputs: imageFiles.map((image) => ({
				path: image.path,
				mimeType: image.mimeType
			})) } : {},
			outputs: [{
				text,
				mediaUrl: null
			}]
		};
	}
	const { provider, model } = requireProviderModelOverride(modelRef) ?? {};
	const hasModelOverride = Boolean(provider || model);
	const sessionId = `model-run-${randomUUID()}`;
	const sessionKey = buildExplicitSessionIdSessionKey({
		agentId,
		sessionId
	});
	const response = await callGateway({
		method: "agent",
		params: {
			agentId,
			sessionId,
			sessionKey,
			message: params.prompt,
			attachments: imageFiles.length > 0 ? imageFiles.map((image) => ({
				type: "image",
				fileName: image.fileName,
				mimeType: image.mimeType,
				content: image.data
			})) : void 0,
			provider,
			model,
			...params.thinking ? { thinking: params.thinking } : {},
			modelRun: true,
			promptMode: "none",
			cleanupBundleMcpOnRunEnd: true,
			idempotencyKey: randomIdempotencyKey()
		},
		expectFinal: true,
		timeoutMs: 12e4,
		clientName: hasModelOverride ? GATEWAY_CLIENT_NAMES.GATEWAY_CLIENT : GATEWAY_CLIENT_NAMES.CLI,
		mode: hasModelOverride ? GATEWAY_CLIENT_MODES.BACKEND : GATEWAY_CLIENT_MODES.CLI,
		...hasModelOverride ? { scopes: [ADMIN_SCOPE] } : {}
	});
	return {
		ok: true,
		capability: "model.run",
		transport: "gateway",
		provider: response?.result?.meta?.agentMeta?.provider,
		model: response?.result?.meta?.agentMeta?.model,
		attempts: response?.result?.meta?.agentMeta?.fallbackAttempts ?? [],
		outputs: (response?.result?.payloads ?? []).map((payload) => ({
			text: payload.text,
			mediaUrl: payload.mediaUrl,
			mediaUrls: payload.mediaUrls
		})),
		...imageFiles.length > 0 ? { inputs: imageFiles.map((image) => ({
			path: image.path,
			mimeType: image.mimeType
		})) } : {}
	};
}
async function buildModelProviders(rawAgentId) {
	const cfg = getRuntimeConfig();
	const agentId = resolveCapabilityProviderAgentId(cfg, rawAgentId);
	const catalog = await loadModelCatalogForInspection(cfg, agentId);
	const selectedProvider = resolveSelectedProviderFromModelRef(resolveAgentEffectiveModelPrimary(cfg, agentId));
	const grouped = /* @__PURE__ */ new Map();
	for (const entry of catalog) {
		const current = grouped.get(entry.provider) ?? {
			provider: entry.provider,
			count: 0,
			defaults: [],
			available: true,
			configured: providerHasGenericConfig({
				cfg,
				providerId: entry.provider,
				agentId,
				envVars: getProviderEnvVars(entry.provider)
			}),
			selected: selectedProvider === entry.provider
		};
		current.count += 1;
		if (current.defaults.length < 3) current.defaults.push(entry.id);
		grouped.set(entry.provider, current);
	}
	return [...grouped.values()].toSorted((a, b) => a.provider.localeCompare(b.provider));
}
async function runModelAuthStatus(agent) {
	const captured = [];
	const { modelsStatusCommand } = await import("./list.status-command-CGiFMvxY.js");
	await modelsStatusCommand({
		json: true,
		agent
	}, {
		log: (...args) => captured.push(args.join(" ")),
		error: (message) => {
			throw message instanceof Error ? message : new Error(String(message));
		},
		exit: (code) => {
			throw new Error(`exit ${code}`);
		}
	});
	const raw = captured.find((line) => line.trim().startsWith("{"));
	return raw ? JSON.parse(raw) : {};
}
async function runModelAuthLogout(provider, agent) {
	const cfg = getRuntimeConfig();
	const agentDir = resolveAgentDir(cfg, agent);
	const store = loadAuthProfileStoreForRuntime(agentDir);
	const profileIds = listProfilesForProvider(store, provider);
	if (!await updateAuthProfileStoreWithLock({
		agentDir,
		updater: (nextStore) => {
			let changed = false;
			for (const profileId of profileIds) {
				if (nextStore.profiles[profileId]) {
					delete nextStore.profiles[profileId];
					changed = true;
				}
				if (nextStore.usageStats?.[profileId]) {
					delete nextStore.usageStats[profileId];
					changed = true;
				}
			}
			if (nextStore.order?.[provider]) {
				delete nextStore.order[provider];
				changed = true;
			}
			if (nextStore.lastGood?.[provider]) {
				delete nextStore.lastGood[provider];
				changed = true;
			}
			return changed;
		}
	})) throw new Error(`Failed to remove saved auth profiles for provider ${provider}.`);
	return {
		provider,
		removedProfiles: profileIds
	};
}
function registerModelCapabilityCommands(capability) {
	const model = capability.command("model").description("Text inference and model catalog commands").option("--agent <id>", "Agent whose model and auth state should be used");
	model.command("run").description("Run a one-shot model turn").requiredOption("--prompt <text>", "Prompt text").option("--file <path>", "Image file", collectOption, []).option("--model <provider/model>", "Model override").option("--thinking <level>", "Thinking level override").option("--local", "Force local execution", false).option("--gateway", "Force gateway execution", false).option("--agent <id>", "Agent whose model and credentials own the run (default: agents.defaults.systemAgent.agentId, then the sole agent)").option("--json", "Output JSON", false).action(async (opts, command) => {
		await runCommandWithRuntime(defaultRuntime, async () => {
			const prompt = requireModelRunPrompt(opts.prompt);
			const thinking = normalizeModelRunThinking(opts.thinking);
			const transport = resolveTransport({
				local: Boolean(opts.local),
				gateway: Boolean(opts.gateway),
				supported: ["local", "gateway"],
				defaultTransport: "local"
			});
			const result = await runModelRun({
				prompt,
				agent: resolveCapabilityAgentOption(command, opts.agent),
				files: opts.file,
				model: opts.model,
				thinking,
				transport
			});
			emitJsonOrText(defaultRuntime, Boolean(opts.json), result, formatEnvelopeForText);
		});
	});
	model.command("list").description("List known models").option("--json", "Output JSON", false).action(async (opts) => {
		await runCommandWithRuntime(defaultRuntime, async () => {
			const result = await loadModelCatalogForInspection(getRuntimeConfig());
			emitJsonOrText(defaultRuntime, Boolean(opts.json), result, providerSummaryText);
		});
	});
	model.command("inspect").description("Inspect one model catalog entry").requiredOption("--model <provider/model>", "Model id").option("--json", "Output JSON", false).action(async (opts) => {
		await runCommandWithRuntime(defaultRuntime, async () => {
			const target = normalizeStringifiedOptionalString(opts.model) ?? "";
			const catalog = await loadModelCatalogForInspection(getRuntimeConfig());
			const entry = catalog.find((candidate) => `${candidate.provider}/${candidate.id}` === target) ?? catalog.find((candidate) => candidate.id === target);
			if (!entry) throw new Error(`Model not found: ${target}`);
			emitJsonOrText(defaultRuntime, Boolean(opts.json), entry, (value) => JSON.stringify(value, null, 2));
		});
	});
	model.command("providers").description("List model providers from the catalog").option("--agent <id>", "Agent whose provider state should be inspected").option("--json", "Output JSON", false).action(async (opts, command) => {
		await runCommandWithRuntime(defaultRuntime, async () => {
			const result = await buildModelProviders(resolveCapabilityAgentOption(command, opts.agent));
			emitJsonOrText(defaultRuntime, Boolean(opts.json), result, providerSummaryText);
		});
	});
	const modelAuth = model.command("auth").description("Provider auth helpers").option("--agent <id>", "Agent id (default: configured default agent)");
	const resolveModelAuthAgent = (command, rawAgentId, surface) => resolveCapabilityProviderAgentId(getRuntimeConfig(), resolveCapabilityAgentOption(command, rawAgentId), surface);
	modelAuth.command("login").description("Run provider auth login").requiredOption("--provider <id>", "Provider id").option("--method <id>", "Provider auth method id").option("--agent <id>", "Agent id (default: configured default agent)").action(async (opts, command) => {
		await runCommandWithRuntime(defaultRuntime, async () => {
			const agent = resolveModelAuthAgent(command, opts.agent, "infer model auth login");
			const { modelsAuthLoginCommand } = await import("./auth-CUR4-JYI.js");
			await modelsAuthLoginCommand({
				provider: String(opts.provider),
				method: opts.method ? String(opts.method) : void 0,
				agent
			}, defaultRuntime);
		});
	});
	modelAuth.command("logout").description("Remove saved auth profiles for one provider").requiredOption("--provider <id>", "Provider id").option("--agent <id>", "Agent id (default: agents.defaults.systemAgent.agentId, then the sole agent)").option("--json", "Output JSON", false).action(async (opts, command) => {
		await runCommandWithRuntime(defaultRuntime, async () => {
			const result = await runModelAuthLogout(String(opts.provider), resolveModelAuthAgent(command, opts.agent, "infer model auth logout"));
			emitJsonOrText(defaultRuntime, Boolean(opts.json), result, (value) => JSON.stringify(value, null, 2));
		});
	});
	modelAuth.command("status").description("Show configured auth state").option("--agent <id>", "Agent id (default: configured default agent)").option("--json", "Output JSON", false).action(async (opts, command) => {
		await runCommandWithRuntime(defaultRuntime, async () => {
			const result = await runModelAuthStatus(resolveModelAuthAgent(command, opts.agent, "infer model auth status"));
			emitJsonOrText(defaultRuntime, Boolean(opts.json), result, (value) => JSON.stringify(value, null, 2));
		});
	});
}
//#endregion
export { registerModelCapabilityCommands };
