import { c as isGatewayServiceEnv } from "./constants-ChqKLfPp.js";
import { t as createLazyImportLoader } from "./lazy-promise-DGqyc4Y4.js";
import { o as isGatewayExternallySupervised } from "./gateway-supervision-CWUKIQty.js";
import { n as inheritOptionFromParent } from "./command-options-BDuSHeWG.js";
import { s as resolveGatewayRpcOptionsWithLocalPort } from "./gateway-rpc-DrwcTCnI.js";
//#region src/cli/daemon-cli/register-service-commands.ts
const daemonInstallModuleLoader = createLazyImportLoader(() => import("./install.runtime-Br0KwT8g.js"));
const daemonLifecycleModuleLoader = createLazyImportLoader(() => import("./lifecycle.runtime.js"));
const daemonStatusModuleLoader = createLazyImportLoader(() => import("./status.runtime-BFvLLO5c.js"));
function resolveJsonOption(cmdOpts, command) {
	const parentJson = inheritOptionFromParent(command, "json", "cli");
	return Boolean(cmdOpts.json || parentJson);
}
function resolveInstallOptions(cmdOpts, command) {
	const parentForce = inheritOptionFromParent(command, "force");
	const parentPort = inheritOptionFromParent(command, "port");
	const parentToken = inheritOptionFromParent(command, "token");
	return {
		...cmdOpts,
		force: Boolean(cmdOpts.force || parentForce),
		port: cmdOpts.port ?? parentPort,
		token: cmdOpts.token ?? parentToken,
		json: resolveJsonOption(cmdOpts, command)
	};
}
function resolveRestartOptions(cmdOpts, command) {
	const parentForce = inheritOptionFromParent(command, "force");
	const force = Boolean(cmdOpts.force || parentForce);
	const safeFromGateway = process.platform === "win32" && isGatewayServiceEnv(process.env) && !isGatewayExternallySupervised() && !force && cmdOpts.wait === void 0 && !cmdOpts.preserveDefinition && !cmdOpts.skipDeferral;
	return {
		...cmdOpts,
		force,
		safe: cmdOpts.safe || safeFromGateway,
		json: resolveJsonOption(cmdOpts, command)
	};
}
function resolveStopOptions(cmdOpts, command) {
	const parentForce = inheritOptionFromParent(command, "force");
	return {
		...cmdOpts,
		force: Boolean(cmdOpts.force || parentForce),
		json: resolveJsonOption(cmdOpts, command)
	};
}
/** Attach Gateway service status/install/lifecycle subcommands to a parent command. */
function addGatewayServiceCommands(parent, opts) {
	parent.command("status").description(opts?.statusDescription ?? "Show gateway service status + probe connectivity/capability").option("--url <url>", "Gateway WebSocket URL (defaults to config/remote/local)").option("--port <port>", "Local Gateway port").option("--token <token>", "Gateway token (if required)").option("--password <password>", "Gateway password (password auth)").option("--timeout <ms>", "Timeout in ms", "10000").option("--no-probe", "Skip RPC probe").option("--require-rpc", "Exit non-zero when the RPC probe fails", false).option("--deep", "Scan system-level services", false).option("--json", "Output JSON", false).action(async (cmdOpts, command) => {
		const { runDaemonStatus } = await daemonStatusModuleLoader.load();
		await runDaemonStatus({
			rpc: resolveGatewayRpcOptionsWithLocalPort(cmdOpts, command),
			probe: Boolean(cmdOpts.probe),
			requireRpc: Boolean(cmdOpts.requireRpc),
			deep: Boolean(cmdOpts.deep),
			json: resolveJsonOption(cmdOpts, command)
		});
	});
	parent.command("install").description("Install the Gateway service (launchd/systemd/schtasks)").option("--port <port>", "Gateway port").option("--runtime <runtime>", "Daemon runtime (node|bun). Default: node").option("--token <token>", "Gateway token (token auth)").option("--wrapper <path>", "Executable wrapper for generated service ProgramArguments").option("--force", "Reinstall/overwrite if already installed", false).option("--json", "Output JSON", false).action(async (cmdOpts, command) => {
		const { runDaemonInstall } = await daemonInstallModuleLoader.load();
		await runDaemonInstall(resolveInstallOptions(cmdOpts, command));
	});
	parent.command("uninstall").description("Uninstall the Gateway service (launchd/systemd/schtasks)").option("--json", "Output JSON", false).action(async (cmdOpts, command) => {
		const { runDaemonUninstall } = await daemonLifecycleModuleLoader.load();
		await runDaemonUninstall({
			...cmdOpts,
			json: resolveJsonOption(cmdOpts, command)
		});
	});
	parent.command("start").description("Start the Gateway service (launchd/systemd/schtasks)").option("--json", "Output JSON", false).action(async (cmdOpts, command) => {
		const { runDaemonStart } = await daemonLifecycleModuleLoader.load();
		await runDaemonStart({
			...cmdOpts,
			json: resolveJsonOption(cmdOpts, command)
		});
	});
	parent.command("stop").description("Stop the Gateway service (launchd/systemd/schtasks)").option("--force", "Allow stop from a non-interactive shell", false).option("--json", "Output JSON", false).option("--disable", "Persistently suppress KeepAlive/RunAtLoad so the gateway does not respawn until next start (launchd only)", false).action(async (cmdOpts, command) => {
		const { runDaemonStop } = await daemonLifecycleModuleLoader.load();
		await runDaemonStop(resolveStopOptions(cmdOpts, command));
	});
	parent.command("restart").description("Restart the Gateway service (launchd/systemd/schtasks)").option("--preserve-definition", "Keep the native service definition", false).option("--force", "Restart immediately without waiting for active gateway work", false).option("--safe", "Request an OpenClaw-aware restart after active work drains (waits indefinitely; use --force for an immediate restart)", false).option("--skip-deferral", "Bypass the safe-restart active-work deferral gate; close-stage reply drain still applies; requires --safe", false).option("--wait <duration>", "Wait duration before restart (ms, 10s, 5m; 0 waits indefinitely). For non-safe restarts (plain restart); not compatible with --force or --safe").option("--json", "Output JSON", false).action(async (cmdOpts, command) => {
		const { runDaemonRestart } = await daemonLifecycleModuleLoader.load();
		await runDaemonRestart(resolveRestartOptions(cmdOpts, command));
	});
}
//#endregion
export { addGatewayServiceCommands as t };
