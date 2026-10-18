import { n as resolveManagedCodexAppServerStartOptions, r as resolveManagedCodexNativeCommand, t as isManagedCodexDesktopCommand } from "./managed-binary-4-Vjz5GH.js";
import { i as closeCodexAppServerTransportAndWait, t as createStdioTransport } from "./transport-stdio-CyPldczm.js";
import { isRecord } from "openclaw/plugin-sdk/string-coerce-runtime";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { resolvePreferredOpenClawTmpDir, withTempWorkspace } from "openclaw/plugin-sdk/temp-path";
import { killProcessTree } from "openclaw/plugin-sdk/process-runtime";
import { once } from "node:events";
import { sanitizeEnvVars } from "openclaw/plugin-sdk/sandbox";
//#region extensions/codex/src/node-exec-server.runtime.ts
const MAX_CODEX_EXEC_SERVER_MESSAGE_BYTES = 67108864;
const CODEX_EXEC_SERVER_TERMINATION_GRACE_MS = 1e3;
const CODEX_EXEC_SERVER_REAP_TIMEOUT_MS = 5e3;
const NODE_EXEC_SERVER_PLATFORM_ENVIRONMENT = /^(?:SYSTEMROOT|WINDIR|COMSPEC|PATHEXT|TEMP|TMP|TMPDIR)$/iu;
function validateNodeExecServerMessage(message) {
	if (message.byteLength === 0 || message.byteLength > MAX_CODEX_EXEC_SERVER_MESSAGE_BYTES) throw new Error("Codex exec-server JSON-RPC message exceeds its 64 MiB limit.");
	const encoded = Buffer.from(message.buffer, message.byteOffset, message.byteLength);
	if (encoded.includes(10) || encoded.includes(13)) throw new Error("Codex exec-server JSON-RPC frames must contain exactly one message.");
	let decoded;
	try {
		const text = new TextDecoder("utf-8", { fatal: true }).decode(encoded);
		decoded = JSON.parse(text);
	} catch {
		throw new Error("Codex exec-server received malformed UTF-8 or JSON-RPC.");
	}
	if (!isRecord(decoded) || decoded.jsonrpc !== void 0 && decoded.jsonrpc !== "2.0" || typeof decoded.method !== "string" && !("id" in decoded && ("result" in decoded || "error" in decoded))) throw new Error("Codex exec-server received an invalid JSON-RPC message.");
	return encoded;
}
function nodeExecServerAbortError(signal) {
	return signal.reason instanceof Error ? signal.reason : /* @__PURE__ */ new Error("Codex node exec-server connection closed.");
}
function writeNodeExecServerMessage(child, message, signal) {
	if (signal.aborted) throw nodeExecServerAbortError(signal);
	const payload = Buffer.concat([message, Buffer.from("\n")]);
	if (!child.stdin.write(payload)) return once(child.stdin, "drain", { signal }).then(() => void 0);
}
async function relayNodeExecServerOutput(child, send) {
	let fragments = [];
	let pendingBytes = 0;
	for await (const rawChunk of child.stdout) {
		const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk);
		let offset = 0;
		while (offset < chunk.byteLength) {
			const newline = chunk.indexOf(10, offset);
			const fragment = chunk.subarray(offset, newline === -1 ? chunk.byteLength : newline);
			const nextLength = pendingBytes + fragment.byteLength;
			if (nextLength > 67108865) throw new Error("Codex exec-server stdout message exceeds its 64 MiB limit.");
			if (fragment.byteLength > 0) fragments.push(fragment);
			pendingBytes = nextLength;
			if (newline === -1) {
				if (pendingBytes > MAX_CODEX_EXEC_SERVER_MESSAGE_BYTES && fragment[fragment.byteLength - 1] !== 13) throw new Error("Codex exec-server stdout message exceeds its 64 MiB limit.");
				break;
			}
			const trailing = fragments.at(-1);
			if (trailing?.[trailing.byteLength - 1] === 13) {
				pendingBytes -= 1;
				if (trailing.byteLength === 1) fragments.pop();
				else fragments[fragments.length - 1] = trailing.subarray(0, trailing.byteLength - 1);
			}
			const message = validateNodeExecServerMessage(fragments.length === 1 ? fragments[0] : Buffer.concat(fragments, pendingBytes));
			fragments = [];
			pendingBytes = 0;
			await send(message);
			offset = newline + 1;
		}
	}
	if (pendingBytes > 0) throw new Error("Codex exec-server stdout ended with an unterminated JSON-RPC message.");
}
function createNodeExecServerProcessOwner(child, closed) {
	let termination;
	return { terminate: () => termination ??= (async () => {
		if (process.platform === "win32" && child.pid) killProcessTree(child.pid, { graceMs: CODEX_EXEC_SERVER_TERMINATION_GRACE_MS });
		if (!await closeCodexAppServerTransportAndWait(child, {
			forceKillDelayMs: CODEX_EXEC_SERVER_TERMINATION_GRACE_MS,
			exitTimeoutMs: CODEX_EXEC_SERVER_REAP_TIMEOUT_MS
		})) throw new Error("Codex node exec-server process tree did not terminate.");
		await closed;
	})() };
}
/** Runs the one-connection paired-node exec-server after lightweight command admission. */
async function runCodexNodeExecServer(params) {
	const { io } = params;
	const frames = io.frames;
	if (!frames) throw new Error("Codex node exec-server requires duplex frames.");
	const cwd = params.workspaceDir;
	let writes;
	let rejectDisconnected;
	const disconnected = new Promise((_resolve, reject) => {
		rejectDisconnected = reject;
	});
	disconnected.catch(() => {});
	const onAbort = () => {
		const error = nodeExecServerAbortError(io.signal);
		rejectDisconnected(error);
	};
	io.signal.addEventListener("abort", onAbort, { once: true });
	try {
		if (io.signal.aborted) throw nodeExecServerAbortError(io.signal);
		return await withTempWorkspace({
			rootDir: resolvePreferredOpenClawTmpDir(),
			prefix: "codex-node-exec-server-"
		}, async ({ dir }) => {
			const codexHome = path.join(dir, ".codex");
			await mkdir(codexHome, {
				recursive: true,
				mode: 448
			});
			const resolved = await resolveManagedCodexAppServerStartOptions({
				transport: "stdio",
				command: "codex",
				commandSource: "managed",
				managedCommandOrder: "package-first",
				args: [
					"exec-server",
					"--listen",
					"stdio"
				],
				headers: {}
			});
			const native = resolveManagedCodexNativeCommand(resolved.command);
			if (!native || isManagedCodexDesktopCommand(resolved.command)) throw new Error("Codex node exec-server requires the pinned managed package binary.");
			const baseEnv = sanitizeEnvVars(process.env, {
				strictMode: true,
				customAllowedPatterns: [NODE_EXEC_SERVER_PLATFORM_ENVIRONMENT]
			}).allowed;
			if (io.signal.aborted) throw nodeExecServerAbortError(io.signal);
			params.assertExecAuthorized();
			const child = await createStdioTransport({
				transport: "stdio",
				command: native,
				commandSource: "resolved-managed",
				args: resolved.args,
				headers: {},
				cwd,
				env: {
					HOME: dir,
					CODEX_HOME: codexHome,
					...process.platform === "win32" ? { USERPROFILE: dir } : {}
				},
				clearEnv: ["NODE_OPTIONS"]
			}, baseEnv, () => {
				if (io.signal.aborted) throw nodeExecServerAbortError(io.signal);
				params.assertExecAuthorized();
			});
			child.stdin.on("error", (error) => {
				rejectDisconnected(error);
			});
			let stderr = Buffer.alloc(0);
			child.stderr.on("data", (chunk) => {
				const bounded = (Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)).subarray(-4096);
				stderr = Buffer.concat([stderr, bounded]).subarray(-4096);
			});
			const closed = new Promise((resolve) => {
				child.once("close", (code, signal) => resolve({
					code,
					signal
				}));
			});
			child.once("error", (error) => {
				rejectDisconnected(error);
			});
			const owner = createNodeExecServerProcessOwner(child, closed);
			params.activeProcesses.add(owner.terminate);
			const output = relayNodeExecServerOutput(child, frames.send.bind(frames));
			output.catch((error) => {
				rejectDisconnected(error instanceof Error ? error : new Error(String(error)));
			});
			try {
				if (io.signal.aborted) throw nodeExecServerAbortError(io.signal);
				params.onFrameReceiver((message) => {
					const encoded = validateNodeExecServerMessage(message);
					const operation = writes ? writes.then(() => writeNodeExecServerMessage(child, encoded, io.signal)) : writeNodeExecServerMessage(child, encoded, io.signal);
					if (!operation) return;
					const observed = operation.catch(() => {});
					writes = observed;
					observed.then(() => {
						if (writes === observed) writes = void 0;
					});
					return operation;
				});
				const outcome = await Promise.race([closed, disconnected]);
				const diagnostic = stderr.toString("utf8").trim();
				throw new Error(`Codex node exec-server exited (code ${outcome.code ?? "none"}, signal ${outcome.signal ?? "none"})${diagnostic ? `: ${diagnostic}` : "."}`);
			} finally {
				await owner.terminate();
				params.activeProcesses.delete(owner.terminate);
				await Promise.allSettled([output, ...writes ? [writes] : []]);
			}
		});
	} finally {
		io.signal.removeEventListener("abort", onAbort);
	}
}
//#endregion
export { runCodexNodeExecServer };
