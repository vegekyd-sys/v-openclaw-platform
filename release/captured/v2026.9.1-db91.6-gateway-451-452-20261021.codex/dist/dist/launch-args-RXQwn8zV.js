//#region extensions/codex/src/app-server/launch-args.ts
const CODEX_VALUE_OPTIONS = /* @__PURE__ */ new Set([
	"-m",
	"--model",
	"--local-provider",
	"-p",
	"--profile",
	"-s",
	"--sandbox",
	"-a",
	"--ask-for-approval",
	"-C",
	"--cd",
	"--add-dir",
	"--remote",
	"--remote-auth-token-env",
	"-c",
	"--config",
	"--enable",
	"--disable",
	"--listen",
	"--code-mode-host",
	"--ws-auth",
	"--ws-token-file",
	"--ws-token-sha256",
	"--ws-shared-secret-file",
	"--ws-issuer",
	"--ws-audience",
	"--ws-max-clock-skew-seconds"
]);
/** One tokenization owner for launch, turn policy, reviewer trust, and private turns. */
function readCodexArgs(args) {
	const tokens = [];
	let nativeSubcommand = false;
	let end = 0;
	for (const [index, arg] of args.entries()) {
		if (index < end) continue;
		end = index + 1;
		const attached = /^(--[^=]+)=([\s\S]*)$/u.exec(arg) ?? /^(-[cmpisaC])=?([\s\S]+)$/u.exec(arg);
		const name = attached?.[1] ?? arg;
		let value = attached?.[2];
		if (name === "-i" || name === "--image") while (args[end]?.startsWith("-") === false) end += 1;
		else if (!attached && CODEX_VALUE_OPTIONS.has(name)) {
			value = args[end];
			if (value !== void 0) end += 1;
		}
		tokens.push({
			index,
			end,
			name,
			value
		});
		if (name === "app-server") nativeSubcommand = true;
		if (name === "--" && nativeSubcommand) break;
	}
	return tokens;
}
function readCodexAppServerConfigOptions(args) {
	return readCodexArgs(args).filter(({ name }) => name === "-c" || name === "--config" || name === "-p" || name === "--profile");
}
/** The stdio proxy forwards to an external server; it does not own that runtime. */
function isCodexAppServerProxyLaunch(args) {
	const tokens = readCodexArgs(args);
	const server = tokens.findLastIndex(({ name }) => name === "app-server");
	return server >= 0 && tokens.slice(server + 1).find(({ name }) => !name.startsWith("-"))?.name === "proxy";
}
/** Keeps Codex overrides in one CLI scope without rewriting raw TOML or wrapper prefixes. */
function normalizeCodexAppServerArgs(rawArgs, enforcedOverride) {
	const tokens = readCodexArgs(rawArgs);
	const subcommandIndex = tokens.findLast(({ name }) => name === "app-server")?.index ?? -1;
	const prefix = subcommandIndex < 0 ? [...rawArgs] : rawArgs.slice(0, subcommandIndex);
	const suffix = [];
	if (subcommandIndex >= 0) for (const token of tokens) {
		if (token.index <= subcommandIndex) continue;
		if (token.name === "--") {
			suffix.push(...rawArgs.slice(token.index));
			break;
		}
		(token.name === "-c" || token.name === "--config" ? prefix : suffix).push(...rawArgs.slice(token.index, token.end));
	}
	if (enforcedOverride && !(prefix.at(-2) === "-c" && prefix.at(-1) === enforcedOverride)) prefix.push("-c", enforcedOverride);
	const normalized = subcommandIndex < 0 ? prefix : [
		...prefix,
		"app-server",
		...suffix
	];
	return normalized.length === rawArgs.length && normalized.every((arg, index) => arg === rawArgs[index]) ? rawArgs : normalized;
}
//#endregion
export { normalizeCodexAppServerArgs as n, readCodexAppServerConfigOptions as r, isCodexAppServerProxyLaunch as t };
