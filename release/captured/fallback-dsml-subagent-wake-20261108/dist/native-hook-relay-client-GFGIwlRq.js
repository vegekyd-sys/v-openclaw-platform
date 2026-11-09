import { l as toErrorObject } from "./error-coercion-CwcmpTBO.js";
import { i as truncateWithMarker, r as truncateUtf16Safe } from "./utf16-slice-D_ngcYKd.js";
// cli-startup-fast: the locator read below uses node:sqlite directly.
import { o as OPENCLAW_SQLITE_BUSY_TIMEOUT_MS } from "./openclaw-state-db-contract-CsSSYjX0.js";
import { o as resolveOpenClawStateSqlitePath } from "./openclaw-state-db.paths-Dwj4ZWNN.js";
import { i as isPidDefinitelyDead } from "./pid-alive-lAl8ESlJ.js";
import path from "node:path";
import { request } from "node:http";
//#region src/agents/harness/native-hook-relay-bridge-record.ts
/** Validate and convert a persisted native relay locator row. */
function readNativeHookRelayBridgeRecordRow(row) {
	if (!row || typeof row.relay_id !== "string" || row.relay_id.length === 0 || !Number.isSafeInteger(row.pid) || row.hostname !== "127.0.0.1" || !Number.isSafeInteger(row.port) || Number(row.port) <= 0 || Number(row.port) > 65535 || typeof row.token !== "string" || row.token.length === 0 || !Number.isSafeInteger(row.expires_at_ms)) return;
	return {
		relayId: row.relay_id,
		pid: Number(row.pid),
		hostname: row.hostname,
		port: Number(row.port),
		token: row.token,
		expiresAtMs: Number(row.expires_at_ms)
	};
}
//#endregion
//#region src/agents/harness/native-hook-relay-client-store.ts
/** Read one native relay locator without loading the shared-state writer lifecycle. */
function readNativeHookRelayClientBridgeRecord(params) {
	const pathname = path.resolve(params.stateDbPath ?? resolveOpenClawStateSqlitePath());
	const { DatabaseSync } = process.getBuiltinModule("node:sqlite");
	const db = new DatabaseSync(pathname, { readOnly: true });
	try {
		db.exec(`PRAGMA busy_timeout = ${OPENCLAW_SQLITE_BUSY_TIMEOUT_MS};`);
		const userVersion = Number(db.prepare("PRAGMA user_version").get()?.user_version ?? 0);
		if (userVersion > 15) throw new Error(`OpenClaw state database ${pathname} has schema version ${userVersion}; this build supports up to 15`);
		return readNativeHookRelayBridgeRecordRow(db.prepare("SELECT * FROM native_hook_relay_bridges WHERE relay_id = ?").get(params.relayId));
	} finally {
		db.close();
	}
}
//#endregion
//#region src/agents/harness/native-hook-relay-constants.ts
const DEFAULT_RELAY_TIMEOUT_MS = 5e3;
//#endregion
//#region src/agents/harness/native-hook-relay-response-codec.ts
/** Render the native Codex hook responses shared by server and cold client paths. */
const codexNativeHookRelayResponseCodec = {
	renderNoopResponse() {
		return {
			stdout: "",
			stderr: "",
			exitCode: 0
		};
	},
	renderPreToolUseBlockResponse(reason, failureDisposition) {
		return {
			stdout: `${JSON.stringify({ hookSpecificOutput: {
				hookEventName: "PreToolUse",
				permissionDecision: "deny",
				permissionDecisionReason: reason
			} })}\n`,
			stderr: "",
			exitCode: 0,
			...failureDisposition ? { failureDisposition } : {}
		};
	},
	renderPermissionDecisionResponse(decision, message) {
		return {
			stdout: `${JSON.stringify({ hookSpecificOutput: {
				hookEventName: "PermissionRequest",
				decision: decision === "allow" ? { behavior: "allow" } : {
					behavior: "deny",
					message: message?.trim() || "Denied by OpenClaw"
				}
			} })}\n`,
			stderr: "",
			exitCode: 0
		};
	}
};
//#endregion
//#region src/agents/harness/native-hook-relay-utils.ts
const MAX_NATIVE_HOOK_RELAY_JSON_DEPTH = 64;
const MAX_NATIVE_HOOK_RELAY_JSON_NODES = 2e4;
const MAX_NATIVE_HOOK_RELAY_STRING_LENGTH = 1e6;
const MAX_NATIVE_HOOK_RELAY_TOTAL_STRING_LENGTH = 4e6;
const MAX_NATIVE_HOOK_RELAY_HISTORY_STRING_LENGTH = 4e3;
const MAX_NATIVE_HOOK_RELAY_HISTORY_TOTAL_STRING_LENGTH = 2e4;
const MAX_NATIVE_HOOK_RELAY_HISTORY_ARRAY_ITEMS = 50;
const MAX_NATIVE_HOOK_RELAY_HISTORY_OBJECT_KEYS = 50;
function normalizePositiveInteger(value, fallback) {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : fallback;
}
function normalizeOptionalPositiveInteger(value) {
	return typeof value === "number" && Number.isFinite(value) && value > 0 ? Math.floor(value) : void 0;
}
function shellQuoteArgs(args) {
	return args.map((arg) => shellQuoteArg(arg, process.platform)).join(" ");
}
function shellQuoteArg(value, platform) {
	if (/^[A-Za-z0-9_/:=.,@%+-]+$/.test(value)) return value;
	if (platform === "win32") return `"${value.replaceAll("\"", "\\\"")}"`;
	return `'${value.replaceAll("'", "'\\''")}'`;
}
function readNativeHookRelayProvider(value) {
	if (value === "codex") return value;
	throw new Error("unsupported native hook relay provider");
}
function readNativeHookRelayEvent(value) {
	if (value === "pre_tool_use" || value === "post_tool_use" || value === "permission_request" || value === "before_agent_finalize") return value;
	throw new Error("unsupported native hook relay event");
}
function readNonEmptyString(value, name) {
	if (typeof value === "string" && value.trim()) return value.trim();
	throw new Error(`native hook relay ${name} is required`);
}
function readOptionalBoolean(value) {
	return typeof value === "boolean" ? value : void 0;
}
function isJsonValue(value) {
	const stack = [{
		value,
		depth: 0
	}];
	let nodes = 0;
	let totalStringLength = 0;
	while (stack.length) {
		const current = stack.pop();
		nodes += 1;
		if (nodes > MAX_NATIVE_HOOK_RELAY_JSON_NODES || current.depth > MAX_NATIVE_HOOK_RELAY_JSON_DEPTH) return false;
		if (current.value === null) continue;
		if (typeof current.value === "string") {
			if (current.value.length > MAX_NATIVE_HOOK_RELAY_STRING_LENGTH) return false;
			totalStringLength += current.value.length;
			if (totalStringLength > MAX_NATIVE_HOOK_RELAY_TOTAL_STRING_LENGTH) return false;
			continue;
		}
		if (typeof current.value === "number") {
			if (!Number.isFinite(current.value)) return false;
			continue;
		}
		if (typeof current.value === "boolean") continue;
		if (Array.isArray(current.value)) {
			for (const item of current.value) {
				if (nodes + stack.length + 1 > MAX_NATIVE_HOOK_RELAY_JSON_NODES) return false;
				stack.push({
					value: item,
					depth: current.depth + 1
				});
			}
			continue;
		}
		if (!isJsonObject(current.value)) return false;
		try {
			for (const key in current.value) {
				if (!Object.hasOwn(current.value, key)) continue;
				if (key.length > MAX_NATIVE_HOOK_RELAY_STRING_LENGTH) return false;
				totalStringLength += key.length;
				if (totalStringLength > MAX_NATIVE_HOOK_RELAY_TOTAL_STRING_LENGTH) return false;
				if (nodes + stack.length + 1 > MAX_NATIVE_HOOK_RELAY_JSON_NODES) return false;
				stack.push({
					value: current.value[key],
					depth: current.depth + 1
				});
			}
		} catch {
			return false;
		}
	}
	return true;
}
function isJsonObject(value) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return false;
	try {
		const prototype = Object.getPrototypeOf(value);
		return prototype === Object.prototype || prototype === null;
	} catch {
		return false;
	}
}
function snapshotNativeHookRelayPayload(payload) {
	return snapshotJsonValue(payload, { remainingStringLength: MAX_NATIVE_HOOK_RELAY_HISTORY_TOTAL_STRING_LENGTH });
}
function snapshotJsonValue(value, state) {
	if (value === null || typeof value === "number" || typeof value === "boolean") return value;
	if (typeof value === "string") return snapshotString(value, state);
	if (Array.isArray(value)) {
		const items = value.slice(0, MAX_NATIVE_HOOK_RELAY_HISTORY_ARRAY_ITEMS).map((item) => snapshotJsonValue(item, state));
		if (value.length > MAX_NATIVE_HOOK_RELAY_HISTORY_ARRAY_ITEMS) items.push("[truncated]");
		return items;
	}
	const snapshot = {};
	const keys = Object.keys(value);
	for (const key of keys.slice(0, MAX_NATIVE_HOOK_RELAY_HISTORY_OBJECT_KEYS)) {
		const item = value[key];
		if (item !== void 0) snapshot[snapshotString(key, state)] = snapshotJsonValue(item, state);
	}
	if (keys.length > MAX_NATIVE_HOOK_RELAY_HISTORY_OBJECT_KEYS) snapshot["[truncated]"] = keys.length - MAX_NATIVE_HOOK_RELAY_HISTORY_OBJECT_KEYS;
	return snapshot;
}
function snapshotString(value, state) {
	if (state.remainingStringLength <= 0) return "[truncated]";
	const limit = Math.min(value.length, MAX_NATIVE_HOOK_RELAY_HISTORY_STRING_LENGTH, state.remainingStringLength);
	if (limit >= value.length) {
		state.remainingStringLength -= limit;
		return value;
	}
	const prefix = truncateUtf16Safe(value, limit);
	state.remainingStringLength -= prefix.length;
	return `${prefix}...[truncated]`;
}
function truncateRelayText(value, maxLength) {
	return truncateWithMarker(value, maxLength, {
		marker: "...",
		reserve: 3,
		trimEnd: false
	});
}
//#endregion
//#region src/agents/harness/native-hook-relay-client.ts
const MAX_NATIVE_HOOK_BRIDGE_RESPONSE_BYTES = 5e6;
const NATIVE_HOOK_BRIDGE_RETRY_INTERVAL_MS = 25;
const NATIVE_HOOK_RELAY_BRIDGE_STALE_REGISTRATION_ERROR = "native hook relay bridge stale registration";
/** Invoke a registered native relay through its read-only SQLite locator. */
async function invokeNativeHookRelayBridge(params) {
	const provider = readNativeHookRelayProvider(params.provider);
	const relayId = readNonEmptyString(params.relayId, "relayId");
	const event = readNativeHookRelayEvent(params.event);
	const timeoutMs = normalizePositiveInteger(params.timeoutMs, DEFAULT_RELAY_TIMEOUT_MS);
	const registrationTimeoutMs = normalizePositiveInteger(params.registrationTimeoutMs, timeoutMs);
	const startedAt = Date.now();
	let lastError = /* @__PURE__ */ new Error("native hook relay bridge not found");
	while (Date.now() - startedAt < timeoutMs) try {
		const record = readNativeHookRelayClientBridgeRecord({
			relayId,
			stateDbPath: params.stateDbPath
		});
		if (!record) throw new Error("native hook relay bridge not found");
		if (isPidDefinitelyDead(record.pid)) throw new Error("native hook relay bridge not found");
		if (Date.now() > record.expiresAtMs) throw new Error("native hook relay bridge expired");
		return await postNativeHookRelayBridgeRecord({
			record,
			timeoutMs: Math.max(1, timeoutMs - (Date.now() - startedAt)),
			payload: {
				provider,
				relayId,
				event,
				generation: params.generation,
				rawPayload: params.rawPayload
			}
		});
	} catch (error) {
		lastError = error;
		const elapsedMs = Date.now() - startedAt;
		if (error instanceof Error && error.message === "native hook relay bridge not found" && elapsedMs >= registrationTimeoutMs) break;
		if (!isRetryableNativeHookRelayBridgeLookupError({
			error,
			elapsedMs
		})) break;
		await delay(Math.min(NATIVE_HOOK_BRIDGE_RETRY_INTERVAL_MS, timeoutMs - elapsedMs));
	}
	throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
function postNativeHookRelayBridgeRecord(params) {
	const body = JSON.stringify(params.payload);
	return new Promise((resolve, reject) => {
		let settled = false;
		const resolveOnce = (value) => {
			if (!settled) {
				settled = true;
				resolve(value);
			}
		};
		const rejectOnce = (error) => {
			if (!settled) {
				settled = true;
				reject(toErrorObject(error, "Non-Error rejection"));
			}
		};
		const req = request({
			hostname: params.record.hostname,
			method: "POST",
			path: "/invoke",
			port: params.record.port,
			timeout: params.timeoutMs,
			headers: {
				authorization: `Bearer ${params.record.token}`,
				"content-type": "application/json",
				"content-length": Buffer.byteLength(body)
			}
		}, (res) => {
			let responseText = "";
			let responseBytes = 0;
			res.setEncoding("utf8");
			res.on("data", (chunk) => {
				const chunkText = typeof chunk === "string" ? chunk : String(chunk);
				responseBytes += Buffer.byteLength(chunkText);
				if (responseBytes > MAX_NATIVE_HOOK_BRIDGE_RESPONSE_BYTES) {
					rejectOnce(/* @__PURE__ */ new Error("native hook relay bridge response too large"));
					res.destroy();
					return;
				}
				responseText += chunkText;
			});
			res.on("error", rejectOnce);
			res.on("end", () => {
				if (settled) return;
				try {
					const parsed = JSON.parse(responseText);
					if (parsed.ok) {
						resolveOnce(parsed.result);
						return;
					}
					rejectOnce(new Error(parsed.error || "native hook relay bridge failed"));
				} catch (error) {
					rejectOnce(error);
				}
			});
		});
		req.on("timeout", () => {
			req.destroy(/* @__PURE__ */ new Error("native hook relay bridge timed out"));
		});
		req.on("error", rejectOnce);
		req.end(body);
	});
}
function isRetryableNativeHookRelayBridgeError(error) {
	const code = error.code;
	return code === "ENOENT" || code === "ECONNREFUSED" || code === "EAGAIN" || error instanceof Error && error.message === "native hook relay bridge not found";
}
function isRetryableNativeHookRelayBridgeLookupError(params) {
	return isRetryableNativeHookRelayBridgeError(params.error) || params.elapsedMs < 250 && isNativeHookRelayBridgeStaleRegistrationError(params.error);
}
/** Detect a stale locator response that must not fall back to the Gateway. */
function isNativeHookRelayBridgeStaleRegistrationError(error) {
	return error instanceof Error && error.message === "native hook relay bridge stale registration";
}
/** Render the provider response used when both relay transports are unavailable. */
function renderNativeHookRelayUnavailableResponse(params) {
	readNativeHookRelayProvider(params.provider);
	const event = readNativeHookRelayEvent(params.event);
	const message = params.message?.trim() || "Native hook relay unavailable";
	if (event === "pre_tool_use") {
		if (params.preToolUseUnavailable === "noop") return codexNativeHookRelayResponseCodec.renderNoopResponse();
		return codexNativeHookRelayResponseCodec.renderPreToolUseBlockResponse(message);
	}
	if (event === "permission_request") return codexNativeHookRelayResponseCodec.renderPermissionDecisionResponse("deny", message);
	return codexNativeHookRelayResponseCodec.renderNoopResponse();
}
function delay(ms) {
	return new Promise((resolve) => {
		setTimeout(resolve, Math.max(0, ms));
	});
}
//#endregion
export { codexNativeHookRelayResponseCodec as _, renderNativeHookRelayUnavailableResponse as a, normalizeOptionalPositiveInteger as c, readNativeHookRelayProvider as d, readNonEmptyString as f, truncateRelayText as g, snapshotNativeHookRelayPayload as h, isRetryableNativeHookRelayBridgeLookupError as i, normalizePositiveInteger as l, shellQuoteArgs as m, invokeNativeHookRelayBridge as n, isJsonObject as o, readOptionalBoolean as p, isNativeHookRelayBridgeStaleRegistrationError as r, isJsonValue as s, NATIVE_HOOK_RELAY_BRIDGE_STALE_REGISTRATION_ERROR as t, readNativeHookRelayEvent as u, DEFAULT_RELAY_TIMEOUT_MS as v, readNativeHookRelayBridgeRecordRow as y };
