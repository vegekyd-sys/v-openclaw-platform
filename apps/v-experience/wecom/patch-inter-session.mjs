// The WeCom inbound bridge of v-session-relay 2.0 (docs/inter-session/design.md §2.a,
// §3.9, §4, §7, §13), as a patch of the WeCom plugin's dist/src/monitor.js exactly as
// V runs it (release/captured/v2026.9.1-db91.6-subagent-index-20261020.wecom, which
// already carries v-experience-wecom-v2; that marker stays).
//
//   patchWeComInterSessionBridge(source) -> patched monitor.js
//
// A separate module because ./patch.mjs skips a file that already has its marker
// (patch.mjs applyAll), so it can never add anything to V's bytes.
//
// What the patch adds:
// - a bridge `wecom:<accountId>` in globalThis[Symbol.for("openclaw.v.interSessionInboundBridges")],
//   registered when the robot socket authenticates (after setWeComWebSocket) and removed
//   by the monitor's cleanup;
// - post(): the visible request as a proactive markdown message (getWeComWebSocket(acc)
//   .sendMessage), at most 1000 characters and 3800 UTF-8 bytes;
// - start(): a synthetic inbound on the chat's serial queue
//   (enqueueWeComChatTask(() => processWeComMessageNow(entry)), never the active-run lane).
//   A synthetic message has no WeCom callback req_id, so nothing in its turn may answer
//   "in reply" (aibot_respond_msg on an unknown req_id fails with 846605): the entry opens
//   no stream and sends no thinking frame, its frame is marked vFromCardEvent (the answer
//   goes out as a new markdown message, in parts of at most 3800 bytes), it never records
//   its req_id for the chat (setReqIdForChat), and it runs in the target session the relay
//   chose (SessionKey forced against dynamic routing);
// - the turn's ctx fields (InputProvenance, ChannelPromptContext as 9.1's string[],
//   CommandInterpretationSuppressed, CommandAuthorized false, SenderId/SenderName/MessageSid, in a
//   direct chat From = the chain root, VInterSession) and replyOptions (runId, vInterSession,
//   onAgentRunStart, onAgentRunTerminalOutcome);
// - the result: the final text taken from state.accumulatedText before vStop appends the
//   background line, plus the media the turn delivered; ask_user questions are not results;
// - a BUSY start (core admission guard) leaves nothing in the chat: nothing it is handed is
//   delivered, and it never takes the session's ask_user questions (the turn registers its
//   question route only when its own run starts);
// - self-echo defence: a socket message from the robot itself, or repeating a request the
//   bridge just posted in that chat, is dropped before it can become a person's message (A11).
// caps.streaming=false: WeCom cannot stream a turn that no WeCom callback started.
import fs from "node:fs";

export const MARKER = "v-wecom-inter-session-bridge-v1";
export const FILE = "monitor.js";
/** Where the file lives in the plugin directory on V (release plan target). */
export const TARGET = "extensions/wecom-openclaw-plugin/dist/src/monitor.js";

// Literals the patched file inlines; tests/patch-wecom-inter-session-bridge.test.mjs asserts
// they equal apps/v-session-relay/plugin/core/contracts.js and appear in the patched file.
export const BRIDGES_SYMBOL_KEY = "openclaw.v.interSessionInboundBridges";
export const CHANNEL = "wecom";
export const CAPS = Object.freeze({ streaming: false, replyAnchor: false, idempotentPost: false, editPost: false, maxVisibleChars: 1000, maxVisibleBytes: 3800, askUser: true, media: true });
export const RESTART_WEDGE_SOURCE = "restart recovery claim changed";
export const BUSY_REASONS = Object.freeze(["active_run", "pending_queue", "recovery_owner"]);
/** A queued start that has not begun after this long reports busy (pending_queue) and never runs. */
export const QUEUE_WAIT_MS = 600_000;
export const POST_TIMEOUT_MS = 15_000;
export const ECHO_TTL_MS = 600_000;
/** Bytes per proactive markdown part of an inter-session answer (a WeCom markdown message holds 4096). */
export const FINAL_PART_BYTES = 3800;

