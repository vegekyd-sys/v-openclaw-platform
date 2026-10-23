import { n as isExperimentalClawsEnabled } from "./experimental-BMzbGmT5.js";
import { a as isDefaultInstallIdentity } from "./paths-Dx1CjxA5.js";
import { n as NON_DEFAULT_INSTALL_SERVICE_SKIP_REASON } from "./gateway-supervision-CWUKIQty.js";
import { o as writeConfigMachineState } from "./config-machine-state-HqtPitRm.js";
import { t as note } from "./note-S3UJZiOI.js";
import { t as hasActiveGatewayExecCredential } from "./doctor-gateway-exec-credential-Dk33hnAr.js";
import { t as resolveDoctorWorkspaceSuggestionScopes } from "./doctor-workspace-suggestion-scopes-BibLQbzX.js";
import { n as normalizeHealthCheck } from "./health-check-adapter-EMFeb2Zf.js";
import { t as scrubDoctorErrorMessage } from "./doctor-error-message-PVjhuNzO.js";
import { f as shouldDeferConfiguredPluginInstallRepair, l as isLegacyParentWritableUpdateDoctorPass } from "./update-phase-DIhBjNQ3.js";
import { t as emitDoctorNotes } from "./emit-notes-B38kJo8h.js";
import { s as shouldManageGatewayService } from "./doctor-service-repair-policy-Bo-bX7P1.js";
import { i as resolveLegacyParentVersionOverride, n as resolveDoctorMode, r as resolveDoctorWorkspaceDir, t as isUpdateDoctorRun } from "./doctor-health-contribution-utils-DIypDViV.js";
import { i as createDoctorHealthContribution, n as runCoreHealthFindingNote, r as runStructuredHealthRepairs, t as runCoreContributionHealth } from "./doctor-health-contribution-core-Bk7U9Phl.js";
import { a as runWriteConfigHealth, n as runFinalConfigValidationHealth, r as runInitialConfigWriteHealth, t as collectWriteConfigHealthFindings } from "./doctor-health-contribution-runners.config-HQGLBkWv.js";
import { n as noteBackupDoctorHint } from "./backup-health-CmqSENo_.js";
import fs from "node:fs";
import { isDeepStrictEqual } from "node:util";
//#region src/flows/doctor-health-contribution-runners.gateway.ts
async function runCommandOwnerHealth(ctx) {
	const { noteCommandOwnerHealth } = await import("./doctor-command-owner-J3AB-X5b.js");
	noteCommandOwnerHealth(ctx.cfg);
}
async function runClaudeCliHealth(ctx) {
	const { noteClaudeCliHealth } = await import("./doctor-claude-cli-B4li0_Mp.js");
	noteClaudeCliHealth(ctx.cfg);
}
async function runGatewayServicesHealth(ctx) {
	if (ctx.gatewayMaintenanceActive) return;
	if (!isDefaultInstallIdentity(ctx.env ?? process.env)) {
		note(NON_DEFAULT_INSTALL_SERVICE_SKIP_REASON, "Gateway");
		return;
	}
	if (!await shouldManageGatewayService(ctx.env ?? process.env)) return;
	const { maybeRepairGatewayServiceConfig, maybeResolveDuelingSystemdGatewayScopes, maybeScanExtraGatewayServices } = await import("./doctor-gateway-services-Aa1ZhCBz.js");
	const { noteMacLaunchAgentOverrides, noteMacLaunchctlGatewayEnvOverrides, noteMacStaleOpenClawUpdateLaunchdJobs } = await import("./doctor-platform-notes-DJ6WO1Po.js");
	await maybeScanExtraGatewayServices(ctx.options, ctx.runtime, ctx.prompter);
	await maybeResolveDuelingSystemdGatewayScopes(ctx.runtime, ctx.prompter);
	const updateDoctorRun = isUpdateDoctorRun(ctx.env ?? process.env);
	ctx.cfg = await maybeRepairGatewayServiceConfig(ctx.cfg, resolveDoctorMode(ctx.cfg), ctx.runtime, ctx.prompter, {
		allowExecSecretRefs: ctx.options.allowExec === true,
		allowConfigSizeDrop: ctx.configResult.shouldWriteConfig === true || updateDoctorRun,
		skipPluginValidation: ctx.configResult.skipPluginValidationOnWrite === true || updateDoctorRun,
		preservedLegacyRootKeys: ctx.configResult.preservedLegacyRootKeys,
		...resolveLegacyParentVersionOverride(ctx)
	});
	await noteMacLaunchAgentOverrides();
	await noteMacStaleOpenClawUpdateLaunchdJobs();
	await noteMacLaunchctlGatewayEnvOverrides(ctx.cfg);
}
async function runHostDesktopHealth(ctx) {
	const { noteHostDesktopHealth } = await import("./doctor-host-desktop-zUMgHnyi.js");
	await noteHostDesktopHealth(ctx.cfg, { prompter: ctx.prompter });
}
async function runStartupChannelMaintenanceHealth(ctx) {
	const { maybeRunDoctorStartupChannelMaintenance } = await import("./doctor-startup-channel-maintenance-CDAcsCyk.js");
	await maybeRunDoctorStartupChannelMaintenance({
		cfg: ctx.cfg,
		env: process.env,
		runtime: ctx.runtime,
		shouldRepair: ctx.prompter.shouldRepair
	});
}
async function runSecurityHealth(ctx) {
	const { noteInstallPolicyHealth } = await import("./doctor-install-policy-qaboh8gp.js");
	const { noteSecurityWarnings } = await import("./doctor-security-wCTUKOv1.js");
	await noteSecurityWarnings(ctx.cfg);
	await noteInstallPolicyHealth(ctx.cfg, {
		deep: ctx.options.deep === true,
		env: ctx.env
	});
}
async function runWebFetchProxyHealth(ctx) {
	if (!isDefaultInstallIdentity(ctx.env ?? process.env)) return;
	const { noteWebFetchProxyDiagnostic } = await import("./doctor-web-fetch-proxy-Cj2hNWQ3.js");
	await noteWebFetchProxyDiagnostic({
		cfg: ctx.cfg,
		env: ctx.env ?? process.env
	});
}
async function runGitHubProjectHealth(ctx) {
	const { hasConfiguredGitHubApiCredential } = await import("./control-ui-github-api-szAH0kn_.js");
	if (!hasConfiguredGitHubApiCredential(ctx.env ?? process.env, ctx.cfg)) note("Prefer gateway.controlUi.github.token for Gateway-owned GitHub project access, or set GH_TOKEN/GITHUB_TOKEN in the shared Gateway process environment. Without either, search is public-only.", "GitHub projects");
}
async function runBrowserHealth(ctx) {
	const { noteChromeMcpBrowserReadiness } = await import("./doctor-browser-CCs1u133.js");
	await runCoreContributionHealth(ctx, ["core/doctor/browser-clawd-profile-residue"]);
	await noteChromeMcpBrowserReadiness(ctx.cfg);
}
async function runOpenAIOAuthTlsHealth(ctx) {
	const { noteOpenAIOAuthTlsPrerequisites } = await import("./provider-openai-chatgpt-oauth-tls-CI7mxaty.js");
	await noteOpenAIOAuthTlsPrerequisites({
		cfg: ctx.cfg,
		deep: ctx.options.deep === true
	});
}
async function runWhatsappResponsivenessHealth(ctx) {
	const { noteWhatsappResponsivenessHealth } = await import("./doctor-whatsapp-responsiveness-Dh3ZSi94.js");
	await noteWhatsappResponsivenessHealth({
		cfg: ctx.cfg,
		status: ctx.gatewayStatus,
		shouldRepair: ctx.prompter.shouldRepair
	});
}
async function runDevicePairingHealth(ctx) {
	const { noteDevicePairingHealth } = await import("./doctor-device-pairing-DLl9hjoz.js");
	await noteDevicePairingHealth({
		cfg: ctx.cfg,
		healthOk: ctx.healthOk ?? false,
		env: ctx.env
	});
}
async function runGatewayDaemonHealth(ctx) {
	if (ctx.gatewayMaintenanceActive || !isDefaultInstallIdentity(ctx.env ?? process.env)) return;
	const { maybeRepairGatewayDaemon } = await import("./doctor-gateway-daemon-flow-BgfTAEUW.js");
	await maybeRepairGatewayDaemon({
		cfg: ctx.cfg,
		runtime: ctx.runtime,
		prompter: ctx.prompter,
		options: ctx.options,
		gatewayDetailsMessage: ctx.gatewayDetails?.message ?? "",
		healthOk: ctx.healthOk ?? false,
		healthSkipped: ctx.gatewayHealthSkipped === true
	});
}
//#endregion
//#region src/flows/doctor-health-contribution-runners.workspace.ts
const loadDoctorStateIntegrityModule$1 = async () => await import("./doctor-state-integrity-C_CEQF1T.js");
async function runActiveToolSchemaWarningsHealth(ctx) {
	if (!ctx.prompter.shouldRepair) return;
	const { collectActiveToolSchemaProjectionWarnings } = await import("./active-tool-schema-warnings-BnzuHkbO.js");
	const warnings = await collectActiveToolSchemaProjectionWarnings({
		cfg: ctx.cfg,
		env: ctx.env ?? process.env,
		...ctx.runWithPluginMetadataSnapshot ? { runWithPluginMetadataSnapshot: ctx.runWithPluginMetadataSnapshot } : {}
	});
	if (warnings.length === 0) return;
	const { note } = await import("./terminal-core/note.js");
	note(warnings.join("\n"), "Doctor warnings");
}
async function runHooksModelHealth(ctx) {
	if (!ctx.cfg.hooks?.gmail?.model?.trim()) return;
	const { DEFAULT_MODEL, DEFAULT_PROVIDER } = await import("./defaults-RjT9WtG0.js");
	const { loadPreparedModelCatalog } = await import("./prepared-model-catalog-BQXfkgza.js");
	const { getModelRefStatus, resolveConfiguredModelRef, resolveHooksGmailModel } = await import("./model-selection-a5W5TAQi.js");
	const { note } = await import("./terminal-core/note.js");
	const hooksModelRef = resolveHooksGmailModel({
		cfg: ctx.cfg,
		defaultProvider: DEFAULT_PROVIDER
	});
	if (!hooksModelRef) {
		note(`- hooks.gmail.model "${ctx.cfg.hooks.gmail.model}" could not be resolved`, "Hooks");
		return;
	}
	const { provider: defaultProvider, model: defaultModel } = resolveConfiguredModelRef({
		cfg: ctx.cfg,
		defaultProvider: DEFAULT_PROVIDER,
		defaultModel: DEFAULT_MODEL
	});
	const catalog = await loadPreparedModelCatalog({
		config: ctx.cfg,
		readOnly: true,
		providerDiscoveryProviderIds: []
	});
	const status = getModelRefStatus({
		cfg: ctx.cfg,
		catalog,
		ref: hooksModelRef,
		defaultProvider,
		defaultModel
	});
	const warnings = [];
	if (!status.allowed) warnings.push(`- hooks.gmail.model "${status.key}" not allowed by agents.defaults.modelPolicy.allow (will use primary instead)`);
	if (!status.inCatalog) warnings.push(`- hooks.gmail.model "${status.key}" not in the model catalog (may fail at runtime)`);
	if (warnings.length > 0) note(warnings.join("\n"), "Hooks");
}
async function collectWorkspaceStatusPluginVersionReadiness(params) {
	if (params.cfg.gateway?.mode === "remote" || !await shouldManageGatewayService()) return;
	try {
		const { gatherDaemonStatus } = await import("./status.gather-BQu-CflJ.js");
		const status = await gatherDaemonStatus({
			rpc: {
				timeout: params.options?.nonInteractive === true ? "3000" : "10000",
				json: true
			},
			probe: true,
			requireRpc: false,
			deep: params.options?.deep === true,
			allowExecSecretRefs: params.options?.allowExec === true,
			pluginVersionTarget: "restart"
		});
		if (status.pluginVersionRestartReadiness?.status === "resolved") {
			const { resolvePluginVersionDriftTargets } = await import("./plugin-version-drift-DQp1tsYO.js");
			return {
				...status.pluginVersionRestartReadiness,
				report: await resolvePluginVersionDriftTargets(status.pluginVersionRestartReadiness.report)
			};
		}
		return status.pluginVersionRestartReadiness;
	} catch {
		return;
	}
}
async function runWorkspaceStatusHealth(ctx) {
	const pluginVersionReadiness = await collectWorkspaceStatusPluginVersionReadiness({
		cfg: ctx.cfg,
		options: ctx.options
	});
	const { noteWorkspaceStatus } = await import("./doctor-workspace-status-CDBkSEQ4.js");
	noteWorkspaceStatus(ctx.cfg, {
		pluginVersionReadiness,
		...ctx.runWithPluginMetadataSnapshot ? { runWithPluginMetadataSnapshot: ctx.runWithPluginMetadataSnapshot } : {}
	});
}
async function runSkillsHealth(ctx) {
	const { maybeRepairSkillReadiness } = await import("./doctor-skills-DsdefR7s.js");
	ctx.cfg = await maybeRepairSkillReadiness({
		cfg: ctx.cfg,
		prompter: ctx.prompter,
		...ctx.runWithPluginMetadataSnapshot ? { runWithPluginMetadataSnapshot: ctx.runWithPluginMetadataSnapshot } : {}
	});
}
async function runBootstrapSizeHealth(ctx) {
	const { noteBootstrapFileSize } = await import("./doctor-bootstrap-size-BhybX_Wa.js");
	await noteBootstrapFileSize(ctx.cfg);
}
async function runHeartbeatCadenceMigrationHealth(ctx) {
	const { maybeMigrateHeartbeatCadenceToCron } = await import("./doctor-heartbeat-cadence-migration-DXkmPk1p.js");
	await maybeMigrateHeartbeatCadenceToCron({
		cfg: ctx.cfg,
		shouldRepair: ctx.prompter.shouldRepair,
		env: ctx.env
	});
}
async function runHeartbeatScratchMigrationHealth(ctx) {
	const { maybeMigrateHeartbeatFilesToScratch } = await import("./doctor-heartbeat-scratch-migration-CMl4aabw.js");
	await maybeMigrateHeartbeatFilesToScratch({
		cfg: ctx.cfg,
		shouldRepair: ctx.prompter.shouldRepair,
		env: ctx.env
	});
}
async function runToolsMdMigrationHealth(ctx) {
	const { maybeMigrateToolsMd } = await import("./doctor-tools-md-migration-CMi1HlLr.js");
	await maybeMigrateToolsMd({
		cfg: ctx.cfg,
		shouldRepair: ctx.prompter.shouldRepair,
		env: ctx.env
	});
}
async function runHeartbeatTaskMigrationHealth(ctx) {
	const { maybeMigrateHeartbeatTasksToCron } = await import("./doctor-heartbeat-task-migration-D59eLrwf.js");
	await maybeMigrateHeartbeatTasksToCron({
		cfg: ctx.cfg,
		shouldRepair: ctx.prompter.shouldRepair,
		env: ctx.env
	});
}
async function runMemorySearchHealthContribution(ctx) {
	const { maybeRepairMemoryRecallHealth, noteMemoryRecallHealth, noteMemorySearchHealth } = await import("./doctor-memory-search-DBqsrS2g.js");
	if (ctx.prompter.shouldRepair) await maybeRepairMemoryRecallHealth({
		cfg: ctx.cfg,
		prompter: ctx.prompter
	});
	await noteMemorySearchHealth(ctx.cfg, {
		env: ctx.env,
		gatewayMemoryProbe: ctx.gatewayMemoryProbe ?? {
			checked: false,
			ready: false,
			skipped: false
		}
	});
	if (ctx.options.deep === true) await noteMemoryRecallHealth(ctx.cfg);
}
function memorySearchNoteToFinding(message) {
	const lines = message.split("\n");
	const firstLine = (lines[0] ?? message).trim();
	if (firstLine === "Memory search is explicitly disabled (enabled: false).") return null;
	const fixHint = lines.slice(1).map((line) => line.trimEnd()).join("\n").trim();
	let path = "memory.search.provider";
	if (firstLine.includes("No active memory plugin")) path = "plugins.slots.memory";
	else if (firstLine.includes("OpenAI-compatible embeddings endpoint")) path = "memory.search.remote.baseUrl";
	else if (firstLine.includes("OpenAI-compatible embedding model")) path = "memory.search.model";
	return {
		checkId: "core/doctor/memory-search",
		severity: "warning",
		message: firstLine,
		path,
		...fixHint ? { fixHint } : {}
	};
}
async function collectMemorySearchHealthFindings(ctx) {
	const { noteMemorySearchHealth } = await import("./doctor-memory-search-DBqsrS2g.js");
	const notes = [];
	await noteMemorySearchHealth(ctx.cfg, {
		env: ctx.env,
		includeWorkspaceMemoryHealth: false,
		skipAuthProfileResolution: true,
		gatewayMemoryProbe: {
			checked: false,
			ready: false,
			skipped: true
		},
		noteFn: (message) => notes.push(String(message))
	});
	return notes.flatMap((message) => {
		const finding = memorySearchNoteToFinding(message);
		return finding ? [finding] : [];
	});
}
async function runWorkspaceSuggestionsHealth(ctx) {
	if (ctx.options.workspaceSuggestions === false) return;
	const { collectWorkspaceBackupTip } = await loadDoctorStateIntegrityModule$1();
	const { MEMORY_SYSTEM_PROMPT, shouldSuggestMemorySystem } = await import("./doctor-workspace-DH7cutiP.js");
	const { note } = await import("./terminal-core/note.js");
	for (const { agentId, workspaceDir, labelAgent } of resolveDoctorWorkspaceSuggestionScopes(ctx.cfg)) {
		const prefix = labelAgent ? `Agent "${agentId}": ` : "";
		const backupTip = collectWorkspaceBackupTip(workspaceDir);
		if (backupTip) note(`${prefix}${backupTip}`, "Workspace");
		if (await shouldSuggestMemorySystem(workspaceDir)) note(`${prefix}${MEMORY_SYSTEM_PROMPT}`, "Workspace");
	}
}
//#endregion
//#region src/flows/doctor-health-contributions-final.ts
const CHANNEL_PACKAGE_STATE_CAPABILITIES_CHECK_ID = "core/doctor/channel-package-state-capabilities";
function resolveFinalDoctorHealthContributions(params) {
	return [
		createDoctorHealthContribution({
			id: "doctor:gateway-services",
			label: "Gateway services",
			healthCheckIds: ["core/doctor/gateway-services/extra", "core/doctor/gateway-services/platform-notes"],
			run: runGatewayServicesHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:host-desktop",
			label: "Host desktop",
			healthChecks: {
				description: "Gateway-host desktop enablement, reachability, and RFB security state.",
				defaultEnabled: false,
				async detect(ctx) {
					const { collectHostDesktopHealthFindings } = await import("./doctor-host-desktop-zUMgHnyi.js");
					return collectHostDesktopHealthFindings(ctx.cfg);
				}
			},
			run: runHostDesktopHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:default-account-routing",
			label: "Default account routing",
			healthChecks: {
				description: "Multi-account channels have explicit default routing or complete bindings.",
				defaultEnabled: false,
				async detect(ctx) {
					const { collectMissingDefaultAccountBindingWarnings, collectMissingExplicitDefaultAccountWarnings } = await import("./default-account-warnings-BRBcASSO.js");
					return [...collectMissingDefaultAccountBindingWarnings(ctx.cfg), ...collectMissingExplicitDefaultAccountWarnings(ctx.cfg)].map((message) => ({
						checkId: "core/doctor/default-account-routing",
						severity: "warning",
						message: message.replace(/^- /, "").trim()
					}));
				}
			}
		}),
		createDoctorHealthContribution({
			id: "doctor:channel-package-state-capabilities",
			label: "Channel package-state capabilities",
			healthChecks: {
				id: CHANNEL_PACKAGE_STATE_CAPABILITIES_CHECK_ID,
				description: "Declared channel package-state checker modules must load.",
				defaultEnabled: true,
				async detect(ctx) {
					if (shouldDeferConfiguredPluginInstallRepair(ctx.env ?? process.env)) return [];
					const { collectBundledChannelPackageStateLoadFailures } = await import("./package-state-probes-C-39TC0y.js");
					return collectBundledChannelPackageStateLoadFailures().map((failure) => ({
						checkId: CHANNEL_PACKAGE_STATE_CAPABILITIES_CHECK_ID,
						severity: "warning",
						message: `Plugin ${failure.pluginId} declared ${failure.metadataKey}, but its checker failed to load: ${failure.detail}`,
						target: failure.pluginId,
						requirement: "declared-channel-package-state-capability-loadable",
						fixHint: `Rebuild or reinstall plugin ${failure.pluginId}, then rerun \`openclaw doctor\`.`
					}));
				}
			}
		}),
		createDoctorHealthContribution({
			id: "doctor:startup-channel-maintenance",
			label: "Startup channel maintenance",
			healthChecks: [{
				id: "core/doctor/channel-plugin-blockers",
				description: "Configured channels must have loadable backing channel plugins.",
				defaultEnabled: false,
				async detect(ctx) {
					const { channelPluginBlockerHitToHealthFinding, scanConfiguredChannelPluginBlockers } = await import("./channel-plugin-blockers-CJM-5V_J.js");
					return scanConfiguredChannelPluginBlockers(ctx.cfg, process.env).map(channelPluginBlockerHitToHealthFinding);
				}
			}, {
				id: "core/doctor/channel-preview-warnings",
				description: "Channel doctor preview warnings are captured as structured findings.",
				defaultEnabled: false,
				async detect(ctx) {
					const { collectChannelPreviewWarningHealthFindings } = await import("./doctor-startup-channel-maintenance-CDAcsCyk.js");
					return collectChannelPreviewWarningHealthFindings({
						cfg: ctx.cfg,
						allowExec: ctx.allowExecSecretRefs === true
					});
				}
			}],
			run: runStartupChannelMaintenanceHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:security",
			label: "Security",
			healthCheckIds: ["core/doctor/security"],
			run: runSecurityHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:web-fetch-proxy",
			label: "Web fetch proxy",
			run: runWebFetchProxyHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:github-projects",
			label: "GitHub projects",
			run: runGitHubProjectHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:browser",
			label: "Browser",
			healthCheckIds: ["core/doctor/browser", "core/doctor/browser-clawd-profile-residue"],
			run: runBrowserHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:oauth-tls",
			label: "OAuth TLS",
			healthCheckIds: ["core/doctor/oauth-tls"],
			run: runOpenAIOAuthTlsHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:hooks-model",
			label: "Hooks model",
			healthCheckIds: ["core/doctor/hooks-model"],
			run: runHooksModelHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:model-references",
			label: "Model references",
			healthCheckIds: ["core/doctor/model-references"],
			run: (ctx) => runCoreHealthFindingNote(ctx, "core/doctor/model-references")
		}),
		createDoctorHealthContribution({
			id: "doctor:provider-catalog-projection",
			label: "Provider catalog projection",
			healthCheckIds: ["core/doctor/provider-catalog-projection"],
			run: (ctx) => runCoreHealthFindingNote(ctx, "core/doctor/provider-catalog-projection")
		}),
		createDoctorHealthContribution({
			id: "doctor:local-audio-acceleration",
			label: "Local audio acceleration",
			healthCheckIds: ["core/doctor/local-audio-acceleration"],
			run: (ctx) => runCoreHealthFindingNote(ctx, "core/doctor/local-audio-acceleration")
		}),
		createDoctorHealthContribution({
			id: "doctor:runtime-tool-schemas",
			label: "Runtime tool schemas",
			healthCheckIds: ["core/doctor/runtime-tool-schemas"],
			run: (ctx) => runCoreHealthFindingNote(ctx, "core/doctor/runtime-tool-schemas")
		}),
		createDoctorHealthContribution({
			id: "doctor:skill-workshop-tool-policy",
			label: "Skill Workshop tool policy",
			healthCheckIds: ["core/doctor/skill-workshop-tool-policy"],
			run: (ctx) => runCoreHealthFindingNote(ctx, "core/doctor/skill-workshop-tool-policy")
		}),
		createDoctorHealthContribution({
			id: "doctor:systemd-linger",
			label: "systemd linger",
			healthChecks: {
				description: "Disabled systemd user lingering is reported as a finding.",
				defaultEnabled: false,
				detect: params.detectSystemdLingerFindings
			},
			run: params.runSystemdLingerHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:workspace-status",
			label: "Workspace status",
			healthChecks: {
				description: "Workspace plugin/status diagnostics are exposed as findings.",
				defaultEnabled: false,
				async detect(ctx) {
					const { collectWorkspaceStatusHealthFindings } = await import("./doctor-workspace-status-CDBkSEQ4.js");
					const pluginVersionReadiness = await collectWorkspaceStatusPluginVersionReadiness({
						cfg: ctx.cfg,
						options: {
							nonInteractive: true,
							allowExec: ctx.allowExecSecretRefs === true
						}
					});
					const runWithPluginMetadataSnapshot = ctx.runWithPluginMetadataSnapshot;
					return collectWorkspaceStatusHealthFindings(ctx.cfg, {
						pluginVersionReadiness,
						...runWithPluginMetadataSnapshot ? { runWithPluginMetadataSnapshot } : {}
					});
				}
			},
			run: runWorkspaceStatusHealth
		}),
		...isExperimentalClawsEnabled() ? [createDoctorHealthContribution({
			id: "doctor:claws-state",
			label: "Claws state",
			healthCheckIds: ["core/doctor/claws-state"],
			run: (ctx) => runCoreHealthFindingNote(ctx, "core/doctor/claws-state")
		})] : [],
		createDoctorHealthContribution({
			id: "doctor:skills",
			label: "Skills",
			healthCheckIds: ["core/doctor/skills-readiness"],
			run: runSkillsHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:bootstrap-size",
			label: "Bootstrap size",
			healthCheckIds: ["core/doctor/bootstrap-size"],
			run: runBootstrapSizeHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:heartbeat-cadence-migration",
			label: "Heartbeat cadence migration",
			healthChecks: {
				description: "Heartbeat cadence config must be materialized in cron monitor rows.",
				defaultEnabled: true,
				async detect(ctx) {
					const { collectHeartbeatCadenceMigrationFindings } = await import("./doctor-heartbeat-cadence-migration-DXkmPk1p.js");
					return collectHeartbeatCadenceMigrationFindings(ctx.cfg, ctx.env);
				}
			},
			run: runHeartbeatCadenceMigrationHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:heartbeat-scratch-migration",
			label: "Heartbeat scratch migration",
			healthChecks: {
				description: "Workspace HEARTBEAT.md files must migrate into cron-owned scratch.",
				defaultEnabled: true,
				async detect(ctx) {
					const { collectHeartbeatScratchMigrationFindings } = await import("./doctor-heartbeat-scratch-migration-CMl4aabw.js");
					return collectHeartbeatScratchMigrationFindings(ctx.cfg);
				}
			},
			run: runHeartbeatScratchMigrationHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:tools-md-migration",
			label: "TOOLS.md migration",
			healthChecks: {
				description: "Workspace TOOLS.md notes must migrate into the AGENTS.md Tools section.",
				defaultEnabled: true,
				async detect(ctx) {
					const { collectToolsMdMigrationFindings } = await import("./doctor-tools-md-migration-CMi1HlLr.js");
					return collectToolsMdMigrationFindings(ctx.cfg);
				}
			},
			run: runToolsMdMigrationHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:heartbeat-task-cron-migration",
			label: "Heartbeat task cron migration",
			healthChecks: {
				description: "Heartbeat scratch task blocks must migrate into automations.",
				defaultEnabled: true,
				async detect(ctx) {
					const { collectHeartbeatTaskMigrationFindings } = await import("./doctor-heartbeat-task-migration-D59eLrwf.js");
					return collectHeartbeatTaskMigrationFindings(ctx.cfg, ctx.env);
				}
			},
			run: runHeartbeatTaskMigrationHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:shell-completion",
			label: "Shell completion",
			healthCheckIds: ["core/doctor/shell-completion"],
			run: params.runShellCompletionHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:gateway-health",
			label: "Gateway health",
			healthCheckIds: ["core/doctor/gateway-health"],
			run: params.runGatewayHealthChecks
		}),
		createDoctorHealthContribution({
			id: "doctor:whatsapp-responsiveness",
			label: "WhatsApp responsiveness",
			healthChecks: {
				description: "WhatsApp responsiveness pressure from degraded Gateway and local TUI clients.",
				defaultEnabled: false,
				async detect(ctx) {
					const { collectWhatsappResponsivenessHealthFindings } = await import("./doctor-whatsapp-responsiveness-Dh3ZSi94.js");
					let status;
					if (!(await hasActiveGatewayExecCredential({ cfg: ctx.cfg }) && ctx.allowExecSecretRefs !== true)) {
						const { callGateway } = await import("./call-biHULXUC.js");
						status = await callGateway({
							method: "status",
							params: { includeChannelSummary: false },
							timeoutMs: 3e3,
							config: ctx.cfg,
							deviceIdentity: null
						}).catch(() => void 0);
					}
					return collectWhatsappResponsivenessHealthFindings({
						cfg: ctx.cfg,
						status
					});
				}
			},
			run: runWhatsappResponsivenessHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:memory-search",
			label: "Memory search",
			healthChecks: {
				description: "Memory search provider and backend readiness are captured as findings.",
				defaultEnabled: false,
				detect: collectMemorySearchHealthFindings
			},
			run: runMemorySearchHealthContribution
		}),
		createDoctorHealthContribution({
			id: "doctor:device-pairing",
			label: "Device pairing",
			healthChecks: {
				description: "Device pairing requests and stale device-auth records are findings.",
				defaultEnabled: false,
				async detect(ctx) {
					const { collectDevicePairingHealthFindings } = await import("./doctor-device-pairing-DLl9hjoz.js");
					return collectDevicePairingHealthFindings({
						cfg: ctx.cfg,
						healthOk: false,
						env: ctx.env
					});
				}
			},
			run: runDevicePairingHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:gateway-daemon",
			label: "Gateway daemon",
			healthCheckIds: ["core/doctor/gateway-daemon"],
			run: runGatewayDaemonHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:write-config",
			label: "Write config",
			healthChecks: {
				description: "Config write blockers are findings before doctor repair writes.",
				defaultEnabled: false,
				detect: collectWriteConfigHealthFindings
			},
			run: runWriteConfigHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:workspace-suggestions",
			label: "Workspace suggestions",
			healthCheckIds: ["core/doctor/workspace-suggestions"],
			run: runWorkspaceSuggestionsHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:final-config-validation",
			label: "Final config validation",
			healthCheckIds: ["core/doctor/final-config-validation"],
			run: runFinalConfigValidationHealth
		})
	];
}
//#endregion
//#region src/flows/doctor-health-contribution-runners.state.ts
const loadDoctorStateIntegrityModule = async () => await import("./doctor-state-integrity-C_CEQF1T.js");
async function runLegacyPluginManifestHealth(ctx) {
	const { maybeRepairLegacyPluginManifestContracts } = await import("./doctor-plugin-manifests-BRAWwu6a.js");
	if (await maybeRepairLegacyPluginManifestContracts({
		config: ctx.cfg,
		env: process.env,
		runtime: ctx.runtime,
		prompter: ctx.prompter
	})) ctx.invalidatePluginMetadataSnapshot?.();
}
async function runPluginRegistryHealth(ctx) {
	const { maybeRepairPluginRegistryState } = await import("./doctor-plugin-registry-dhsHSnHp.js");
	const result = await maybeRepairPluginRegistryState({
		config: ctx.cfg,
		env: process.env,
		prompter: ctx.prompter
	});
	ctx.cfg = result.config;
	if (result.pluginInventoryChanged) ctx.invalidatePluginMetadataSnapshot?.();
}
async function runReleaseConfiguredPluginInstallsHealth(ctx) {
	if (!ctx.sourceConfigValid || !ctx.prompter.shouldRepair) return;
	const { maybeRunConfiguredPluginInstallReleaseStep } = await import("./release-configured-plugin-installs-uiGUvkgF.js");
	const { note } = await import("./terminal-core/note.js");
	const { VERSION } = await import("./version-H8RjDI4y.js");
	const result = await maybeRunConfiguredPluginInstallReleaseStep({
		cfg: ctx.cfg,
		env: ctx.env ?? process.env,
		touchedVersion: ctx.configResult.sourceLastTouchedVersion ?? ctx.cfg.meta?.lastTouchedVersion
	});
	if (result.pluginInventoryChanged) ctx.invalidatePluginMetadataSnapshot?.();
	if (result.postInstallDoctorResult) ctx.postInstallDoctorResult = result.postInstallDoctorResult;
	if (result.changes.length > 0) note(result.changes.join("\n"), "Doctor changes");
	if (result.warnings.length > 0) note(result.warnings.join("\n"), "Doctor warnings");
	if (!result.touchedConfig) return;
	const lastTouchedVersion = isLegacyParentWritableUpdateDoctorPass(ctx.env ?? process.env) ? ctx.configResult.sourceLastTouchedVersion?.trim() || ctx.cfg.meta?.lastTouchedVersion || VERSION : VERSION;
	ctx.cfg = {
		...ctx.cfg,
		meta: {
			...ctx.cfg.meta,
			lastTouchedVersion
		}
	};
	writeConfigMachineState("config.lastTouchedAt", (/* @__PURE__ */ new Date()).toISOString());
}
async function runDiskSpaceHealth(ctx) {
	const { noteDiskSpace } = await import("./doctor-disk-space-D1IriswZ.js");
	noteDiskSpace(ctx.cfg);
}
async function runDatabaseBloatHealth(ctx) {
	const { noteSqliteDatabaseBloat } = await import("./doctor-db-bloat-BqF_x55-.js");
	noteSqliteDatabaseBloat(ctx.cfg);
}
async function runAgentMemorySchemaHealth(ctx) {
	const { noteDoctorAgentMemorySchemaHealth } = await import("./doctor-agent-memory-schema-DEqSUQ3z.js");
	await noteDoctorAgentMemorySchemaHealth({
		env: ctx.env ?? process.env,
		shouldRepair: ctx.prompter.shouldRepair
	});
}
async function runChannelIngressDeadLettersHealth() {
	const { noteChannelIngressDeadLetters } = await import("./doctor-channel-ingress-DcD0uGG6.js");
	noteChannelIngressDeadLetters();
}
async function runStateIntegrityHealth(ctx) {
	const { noteStateIntegrity } = await loadDoctorStateIntegrityModule();
	await noteStateIntegrity(ctx.cfg, ctx.prompter, ctx.configPath, { stateDirExistedAtStart: ctx.stateDirExistedAtStart });
	noteBackupDoctorHint(ctx.env ?? process.env);
}
async function runCodexSessionRouteHealth(ctx) {
	const { maybeRepairCodexSessionRoutes } = await import("./codex-route-warnings-DU2RM-1g.js");
	const { note } = await import("./terminal-core/note.js");
	const result = await maybeRepairCodexSessionRoutes({
		cfg: ctx.cfg,
		env: ctx.env ?? process.env,
		shouldRepair: ctx.prompter.shouldRepair,
		...ctx.configResult.blockedCodexModelIdentities?.length ? { blockedModelIdentities: new Set(ctx.configResult.blockedCodexModelIdentities) } : {},
		...ctx.configResult.openAICodexAuthProfileIdMap?.size ? { authProfileIdMap: ctx.configResult.openAICodexAuthProfileIdMap } : {}
	});
	if (result.changes.length > 0) note(result.changes.join("\n"), "Doctor changes");
	if (result.warnings.length > 0) note(result.warnings.join("\n"), "Doctor warnings");
}
async function runSessionTranscriptsHealth(ctx) {
	const { noteSessionTranscriptHealth } = await import("./doctor-session-transcripts-BIGKg54d.js");
	await noteSessionTranscriptHealth({
		cfg: ctx.cfg,
		env: ctx.env ?? process.env,
		shouldRepair: ctx.prompter.shouldRepair
	});
}
async function runSessionTranscriptHeadersHealth(ctx) {
	const { noteSessionTranscriptHeaderHealth } = await import("./doctor-session-transcript-headers-QxFtPRSC.js");
	await noteSessionTranscriptHeaderHealth({
		cfg: ctx.cfg,
		env: ctx.env ?? process.env,
		shouldRepair: ctx.prompter.shouldRepair
	});
}
async function runSessionTranscriptLabelsHealth(ctx) {
	const { noteSessionTranscriptLabelHealth } = await import("./doctor-session-transcript-labels-DTxp6Q8J.js");
	await noteSessionTranscriptLabelHealth({
		cfg: ctx.cfg,
		env: ctx.env ?? process.env,
		shouldRepair: ctx.prompter.shouldRepair
	});
}
async function runSessionSnapshotsHealth(ctx) {
	const { noteSessionSnapshotHealth } = await import("./doctor-session-snapshots-BwIcmOfe.js");
	await noteSessionSnapshotHealth({
		cfg: ctx.cfg,
		env: ctx.env ?? process.env,
		shouldRepair: ctx.prompter.shouldRepair
	});
}
async function runConfigAuditScrubHealth(ctx) {
	const { maybeRepairLegacyRuntimeFiles } = await import("./doctor-usage-cost-cache-ByZLlldU.js");
	await maybeRepairLegacyRuntimeFiles(ctx.prompter.shouldRepair, ctx.env);
}
async function runLegacyCronHealth(ctx) {
	const { maybeRepairLegacyCronStore, noteLegacyWhatsAppCrontabHealthCheck } = await import("./cron-B4d7cuYz.js");
	await noteLegacyWhatsAppCrontabHealthCheck();
	await maybeRepairLegacyCronStore({
		cfg: ctx.cfg,
		options: ctx.options,
		prompter: ctx.prompter
	});
}
async function runSandboxHealth(ctx) {
	const { maybeRepairSandboxImages, maybeRepairSandboxRegistryFiles, noteSandboxScopeWarnings } = await import("./doctor-sandbox-8knPnvAW.js");
	await maybeRepairSandboxRegistryFiles(ctx.prompter);
	ctx.cfg = await maybeRepairSandboxImages(ctx.cfg, ctx.runtime, ctx.prompter);
	noteSandboxScopeWarnings(ctx.cfg);
}
//#endregion
//#region src/flows/doctor-health-contributions-initial.ts
function legacyOwnedRepair(collectEffects, reason) {
	return async (ctx) => {
		const effects = await collectEffects(ctx);
		return ctx.dryRun === true ? {
			status: "repaired",
			changes: [],
			effects
		} : {
			status: "skipped",
			reason,
			changes: [],
			effects
		};
	};
}
async function runTelegramGeneralTopicConversationHealth(ctx) {
	const { runCoreContributionHealth } = await import("./doctor-health-contribution-core-MZ-bHA7L.js");
	await runCoreContributionHealth(ctx, ["core/doctor/telegram-general-topic-conversations"]);
}
function resolveInitialDoctorHealthContributions(params) {
	return [
		createDoctorHealthContribution({
			id: "doctor:write-config-migrations",
			label: "Write config migrations",
			required: true,
			run: runInitialConfigWriteHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:gateway-config",
			label: "Gateway config",
			healthCheckIds: ["core/doctor/gateway-config"],
			run: params.runGatewayConfigHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:auth-profiles",
			label: "Auth profiles",
			healthChecks: {
				description: "Auth profile cooldown, expiry, missing credential, and legacy override state",
				defaultEnabled: false,
				async detect(ctx) {
					const { collectAuthProfileHealthFindings } = await import("./doctor-auth-BK8x86G5.js");
					return collectAuthProfileHealthFindings({
						cfg: ctx.cfg,
						allowKeychainPrompt: false
					});
				}
			},
			run: params.runAuthProfileHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:claude-cli",
			label: "Claude CLI",
			healthCheckIds: ["core/doctor/claude-cli"],
			run: runClaudeCliHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:gateway-auth",
			label: "Gateway auth",
			healthCheckIds: ["core/doctor/gateway-auth"],
			run: params.runGatewayAuthHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:node-hosting-preconditions",
			label: "Node hosting preconditions",
			healthChecks: {
				description: "Gateway config can authenticate and onboard node and worker hosts.",
				async detect(ctx) {
					const { collectNodeHostingPreconditionFindings } = await import("./doctor-node-hosting-preconditions-Dlv-A-9h.js");
					return collectNodeHostingPreconditionFindings(ctx.cfg);
				}
			}
		}),
		createDoctorHealthContribution({
			id: "doctor:command-owner",
			label: "Command owner",
			healthCheckIds: ["core/doctor/command-owner"],
			run: runCommandOwnerHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:structured-health-repairs",
			label: "Structured health repairs",
			run: params.runStructuredHealthRepairs
		}),
		createDoctorHealthContribution({
			id: "doctor:legacy-state",
			label: "Legacy state",
			healthCheckIds: ["core/doctor/legacy-state", "core/doctor/removed-workspaces-state"],
			run: params.runLegacyStateHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:session-transcripts",
			label: "Session transcripts",
			healthChecks: {
				description: "Legacy or branchy session transcript files are represented as findings.",
				defaultEnabled: false,
				async detect() {
					const { detectSessionTranscriptHealthIssues, sessionTranscriptIssueToHealthFinding } = await import("./doctor-session-transcripts-BIGKg54d.js");
					return (await detectSessionTranscriptHealthIssues()).map(sessionTranscriptIssueToHealthFinding);
				},
				repair: legacyOwnedRepair(async () => {
					const { detectSessionTranscriptHealthIssues, sessionTranscriptIssueToRepairEffect } = await import("./doctor-session-transcripts-BIGKg54d.js");
					return (await detectSessionTranscriptHealthIssues()).map(sessionTranscriptIssueToRepairEffect);
				}, "legacy doctor session transcript contribution owns transcript rewrites")
			},
			run: runSessionTranscriptsHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:agent-memory-schema",
			label: "Agent memory schema",
			run: runAgentMemorySchemaHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:legacy-plugin-manifests",
			label: "Legacy plugin manifests",
			healthChecks: {
				description: "Legacy plugin manifest capability keys are reported as findings.",
				defaultEnabled: false,
				async detect(ctx) {
					const { collectLegacyPluginManifestContractMigrations, legacyPluginManifestContractMigrationToHealthFinding } = await import("./doctor-plugin-manifests-BRAWwu6a.js");
					return collectLegacyPluginManifestContractMigrations({
						config: ctx.cfg,
						env: process.env
					}).map(legacyPluginManifestContractMigrationToHealthFinding);
				}
			},
			run: runLegacyPluginManifestHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:legacy-plugin-dependencies",
			label: "Legacy plugin dependencies",
			healthChecks: {
				description: "Legacy plugin dependency state roots are represented as findings.",
				defaultEnabled: false,
				async detect() {
					const { detectLegacyPluginDependencyStateIssues, legacyPluginDependencyStateIssueToHealthFinding } = await import("./plugin-dependency-cleanup-BzHZRBmR.js");
					return (await detectLegacyPluginDependencyStateIssues({ env: process.env })).map(legacyPluginDependencyStateIssueToHealthFinding);
				}
			},
			run: async () => {}
		}),
		createDoctorHealthContribution({
			id: "doctor:stale-plugin-runtime-symlinks",
			label: "Stale plugin runtime symlinks",
			healthChecks: {
				description: "Stale plugin-runtime symlinks are represented as findings.",
				defaultEnabled: false,
				async detect() {
					const { collectStalePluginRuntimeSymlinkHealthFindings } = await import("./plugin-runtime-symlinks-W8fy5Zpf.js");
					return collectStalePluginRuntimeSymlinkHealthFindings();
				}
			},
			run: async () => {}
		}),
		createDoctorHealthContribution({
			id: "doctor:release-configured-plugin-installs",
			label: "Configured plugin repair",
			healthChecks: {
				id: "core/doctor/configured-plugin-installs",
				description: "Configured plugin install records and package payloads are repairable.",
				defaultEnabled: false,
				async detect(ctx) {
					const { detectConfiguredPluginInstallHealthIssues, configuredPluginInstallIssueToHealthFinding } = await import("./missing-configured-plugin-install-BU9aCHB5.js");
					return (await detectConfiguredPluginInstallHealthIssues({
						cfg: ctx.cfg,
						env: process.env
					})).map(configuredPluginInstallIssueToHealthFinding);
				},
				repair: legacyOwnedRepair(async (ctx) => {
					const { detectConfiguredPluginInstallHealthIssues, configuredPluginInstallIssueToRepairEffect } = await import("./missing-configured-plugin-install-BU9aCHB5.js");
					return (await detectConfiguredPluginInstallHealthIssues({
						cfg: ctx.cfg,
						env: process.env
					})).map(configuredPluginInstallIssueToRepairEffect);
				}, "legacy doctor configured plugin install repair owns package mutation")
			},
			run: runReleaseConfiguredPluginInstallsHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:plugin-registry",
			label: "Plugin registry",
			healthChecks: {
				description: "Plugin registry migration, stale shadow, and peer-link issues are findings.",
				defaultEnabled: false,
				async detect(ctx) {
					const { detectPluginRegistryHealthIssues, pluginRegistryIssueToHealthFinding } = await import("./doctor-plugin-registry-dhsHSnHp.js");
					return (await detectPluginRegistryHealthIssues({
						config: ctx.cfg,
						env: process.env,
						prompter: { shouldRepair: false }
					})).map(pluginRegistryIssueToHealthFinding);
				},
				repair: legacyOwnedRepair(async (ctx) => {
					const { detectPluginRegistryHealthIssues, pluginRegistryIssueToRepairEffect } = await import("./doctor-plugin-registry-dhsHSnHp.js");
					return (await detectPluginRegistryHealthIssues({
						config: ctx.cfg,
						env: process.env,
						prompter: { shouldRepair: false }
					})).map(pluginRegistryIssueToRepairEffect);
				}, "legacy doctor plugin registry contribution owns registry repairs")
			},
			run: runPluginRegistryHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:active-tool-schema-warnings",
			label: "Active tool schema warnings",
			run: runActiveToolSchemaWarningsHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:ui-protocol-freshness",
			label: "UI protocol freshness",
			healthCheckIds: ["core/doctor/ui-protocol-freshness"],
			run: async () => {}
		}),
		createDoctorHealthContribution({
			id: "doctor:disk-space",
			label: "Disk space",
			healthChecks: {
				description: "Low disk space around the OpenClaw state directory is a finding.",
				defaultEnabled: false,
				async detect(ctx) {
					const { collectDiskSpaceHealthFindings } = await import("./doctor-disk-space-D1IriswZ.js");
					return collectDiskSpaceHealthFindings(ctx.cfg);
				}
			},
			run: runDiskSpaceHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:db-bloat",
			label: "SQLite database size",
			run: runDatabaseBloatHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:channel-ingress-dead-letters",
			label: "Channel ingress dead letters",
			run: runChannelIngressDeadLettersHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:state-integrity",
			label: "State integrity",
			healthChecks: {
				description: "State directory, config permission, and runtime state issues are findings.",
				defaultEnabled: false,
				async detect(ctx) {
					const { detectStateIntegrityHealthIssues, stateIntegrityIssueToHealthFinding } = await import("./doctor-state-integrity-C_CEQF1T.js");
					return detectStateIntegrityHealthIssues(ctx.cfg, {
						configPath: ctx.configPath,
						env: process.env
					}).map(stateIntegrityIssueToHealthFinding);
				},
				repair: legacyOwnedRepair(async (ctx) => {
					const { detectStateIntegrityHealthIssues, stateIntegrityIssueToRepairEffect } = await import("./doctor-state-integrity-C_CEQF1T.js");
					return detectStateIntegrityHealthIssues(ctx.cfg, {
						configPath: ctx.configPath,
						env: process.env
					}).map(stateIntegrityIssueToRepairEffect);
				}, "legacy doctor state integrity contribution owns state repairs")
			},
			run: runStateIntegrityHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:codex-session-routes",
			label: "Codex session routes",
			healthCheckIds: ["core/doctor/codex-session-routes"],
			run: runCodexSessionRouteHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:telegram-general-topic-conversations",
			label: "Telegram General-topic conversations",
			healthCheckIds: ["core/doctor/telegram-general-topic-conversations"],
			run: runTelegramGeneralTopicConversationHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:session-transcript-headers",
			label: "Session transcript headers",
			run: runSessionTranscriptHeadersHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:session-transcript-labels",
			label: "Session transcript labels",
			run: runSessionTranscriptLabelsHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:session-snapshots",
			label: "Session snapshots",
			healthChecks: {
				description: "Stale cached session snapshot paths are represented as findings.",
				defaultEnabled: false,
				async detect(ctx) {
					const { detectSessionSnapshotHealthIssues, sessionSnapshotIssueToHealthFinding } = await import("./doctor-session-snapshots-BwIcmOfe.js");
					return (await detectSessionSnapshotHealthIssues({
						cfg: ctx.cfg,
						env: process.env
					})).map(sessionSnapshotIssueToHealthFinding);
				},
				repair: legacyOwnedRepair(async (ctx) => {
					const { detectSessionSnapshotHealthIssues, sessionSnapshotIssueToRepairEffect } = await import("./doctor-session-snapshots-BwIcmOfe.js");
					return (await detectSessionSnapshotHealthIssues({
						cfg: ctx.cfg,
						env: process.env
					})).map(sessionSnapshotIssueToRepairEffect);
				}, "legacy doctor session snapshot contribution owns snapshot rewrites")
			},
			run: runSessionSnapshotsHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:config-audit-scrub",
			label: "Config audit",
			healthChecks: {
				description: "Historical config-audit argv redaction gaps are represented as structured findings.",
				defaultEnabled: false,
				async detect() {
					const { configAuditScrubToHealthFinding, detectConfigAuditScrubIssue } = await import("./doctor-config-audit-scrub-BBA1B1dy.js");
					const result = await detectConfigAuditScrubIssue();
					return result.rewritten > 0 ? [configAuditScrubToHealthFinding(result)] : [];
				},
				repair: legacyOwnedRepair(async () => {
					const { configAuditScrubToRepairEffect, detectConfigAuditScrubIssue } = await import("./doctor-config-audit-scrub-BBA1B1dy.js");
					const result = await detectConfigAuditScrubIssue();
					return result.rewritten > 0 ? [configAuditScrubToRepairEffect(result)] : [];
				}, "legacy doctor config audit contribution owns cleanup")
			},
			run: runConfigAuditScrubHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:legacy-cron",
			label: "Legacy cron",
			healthCheckIds: ["core/doctor/legacy-whatsapp-crontab", "core/doctor/legacy-cron-store"],
			run: runLegacyCronHealth
		}),
		createDoctorHealthContribution({
			id: "doctor:sandbox",
			label: "Sandbox",
			healthChecks: {
				id: "core/doctor/sandbox/registry-files",
				description: "Legacy sandbox registry files are represented in SQLite registry storage.",
				async detect() {
					const { detectLegacySandboxRegistryFileIssues, legacySandboxRegistryInspectionToHealthFinding } = await import("./doctor-sandbox-8knPnvAW.js");
					return (await detectLegacySandboxRegistryFileIssues()).map(legacySandboxRegistryInspectionToHealthFinding);
				},
				repair: legacyOwnedRepair(async () => {
					const { detectLegacySandboxRegistryFileIssues, legacySandboxRegistryInspectionToRepairEffect } = await import("./doctor-sandbox-8knPnvAW.js");
					return (await detectLegacySandboxRegistryFileIssues()).map(legacySandboxRegistryInspectionToRepairEffect);
				}, "legacy doctor sandbox contribution owns registry migration")
			},
			run: runSandboxHealth
		})
	];
}
//#endregion
//#region src/flows/doctor-health-contributions.ts
const loadCommandFormatModule = async () => await import("./command-format-2kUn86lR.js");
const loadDoctorCoreChecksModule = async () => await import("./doctor-core-checks-CJ8DoqwV.js");
const loadNoteModule = async () => await import("./terminal-core/note.js");
const loadOnboardHelpersModule = async () => await import("./onboard-helpers-I1g4vB2R.js");
const loadSecretTypesModule = async () => await import("./types.secrets-CyZdbNdm.js");
const MAX_DEFERRED_LEGACY_STATE_DETAILS = 20;
async function reportDeferredLegacyState(ctx) {
	if (ctx.options.repair !== true && ctx.options.yes !== true) return;
	const [{ detectLegacyStateMigrations }, { prepareLegacySessionSurfaces }] = await Promise.all([import("./state-migrations.doctor-BGAIyMqv.js"), import("./legacy-session-surfaces-DHHD7LpX.js")]);
	const legacyState = await detectLegacyStateMigrations({
		cfg: ctx.cfg,
		doctorOnlyStateMigrations: true,
		...ctx.env ? { env: ctx.env } : {},
		legacySessionSurfaces: prepareLegacySessionSurfaces({ config: ctx.cfg })
	});
	const pendingDetails = [...legacyState.warnings.map((warning) => warning.startsWith("- ") ? warning : `- ${warning}`), ...legacyState.preview];
	if (pendingDetails.length === 0) return;
	const { note } = await loadNoteModule();
	const displayedDetails = pendingDetails.slice(0, MAX_DEFERRED_LEGACY_STATE_DETAILS);
	const omittedDetailCount = pendingDetails.length - displayedDetails.length;
	const remediation = ctx.configWriteRefusal === "validation" ? "Fix the config errors above, then rerun \"openclaw doctor --fix\"." : "Resolve the Gateway or cron-store condition above, then rerun \"openclaw doctor --fix\".";
	note([
		"Pending owners and blockers:",
		...displayedDetails,
		...omittedDetailCount > 0 ? [`${omittedDetailCount} additional pending entries were omitted from this report.`] : [],
		"No listed legacy source was removed.",
		remediation
	].join("\n"), "Legacy state deferred");
}
async function runGatewayConfigHealth(ctx) {
	const { formatCliCommand } = await loadCommandFormatModule();
	const { hasAmbiguousGatewayAuthModeConfig } = await import("./auth-mode-policy-RB0qZ5fk.js");
	const { note } = await loadNoteModule();
	if (!ctx.cfg.gateway?.mode) {
		const lines = [
			"gateway.mode is unset; gateway start will be blocked.",
			`Fix: run ${formatCliCommand("openclaw configure")} and set Gateway mode (local/remote).`,
			`Or set directly: ${formatCliCommand("openclaw config set gateway.mode local")}`
		];
		if (!fs.existsSync(ctx.configPath)) lines.push(`Missing config: run ${formatCliCommand("openclaw setup")} first.`);
		note(lines.join("\n"), "Gateway");
	}
	if (resolveDoctorMode(ctx.cfg) === "local" && hasAmbiguousGatewayAuthModeConfig(ctx.cfg)) note([
		"gateway.auth.token and gateway.auth.password are both configured while gateway.auth.mode is unset.",
		"Set an explicit mode to avoid ambiguous auth selection and startup/runtime failures.",
		`Set token mode: ${formatCliCommand("openclaw config set gateway.auth.mode token")}`,
		`Set password mode: ${formatCliCommand("openclaw config set gateway.auth.mode password")}`
	].join("\n"), "Gateway auth");
}
async function runAuthProfileHealth(ctx) {
	const { collectOpenAICodexAuthProfileStoreIdMap, maybeMigrateAuthProfileJsonStoresToSqlite, maybeRepairOpenAICodexAuthConfig } = await import("./doctor-auth-flat-profiles-B9PwYOdy.js");
	const { maybeRepairLegacyOAuthProfileIds } = await import("./doctor-auth-legacy-oauth-Dxrz3IDb.js");
	const { maybeRepairLegacyOAuthSidecarProfiles } = await import("./doctor-auth-oauth-sidecar-CO5TZNRd.js");
	const { maybeMigrateLegacyPluginModelCatalogs } = await import("./doctor-plugin-model-catalog-C7Zh9S5z.js");
	const { noteAuthProfileHealth, noteLegacyCodexProviderOverride, noteSharedAuthStoreStatus } = await import("./doctor-auth-BK8x86G5.js");
	const { buildGatewayConnectionDetails } = await import("./call-biHULXUC.js");
	const { note } = await loadNoteModule();
	await maybeRepairLegacyOAuthSidecarProfiles({
		cfg: ctx.cfg,
		prompter: ctx.prompter
	});
	const openAICodexAuthProfileIdMap = collectOpenAICodexAuthProfileStoreIdMap({
		cfg: ctx.cfg,
		...ctx.env ? { env: ctx.env } : {}
	});
	const authConfigCandidate = maybeRepairOpenAICodexAuthConfig(ctx.cfg, { profileIdMap: openAICodexAuthProfileIdMap }).config;
	const authProfileMigration = await maybeMigrateAuthProfileJsonStoresToSqlite({
		cfg: authConfigCandidate,
		prompter: ctx.prompter,
		openAICodexAuthProfileIdMap,
		...ctx.env ? { env: ctx.env } : {}
	});
	emitDoctorNotes({
		note,
		changeNotes: authProfileMigration.changes,
		warningNotes: authProfileMigration.warnings
	});
	if (authProfileMigration.configOwnerMigrationApplied) ctx.cfg = authConfigCandidate;
	await maybeMigrateLegacyPluginModelCatalogs({
		cfg: ctx.cfg,
		...ctx.env ? { env: ctx.env } : {},
		prompter: ctx.prompter,
		runtime: ctx.runtime
	});
	const modelsBeforeRepair = ctx.cfg.agents?.defaults?.models;
	const legacyOAuthRepair = await maybeRepairLegacyOAuthProfileIds(ctx.cfg, ctx.prompter);
	ctx.cfg = legacyOAuthRepair.config;
	if (legacyOAuthRepair.retiredProfileCleanupPlans.length > 0) ctx.configResult.retiredAuthProfileCleanupPlans = [...ctx.configResult.retiredAuthProfileCleanupPlans ?? [], ...legacyOAuthRepair.retiredProfileCleanupPlans];
	if (!isDeepStrictEqual(modelsBeforeRepair, ctx.cfg.agents?.defaults?.models)) ctx.configResult.explicitSetPaths = [...ctx.configResult.explicitSetPaths ?? [], [
		"agents",
		"defaults",
		"models"
	]];
	const { maybeMigrateModelCatalogCredentials } = await import("./doctor-model-catalog-credentials-rz0Adxqn.js");
	await maybeMigrateModelCatalogCredentials({
		cfg: ctx.cfg,
		...ctx.env ? { env: ctx.env } : {},
		prompter: ctx.prompter,
		runtime: ctx.runtime
	});
	let authProfileHealthReady = true;
	if (ctx.configResult.retiredAuthProfileCleanupPlans?.length) {
		const { runRetiredAuthProfileCleanup, runWriteConfigHealth } = await import("./doctor-health-contribution-runners.config-lUunbuy9.js");
		await runWriteConfigHealth(ctx, { runPostWriteRepairs: false });
		authProfileHealthReady = !ctx.configWriteRefusal && isDeepStrictEqual(ctx.cfg, ctx.cfgForPersistence);
		if (authProfileHealthReady) await runRetiredAuthProfileCleanup(ctx);
	}
	if (authProfileHealthReady) await noteAuthProfileHealth({
		cfg: ctx.cfg,
		prompter: ctx.prompter,
		allowKeychainPrompt: ctx.options.nonInteractive !== true && process.stdin.isTTY
	});
	noteLegacyCodexProviderOverride(ctx.cfg);
	noteSharedAuthStoreStatus(ctx.env);
	ctx.gatewayDetails = buildGatewayConnectionDetails({ config: ctx.cfg });
	if (ctx.gatewayDetails.remoteFallbackNote) note(ctx.gatewayDetails.remoteFallbackNote, "Gateway");
}
async function runGatewayAuthHealth(ctx) {
	const { resolveSecretInputRef } = await loadSecretTypesModule();
	const { buildGatewayTokenSecretRefFixHint, buildGatewayTokenSecretRefUnavailableMessage } = await loadDoctorCoreChecksModule();
	const { resolveGatewayAuth } = await import("./auth-BUjnBIEy.js");
	const { resolveGatewayAuthToken } = await import("./auth-token-resolution-BcNNI9Bt.js");
	const { note } = await loadNoteModule();
	const { randomToken } = await loadOnboardHelpersModule();
	if (resolveDoctorMode(ctx.cfg) !== "local" || !ctx.sourceConfigValid) return;
	const gatewayTokenRef = resolveSecretInputRef({
		value: ctx.cfg.gateway?.auth?.token,
		defaults: ctx.cfg.secrets?.defaults
	}).ref;
	const auth = resolveGatewayAuth({
		authConfig: ctx.cfg.gateway?.auth,
		tailscaleMode: ctx.cfg.gateway?.tailscale?.mode ?? "off"
	});
	const hasInlineToken = typeof auth.token === "string" && auth.token.trim() !== "";
	if (!(auth.mode !== "password" && auth.mode !== "none" && auth.mode !== "trusted-proxy" && (auth.mode !== "token" || !hasInlineToken || Boolean(gatewayTokenRef)))) return;
	let unresolvedRefReason;
	if (gatewayTokenRef && gatewayTokenRef.source === "exec") {
		const { getSkippedExecRefStaticError } = await import("./exec-resolution-policy--efpRESz.js");
		if (getSkippedExecRefStaticError({
			ref: gatewayTokenRef,
			config: ctx.cfg
		})) unresolvedRefReason = void 0;
		else if (ctx.options.allowExec !== true) return;
		else {
			const resolvedToken = await resolveGatewayAuthToken({
				cfg: ctx.cfg,
				env: ctx.env ?? process.env,
				unresolvedReasonStyle: "detailed",
				envFallback: "never"
			});
			if (resolvedToken.source === "secretRef") return;
			unresolvedRefReason = resolvedToken.unresolvedRefReason;
		}
	} else {
		const resolvedToken = await resolveGatewayAuthToken({
			cfg: ctx.cfg,
			env: ctx.env ?? process.env,
			unresolvedReasonStyle: "detailed"
		});
		if (gatewayTokenRef ? resolvedToken.source === "secretRef" : resolvedToken.token) return;
		unresolvedRefReason = resolvedToken.unresolvedRefReason;
	}
	if (gatewayTokenRef) {
		note([
			buildGatewayTokenSecretRefUnavailableMessage({
				cfg: ctx.cfg,
				ref: gatewayTokenRef,
				unresolvedRefReason
			}),
			"Doctor will not overwrite gateway.auth.token with a plaintext value.",
			buildGatewayTokenSecretRefFixHint(gatewayTokenRef)
		].join("\n"), "Gateway auth");
		return;
	}
	note("Gateway auth is off or missing a token. Token auth is now the recommended default (including loopback).", "Gateway auth");
	if (!(ctx.options.generateGatewayToken === true ? true : ctx.options.nonInteractive === true ? false : await ctx.prompter.confirmAutoFix({
		message: "Generate and configure a gateway token now?",
		initialValue: true
	}))) return;
	const nextToken = randomToken();
	ctx.cfg = {
		...ctx.cfg,
		gateway: {
			...ctx.cfg.gateway,
			auth: {
				...ctx.cfg.gateway?.auth,
				mode: "token",
				token: nextToken
			}
		}
	};
	note("Gateway token configured.", "Gateway auth");
}
async function runLegacyStateHealth(ctx) {
	const { detectLegacyStateMigrations, runLegacyStateMigrations } = await import("./state-migrations.doctor-BGAIyMqv.js");
	const { note } = await loadNoteModule();
	await runCoreContributionHealth(ctx, ["core/doctor/removed-workspaces-state"]);
	const { prepareLegacySessionSurfaces } = await import("./legacy-session-surfaces-DHHD7LpX.js");
	const legacySessionSurfaces = prepareLegacySessionSurfaces({ config: ctx.cfg });
	const doctorOnlyStateMigrations = ctx.options.repair === true || ctx.options.yes === true;
	const legacyState = await detectLegacyStateMigrations({
		cfg: ctx.cfg,
		...doctorOnlyStateMigrations ? { doctorOnlyStateMigrations: true } : {},
		legacySessionSurfaces
	});
	if (legacyState.warnings.length > 0) note(legacyState.warnings.join("\n"), "Doctor warnings");
	if (legacyState.notices.length > 0) note(legacyState.notices.join("\n"), "Doctor notices");
	if (legacyState.preview.length > 0) {
		note(legacyState.preview.join("\n"), "Legacy state detected");
		if (ctx.options.nonInteractive === true ? true : await ctx.prompter.confirm({
			message: "Migrate detected legacy state now?",
			initialValue: true
		})) {
			const migrated = await runLegacyStateMigrations({
				detected: legacyState,
				config: ctx.cfg,
				...doctorOnlyStateMigrations ? { doctorOnlyStateMigrations: true } : {},
				recoverCorruptTargetStore: ctx.options.repair === true || ctx.options.yes === true,
				legacySessionSurfaces
			});
			if (migrated.changes.length > 0) note(migrated.changes.join("\n"), "Doctor changes");
			const notices = migrated.notices ?? [];
			if (notices.length > 0) note(notices.join("\n"), "Doctor notices");
			if (migrated.warnings.length > 0) note(migrated.warnings.join("\n"), "Doctor warnings");
		}
	}
	if (!doctorOnlyStateMigrations) return;
	const { repairObsoleteGeneratedExecApprovals } = await import("./exec-approvals-generated-migration-CRaTOnHJ.js");
	const { ExecApprovalsMigrationRequiredError } = await import("./exec-approvals-migration-gate-BEjwRxRr.js");
	let removedExecApprovals;
	try {
		removedExecApprovals = repairObsoleteGeneratedExecApprovals();
	} catch (error) {
		if (error instanceof ExecApprovalsMigrationRequiredError) return;
		throw error;
	}
	if (removedExecApprovals > 0) note(`Exec approvals updated: removed ${removedExecApprovals} older generated ${removedExecApprovals === 1 ? "approval" : "approvals"} that were not tied to a working directory. Manual allowlist rules were not changed. Rerun affected workflows and choose "Always allow here" when prompted.`, "Doctor changes");
}
async function hasUserScopedSystemdGatewayService(env) {
	const { findInstalledSystemdGatewayScope } = await import("./systemd-Cx5YjBCK.js");
	return (await findInstalledSystemdGatewayScope(env))?.scope === "user";
}
async function runSystemdLingerHealth(ctx) {
	if (ctx.options.nonInteractive === true || process.platform !== "linux" || resolveDoctorMode(ctx.cfg) !== "local" || !await shouldManageGatewayService(ctx.env ?? process.env) || !await hasUserScopedSystemdGatewayService(ctx.env ?? process.env)) return;
	const { readGatewayServiceState, resolveGatewayService } = await import("./service-Cf-5LQMc.js");
	const { ensureSystemdUserLingerInteractive } = await import("./systemd-linger-Dx8UIi38.js");
	const { note } = await loadNoteModule();
	if ((await readGatewayServiceState(resolveGatewayService(), { env: process.env })).loadState.status !== "loaded") return;
	await ensureSystemdUserLingerInteractive({
		runtime: ctx.runtime,
		prompter: {
			confirm: async (p) => ctx.prompter.confirm(p),
			note
		},
		reason: "Gateway runs as a systemd user service. Without lingering, systemd stops the user session on logout/idle and kills the Gateway.",
		requireConfirm: true
	});
}
async function detectSystemdLingerFindings(ctx) {
	if (process.platform !== "linux" || resolveDoctorMode(ctx.cfg) !== "local" || !await shouldManageGatewayService(ctx.env ?? process.env) || !await hasUserScopedSystemdGatewayService(ctx.env ?? process.env)) return [];
	const { readGatewayServiceState, resolveGatewayService } = await import("./service-Cf-5LQMc.js");
	if ((await readGatewayServiceState(resolveGatewayService(), { env: process.env })).loadState.status !== "loaded") return [];
	const { isSystemdUserServiceAvailable, readSystemdUserLingerStatus, resolveSystemdUserServiceAccount } = await import("./systemd-Cx5YjBCK.js");
	if (!await isSystemdUserServiceAvailable(process.env)) return [];
	const user = resolveSystemdUserServiceAccount(process.env);
	if (!user) return [];
	const status = await readSystemdUserLingerStatus({
		env: process.env,
		user
	});
	if (!status || status.linger === "yes") return [];
	return [{
		checkId: "core/doctor/systemd-linger",
		severity: "warning",
		source: "doctor",
		message: `Systemd lingering is disabled for ${status.user}.`,
		target: `systemd.user.${status.user}`,
		requirement: "systemd user lingering enabled",
		fixHint: `Run: sudo loginctl enable-linger ${status.user}`
	}];
}
async function runShellCompletionHealth(ctx) {
	const { doctorShellCompletion } = await import("./doctor-completion-JKBsQ5e3.js");
	await doctorShellCompletion(ctx.runtime, ctx.prompter, { nonInteractive: ctx.options.nonInteractive });
}
async function runGatewayHealthChecks(ctx) {
	const { note } = await loadNoteModule();
	if (ctx.gatewayMaintenanceActive) {
		note("Gateway health will be checked after Doctor repair.", "Gateway");
		ctx.gatewayHealthSkipped = true;
		ctx.gatewayMemoryProbe = {
			checked: false,
			ready: false,
			skipped: true
		};
		return;
	}
	if (await hasActiveGatewayExecCredential(ctx) && ctx.options.allowExec !== true) {
		note("Gateway health probes skipped because gateway credentials use an exec SecretRef. Run `openclaw doctor --allow-exec` to verify Gateway health with exec SecretRefs.", "Gateway");
		ctx.gatewayHealthSkipped = true;
		ctx.gatewayMemoryProbe = {
			checked: false,
			ready: false,
			skipped: true
		};
		return;
	}
	const { checkGatewayHealth, probeGatewayMemoryStatus } = await import("./doctor-gateway-health-DxMCJ8lx.js");
	const { healthOk, authenticated, status } = await checkGatewayHealth({
		runtime: ctx.runtime,
		cfg: ctx.cfg,
		timeoutMs: ctx.options.nonInteractive === true ? 3e3 : 1e4
	});
	ctx.gatewayHealthSkipped = false;
	ctx.healthOk = healthOk;
	ctx.gatewayHealthAuthenticated = authenticated;
	ctx.gatewayStatus = status;
	ctx.gatewayMemoryProbe = authenticated ? await probeGatewayMemoryStatus({
		cfg: ctx.cfg,
		timeoutMs: ctx.options.nonInteractive === true ? 3e3 : 1e4
	}) : {
		checked: false,
		ready: false,
		skipped: healthOk
	};
}
function resolveDoctorHealthContributions() {
	return [...resolveInitialDoctorHealthContributions({
		runStructuredHealthRepairs: (ctx) => runStructuredHealthRepairs(ctx, resolveDoctorContributionHealthChecks),
		runGatewayConfigHealth,
		runAuthProfileHealth,
		runGatewayAuthHealth,
		runLegacyStateHealth
	}), ...resolveFinalDoctorHealthContributions({
		runSystemdLingerHealth,
		detectSystemdLingerFindings,
		runShellCompletionHealth,
		runGatewayHealthChecks
	})];
}
async function resolveDoctorContributionHealthChecks() {
	const { createCoreHealthChecks } = await import("./doctor-core-checks-CJ8DoqwV.js");
	const checksById = new Map(createCoreHealthChecks().map((check) => [check.id, check]));
	const checks = [];
	for (const contribution of resolveDoctorHealthContributions()) {
		if (contribution.healthChecks.length > 0) {
			checks.push(...contribution.healthChecks.map(normalizeHealthCheck));
			continue;
		}
		for (const id of contribution.healthCheckIds) {
			const check = checksById.get(id);
			if (check === void 0) throw new Error(`doctor contribution ${contribution.id} references unknown core health check ${id}`);
			checks.push(check);
		}
	}
	return checks;
}
async function runDoctorHealthContributionList(ctx, contributions) {
	const runWithPluginMetadataSnapshot = ctx.runWithPluginMetadataSnapshot;
	for (const contribution of contributions) try {
		const run = async () => {
			await contribution.run(ctx);
			if (ctx.configWriteRefusal) await reportDeferredLegacyState(ctx);
		};
		if (!runWithPluginMetadataSnapshot) await run();
		else {
			const workspaceDir = resolveDoctorWorkspaceDir(ctx.cfg, ctx.env);
			await runWithPluginMetadataSnapshot({
				config: ctx.cfg,
				workspaceDir
			}, run);
		}
		if (ctx.configWriteRefusal) return;
	} catch (error) {
		await (contribution.required ? Promise.reject(error) : Promise.resolve());
		const { note } = await loadNoteModule();
		note(`${contribution.id} run failed: ${scrubDoctorErrorMessage(error)}`, "Doctor warnings");
	}
}
async function runDoctorHealthContributions(ctx) {
	await runDoctorHealthContributionList(ctx, resolveDoctorHealthContributions());
}
if (process.env.VITEST || false) globalThis[Symbol.for("openclaw.doctorHealthContributionsTestApi")] = {
	resolveDoctorHealthContributions,
	runDoctorHealthContributionList
};
//#endregion
export { runDoctorHealthContributions as n, resolveDoctorContributionHealthChecks as t };
