// cli-startup-fast. openclaw.mjs imports this file before dist/entry.js (its "./dist/warning-filter.js"
// step). dist/index.js (the Gateway) and the Worker do not load it. Source: src/cli/launcher-preflight.ts
// on the fork. OPENCLAW_V_CLI_FAST_PATH=0 restores the old path.
import process from "node:process";
import { t as installOpenClawWarningFilter } from "./warning-filter-z3hZGeVP.js";
const RELAY_DRAIN_BACKSTOP_MS = 2e3;
function hasContainerTarget(env) {
	const container = env.OPENCLAW_CONTAINER?.trim();
	return Boolean(container) && container !== "undefined" && container !== "null";
}
/** Whether Codex's hook command should run here, without the general CLI entry. */
function shouldRunNativeHookRelayFastPath(argv, env, platform) {
	return env.OPENCLAW_V_CLI_FAST_PATH !== "0" && platform !== "win32" && argv[2] === "hooks" && argv[3] === "relay" && !argv.includes("--help") && !argv.includes("-h") && !hasContainerTarget(env);
}
/** dist/entry.js otherwise loads 680 modules only to respawn with --disable-warning=ExperimentalWarning. */
function skipWarningRespawn(env) {
	if (env.OPENCLAW_V_CLI_FAST_PATH === "0" || hasContainerTarget(env) || env.OPENCLAW_NODE_OPTIONS_READY !== void 0) return false;
	env.OPENCLAW_NODE_OPTIONS_READY = "1";
	return true;
}
function dropExperimentalWarnings() {
	const emitWarning = process.emitWarning.bind(process);
	process.emitWarning = (warning, ...rest) => {
		const type = typeof rest[0] === "string" ? rest[0] : rest[0]?.type;
		if ((warning instanceof Error ? warning.name : type) === "ExperimentalWarning") return;
		emitWarning(warning, ...rest);
	};
}
async function runNativeHookRelayAndExit() {
	process.title = "openclaw";
	process.env.OPENCLAW_CLI = "1";
	let exitCode = 1;
	try {
		const { runNativeHookRelayCliFromArgv } = await import("./native-hook-relay-cli-FHvp11Az.js");
		exitCode = await runNativeHookRelayCliFromArgv(process.argv);
	} catch (error) {
		process.stderr.write(`[openclaw] native hook relay failed: ${error instanceof Error ? error.message : String(error)}\n`);
	}
	process.exitCode = exitCode;
	const exit = () => process.exit(exitCode);
	// Referenced on purpose: this module's top-level await never settles, so the loop must not drain.
	setTimeout(exit, RELAY_DRAIN_BACKSTOP_MS);
	let pending = 2;
	const drained = () => {
		pending -= 1;
		if (pending === 0) setImmediate(exit);
	};
	process.stdout.write("", drained);
	process.stderr.write("", drained);
	return await new Promise(() => {});
}
function installProcessWarningFilter() {
	installOpenClawWarningFilter();
}
installOpenClawWarningFilter();
if (shouldRunNativeHookRelayFastPath(process.argv, process.env, process.platform)) await runNativeHookRelayAndExit();
if (skipWarningRespawn(process.env)) dropExperimentalWarnings();
export { installProcessWarningFilter };