const HELPERS = String.raw`// v-wecom-inter-session-bridge-v1
// The WeCom inbound bridge of v-session-relay (docs/inter-session/design.md §2.a, §3.9).
// post() shows the request in the chat; start() runs a synthetic inbound through the
// normal handler on the chat's serial queue. Its turn has no WeCom callback to answer, so
// it opens no stream: the answer goes out as new markdown messages.
const V_IS_BRIDGES = Symbol.for("openclaw.v.interSessionInboundBridges");
const V_IS_CAPS = Object.freeze({ streaming: false, replyAnchor: false, idempotentPost: false, editPost: false, maxVisibleChars: 1000, maxVisibleBytes: 3800, askUser: true, media: true });
const V_IS_RESTART_WEDGE = /restart recovery claim changed/u;
const V_IS_BUSY_REASONS = ["active_run", "pending_queue", "recovery_owner"];
const V_IS_QUEUE_WAIT_MS = 600000;
const V_IS_POST_TIMEOUT_MS = 15000;
const V_IS_ECHO_TTL_MS = 600000;
const V_IS_FINAL_PART_BYTES = 3800;
const vIsPosted = new Map(); // "<accountId>:<chatId>" -> Map(text -> posted at)
function vIsRegistry() {
    globalThis[V_IS_BRIDGES] ??= { v: 1, bridges: new Map(), listeners: new Set() };
    return globalThis[V_IS_BRIDGES];
}
function vIsNotify(reg, key, bridge) {
    for (const listener of [...reg.listeners]) {
        try { listener(key, bridge); } catch { }
    }
}
function vIsRegisterBridge(bridge) {
    const reg = vIsRegistry();
    const key = bridge.channel + ":" + bridge.accountId;
    reg.bridges.set(key, bridge);
    vIsNotify(reg, key, bridge);
    return key;
}
function vIsUnregisterBridge(bridge) {
    const reg = vIsRegistry();
    const key = bridge.channel + ":" + bridge.accountId;
    if (reg.bridges.get(key) !== bridge) return false;
    reg.bridges.delete(key);
    vIsNotify(reg, key, null);
    return true;
}
function vIsBridgeError(code, message, transient) {
    const err = new Error(message);
    err.name = "BridgeError";
    err.code = code;
    err.transient = Boolean(transient);
    return err;
}
const vIsBytes = (text) => Buffer.byteLength(text, "utf8");
/** At most maxChars characters and maxBytes UTF-8 bytes; a cut text ends with "…". */
function vIsClip(text, maxChars, maxBytes) {
    const s = String(text ?? "");
    const chars = Array.from(s);
    if (chars.length <= maxChars && vIsBytes(s) <= maxBytes) return s;
    let out = "";
    let count = 1;
    let bytes = vIsBytes("…");
    for (const ch of chars) {
        const b = vIsBytes(ch);
        if (count + 1 > maxChars || bytes + b > maxBytes) break;
        out += ch;
        count += 1;
        bytes += b;
    }
    return out + "…";
}
/** Parts of at most maxBytes UTF-8 bytes, cut at line ends where a line fits. */
function vIsChunks(text, maxBytes) {
    const s = String(text ?? "");
    if (vIsBytes(s) <= maxBytes) return [s];
    const parts = [];
    let current = "";
    let currentBytes = 0;
    const flush = () => {
        if (current.trim()) parts.push(current);
        current = "";
        currentBytes = 0;
    };
    for (const line of s.split("\n")) {
        const lineBytes = vIsBytes(line);
        if (current && currentBytes + 1 + lineBytes <= maxBytes) {
            current += "\n" + line;
            currentBytes += 1 + lineBytes;
            continue;
        }
        flush();
        if (lineBytes <= maxBytes) {
            current = line;
            currentBytes = lineBytes;
            continue;
        }
        for (const ch of line) {
            const b = vIsBytes(ch);
            if (currentBytes + b > maxBytes) flush();
            current += ch;
            currentBytes += b;
        }
    }
    flush();
    return parts.length ? parts : [s];
}
/** The relay's channelPromptContext (one string) as 9.1's ChannelPromptContext (string[]). */
function vIsPromptContext(value) {
    const entries = (Array.isArray(value) ? value : [value]).filter((entry) => typeof entry === "string" && entry.trim());
    return entries.length ? entries : undefined;
}
const vIsEchoKey = (text) => String(text ?? "").replace(/\s+/gu, " ").trim();
function vIsNotePosted(accountId, chatId, text) {
    const now = Date.now();
    for (const [key, posts] of vIsPosted) {
        for (const [k, at] of posts) if (now - at >= V_IS_ECHO_TTL_MS) posts.delete(k);
        if (!posts.size) vIsPosted.delete(key);
    }
    const key = accountId + ":" + chatId;
    const posts = vIsPosted.get(key) ?? new Map();
    posts.set(vIsEchoKey(text), now);
    vIsPosted.set(key, posts);
}
/** The robot's own message, or a repeat of a request the bridge just posted in that chat. */
function vIsSelfEcho(account, frame) {
    const body = frame?.body;
    if (!body || body.vInterSession) return false;
    const from = body.from?.userid;
    if (from && ((account.botId && from === account.botId) || (body.aibotid && from === body.aibotid))) return true;
    const posts = vIsPosted.get(account.accountId + ":" + (body.chatid || from));
    const text = body.markdown?.content ?? body.text?.content;
    if (!posts || !text) return false;
    const at = posts.get(vIsEchoKey(text));
    return at !== undefined && Date.now() - at < V_IS_ECHO_TTL_MS;
}
/** WeCom group sessions carry "group" right after the channel (and account); anything else is a direct chat. */
function vIsChatTypeFromKey(sessionKey) {
    const parts = String(sessionKey ?? "").toLowerCase().split(":");
    const at = parts.indexOf("wecom");
    const scope = at >= 0 ? parts.slice(at + 1, at + 3) : parts;
    return scope.includes("group") || scope.includes("channel") ? "group" : "direct";
}
/** WeCom routes only to the session's stored delivery address (a WeCom session key is lower-cased). */
function vIsResolveRoute(accountId, q) {
    const delivery = q?.delivery ?? {};
    const noRoute = (reason) => ({ ok: false, code: "NO_ROUTE", reason });
    if (delivery.channel && String(delivery.channel).trim().toLowerCase() !== "wecom") return noRoute("the session's delivery address is on " + delivery.channel + ", not WeCom");
    if (delivery.accountId && vNormalizeAccountId(delivery.accountId) !== accountId) return noRoute("the session belongs to WeCom account " + vNormalizeAccountId(delivery.accountId));
    const to = String(delivery.to ?? "").trim();
    if (!to) return noRoute("WeCom routes only to a stored delivery address and this session has none");
    let chatId = to.replace(/^(wecom-agent|wecom|wechatwork|wework|qywx):/iu, "").trim();
    let chatType;
    if (/^(group|chat):/iu.test(chatId)) {
        chatType = "group";
        chatId = chatId.replace(/^(group|chat):/iu, "").trim();
    }
    else if (/^user:/iu.test(chatId)) {
        chatType = "direct";
        chatId = chatId.replace(/^user:/iu, "").trim();
    }
    else if (/^(party|dept|tag):/iu.test(chatId)) return noRoute(to + " is a broadcast target, not a chat");
    if (!chatId) return noRoute(to + " names no chat");
    chatType ??= vIsChatTypeFromKey(q?.sessionKey);
    return {
        ok: true,
        route: {
            channel: "wecom", accountId, to, chatId, chatType,
            ...(chatType === "direct" ? { peerId: chatId } : {}),
            humans: chatType === "group" ? "shared" : "single_peer",
        },
    };
}
/**
 * One start: what the handler reports back (run start, BUSY, result) and what the relay is told.
 * A second onAgentRunStart of the same start (the core re-running a stranded reply) changes nothing;
 * its output joins done while it is open. When the handler returns the run closes: a followup drain
 * may run a person's turn with this turn's options, and nothing that turn reports is this request's;
 * closing also retires the exclusive-admission seam, so the core admits such a reused turn like any
 * other. RunOutcome.status (same rule in every channel bridge): error when the handler failed or the
 * core reported "failed"; ok when it reported "completed"; with no terminal outcome (the core reports
 * none for an aborted run) ok only if a non-error final was delivered, else aborted. Error notices
 * (isError) go in error, never in finals.
 */
function vIsCreateRun(req) {
    let settled = false;
    let resolveOutcome;
    const outcome = new Promise((resolve) => { resolveOutcome = resolve; });
    let resolveDone;
    const done = new Promise((resolve) => { resolveDone = resolve; });
    const run = {
        req, outcome, runId: req.runId, phase: "pending", began: false, busy: false, dispatched: false,
        error: undefined, deliveryError: undefined, finalText: "", finalNoted: false, finalSent: false, media: [],
        finalCount: 0, delivered: 0, visible: false, finished: false, queueTimer: undefined,
        terminal: undefined, resultFinal: false, errorTexts: [],
    };
    const settle = (value) => {
        if (settled) return;
        settled = true;
        clearTimeout(run.queueTimer);
        resolveOutcome(value);
    };
    run.control = {
        exclusive: true, id: req.id, kind: req.kind,
        onBusy: (info) => {
            if (run.finished || run.phase !== "pending") return;
            run.phase = "busy";
            run.busy = true;
            settle({ status: "busy", reason: V_IS_BUSY_REASONS.includes(info?.reason) ? info.reason : "active_run" });
        },
    };
    /** True only for the call that starts the run. */
    run.onAgentRunStart = (runId) => {
        if (run.finished || run.phase !== "pending") return false;
        run.phase = "started";
        if (typeof runId === "string" && runId) run.runId = runId;
        settle({ status: "started", runId: run.runId, done });
        return true;
    };
    run.armQueueTimer = () => {
        run.queueTimer = setTimeout(() => {
            if (run.phase !== "pending" || run.began) return;
            run.phase = "abandoned";
            settle({ status: "busy", reason: "pending_queue" });
        }, V_IS_QUEUE_WAIT_MS);
        run.queueTimer.unref?.();
    };
    /** The core's terminal outcome of the run ("completed" | "failed"; none for an aborted run). */
    run.onTerminalOutcome = (value) => {
        if (run.finished || run.busy) return;
        if (value === "failed" || run.terminal === undefined) run.terminal = value;
    };
    run.begin = () => {
        if (run.phase !== "pending") return false;
        run.began = true;
        return true;
    };
    run.ctxFields = () => ({
        InputProvenance: req.provenance,
        // 9.1 takes ChannelPromptContext as a list of entries: appendChannelPromptContext
        // (prompt-prelude) drops anything that is not an array, so the one string is one entry.
        ChannelPromptContext: vIsPromptContext(req.channelPromptContext),
        CommandInterpretationSuppressed: true,
        SenderId: req.sender?.id,
        SenderName: req.sender?.name,
        // In a direct chat the core reads From as a sender identity too (elevated allowFrom,
        // shouldUseFromAsSenderFallback): it carries the chain root, never the chat's person, who
        // still routes the turn (To, the synthetic frame's sender).
        ...(req.route?.chatType === "direct" ? { From: "wecom:" + req.sender?.id } : {}),
        MessageSid: req.messageSid,
        VInterSession: run.control,
        ReqId: undefined,
        ResponseUrl: undefined,
        WeComFrame: undefined,
    });
    run.noteDeliver = (payload, info) => {
        if (run.finished) return;
        run.delivered += 1;
        if (info?.kind === "final") run.finalCount += 1;
        const text = typeof payload?.text === "string" ? payload.text.trim() : "";
        if (payload?.isError === true) {
            if (text) run.errorTexts.push(text);
            return;
        }
        const urls = payload?.mediaUrls?.length ? payload.mediaUrls : payload?.mediaUrl ? [payload.mediaUrl] : [];
        if (info?.kind === "final" && (text || urls.length)) run.resultFinal = true;
        for (const url of urls) if (typeof url === "string" && url && !run.media.includes(url)) run.media.push(url);
    };
    // The first call is the result: a retry after a failed final send sees the background line too.
    run.noteFinal = (text, state) => {
        if (run.finished || run.finalNoted) return;
        run.finalNoted = true;
        run.finalText = String(text ?? "");
        run.visible = Boolean(run.finalText.trim()) || Boolean(state?.hasMedia) || Boolean(state?.hasTemplateCard);
    };
    run.noteError = (err) => {
        if (run.finished) return;
        if (run.dispatched) run.deliveryError ??= err;
        else run.error ??= err;
    };
    run.finish = (err) => {
        if (run.finished) return;
        run.finished = true;
        clearTimeout(run.queueTimer);
        run.control.exclusive = false;
        const error = run.error ?? err;
        const message = error === undefined ? "" : String(error?.message ?? error);
        if (run.phase === "pending") {
            if (run.delivered > 0 || run.finalText.trim() || run.terminal !== undefined) {
                // The turn ran although no run start was reported: never report it as not started.
                run.phase = "started";
                settle({ status: "started", runId: run.runId, done });
            }
            else {
                run.phase = "rejected";
                settle(error === undefined
                    ? { status: "rejected", code: "GATED", message: "the WeCom handler returned without starting or refusing the turn", started: false }
                    : { status: "rejected", code: V_IS_RESTART_WEDGE.test(message) ? "RESTART_WEDGE" : "INTERNAL", message, started: false });
                return;
            }
        }
        if (run.phase !== "started") return;
        // The answer text (finalText also holds streamed text and error notices) is a result only when a
        // non-error final came, or the core reported the run completed.
        const text = run.finalText.trim() && (run.resultFinal || run.terminal === "completed") ? run.finalText : "";
        const finals = text || run.media.length ? [{ ...(text ? { text } : {}), ...(run.media.length ? { mediaUrls: [...run.media] } : {}) }] : [];
        const status = error !== undefined || run.terminal === "failed" ? "error" : run.terminal === "completed" || run.resultFinal ? "ok" : "aborted";
        const errorText = error !== undefined ? message : run.errorTexts.length ? run.errorTexts.join("\n") : status === "error" ? "the agent run failed" : undefined;
        resolveDone({
            status,
            finals,
            visibleReplySent: run.visible && run.finalSent,
            finalCount: run.finalCount,
            ...(errorText === undefined ? {} : { error: errorText }),
        });
    };
    return run;
}
function vCreateWeComInterSessionBridge({ account, config, runtime, wsClient }) {
    const accountId = vNormalizeAccountId(account.accountId);
    const socket = () => vGetWeComWebSocket(account.accountId) ?? wsClient;
    const rejected = (code, message) => ({ status: "rejected", code, message, started: false });
    return {
        v: 1,
        channel: "wecom",
        accountId,
        caps: { ...V_IS_CAPS },
        async resolveRoute(q) {
            return vIsResolveRoute(accountId, q);
        },
        async post(p) {
            const chatId = String(p?.route?.chatId ?? "").trim();
            if (!chatId) throw vIsBridgeError("POST_FAILED", "no WeCom chat id in the route", false);
            const ws = socket();
            if (!ws?.isConnected) throw vIsBridgeError("CHANNEL_DOWN", "the WeCom robot socket of account " + accountId + " is not connected", true);
            const content = vIsClip(p.text, V_IS_CAPS.maxVisibleChars, V_IS_CAPS.maxVisibleBytes);
            vIsNotePosted(account.accountId, chatId, content);
            let timer;
            try {
                const result = await Promise.race([
                    ws.sendMessage(chatId, { msgtype: "markdown", markdown: { content } }),
                    new Promise((_, reject) => {
                        timer = setTimeout(() => reject(vIsBridgeError("POST_FAILED", "WeCom send timed out after " + V_IS_POST_TIMEOUT_MS + " ms", true)), V_IS_POST_TIMEOUT_MS);
                        timer.unref?.();
                    }),
                ]);
                runtime.log?.("[wecom][inter-session] posted to chat=" + chatId + " key=" + (p.idempotencyKey ?? "-"));
                return { messageId: result?.headers?.req_id ?? null };
            }
            catch (err) {
                if (err?.name === "BridgeError") throw err;
                const errcode = err?.errcode;
                const detail = String(err?.errmsg ?? err?.message ?? err);
                // No errcode: the socket failed. -1 (busy) and 45009 (rate limit) are worth a retry.
                throw vIsBridgeError("POST_FAILED", "WeCom did not take the message" + (errcode === undefined ? "" : " (errcode " + errcode + ")") + ": " + detail, errcode === undefined || errcode === -1 || errcode === 45009);
            }
            finally {
                clearTimeout(timer);
            }
        },
        async start(req) {
            const route = req?.route;
            if (!route || route.channel !== "wecom" || vNormalizeAccountId(route.accountId) !== accountId) return rejected("ROUTE_MISMATCH", "not a route of WeCom account " + accountId);
            const chatId = String(route.chatId ?? "").trim();
            if (!chatId) return rejected("NO_ROUTE", "no WeCom chat id in the route");
            if (!req.sessionKey || !req.agentId || !req.runId || !req.messageSid) return rejected("INTERNAL", "incomplete inter-session start request");
            const ws = socket();
            if (!ws?.isConnected) return rejected("CHANNEL_DOWN", "the WeCom robot socket of account " + accountId + " is not connected");
            const run = vIsCreateRun(req);
            const group = route.chatType === "group";
            // A frame no WeCom callback produced: its req_id must never be answered.
            const frame = {
                cmd: "aibot_msg_callback",
                headers: { req_id: req.messageSid },
                body: {
                    msgid: req.syntheticMessageId || req.runId,
                    aibotid: account.botId,
                    chatid: chatId,
                    chattype: group ? "group" : "single",
                    from: { userid: group ? (req.routePeerId ?? req.sender?.id) : (route.peerId ?? chatId) },
                    msgtype: "text",
                    text: { content: req.promptText },
                    create_time: Math.floor(Date.now() / 1000),
                    vFromCardEvent: true,
                    vInterSession: true,
                },
            };
            const entry = {
                frame, account, config, runtime, wsClient: ws, text: req.promptText, mediaList: [], quoteContent: undefined,
                messageId: frame.body.msgid, chatId, reqId: undefined, vInterSession: run,
            };
            let queued;
            try {
                queued = enqueueWeComChatTask({ accountId: account.accountId, chatId, task: () => processWeComMessageNow(entry) });
            }
            catch (err) {
                return rejected("INTERNAL", String(err?.message ?? err));
            }
            queued.promise.then(() => run.finish(), (err) => run.finish(err));
            run.armQueueTimer();
            runtime.log?.("[wecom][inter-session] " + req.kind + " " + req.id + " attempt " + req.attempt + " " + queued.status + " for chat=" + chatId);
            return run.outcome;
        },
    };
}
`;

