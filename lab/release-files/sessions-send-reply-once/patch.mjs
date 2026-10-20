// Backport to OpenClaw 2026.9.1 of how sessions_send returns a peer's reply in
// 2026.9.5 (wait until the target run is terminal) and 2026.9.8 (1b9e70e2685,
// "deliver sessions_send replies once"):
//   - a fire-and-forget send waits for the target run however long it takes,
//     instead of giving up after 30 s and dropping the reply;
//   - the reply reaches the requester once, as a new inter-session turn in the
//     requester session; the invisible 5-round ping-pong and the announce step
//     that posted into the target's channel are gone;
//   - an inline (waited) send already returned the reply as the tool result, so
//     nothing more is delivered.
// One deviation from 9.8: the requester's turn uses the idempotency key
// `sessions-send-result:<target runId>`, so the v-session-relay plugin can find
// it (and re-issue it after a Gateway restart without running it twice).
//
// V-only (v2, not in any upstream release): both turns are delivered through the
// session's own channel, the way a reply to a person is. The target's turn and the
// requester's wake-up turn run with `deliver: true` and automatic source replies, so
// whatever each V says, plus images and files, shows up natively in that session's
// own Feishu chat. Upstream runs both with `deliver: false` on the internal channel,
// where nobody in either chat sees them. The 9.8 drop keeps the reply-once part;
// this part has to be carried forward.
import fs from "node:fs";

export const MARKER = "v-sessions-send-reply-once-v2";
export const FILE = "sessions-spawn-tool-1FQMTkIo.js";

const STEP_ANCHOR = "\tconst stepIdem = crypto.randomUUID();\n";
const FLOW_START = "async function runSessionsSendA2AFlow(params) {\n";
// The target's turn, started by sessions_send itself.
const TARGET_SEND = "\t\t\t\t\t\tdeliver: false,\n\t\t\t\t\t\tsourceReplyDeliveryMode: \"message_tool_only\",\n\t\t\t\t\t\tchannel: INTERNAL_MESSAGE_CHANNEL,\n";
const TARGET_SEND_NATIVE = "\t\t\t\t\t\tdeliver: true,\n\t\t\t\t\t\tbestEffortDeliver: true,\n\t\t\t\t\t\tsourceReplyDeliveryMode: \"automatic\",\n";
// runAgentStep's Gateway call (the requester's wake-up turn goes through it).
const STEP_GATEWAY = "\t\t\tidempotencyKey: stepIdem,\n\t\t\tdeliver: false,\n\t\t\tsourceReplyDeliveryMode: \"message_tool_only\",\n\t\t\tchannel,\n";
const STEP_GATEWAY_NATIVE = "\t\t\tidempotencyKey: stepIdem,\n\t\t\t...params.deliver === true ? {\n\t\t\t\tdeliver: true,\n\t\t\t\tbestEffortDeliver: true,\n\t\t\t\tsourceReplyDeliveryMode: \"automatic\"\n\t\t\t} : {\n\t\t\t\tdeliver: false,\n\t\t\t\tsourceReplyDeliveryMode: \"message_tool_only\",\n\t\t\t\tchannel\n\t\t\t},\n";
const FLOW_END = "//#endregion\n//#region src/agents/tools/sessions-send-tool.ts\n";

