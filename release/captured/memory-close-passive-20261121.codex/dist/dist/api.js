import { a as resolveCodexAppServerStartOptionsForAgent, i as resolveCodexAppServerRuntimeOptions } from "./config-BhmfC1s6.js";
import { n as resolveManagedCodexAppServerStartOptions, o as CODEX_APP_SERVER_VERSION, r as resolveManagedCodexNativeCommand, t as isManagedCodexDesktopCommand } from "./managed-binary-4-Vjz5GH.js";
import path from "node:path";
import { resolveDefaultModelForAgent } from "openclaw/plugin-sdk/agent-runtime";
import { listAgentIds as listAgentIds$1, resolveAgentDir as resolveAgentDir$1 } from "openclaw/plugin-sdk/agent-scope-runtime";
import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolveEffectiveAgentRuntime } from "openclaw/plugin-sdk/command-auth-native";
//#region extensions/codex/src/doctor.ts
const CODEX_MANAGED_APP_SERVER_CHECK_ID = "codex/managed-app-server";
const CODEX_VERSION_TIMEOUT_MS = 5e3;
const CODEX_VERSION_MAX_BUFFER_BYTES = 65536;
function managedCodexFinding(params) {
	return {
		checkId: CODEX_MANAGED_APP_SERVER_CHECK_ID,
		severity: "error",
		source: "codex",
		message: params.message,
		...params.path ? { path: params.path } : {},
		...params.requirement ? { requirement: params.requirement } : {},
		...params.fixHint ? { fixHint: params.fixHint } : {}
	};
}
function readErrorMessage(error) {
	return error instanceof Error ? error.message : String(error);
}
function parseCodexVersion(output) {
	return /(?:^|\s)(\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?)(?:\s|$)/u.exec(output)?.[1];
}
function runVersionCommand(command) {
	return new Promise((resolve, reject) => {
		execFile(command, ["--version"], {
			encoding: "utf8",
			maxBuffer: CODEX_VERSION_MAX_BUFFER_BYTES,
			timeout: CODEX_VERSION_TIMEOUT_MS,
			windowsHide: true
		}, (error, stdout, stderr) => {
			if (error) {
				reject(new Error(readErrorMessage(error), { cause: error }));
				return;
			}
			resolve({
				stdout,
				stderr
			});
		});
	});
}
function createCodexManagedAppServerHealthCheck(params) {
	const resolveStartOptions = params.deps?.resolveStartOptions ?? resolveManagedCodexAppServerStartOptions;
	const resolveAgentStartOptions = params.deps?.resolveAgentStartOptions ?? resolveCodexAppServerStartOptionsForAgent;
	const isDesktopCommand = params.deps?.isDesktopCommand ?? isManagedCodexDesktopCommand;
	const resolveNativeCommand = params.deps?.resolveNativeCommand ?? resolveManagedCodexNativeCommand;
	const executeVersion = params.deps?.runVersionCommand ?? runVersionCommand;
	return {
		id: CODEX_MANAGED_APP_SERVER_CHECK_ID,
		kind: "plugin",
		description: "Verify the selected managed Codex app-server binary and pinned version.",
		source: "codex",
		defaultEnabled: false,
		async detect(ctx) {
			const pluginConfig = ctx.cfg.plugins?.entries?.codex?.config;
			const start = resolveCodexAppServerRuntimeOptions({
				pluginConfig,
				env: ctx.env ?? process.env
			}).start;
			if (start.transport !== "stdio" || start.commandSource !== "managed") return [];
			const env = ctx.env ?? process.env;
			let resolved;
			for (const agentId of listAgentIds$1(ctx.cfg)) {
				const model = resolveDefaultModelForAgent({
					cfg: ctx.cfg,
					agentId
				});
				if (resolveEffectiveAgentRuntime({
					cfg: ctx.cfg,
					provider: model.provider,
					modelId: model.model,
					agentId
				}) !== "codex") continue;
				const agentStart = resolveAgentStartOptions({
					startOptions: start,
					agentDir: resolveAgentDir$1(ctx.cfg, agentId, env),
					env
				});
				try {
					resolved = await resolveStartOptions(agentStart, { pluginRoot: params.pluginRoot });
				} catch (error) {
					return [managedCodexFinding({
						message: `Managed Codex app-server could not be resolved: ${readErrorMessage(error)}`,
						path: params.pluginRoot,
						requirement: `an executable Codex ${CODEX_APP_SERVER_VERSION} managed artifact`,
						fixHint: "Reinstall the staged OpenClaw package with its @openai/codex platform dependency, then rerun the candidate check."
					})];
				}
				if (!isDesktopCommand(resolved.command)) break;
				resolved = void 0;
			}
			if (!resolved) return [];
			const nativeCommand = resolveNativeCommand(resolved.command);
			if (!nativeCommand) return [managedCodexFinding({
				message: "Managed Codex app-server resolved a launcher without a native artifact.",
				path: resolved.command,
				requirement: `the platform-native Codex ${CODEX_APP_SERVER_VERSION} executable`,
				fixHint: "Reinstall the staged OpenClaw package with the matching @openai/codex platform package, then rerun the candidate check."
			})];
			let output;
			try {
				output = await executeVersion(nativeCommand);
			} catch (error) {
				return [managedCodexFinding({
					message: `Managed Codex app-server version check failed: ${readErrorMessage(error)}`,
					path: nativeCommand,
					requirement: `Codex ${CODEX_APP_SERVER_VERSION} must report its version within ${CODEX_VERSION_TIMEOUT_MS} ms`,
					fixHint: "Repair or reinstall the staged OpenClaw package, then rerun the candidate check before cutover."
				})];
			}
			const detectedVersion = parseCodexVersion(`${output.stdout}\n${output.stderr}`);
			if (detectedVersion !== "0.152.1") return [managedCodexFinding({
				message: detectedVersion ? `Managed Codex app-server version mismatch: expected ${CODEX_APP_SERVER_VERSION}, detected ${detectedVersion}.` : `Managed Codex app-server did not report a parseable version; expected ${CODEX_APP_SERVER_VERSION}.`,
				path: nativeCommand,
				requirement: `the exact OpenClaw-pinned Codex version ${CODEX_APP_SERVER_VERSION}`,
				fixHint: "Reinstall the staged OpenClaw package so its managed @openai/codex dependency matches the pinned version, then rerun the candidate check."
			})];
			return [];
		}
	};
}
function registerCodexManagedAppServerDoctorChecks$1(host, deps) {
	if (host.getHealthCheck("codex/managed-app-server")) return;
	host.registerHealthCheck(createCodexManagedAppServerHealthCheck({
		pluginRoot: host.pluginRoot,
		deps
	}));
}
//#endregion
//#region extensions/codex/api.ts
const CODEX_PLUGIN_ROOT = path.dirname(fileURLToPath(import.meta.url));
function registerCodexManagedAppServerDoctorChecks(host) {
	registerCodexManagedAppServerDoctorChecks$1({
		...host,
		pluginRoot: CODEX_PLUGIN_ROOT
	});
}
//#endregion
export { CODEX_MANAGED_APP_SERVER_CHECK_ID, registerCodexManagedAppServerDoctorChecks };