const EDITS = [
  {
    name: "imports",
    anchor: 'import { setWeComWebSocket, setMessageState, deleteMessageState, setReqIdForChat, warmupReqIdStore, startMessageStateCleanup, stopMessageStateCleanup, cleanupAccount, } from "./state-manager.js";\n',
    insert: "after",
    code: String.raw`import { getWeComWebSocket as vGetWeComWebSocket } from "./state-manager.js";
import { normalizeAccountId as vNormalizeAccountId } from "openclaw/plugin-sdk/account-id";
`,
  },
  {
    name: "helpers",
    anchor: 'export { sendWeComReply } from "./message-sender.js";\n',
    insert: "after",
    code: HELPERS,
  },
  {
    name: "context-signature",
    anchor: "async function buildMessageContext(frame, account, config, text, mediaList, quoteContent, runtime) {\n",
    replace: "async function buildMessageContext(frame, account, config, text, mediaList, quoteContent, runtime, vInterSession) {\n",
  },
  {
    name: "context-sender-name",
    anchor: '    const senderName = chatType === "group"\n        ? await senderNameResolver.resolve(account.accountId, body.from.userid)\n        : undefined;\n',
    replace: String.raw`    // inter-session bridge: the synthetic message names its sender itself (no directory lookup).
    const senderName = vInterSession
        ? vInterSession.req.sender?.name
        : chatType === "group"
        ? await senderNameResolver.resolve(account.accountId, body.from.userid)
        : undefined;
`,
  },
  {
    name: "context-forced-session",
    anchor: "    // ===== 动态 Agent 路由注入结束 =====\n",
    insert: "after",
    code: String.raw`    // inter-session bridge: the relay chose the target session; dynamic routing must not move it.
    if (vInterSession) {
        route.agentId = vInterSession.req.agentId;
        route.sessionKey = vInterSession.req.sessionKey;
    }
`,
  },
  {
    name: "context-command-authorized",
    anchor: "        CommandAuthorized: (await vResolveCommandAuthorization({\n",
    replace: "        CommandAuthorized: vInterSession ? false : (await vResolveCommandAuthorization({\n",
  },
  {
    name: "context-fields",
    anchor: "        ReplyToBody: quoteContent,\n    });\n    return { ctxPayload, route, storePath, chatId, chatType };\n",
    replace: String.raw`        ReplyToBody: quoteContent,
        // inter-session bridge: who asks, from where, and the admission control (design §2.a).
        ...(vInterSession ? vInterSession.ctxFields() : {}),
    });
    return { ctxPayload, route, storePath, chatId, chatType };
`,
  },
  {
    name: "final-in-parts",
    anchor: '            await wsClient.sendMessage(chatId, {\n                msgtype: "markdown",\n                markdown: { content: finishText },\n            });\n',
    replace: String.raw`            // inter-session bridge: such an answer always goes out here, and a markdown
            // message holds 4096 bytes, so a long answer goes out in parts.
            for (const vPart of frame.body?.vInterSession ? vIsChunks(finishText, V_IS_FINAL_PART_BYTES) : [finishText]) {
                await wsClient.sendMessage(chatId, {
                    msgtype: "markdown",
                    markdown: { content: vPart },
                });
            }
`,
  },
  {
    name: "dispatch-params",
    anchor: "    const { ctxPayload, route, storePath, chatId, chatType, config, account, wsClient, frame, state, runtime, onCleanup, } = params;\n",
    insert: "after",
    code: "    const vInterSession = params.vInterSession;\n",
  },
  {
    name: "dispatch-question-answerer",
    anchor: '    const vSender = frame.body?.from?.userid;\n    let vPartial = "";\n',
    replace: String.raw`    // inter-session bridge: only the chain's person (if any here) may answer a question.
    const vSender = vInterSession ? vInterSession.req.askUserAnswererId : frame.body?.from?.userid;
    let vPartial = "";
`,
  },
  {
    // The v-experience question route is the session's newest dispatcher (routes.at(-1)). A BUSY
    // attempt runs while another run of the same session is active; registering it up front would
    // take that run's ask_user questions (shown here, answerable by the wrong person).
    name: "dispatch-question-route",
    anchor: "    const vUnrouteQuestions = vExperience.onQuestionRequested(vSessionKey, (record) => vDeliverQuestionRecord(record));\n",
    replace: String.raw`    // inter-session bridge: a synthetic turn takes its session's questions only once its own run
    // started (onAgentRunStart); a BUSY attempt never takes a question of the run it waits behind.
    let vUnrouteQuestions = vInterSession ? () => { } : vExperience.onQuestionRequested(vSessionKey, (record) => vDeliverQuestionRecord(record));
    const vRouteQuestions = () => {
        if (state.vFinished) return;
        vUnrouteQuestions();
        vUnrouteQuestions = vExperience.onQuestionRequested(vSessionKey, (record) => vDeliverQuestionRecord(record));
    };
`,
  },
  {
    name: "dispatch-result-before-background-line",
    anchor: "        state.accumulatedText = vWork.finalText(state.accumulatedText);\n        const line = vExperience.currentBackgroundLine(vSessionKey);\n",
    replace: String.raw`        state.accumulatedText = vWork.finalText(state.accumulatedText);
        vInterSession?.noteFinal(state.accumulatedText, state);
        const line = vExperience.currentBackgroundLine(vSessionKey);
`,
  },
  {
    // A synthetic turn in a direct chat must not move the main session's last route to WeCom.
    name: "dispatch-last-route",
    anchor: '            updateLastRoute: chatType !== "group"\n',
    replace: '            updateLastRoute: chatType !== "group" && !vInterSession\n',
  },
  {
    name: "dispatch-reply-options",
    anchor: "            replyOptions: {\n                allowToolLifecycleWhenProgressHidden: true,\n",
    replace: String.raw`            replyOptions: {
                // inter-session bridge: the relay's preset runId, exclusive admission and run start (design §2.a).
                ...(vInterSession ? {
                    runId: vInterSession.req.runId,
                    vInterSession: vInterSession.control,
                    onAgentRunStart: (runId) => {
                        if (vInterSession.onAgentRunStart(runId)) vRouteQuestions();
                    },
                    onAgentRunTerminalOutcome: (value) => {
                        vInterSession.onTerminalOutcome(value);
                    },
                } : {}),
                allowToolLifecycleWhenProgressHidden: true,
`,
  },
  {
    name: "dispatch-deliver",
    anchor: '                    if ((info.kind === "tool" || payload?.channelData?.askUser) && await vDeliverQuestion(payload)) return;\n',
    replace: String.raw`                    // inter-session bridge: a BUSY start shows nothing, whatever the core hands over
                    // (no question, no media, no text); otherwise questions are not results.
                    if (vInterSession?.busy) return;
                    if ((info.kind === "tool" || payload?.channelData?.askUser) && await vDeliverQuestion(payload)) return;
                    vInterSession?.noteDeliver(payload, info);
`,
  },
  {
    name: "dispatch-busy",
    anchor: "        // 模板卡片检测与发送（在关闭 thinking 流之前独立处理）\n",
    insert: "before",
    code: String.raw`        // inter-session bridge: a BUSY start leaves nothing in the chat (design §4.2).
        if (vInterSession) {
            vInterSession.dispatched = true;
            if (vInterSession.busy) {
                await vStop().catch(() => { });
                safeCleanup();
                return;
            }
        }
`,
  },
  {
    name: "dispatch-final-sent",
    anchor: "        await vStop();\n        // 关闭 thinking 流\n        await finishThinkingStream(ctx);\n",
    insert: "after",
    code: "        if (vInterSession) vInterSession.finalSent = true;\n",
  },
  {
    name: "dispatch-final-sent-after-error",
    anchor: "            await vStop().catch(() => { });\n            await finishThinkingStream(ctx);\n",
    insert: "after",
    code: "            if (vInterSession) vInterSession.finalSent = true;\n",
  },
  {
    name: "dispatch-error",
    anchor: "    catch (err) {\n        runtime.error?.(`[wecom][plugin] Failed to process message: ${String(err)}`);\n",
    insert: "after",
    code: "        vInterSession?.noteError(err);\n",
  },
  {
    name: "process-entry",
    anchor: '    // Step 5: 初始化消息状态\n    setReqIdForChat(chatId, reqId, account.accountId);\n    const streamId = generateReqId("stream");\n',
    replace: String.raw`    // inter-session bridge: a synthetic message runs only while its start is still wanted, never
    // records its req_id for the chat and opens no stream (no WeCom callback to answer).
    const vInterSession = entry.vInterSession;
    if (vInterSession && !vInterSession.begin()) return;
    // Step 5: 初始化消息状态
    if (!vInterSession) setReqIdForChat(chatId, reqId, account.accountId);
    const streamId = vInterSession ? undefined : generateReqId("stream");
`,
  },
  {
    name: "process-context",
    anchor: "await buildMessageContext(frame, account, config, text, mediaList, quoteContent, runtime);\n",
    replace: "await buildMessageContext(frame, account, config, text, mediaList, quoteContent, runtime, vInterSession);\n",
  },
  {
    name: "process-dispatch",
    anchor: "            onCleanup: cleanupState,\n        });\n",
    replace: "            onCleanup: cleanupState,\n            vInterSession,\n        });\n",
  },
  {
    name: "process-error",
    anchor: "    catch (err) {\n        runtime.error?.(`[wecom][plugin] Message processing failed: ${String(err)}`);\n",
    insert: "after",
    code: "        vInterSession?.noteError(err);\n",
  },
  {
    name: "monitor-bridge",
    anchor: "            plug_version: PLUGIN_VERSION,\n        });\n",
    insert: "after",
    code: String.raw`        // inter-session bridge of this account, registered once the socket authenticates.
        const vInterSessionBridge = vCreateWeComInterSessionBridge({ account, config, runtime, wsClient });
`,
  },
  {
    name: "monitor-unregister",
    anchor: "            cleanedUp = true;\n            stopMessageStateCleanup();\n",
    replace: "            cleanedUp = true;\n            vIsUnregisterBridge(vInterSessionBridge);\n            stopMessageStateCleanup();\n",
  },
  {
    name: "monitor-register",
    anchor: "            setWeComWebSocket(account.accountId, wsClient);\n",
    insert: "after",
    code: "            vIsRegisterBridge(vInterSessionBridge);\n",
  },
  {
    name: "monitor-self-echo",
    anchor: '        wsClient.on("message", async (frame) => {\n            try {\n',
    insert: "after",
    code: String.raw`                // inter-session bridge: the robot's own posts are never a person's message (A11).
                if (vIsSelfEcho(account, frame)) {
                    runtime.log?.("[" + account.accountId + "] [inter-session] dropped the robot's own message " + (frame.body?.msgid ?? ""));
                    return;
                }
`,
  },
];

/** The anchors, each of which must occur exactly once in V's monitor.js. */
export const ANCHORS = Object.freeze(EDITS.map(({ name, anchor }) => Object.freeze({ name, anchor })));

/** Patched source of the WeCom plugin's dist/src/monitor.js, from the exact bytes V runs. */
export function patchWeComInterSessionBridge(source) {
  if (source.includes(MARKER)) throw new Error("already patched");
  let out = source;
  for (const edit of EDITS) {
    const parts = out.split(edit.anchor);
    if (parts.length !== 2) throw new Error(`wecom inter-session ${edit.name}: expected exactly one anchor, found ${parts.length - 1}`);
    const next = edit.replace ?? (edit.insert === "after" ? edit.anchor + edit.code : edit.code + edit.anchor);
    out = parts[0] + next + parts[1];
  }
  return out;
}

// node apps/v-experience/wecom/patch-inter-session.mjs <V's monitor.js> <output>
if (import.meta.url === `file://${process.argv[1]}`) {
  const [input, output] = process.argv.slice(2);
  if (!input || !output) throw new Error("usage: node patch-inter-session.mjs <input monitor.js> <output>");
  fs.writeFileSync(output, patchWeComInterSessionBridge(fs.readFileSync(input, "utf8")));
}