const FLOW = `async function runSessionsSendA2AFlow(params) {
	// ${MARKER}
	const runContextId = params.waitRunId ?? "unknown";
	const gatewayCall = params.callGateway ?? callAgentToolGatewayRequest;
	try {
		const inline = Boolean(params.roundOneReply);
		let reply = params.roundOneReply;
		if (!reply && params.waitRunId) {
			const deadline = Date.now() + SESSIONS_SEND_REPLY_MAX_WAIT_MS;
			let wait;
			for (;;) {
				wait = await waitForAgentRun({
					runId: params.waitRunId,
					timeoutMs: Math.max(1e3, Math.min(6e4, deadline - Date.now())),
					callGateway: gatewayCall
				});
				const stillRunning = wait.status === "pending" || wait.status === "timeout" && wait.pendingError !== true && wait.endedAt === void 0 && !wait.stopReason && !wait.livenessState && !wait.error;
				if (!stillRunning || Date.now() >= deadline) break;
				if (wait.status === "pending") await new Promise((resolve) => setTimeout(resolve, 1e3));
			}
			if (wait.status !== "ok") {
				if (params.notifyRequesterOnWaitFailure === true && params.requesterSessionKey && isDeliveryFailureWait(wait)) {
					const error = typeof wait.error === "string" && wait.error.trim() ? \`: \${wait.error.trim()}\` : "";
					await runAgentStep({
						agentId: params.requesterAgentId,
						sessionKey: params.requesterSessionKey,
						message: \`sessions_send delivery to \${params.displayKey} failed\${error}. The target may not have received the message; retry or report the failure instead of assuming delivery succeeded.\`,
						extraSystemPrompt: "A previous sessions_send delivery failed after it was accepted. Decide whether to retry, use another route, or report the failure. Do not assume the target received the message.",
						timeoutMs: params.announceTimeoutMs,
						lane: resolveNestedAgentLaneForSession(params.requesterSessionKey),
						sourceSessionKey: params.targetSessionKey,
						sourceTool: "sessions_send",
						callGateway: gatewayCall,
						deliver: true
					});
				}
				return;
			}
			if (wait.terminalReply) reply = wait.terminalReply.disposition === "visible" ? wait.terminalReply.text : void 0;
			else {
				const latestSnapshot = await readLatestAssistantReplySnapshot({
					sessionKey: params.targetSessionKey,
					agentId: params.targetAgentId,
					stopAtTranscriptArtifact: true,
					callGateway: gatewayCall
				});
				reply = hasUpdatedAssistantReplySnapshot(latestSnapshot, params.baseline) ? latestSnapshot.text : void 0;
			}
		}
		if (!reply || isNonDeliverableSessionsReply(reply)) return;
		const sameSessionSourceReply = sameOwnedSession({
			leftKey: params.requesterSessionKey,
			leftAgentId: params.requesterAgentId,
			rightKey: params.targetSessionKey,
			rightAgentId: params.targetAgentId
		});
		if (sameSessionSourceReply) {
			// Self-sends post the output to the session's own conversation, as before.
			const announceTarget = await resolveAnnounceTarget({
				sessionKey: params.targetSessionKey,
				displayKey: params.displayKey,
				callGateway: gatewayCall,
				agentId: params.targetAgentId
			});
			const canDirectDeliver = announceTarget && (!params.requesterChannel || params.requesterChannel === announceTarget.channel);
			if (!canDirectDeliver || params.waitRunId && !params.roundOneReply && !params.baseline) return;
			await deliverAnnounceReply({
				announceTarget,
				callGateway: gatewayCall,
				message: reply,
				runContextId,
				targetSessionKey: params.targetSessionKey
			});
			return;
		}
		if (inline || !params.requesterSessionKey) return;
		await runAgentStep({
			agentId: params.requesterAgentId,
			sessionKey: params.requesterSessionKey,
			message: reply,
			extraSystemPrompt: "Another session returned the result of your earlier sessions_send request. Continue the work it was for. What you write now is posted in this conversation's own chat. This result is delivered once; your response will not be sent back to the target session.",
			timeoutMs: SESSIONS_SEND_REPLY_MAX_WAIT_MS,
			lane: resolveNestedAgentLaneForSession(params.requesterSessionKey),
			sourceAgentId: params.targetAgentId,
			sourceSessionKey: params.targetSessionKey,
			sourceTool: "sessions_send",
			callGateway: gatewayCall,
			idempotencyKey: \`sessions-send-result:\${runContextId}\`,
			deliver: true
		});
	} catch (err) {
		log$1.warn("sessions_send reply flow failed", {
			runId: runContextId,
			error: formatErrorMessage(err)
		});
	}
}
const SESSIONS_SEND_REPLY_MAX_WAIT_MS = 6 * 36e5;
`;

function once(source, anchor, label) {
  const parts = source.split(anchor);
  if (parts.length !== 2) {
    throw new Error(`${label}: expected exactly one anchor, found ${parts.length - 1}`);
  }
  return parts;
}

/** Patched source of sessions-spawn-tool-1FQMTkIo.js, from the exact bytes V runs. */
export function patchSessionsSendReplyOnce(source) {
  if (source.includes(MARKER)) {
    throw new Error("already patched");
  }
  const [beforeStep, afterStep] = once(source, STEP_ANCHOR, "runAgentStep idempotency");
  let out = `${beforeStep}\tconst stepIdem = params.idempotencyKey ?? crypto.randomUUID();\n${afterStep}`;
  const [head, rest] = once(out, FLOW_START, "runSessionsSendA2AFlow start");
  const endAt = rest.indexOf(FLOW_END);
  if (endAt < 0) {
    throw new Error("runSessionsSendA2AFlow end anchor not found");
  }
  out = `${head}${FLOW}${rest.slice(endAt)}`;
  const [beforeTarget, afterTarget] = once(out, TARGET_SEND, "sessions_send target turn");
  out = `${beforeTarget}${TARGET_SEND_NATIVE}${afterTarget}`;
  const [beforeGateway, afterGateway] = once(out, STEP_GATEWAY, "runAgentStep Gateway call");
  out = `${beforeGateway}${STEP_GATEWAY_NATIVE}${afterGateway}`;
  return out;
}

// node patch.mjs <input> <output>
if (import.meta.url === `file://${process.argv[1]}`) {
  const [input, output] = process.argv.slice(2);
  fs.writeFileSync(output, patchSessionsSendReplyOnce(fs.readFileSync(input, "utf8")));
}
