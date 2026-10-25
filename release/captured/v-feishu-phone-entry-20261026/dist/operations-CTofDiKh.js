import { r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
import fs from "node:fs";
import { c as resolveUserPath } from "./home-dir-BPhrG-aM.js";
import { m as shortenHomePath } from "./utils-D3A1hGii.js";
import { t as formatErrorMessage } from "./errors-u9zSVTak.js";
import { w as tryResolveAmbientOwnerAgentId } from "./agent-scope-config-CUiGBd59.js";
import { n as normalizeAgentId } from "./agent-id-CeT3w4ap.js";
import { a as buildAgentMainSessionKey } from "./session-key-CRjxKW0X.js";
import { r as isReservedSystemAgentId } from "./agent-id-CaFmP6-7.js";
import { n as t } from "./i18n-D7-Ks--0.js";
import { i as appendSystemAgentAuditEntry, r as SYSTEM_AGENT_AUDIT_STORE_LABEL } from "./audit-Dmdv-Ynb.js";
import { i as formatSystemAgentPersistentPlan, s as validateSystemAgentPluginInstallSpec, u as redactSystemAgentConfig } from "./operations-parse-C6y4xCop.js";
import { i as sameDefaultInferenceRoute, n as projectInferenceRoute, t as projectDefaultInferenceRoute } from "./inference-route-Bv_D48Z8.js";
//#region src/system-agent/config-write-policy.ts
/**
* Config roots the system agent must never write directly, with the operator
* escalation for each. These stay human-only regardless of approval:
* credential material, alternate-config inclusion, and provider/catalog
* definitions that feed inference routing (which has the verified
* `set_default_model` path instead). Everything else in the schema is
* agent-writable behind the exact-operation human approval gate — the
* config-write-parity contract test enforces that classification.
*/
const SYSTEM_AGENT_CONFIG_WRITE_DENYLIST = {
	$include: "alternate-config inclusion; edit openclaw.json in a trusted shell",
	auth: "provider auth; `openclaw onboard` on the machine running OpenClaw",
	env: "environment/credential injection; edit openclaw.json in a trusted shell",
	models: "provider/catalog definitions feed routing; use `set_default_model` or `openclaw onboard`",
	secrets: "secret providers; edit openclaw.json in a trusted shell"
};
function classifyInferenceRouteConfigPath(path) {
	const [root, scope, ownerOrField, field] = path.map((segment) => segment.trim().toLowerCase()).filter(Boolean);
	if (root && root in SYSTEM_AGENT_CONFIG_WRITE_DENYLIST) return "blocked";
	if (root === "plugins") return scope === "entries" && ownerOrField ? "plugin-entry" : "blocked";
	if (root !== "agents") return "allowed";
	if (!scope || scope === "defaults" && !ownerOrField || scope === "list" && !ownerOrField) return "blocked";
	if (scope === "defaults") return [
		"agentruntime",
		"model",
		"models",
		"params"
	].includes(ownerOrField ?? "") ? "blocked" : "allowed";
	if (scope !== "list") return "allowed";
	if (/^\d+$/.test(ownerOrField ?? "") && !field) return "blocked";
	const routeField = /^\d+$/.test(ownerOrField ?? "") ? field : ownerOrField;
	if ([
		"agentdir",
		"default",
		"id"
	].includes(routeField ?? "")) return "blocked";
	return [
		"agentruntime",
		"model",
		"models",
		"params"
	].includes(routeField ?? "") ? "agent-route" : "allowed";
}
//#endregion
//#region src/system-agent/operations-execution-helpers.ts
const loadConfigModule = async () => await import("./config/config.js");
const loadOverviewModule$1 = async () => await import("./overview-4egA0VsE.js");
const CONFIG_GET_OUTPUT_MAX_CHARS = 2e3;
function readConfigValueAtPath(config, path) {
	let current = config;
	for (const rawSegment of path.split(".")) {
		const parts = rawSegment.split(/[[\]]/).filter(Boolean);
		for (const part of parts) {
			if (current === null || typeof current !== "object") return { found: false };
			const index = /^\d+$/.test(part) ? Number(part) : void 0;
			if (index !== void 0 && Array.isArray(current)) current = current[index];
			else current = current[part];
			if (current === void 0) return { found: false };
		}
	}
	return {
		found: true,
		value: current
	};
}
function formatGatewayStatusLine(overview) {
	return [
		`Gateway: ${overview.gateway.reachable ? "reachable" : "not reachable"}`,
		`URL: ${overview.gateway.url}`,
		`Source: ${overview.gateway.source}`,
		overview.gateway.error ? `Note: ${overview.gateway.error}` : void 0
	].filter((line) => line !== void 0).join("\n");
}
async function runGatewayLifecycle(operation, surface) {
	if (operation === "restart" && surface === "gateway") {
		const { scheduleSafeGatewayRestart } = await import("./restart-coordinator-BYIoXnkw.js");
		return scheduleSafeGatewayRestart({
			reason: "gateway.restart.safe",
			delayMs: 0
		}).ok;
	}
	const lifecycle = await import("./lifecycle-DREtOpag.js");
	if (operation === "start") {
		await lifecycle.runDaemonStart();
		return;
	}
	if (operation === "stop") {
		await lifecycle.runDaemonStop({ force: true });
		return;
	}
	return await lifecycle.runDaemonRestart();
}
async function readConfigFileSnapshotLazy() {
	const { readConfigFileSnapshot } = await loadConfigModule();
	return await readConfigFileSnapshot();
}
async function loadOverviewForOperation(deps) {
	if (deps?.loadOverview) return await deps.loadOverview();
	const { loadSystemAgentOverview } = await loadOverviewModule$1();
	return await loadSystemAgentOverview();
}
async function resolveChannelSetupState(deps) {
	const listPlugins = deps?.listChannelSetupPlugins ?? (await import("./setup-registry-CH9MmwH2.js")).listChannelSetupPlugins;
	const resolveEntries = deps?.resolveChannelSetupEntries ?? (await import("./discovery-Cs2rdXrq.js")).resolveChannelSetupEntries;
	const isConfigured = deps?.isChannelConfigured ?? (await import("./channel-configured-shared-CUHFXrmV.js")).isStaticallyChannelConfigured;
	const { shouldShowChannelInSetup } = await import("./discovery-Cs2rdXrq.js");
	const snapshot = await readConfigFileSnapshotLazy();
	const cfg = snapshot.valid ? snapshot.runtimeConfig ?? snapshot.config : {};
	const installedPlugins = listPlugins();
	const resolved = resolveEntries({
		cfg,
		installedPlugins
	});
	return {
		cfg,
		installedPlugins,
		resolved: {
			...resolved,
			entries: resolved.entries.filter((entry) => shouldShowChannelInSetup(entry.meta))
		},
		isConfigured
	};
}
function formatChannelDocsUrl(docsPath) {
	return `https://docs.openclaw.ai${docsPath.startsWith("/") ? docsPath : `/${docsPath}`}`;
}
function formatConfigValidationLine(snapshot) {
	if (!snapshot.exists) return `Config missing: ${shortenHomePath(snapshot.path)}`;
	if (snapshot.valid) return `Config valid: ${shortenHomePath(snapshot.path)}`;
	return [`Config invalid: ${shortenHomePath(snapshot.path)}`, ...snapshot.issues.map((issue) => {
		return `  - ${issue.path ? `${issue.path}: ` : ""}${issue.message}`;
	})].join("\n");
}
function createNoExitRuntime(runtime) {
	return {
		...runtime,
		exit: (code) => {
			throw new Error(`operation exited with code ${code}`);
		}
	};
}
function resolveTuiAgentId(params) {
	const { overview } = params;
	const workspace = params.requestedWorkspace ? resolveUserPath(params.requestedWorkspace) : void 0;
	if (workspace) {
		const workspaceMatch = overview.agents.find((agent) => {
			return agent.workspace ? resolveUserPath(agent.workspace) === workspace : false;
		});
		if (workspaceMatch) return workspaceMatch.id;
	}
	if (!params.requestedAgentId?.trim()) return overview.defaultAgentId;
	const requested = normalizeAgentId(params.requestedAgentId);
	return overview.agents.find((agent) => {
		return normalizeAgentId(agent.id) === requested || (agent.name ? normalizeAgentId(agent.name) === requested : false);
	})?.id ?? requested;
}
async function applyPersistentOperation(params) {
	const { auditOperation, runtime, opts } = params;
	if (!opts.approved) {
		const message = formatSystemAgentPersistentPlan(params.operation, opts.operatorApprovalOnly);
		runtime.log(message);
		return {
			applied: false,
			message
		};
	}
	runtime.log(`[openclaw] running: ${auditOperation}`);
	const { readConfigFileSnapshot } = await loadConfigModule();
	const before = await readConfigFileSnapshot();
	const assertPersistentApply = opts.beforePersistentApply;
	const commit = async (effect) => {
		assertPersistentApply?.();
		return await effect();
	};
	const outcome = await params.run({
		runtime,
		deps: opts.deps,
		...assertPersistentApply ? { assertPersistentApply } : {},
		commit
	});
	const after = await readConfigFileSnapshot();
	try {
		await appendSystemAgentAuditEntry({
			operation: auditOperation,
			summary: outcome.summary,
			configPath: outcome.configPath ?? after.path ?? before.path ?? void 0,
			configHashBefore: before.hash ?? null,
			configHashAfter: after.hash ?? null,
			details: {
				...opts.auditDetails,
				...outcome.details
			}
		});
	} catch (error) {
		runtime.error(`${outcome.summary}, but OpenClaw could not record its audit entry: ${formatErrorMessage(error)}`);
	}
	runtime.log(`[openclaw] done: ${auditOperation}`);
	return {
		applied: true,
		...outcome.bootstrapPending === void 0 ? {} : { bootstrapPending: outcome.bootstrapPending },
		...outcome.agentId ? { agentId: outcome.agentId } : {}
	};
}
async function runConfigSetOperation(params) {
	const { operation, ctx } = params;
	const runConfigSet = ctx.deps?.runConfigSet ?? (async (setOpts) => {
		const { runConfigSet: importedRunConfigSet } = await import("./config-cli-CsHq462L.js");
		await importedRunConfigSet({
			...setOpts,
			runtime: createNoExitRuntime(ctx.runtime)
		});
	});
	if (operation.kind === "config-set") {
		await assertConfigWriteDoesNotBypassInferenceVerification(operation);
		await ctx.commit(() => runConfigSet({
			path: operation.path,
			value: operation.value,
			cliOptions: {},
			...ctx.assertPersistentApply ? { beforePersistentApply: ctx.assertPersistentApply } : {}
		}));
		return;
	}
	await assertConfigWriteDoesNotBypassInferenceVerification(operation);
	await ctx.commit(() => runConfigSet({
		path: operation.path,
		cliOptions: {
			refProvider: operation.provider ?? "default",
			refSource: operation.source,
			refId: operation.id
		},
		...ctx.assertPersistentApply ? { beforePersistentApply: ctx.assertPersistentApply } : {}
	}));
}
async function isDefaultAgentListPath(segments) {
	const listIndexSegment = segments.map((segment) => segment.trim().toLowerCase()).filter(Boolean)[2];
	if (!listIndexSegment || !/^\d+$/.test(listIndexSegment)) return true;
	const { readConfigFileSnapshot } = await loadConfigModule();
	const snapshot = await readConfigFileSnapshot();
	if (!snapshot.exists || !snapshot.valid) return true;
	const config = snapshot.sourceConfig ?? snapshot.config;
	const authoredList = snapshot.sourceConfigBeforeMigrations?.agents?.list;
	const entry = Array.isArray(authoredList) ? authoredList[Number(listIndexSegment)] : void 0;
	if (!entry?.id) return true;
	const defaultAgentId = config ? tryResolveAmbientOwnerAgentId(config) : void 0;
	return !defaultAgentId || normalizeAgentId(entry.id) === normalizeAgentId(defaultAgentId);
}
async function assertConfigWriteDoesNotBypassInferenceVerification(operation) {
	const { parseConfigSetPath } = await import("./config-cli-CsHq462L.js");
	const segments = parseConfigSetPath(operation.path);
	const verdict = classifyInferenceRouteConfigPath(segments);
	if (verdict === "allowed") return;
	if (verdict === "agent-route" && !await isDefaultAgentListPath(segments)) return;
	if (verdict === "plugin-entry") {
		const pluginId = segments.filter((segment) => segment.trim())[2] ?? "";
		if (!await isPluginBackingDefaultInferenceRoute(pluginId)) return;
		throw new Error(`Direct config writes cannot change plugin "${pluginId}" because it may back OpenClaw's own active inference route. Editing it is a human-only change, made with OpenClaw stopped from a trusted shell on the machine running it.`);
	}
	const deniedRoot = segments[0]?.trim().toLowerCase() ?? "";
	const denialReason = SYSTEM_AGENT_CONFIG_WRITE_DENYLIST[deniedRoot];
	throw new Error(denialReason ? `Direct config writes cannot change \`${deniedRoot}\` (${denialReason}).` : "Direct config writes cannot change the default inference route or include alternate config. Use `set_default_model` (optionally with agentId) for an already configured route; changing provider or auth access is `openclaw onboard` on the machine running OpenClaw.");
}
async function verifyCurrentSetupInference(runtime, deps) {
	const { readConfigFileSnapshot } = await loadConfigModule();
	const before = await readConfigFileSnapshot();
	if (!before.exists || !before.valid) throw new Error("OpenClaw setup requires a valid configured inference route. Run `openclaw onboard` on the machine running OpenClaw, then retry.");
	const beforeConfig = before.runtimeConfig ?? before.config;
	const beforeRoute = await projectDefaultInferenceRoute(beforeConfig);
	if (!beforeRoute.route) throw new Error("OpenClaw setup requires working inference first. Run `openclaw onboard` on the machine running OpenClaw, then retry.");
	const verification = await (deps?.verifyInferenceConfig ?? (await import("./system-agent/setup-inference.js")).verifySetupInferenceConfig)({
		config: beforeConfig,
		runtime
	});
	if (!verification.ok) throw new Error(`OpenClaw setup requires working inference first. The configured route failed a live check: ${verification.error} Run \`openclaw onboard\` on the machine running OpenClaw, then retry.`);
	const after = await readConfigFileSnapshot();
	if (!after.exists || !after.valid) throw new Error("The default-agent inference route changed during setup verification, so setup was not applied. Review the current config and retry.");
	const afterConfig = after.runtimeConfig ?? after.config;
	const afterRoute = await projectDefaultInferenceRoute(afterConfig);
	if (!sameDefaultInferenceRoute(beforeRoute, afterRoute) || verification.modelRef !== afterRoute.route?.modelLabel) throw new Error("The default-agent inference route changed during setup verification, so setup was not applied. Review the current model/auth/runtime settings and retry.");
	return {
		modelRef: verification.modelRef,
		route: afterRoute,
		latencyMs: verification.latencyMs
	};
}
async function executeSetup(operation, runtime, opts) {
	const defaultModel = (await loadOverviewForOperation(opts.deps)).defaultModel?.trim();
	if (!defaultModel) throw new Error("OpenClaw setup requires working inference first. Run `openclaw onboard` on the machine running OpenClaw to configure and verify a default model, then start OpenClaw again.");
	const requestedModel = operation.model?.trim();
	if (requestedModel && requestedModel !== defaultModel) throw new Error(`OpenClaw setup will preserve the verified default model ${defaultModel}. Staging, live-testing, and saving a different inference route is \`openclaw onboard\` on the machine running OpenClaw.`);
	if (!opts.approved) {
		const message = [formatSystemAgentPersistentPlan(operation, opts.operatorApprovalOnly), `Model choice: keep verified default ${defaultModel}.`].join("\n");
		runtime.log(message);
		return {
			applied: false,
			message
		};
	}
	const verified = await verifyCurrentSetupInference(runtime, opts.deps);
	if (requestedModel && requestedModel !== verified.modelRef) throw new Error(`The verified default model is now ${verified.modelRef}, not ${requestedModel}. Review the current route, or run \`openclaw onboard\` on the machine running OpenClaw, before retrying setup.`);
	return await applyPersistentOperation({
		auditOperation: "openclaw.setup",
		operation,
		runtime,
		opts,
		run: async (ctx) => {
			const applySetup = ctx.deps?.applySetup ?? (await import("./setup-apply-D8YqfwIQ.js")).applySystemAgentSetup;
			const surface = ctx.deps?.setupSurface ?? "cli";
			const recovery = surface === "cli" ? await (await import("./setup-recovery-BW6JTCAg.js")).loadLocalSetupRecovery(operation.workspace) : void 0;
			const workspace = recovery?.workspace ?? resolveUserPath(operation.workspace ?? process.cwd());
			const applied = await ctx.commit(() => applySetup({
				workspace,
				...operation.agentName ? { firstAgent: { name: operation.agentName } } : {},
				expectedInferenceRoute: verified.route,
				...recovery?.applyOptions,
				surface,
				runtime: ctx.runtime
			}, { beforePersistentApply: ctx.assertPersistentApply }));
			if (!applied.workspaceReady) throw new Error("The workspace could not be prepared. Retry onboarding to finish setup.");
			if (applied.gateway.status === "failed") throw new Error(applied.gateway.error);
			const after = await recovery?.complete(applied.configPath, (effect) => ctx.commit(effect)) ?? await readConfigFileSnapshotLazy();
			ctx.runtime.log(`Updated ${after.path || applied.configPath || "config"}`);
			for (const line of applied.lines) ctx.runtime.log(line);
			ctx.runtime.log(`Default model: ${verified.modelRef} (verified and kept)`);
			return {
				summary: "Bootstrapped setup workspace",
				bootstrapPending: applied.bootstrapPending,
				configPath: after.path || applied.configPath,
				details: {
					workspace,
					model: verified.modelRef,
					modelSource: "live-verified default model",
					inferenceLatencyMs: verified.latencyMs
				}
			};
		}
	});
}
async function executeSetDefaultModel(operation, runtime, opts) {
	return await applyPersistentOperation({
		auditOperation: "config.setDefaultModel",
		operation,
		runtime,
		opts,
		run: async (ctx) => {
			const { mutateConfigFile, readConfigFileSnapshot } = await loadConfigModule();
			const { applySystemAgentModelSelection, createSystemAgentModelSelectionUpdater } = await import("./setup-model-selection-N7sp-d_I.js");
			const targetAgentId = operation.agentId;
			const snapshot = await readConfigFileSnapshot();
			const projectRoute = (config) => projectInferenceRoute(config, targetAgentId);
			const stagedConfig = await applySystemAgentModelSelection({
				config: snapshot.sourceConfig,
				model: operation.model,
				...targetAgentId ? { targetAgentId } : {}
			});
			const beforeRoute = await projectRoute(snapshot.sourceConfig);
			const verifiedRoute = await projectRoute(stagedConfig);
			const verifyInferenceConfig = ctx.deps?.verifyInferenceConfig ?? (await import("./system-agent/setup-inference.js")).verifySetupInferenceConfig;
			const initialVerification = await verifyInferenceConfig({
				config: stagedConfig,
				runtime: ctx.runtime,
				requireExecutionOwner: true,
				...targetAgentId ? { agentId: targetAgentId } : {}
			});
			if (!initialVerification.ok) throw new Error(`The requested model failed a live inference test, so the current default model was not changed. ${initialVerification.error} Fix provider authentication or model access, then retry.`);
			const verifiedModelRef = verifiedRoute.route?.modelLabel;
			if (!verifiedModelRef || initialVerification.modelRef !== verifiedModelRef) throw new Error("The live inference test did not verify the exact model route that would be saved, so the current default model was not changed. Review model aliases and runtime routing, then retry.");
			let persistedVerification = initialVerification;
			let persistedBinding;
			let selectedRouteForCommit = verifiedRoute;
			const selectModel = await createSystemAgentModelSelectionUpdater({
				model: operation.model,
				...targetAgentId ? { targetAgentId } : {}
			});
			const result = await mutateConfigFile({
				base: "source",
				writeOptions: {
					auditOrigin: "system-agent",
					...ctx.assertPersistentApply ? { assertConfigPathForWrite: ctx.assertPersistentApply } : {},
					preCommitRuntimePreflight: async (sourceConfig) => {
						const commitRoute = await projectRoute(sourceConfig);
						if (!sameDefaultInferenceRoute(commitRoute, selectedRouteForCommit)) throw new Error("The selected inference route changed while preparing the config write, so the requested model was not saved. Review the current model/auth/runtime settings and retry.");
						ctx.assertPersistentApply?.();
						let latestBinding;
						const latestVerification = await verifyInferenceConfig({
							config: sourceConfig,
							runtime: ctx.runtime,
							requireExecutionOwner: true,
							...targetAgentId ? { agentId: targetAgentId } : {},
							...opts.onVerifiedInferenceChanged ? { onVerifiedExecution: (_auth, binding) => {
								latestBinding = binding;
							} } : {}
						});
						if (!latestVerification.ok) throw new Error(`The requested model no longer passes live inference at the config commit boundary, so it was not saved. ${latestVerification.error} Review concurrent configuration changes and retry.`);
						if (latestVerification.modelRef !== commitRoute.route?.modelLabel) throw new Error("The final live inference test did not verify the exact model route at the config commit boundary, so the requested model was not saved. Review model aliases and runtime routing, then retry.");
						if (opts.onVerifiedInferenceChanged && !latestBinding) throw new Error("The final live inference test did not return a reusable session binding, so the requested model was not saved. Retry the model change.");
						ctx.assertPersistentApply?.();
						persistedVerification = latestVerification;
						persistedBinding = latestBinding;
					}
				},
				mutate: async (cfg) => {
					const currentRoute = await projectRoute(cfg);
					if (!sameDefaultInferenceRoute(currentRoute, beforeRoute)) throw new Error("The default-agent inference route changed during verification, so the requested model was not saved. Review the current model/auth/runtime settings and retry.");
					const selected = selectModel(cfg);
					const selectedRoute = await projectRoute(selected);
					if (selectedRoute.route?.modelLabel !== verifiedModelRef) throw new Error("The model selection no longer resolves to the exact model that passed live inference. Review the current model/auth/runtime settings and retry.");
					selectedRouteForCommit = selectedRoute;
					cfg.agents = selected.agents;
				}
			});
			if (persistedBinding) opts.onVerifiedInferenceChanged?.(persistedBinding);
			ctx.runtime.log(`Updated ${result.path}`);
			ctx.runtime.log(targetAgentId ? `Agent ${targetAgentId} model: ${persistedVerification.modelRef}` : `Default model: ${persistedVerification.modelRef}`);
			return {
				summary: targetAgentId ? `Set agent ${targetAgentId} model to ${operation.model}` : `Set default model to ${operation.model}`,
				configPath: result.path,
				details: {
					...targetAgentId ? { agentId: targetAgentId } : {},
					requestedModel: operation.model,
					effectiveModel: persistedVerification.modelRef,
					inferenceVerified: true,
					inferenceLatencyMs: persistedVerification.latencyMs
				}
			};
		}
	});
}
/**
* Uninstalling the plugin that provides the active default inference route
* would break the very session driving the change, so that case stays a
* terminal-only operation. Every other plugin is uninstallable behind the
* standard approval gate — matching what the operator can do from the UI/CLI.
*/
async function isPluginBackingDefaultInferenceRoute(pluginId) {
	const { readConfigFileSnapshot } = await loadConfigModule();
	const snapshot = await readConfigFileSnapshot();
	if (!snapshot.exists || !snapshot.valid) return true;
	const config = snapshot.runtimeConfig ?? snapshot.config;
	const route = (await projectDefaultInferenceRoute(config ?? {})).route;
	if (!route) return false;
	const { resolveModelRuntimePolicy } = await import("./model-runtime-policy-DZ3AbdMV.js");
	const runtimePolicyId = resolveModelRuntimePolicy({
		config,
		provider: route.provider,
		modelId: route.model,
		agentId: route.agentId
	}).policy?.id;
	const normalizedPluginId = pluginId.trim().toLowerCase();
	const components = [
		route.provider,
		runtimePolicyId,
		route.runner === "embedded" ? route.agentHarnessRuntimeOverride : void 0
	].map((component) => component?.trim().toLowerCase()).filter((component) => Boolean(component));
	if (components.includes(normalizedPluginId)) return true;
	const { resolveOwningPluginIdsForProviderRef } = await import("./providers-n630tn_p.js");
	return components.some((component) => (resolveOwningPluginIdsForProviderRef({
		provider: component,
		config
	}) ?? []).some((owner) => owner.trim().toLowerCase() === normalizedPluginId));
}
//#endregion
//#region src/system-agent/plugin-install.ts
async function executePluginInstall(operation, runtime, opts) {
	const validationError = validateSystemAgentPluginInstallSpec(operation.spec);
	if (validationError) throw new Error(validationError);
	const { runPluginInstallCommand } = await import("./plugins-install-command-BDHnNAsO.js");
	const result = await applyPersistentOperation({
		auditOperation: "plugin.install",
		operation,
		runtime,
		opts,
		run: async (ctx) => {
			await ctx.commit(() => runPluginInstallCommand({
				raw: operation.spec,
				opts: {},
				runtime: createNoExitRuntime(ctx.runtime),
				allowInstallPolicyWarningPrompt: false,
				...ctx.assertPersistentApply ? { beforePersistentApply: ctx.assertPersistentApply } : {}
			}));
			return {
				summary: `Installed plugin ${operation.spec}`,
				details: { spec: operation.spec }
			};
		}
	});
	if (result.applied) runtime.log("Restart the Gateway to apply installed plugin changes.");
	return result;
}
//#endregion
//#region doctor-subprocess
const DOCTOR_SUBPROCESS_OUTPUT_MAX_BYTES = 1024 * 1024;
function findExecutableOnPath(name) {
	for (const dir of (process.env.PATH ?? "").split(":")) {
		if (!dir) continue;
		const candidate = `${dir}/${name}`;
		try {
			fs.accessSync(candidate, fs.constants.X_OK);
			return candidate;
		} catch {}
	}
}
/** Runs `openclaw doctor --non-interactive` from this dist in a child process, output to the runtime. */
async function runDoctorSubprocess(runtime) {
	const [{ spawn }, { StringDecoder }, { fileURLToPath }] = await Promise.all([
		import("node:child_process"),
		import("node:string_decoder"),
		import("node:url")
	]);
	const argv = [
		process.execPath,
		...process.execArgv.filter((arg) => !/^--(inspect|debug)/.test(arg)),
		"--disable-warning=ExperimentalWarning",
		fileURLToPath(new URL("./index.js", import.meta.url)),
		"doctor",
		"--non-interactive"
	];
	const nice = findExecutableOnPath("nice");
	if (nice) argv.unshift(nice, "-n", "10");
	const ionice = process.platform === "linux" ? findExecutableOnPath("ionice") : void 0;
	if (ionice) argv.unshift(ionice, "-c3");
	const env = { ...process.env };
	if (env.OPENCLAW_V_DOCTOR_TRANSCRIPT_SCANS === "1") delete env.OPENCLAW_V_DOCTOR_SKIP_TRANSCRIPT_SCANS;
	else env.OPENCLAW_V_DOCTOR_SKIP_TRANSCRIPT_SCANS = "1";
	const child = spawn(argv[0], argv.slice(1), {
		cwd: process.cwd(),
		env,
		stdio: [
			"ignore",
			"pipe",
			"pipe"
		]
	});
	let remaining = DOCTOR_SUBPROCESS_OUTPUT_MAX_BYTES;
	let truncated = false;
	const forward = (stream, write) => {
		const decoder = new StringDecoder("utf8");
		let pending = "";
		const push = (text) => {
			pending += text;
			let newline;
			while ((newline = pending.indexOf("\n")) >= 0) {
				write(pending.slice(0, newline));
				pending = pending.slice(newline + 1);
			}
		};
		stream.on("data", (chunk) => {
			const accepted = chunk.subarray(0, Math.max(remaining, 0));
			remaining -= accepted.byteLength;
			truncated ||= accepted.byteLength < chunk.byteLength;
			push(decoder.write(accepted));
		});
		return () => {
			if (!truncated) push(decoder.end());
			if (pending) write(pending);
		};
	};
	const endStdout = forward(child.stdout, (line) => runtime.log(line));
	const endStderr = forward(child.stderr, (line) => runtime.error(line));
	const result = await new Promise((resolve, reject) => {
		child.once("error", reject);
		child.once("close", (code, signal) => resolve({
			code,
			signal
		}));
	});
	endStdout();
	endStderr();
	if (truncated) runtime.error("Doctor output was truncated after 1 MiB. Run `openclaw doctor --non-interactive` on this host for the complete report.");
	if (result.signal) throw new Error(`Doctor process stopped unexpectedly (${result.signal}).`);
	if (result.code !== 0) runtime.exit(result.code ?? 1);
}
//#endregion
//#region src/system-agent/operations-execute.ts
const loadOverviewModule = async () => await import("./overview-4egA0VsE.js");
/** Execute a parsed OpenClaw operation after applying approval gates and audit logging. */
async function executeSystemAgentOperation(operation, runtime, opts = {}) {
	switch (operation.kind) {
		case "none":
			runtime.log(operation.message);
			return {
				applied: false,
				exitsInteractive: operation.message.includes("Bye.")
			};
		case "overview": {
			const overview = await loadOverviewForOperation(opts.deps);
			if (opts.deps?.formatOverview) runtime.log(opts.deps.formatOverview(overview));
			else {
				const { formatSystemAgentOverview } = await loadOverviewModule();
				runtime.log(formatSystemAgentOverview(overview));
			}
			return { applied: false };
		}
		case "agents": {
			const overview = await loadOverviewForOperation(opts.deps);
			runtime.log(["Agents:", ...overview.agents.map((agent) => {
				return `  - ${[
					agent.id,
					agent.isDefault ? "default" : void 0,
					agent.name ? `name=${agent.name}` : void 0,
					agent.workspace ? `workspace=${shortenHomePath(resolveUserPath(agent.workspace))}` : void 0
				].filter(Boolean).join(" | ")}`;
			})].join("\n"));
			return { applied: false };
		}
		case "models": {
			const overview = await loadOverviewForOperation(opts.deps);
			runtime.log([
				`Default model: ${overview.defaultModel ?? "not configured"}`,
				`Codex: ${overview.tools.codex.found ? "found" : "not found"}`,
				`Claude Code: ${overview.tools.claude.found ? "found" : "not found"}`,
				`Gemini CLI: ${overview.tools.gemini.found ? "found" : "not found"}`,
				`OpenAI key: ${overview.tools.apiKeys.openai ? "found" : "not found"}`,
				`Anthropic key: ${overview.tools.apiKeys.anthropic ? "found" : "not found"}`
			].join("\n"));
			return { applied: false };
		}
		case "plugin-list":
			await (opts.deps?.runPluginsList ?? (async (pluginRuntime) => {
				const { runPluginsListCommand } = await import("./plugins-list-command-CiExTKkO.js");
				await runPluginsListCommand({}, pluginRuntime);
			}))(runtime);
			return { applied: false };
		case "plugin-search":
			await (opts.deps?.runPluginsSearch ?? (async (query, pluginRuntime) => {
				const { runPluginsSearchCommand } = await import("./plugins-search-command-C3etMKi7.js");
				await runPluginsSearchCommand(query, {}, pluginRuntime);
			}))(operation.query, runtime);
			return { applied: false };
		case "audit":
			runtime.log(`Audit state: ${SYSTEM_AGENT_AUDIT_STORE_LABEL}`);
			runtime.log("Only applied writes/actions are recorded; discovery stays quiet.");
			return { applied: false };
		case "config-validate": {
			const snapshot = await readConfigFileSnapshotLazy();
			runtime.log(formatConfigValidationLine(snapshot));
			return { applied: false };
		}
		case "config-get": {
			const snapshot = await readConfigFileSnapshotLazy();
			if (!snapshot.exists) {
				runtime.log(`Config missing: ${shortenHomePath(snapshot.path)}`);
				return { applied: false };
			}
			const cfg = snapshot.sourceConfig;
			const lookup = readConfigValueAtPath(redactSystemAgentConfig(cfg, {
				config: cfg,
				valid: snapshot.valid
			}), operation.path);
			if (!lookup.found) {
				runtime.log(`${operation.path}: not set. Use \`config schema ${operation.path}\` to see what is allowed.`);
				return { applied: false };
			}
			const rendered = JSON.stringify(lookup.value, null, 2) ?? "null";
			runtime.log(rendered.length > 2e3 ? `${operation.path} = ${truncateUtf16Safe(rendered, CONFIG_GET_OUTPUT_MAX_CHARS)}\n… (truncated)` : `${operation.path} = ${rendered}`);
			return { applied: false };
		}
		case "config-schema": {
			const { buildConfigSchemaCore, lookupConfigSchema } = await import("./schema-B8BPRI0m.js");
			const response = buildConfigSchemaCore();
			const path = operation.path ?? ".";
			const result = lookupConfigSchema(response, path);
			if (!result) {
				runtime.log(`No config schema at "${path}". Try \`config schema .\` for the root keys.`);
				return { applied: false };
			}
			const schema = result.schema;
			const childLines = result.children.slice(0, 40).map((child) => {
				const bits = [
					Array.isArray(child.type) ? child.type.join("|") : child.type ?? "object",
					child.required ? "required" : void 0,
					child.hasChildren ? "…" : void 0
				].filter(Boolean).join(", ");
				return `  - ${child.path} (${bits})`;
			});
			runtime.log([
				`Schema for ${result.path === "" ? "." : result.path}:`,
				schema.type ? `type: ${Array.isArray(schema.type) ? schema.type.join("|") : schema.type}` : void 0,
				schema.description ? `description: ${schema.description}` : void 0,
				schema.enum ? `allowed values: ${schema.enum.map((v) => JSON.stringify(v)).join(", ")}` : void 0,
				schema.default !== void 0 ? `default: ${JSON.stringify(schema.default)}` : void 0,
				...childLines.length > 0 ? ["keys:", ...childLines] : [],
				result.children.length > 40 ? `… +${result.children.length - 40} more keys` : void 0
			].filter((line) => line !== void 0).join("\n"));
			return { applied: false };
		}
		case "channel-list": {
			const { resolved } = await resolveChannelSetupState(opts.deps);
			const entries = resolved.entries.toSorted((a, b) => a.id.localeCompare(b.id));
			runtime.log([
				"Channels:",
				...entries.map((entry) => `  - ${entry.id}${entry.meta.label ? ` (${entry.meta.label})` : ""}`),
				"",
				"Say `connect <channel>` to walk through setup (for example `connect telegram`)."
			].join("\n"));
			return { applied: false };
		}
		case "channel-info": {
			const { cfg, installedPlugins, resolved, isConfigured } = await resolveChannelSetupState(opts.deps);
			const channel = operation.channel.toLowerCase();
			const entry = resolved.entries.find((candidate) => candidate.id === channel);
			if (!entry) {
				const knownIds = resolved.entries.map((candidate) => candidate.id).toSorted();
				runtime.log([`Unknown channel: ${channel}`, `Known channels: ${knownIds.length > 0 ? knownIds.join(", ") : "none"}`].join("\n"));
				return { applied: false };
			}
			const installed = installedPlugins.some((plugin) => plugin.id === entry.id) || resolved.installedCatalogById.has(entry.id);
			runtime.log([
				`${entry.meta.label} (${entry.id})`,
				entry.meta.blurb,
				`Configured: ${isConfigured(cfg, entry.id) ? "yes" : "no"}`,
				`Installed: ${installed ? "yes" : "no"}`,
				`Docs: ${formatChannelDocsUrl(entry.meta.docsPath)}`,
				"",
				`Say \`connect ${entry.id}\` to set it up here, or \`open channel wizard for ${entry.id}\` for the masked terminal wizard.`
			].join("\n"));
			return { applied: false };
		}
		case "channel-setup":
			runtime.log([
				`Connecting ${operation.channel} needs an interactive session.`,
				"Run `openclaw setup` and say `connect " + operation.channel + "`,",
				"or run `openclaw channels add` for the terminal wizard."
			].join("\n"));
			return { applied: false };
		case "skills-setup":
			runtime.log([
				"Skills setup needs an interactive session.",
				"Run `openclaw setup` and say `configure skills`,",
				"or run `openclaw configure --section skills` for the terminal wizard."
			].join("\n"));
			return { applied: false };
		case "search-setup":
			runtime.log([
				"Web search setup needs an interactive session.",
				"Run `openclaw setup` and say `configure search`,",
				"or run `openclaw configure --section web` for the masked terminal wizard."
			].join("\n"));
			return { applied: false };
		case "gateway-config-setup":
			runtime.log([
				"Gateway configuration needs an interactive session.",
				"Run `openclaw setup` and say `configure gateway`,",
				"or run `openclaw configure --section gateway` for the masked terminal wizard."
			].join("\n"));
			return { applied: false };
		case "memory-import":
			runtime.log([
				"Memory import needs an interactive session.",
				"Open the Memory page in the Control UI,",
				"or run `openclaw onboard` for the terminal wizard."
			].join("\n"));
			return { applied: false };
		case "model-setup":
			runtime.log(["Changing model providers must happen outside the inference session that powers OpenClaw.", "Stop the OpenClaw host through whatever started it. Run `openclaw onboard` on the machine running OpenClaw: it stages credentials, live-tests the candidate route, and saves only a passing setup. Then restart the host."].join("\n"));
			return { applied: false };
		case "open-setup": {
			const command = operation.target === "guided" ? "openclaw onboard" : operation.target === "classic" ? "openclaw onboard --classic" : operation.target === "channels" ? `openclaw channels add${operation.channel ? ` --channel ${operation.channel}` : ""}` : operation.target === "search" ? "openclaw configure --section web" : "openclaw configure --section gateway";
			runtime.log(`This session cannot host an interactive wizard. Run \`${command}\` on the machine running OpenClaw.`);
			return { applied: false };
		}
		case "setup": return await executeSetup(operation, runtime, opts);
		case "config-set":
			await assertConfigWriteDoesNotBypassInferenceVerification(operation);
			return await applyPersistentOperation({
				auditOperation: "config.set",
				operation,
				runtime,
				opts,
				run: async (ctx) => {
					await runConfigSetOperation({
						operation,
						ctx
					});
					return {
						summary: `Set config ${operation.path}`,
						details: { path: operation.path }
					};
				}
			});
		case "config-set-ref":
			await assertConfigWriteDoesNotBypassInferenceVerification(operation);
			return await applyPersistentOperation({
				auditOperation: "config.setRef",
				operation,
				runtime,
				opts,
				run: async (ctx) => {
					await runConfigSetOperation({
						operation,
						ctx
					});
					return {
						summary: `Set config ${operation.path} SecretRef`,
						details: {
							path: operation.path,
							source: operation.source,
							provider: operation.provider ?? "default"
						}
					};
				}
			});
		case "plugin-install": return await executePluginInstall(operation, runtime, opts);
		case "plugin-uninstall": {
			if (await isPluginBackingDefaultInferenceRoute(operation.pluginId)) {
				const message = [`Uninstalling ${operation.pluginId} could remove the provider behind OpenClaw's own active inference route.`, `Removing it has to happen with OpenClaw stopped: run \`openclaw plugins uninstall ${operation.pluginId}\` on the machine running it.`].join("\n");
				runtime.log(message);
				return {
					applied: false,
					message
				};
			}
			const result = await applyPersistentOperation({
				auditOperation: "plugin.uninstall",
				operation,
				runtime,
				opts,
				run: async (ctx) => {
					const runPluginUninstall = ctx.deps?.runPluginUninstall ?? (async (pluginId, pluginRuntime, options) => {
						const { runPluginUninstallCommand } = await import("./plugins-uninstall-command-DyQ185xf.js");
						await runPluginUninstallCommand(pluginId, options, pluginRuntime);
					});
					if (await isPluginBackingDefaultInferenceRoute(operation.pluginId)) throw new Error(`Uninstall aborted: ${operation.pluginId} now backs the active inference route. Removing it has to happen with OpenClaw stopped: run \`openclaw plugins uninstall ${operation.pluginId}\` on the machine running it.`);
					await ctx.commit(() => runPluginUninstall(operation.pluginId, createNoExitRuntime(ctx.runtime), ctx.assertPersistentApply ? { beforePersistentApply: ctx.assertPersistentApply } : void 0));
					return {
						summary: `Uninstalled plugin ${operation.pluginId}`,
						details: { pluginId: operation.pluginId }
					};
				}
			});
			if (result.applied) runtime.log("Restart the Gateway to apply plugin changes.");
			return result;
		}
		case "create-agent":
			if (isReservedSystemAgentId(operation.agentId)) throw new Error(`Agent id "${normalizeAgentId(operation.agentId)}" is reserved for the system agent. Choose a different agent id.`);
			if (operation.model?.trim()) throw new Error("OpenClaw cannot save an explicit per-agent model until that new route can be live-tested. Retry without `model`; the new agent inherits the verified default, then use `set_default_model` with agentId to live-test and save its own model.");
			return await applyPersistentOperation({
				auditOperation: "agents.create",
				operation,
				runtime,
				opts,
				run: async (ctx) => {
					const createAgentForOperation = ctx.deps?.createAgent ?? (await import("./agent-create-yws_l8jl.js")).createAgent;
					const result = await ctx.commit(async () => {
						return await createAgentForOperation({
							name: operation.agentId,
							...operation.workspace ? { workspace: operation.workspace } : {},
							...ctx.assertPersistentApply ? { beforePersistentApply: ctx.assertPersistentApply } : {},
							provenance: {
								createdVia: "agent",
								creatorAgentId: operation.requesterAgentId ?? "openclaw"
							}
						});
					});
					if (result.status === "error") throw new Error(result.message);
					return {
						summary: `Created agent ${result.agentId}`,
						bootstrapPending: result.bootstrapPending,
						agentId: result.agentId,
						details: {
							agentId: result.agentId,
							workspace: result.workspace
						}
					};
				}
			});
		case "doctor":
			// doctor-subprocess: keep doctor's synchronous work and transcript scans off the Gateway's main thread.
			if (!opts.deps?.runDoctor && process.env.OPENCLAW_V_DOCTOR_SUBPROCESS !== "0") {
				await runDoctorSubprocess(runtime);
				return { applied: false };
			}
			await (opts.deps?.runDoctor ?? (await import("./doctor-C3VXV-em.js")).doctorCommand)(runtime, { nonInteractive: true });
			return { applied: false };
		case "doctor-fix":
			runtime.log("Doctor repairs can change the inference route that powers this session, so they run with OpenClaw stopped: `openclaw doctor --fix` on the machine running it.");
			return { applied: false };
		case "status": {
			const { statusCommand } = await import("./status.command-BrlN7wgh.js");
			await statusCommand({ timeoutMs: 1e4 }, runtime);
			return { applied: false };
		}
		case "health": {
			const { healthCommand } = await import("./health-D-b82eUl.js");
			await healthCommand({ timeoutMs: 1e4 }, runtime);
			return { applied: false };
		}
		case "gateway-status": {
			const overview = await loadOverviewForOperation(opts.deps);
			runtime.log(formatGatewayStatusLine(overview));
			return { applied: false };
		}
		case "gateway-start": return await applyPersistentOperation({
			auditOperation: "gateway.start",
			operation,
			runtime,
			opts,
			run: async (ctx) => {
				const runGatewayStart = ctx.deps?.runGatewayStart ?? (() => runGatewayLifecycle("start"));
				await ctx.commit(runGatewayStart);
				return { summary: "Started Gateway" };
			}
		});
		case "gateway-stop": return await applyPersistentOperation({
			auditOperation: "gateway.stop",
			operation,
			runtime,
			opts,
			run: async (ctx) => {
				const runGatewayStop = ctx.deps?.runGatewayStop ?? (() => runGatewayLifecycle("stop"));
				await ctx.commit(runGatewayStop);
				return { summary: "Stopped Gateway" };
			}
		});
		case "gateway-restart": return await applyPersistentOperation({
			auditOperation: "gateway.restart",
			operation,
			runtime,
			opts,
			run: async (ctx) => {
				const gatewayHosted = ctx.deps?.setupSurface === "gateway";
				const runGatewayRestart = ctx.deps?.runGatewayRestart ?? (() => runGatewayLifecycle("restart", gatewayHosted ? "gateway" : void 0));
				if (await ctx.commit(runGatewayRestart) === false) throw new Error("Gateway restart did not complete");
				const summary = gatewayHosted ? "Scheduled Gateway restart" : "Restarted Gateway";
				if (gatewayHosted) ctx.runtime.log(summary);
				return { summary };
			}
		});
		case "open-tui": {
			const overview = await loadOverviewForOperation(opts.deps);
			const agentId = resolveTuiAgentId({
				requestedAgentId: operation.agentId,
				requestedWorkspace: operation.workspace,
				overview
			});
			const session = agentId ? buildAgentMainSessionKey({ agentId }) : void 0;
			const result = await (opts.deps?.runTui ?? (await import("./tui-D5ONd9rD.js")).runTui)({
				local: !overview.gateway.reachable,
				session,
				deliver: false,
				historyLimit: 200,
				...operation.agentDraft === "hatch" ? { message: t("wizard.finalize.bootstrapHatchMessage") } : {}
			});
			if (result?.exitReason === "return-to-system-agent") {
				runtime.log(result.systemAgentMessage ? `[openclaw] returned from agent with request: ${result.systemAgentMessage}` : "[openclaw] returned from agent");
				return {
					applied: false,
					returnToShell: true,
					nextInput: result.systemAgentMessage
				};
			}
			return {
				applied: false,
				exitsInteractive: true
			};
		}
		case "set-default-model": return await executeSetDefaultModel(operation, runtime, opts);
		default: return { applied: false };
	}
}
//#endregion
export { executeSystemAgentOperation as t };
