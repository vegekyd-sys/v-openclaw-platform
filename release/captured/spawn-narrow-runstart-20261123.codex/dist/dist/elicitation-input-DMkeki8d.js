import { agentHarnessStructuredInput } from "openclaw/plugin-sdk/agent-harness-runtime";
//#region extensions/codex/src/app-server/elicitation-input.ts
/** Snapshots and compiles ordinary Codex input before it enters the per-turn queue. */
function compileCodexOrdinaryElicitation(params) {
	if (readRawOwnString(params.value, "threadId") !== params.threadId) return { kind: "ignored" };
	const snapshot = agentHarnessStructuredInput.snapshot(params.value);
	if (!agentHarnessStructuredInput.isRecord(snapshot)) return {
		kind: "compiled",
		input: {
			kind: "unsupported",
			message: "OpenClaw declined a malformed or over-limit MCP elicitation request."
		}
	};
	const requestTurnId = readValue(snapshot, "turnId");
	if (typeof requestTurnId === "string" && requestTurnId !== params.turnId) return { kind: "ignored" };
	if (requestTurnId !== null && typeof requestTurnId !== "string") return {
		kind: "compiled",
		input: {
			kind: "unsupported",
			message: "OpenClaw declined an MCP elicitation with invalid turn correlation."
		}
	};
	const mode = readCodexElicitationString(snapshot, "mode");
	if (mode === "url") return {
		kind: "compiled",
		input: agentHarnessStructuredInput.compileUrl({
			url: readValue(snapshot, "url"),
			elicitationId: readValue(snapshot, "elicitationId"),
			message: readValue(snapshot, "message"),
			fallbackMessage: "Codex provided a URL",
			protocolName: "MCP"
		})
	};
	if (mode !== "form" && mode !== "openai/form") return {
		kind: "compiled",
		input: {
			kind: "unsupported",
			message: `OpenClaw does not support MCP elicitation mode ${JSON.stringify(mode ?? "unknown")}.`
		}
	};
	return {
		kind: "compiled",
		input: agentHarnessStructuredInput.compileForm({
			schema: readValue(snapshot, "requestedSchema"),
			message: readCodexElicitationString(snapshot, "message"),
			fallbackMessage: "Codex needs input",
			options: {
				protocolName: mode === "openai/form" ? "OpenAI" : "MCP",
				allowEmptyForm: true,
				minimumChoiceCount: 1,
				allowEnumNames: true,
				allowImagePicker: mode === "openai/form",
				metadata: { secretPath: ["isSecret"] }
			}
		})
	};
}
function readValue(record, key) {
	return Object.hasOwn(record, key) ? record[key] : void 0;
}
function readCodexElicitationString(record, key) {
	const value = readValue(record, key);
	return typeof value === "string" ? value : void 0;
}
function readRawOwnString(value, key) {
	if (!value || typeof value !== "object" || Array.isArray(value)) return;
	const descriptor = Object.getOwnPropertyDescriptor(value, key);
	return descriptor && "value" in descriptor && typeof descriptor.value === "string" ? descriptor.value : void 0;
}
//#endregion
export { compileCodexOrdinaryElicitation };
