// v-meeting-bridge: V in a Feishu meeting as the same V as in the chat that brought it there.
// Gateway process: a service that owns every meeting (core/manager.js), keeps them on disk and
// resumes them after a restart, plus vmeeting.* Gateway methods. Every process (Gateway and Worker
// children) registers the meeting_* tools; outside the Gateway they call the methods over RPC.
import path from "node:path";

import { callGatewayFromCli } from "openclaw/plugin-sdk/gateway-runtime";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { DEFAULT_TIMING } from "./core/bridge.js";
import { createLarkCli } from "./core/lark.js";
import { Manager, createTurnRunner } from "./core/manager.js";
import { Store } from "./core/store.js";

const HOST_KEY = Symbol.for("openclaw.v.meetingBridge.manager");
const WORKER_CHILD_ENV = "VLAB_WORKER_CHILD";

export const METHODS = Object.freeze({
  start: "vmeeting.start",
  say: "vmeeting.say",
  screenshot: "vmeeting.screenshot",
  stop: "vmeeting.stop",
  list: "vmeeting.list",
});
const METHOD_SCOPES = Object.freeze({
  [METHODS.start]: "operator.write",
  [METHODS.say]: "operator.write",
  [METHODS.screenshot]: "operator.write",
  [METHODS.stop]: "operator.write",
  [METHODS.list]: "operator.read",
});

const textResult = (value) => ({ content: [{ type: "text", text: JSON.stringify(value, null, 2) }] });

function resolveConfig(raw = {}) {
  const timing = {};
  for (const key of Object.keys(DEFAULT_TIMING)) if (Number.isFinite(raw.timing?.[key])) timing[key] = raw.timing[key];
  return {
    larkCli: { bin: raw.larkCli?.bin || "lark-cli", profile: raw.larkCli?.profile || undefined },
    timing,
    progressEmoji: raw.progressEmoji || "OnIt",
    storeDir: raw.storeDir || null,
    runTimeoutMs: Number.isFinite(raw.runTimeoutMs) ? raw.runTimeoutMs : 15 * 60_000,
  };
}

/** The chat a tool call came from: where the mirrored replies and the brief go. */
function deliveryOf(context) {
  const dc = context?.deliveryContext;
  if (dc?.channel && dc?.to) return { channel: dc.channel, to: dc.to, ...(dc.accountId ? { accountId: dc.accountId } : {}), ...(dc.threadId ? { threadId: dc.threadId } : {}) };
  return null;
}

async function call(method, params, context) {
  const local = globalThis[HOST_KEY];
  if (local) return dispatch(local, method, params);
  const config = context?.getRuntimeConfig?.() ?? context?.runtimeConfig ?? context?.config ?? {};
  return callGatewayFromCli(method, { config }, params, { scopes: [METHOD_SCOPES[method]], progress: false, timeoutMs: 60_000 });
}

async function dispatch(manager, method, p) {
  switch (method) {
    case METHODS.start: return manager.start(p);
    case METHODS.say: return manager.say(p);
    case METHODS.screenshot: return manager.screenshot(p);
    case METHODS.stop: return manager.stop(p);
    case METHODS.list: return { meetings: manager.list() };
    default: throw new Error(`unknown method ${method}`);
  }
}

export default definePluginEntry({
  id: "v-meeting-bridge",
  name: "V Meeting Bridge",
  description: "V joins a Feishu meeting from a chat, hears subtitles and meeting chat, and answers as the full V in the meeting chat and in that chat.",
  register(api) {
    const config = resolveConfig(api.pluginConfig ?? {});
    const inWorker = process.env[WORKER_CHILD_ENV] === "1";

    api.registerTool?.((context) => ({
      name: "meeting_join",
      label: "Join Feishu Meeting",
      description:
        "Join a Feishu video meeting as V (app identity) and stay in it: V then reads the meeting's subtitles and chat, and you get them here as turns, answering in the meeting chat (mirrored to this conversation). Use only when someone asks V to join a meeting and gives the 9-digit meeting number. The host must have turned on AI notes (AI 纪要) and 'allow agents to join' (允许智能体入会). Returns status listening once in; status joining means the meeting is not ready yet and V keeps trying for waitMinutes, then says so in this chat.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          meetingNumber: { type: "string", description: "9-digit Feishu meeting number (spaces allowed)" },
          waitMinutes: { type: "number", description: "Keep retrying this long if the meeting has not started or agents are not allowed yet (default 15, 0 = try once)" },
        },
        required: ["meetingNumber"],
      },
      async execute(_id, params) {
        if (!context?.sessionKey) throw new Error("meeting_join needs a conversation session");
        const res = await call(METHODS.start, {
          meetingNumber: params.meetingNumber, waitMinutes: params.waitMinutes,
          sessionKey: context.sessionKey, agentId: context.agentId, delivery: deliveryOf(context), workspaceDir: context.workspaceDir,
        }, context);
        return textResult(res);
      },
    }), { name: "meeting_join" });

    api.registerTool?.((context) => ({
      name: "meeting_say",
      label: "Say In Meeting",
      description:
        "Post a short line into the meeting this conversation is in (and mirror it here). Use it during a meeting turn before work that takes more than a few seconds, e.g. '我去翻一下最近合入的 PR', so people know V is on it; the final answer is still your normal reply. Only works while this conversation is in a meeting.",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: { text: { type: "string", description: "What to say, short and spoken-style" } },
        required: ["text"],
      },
      async execute(_id, params) {
        return textResult(await call(METHODS.say, { sessionKey: context?.sessionKey, text: params.text }, context));
      },
    }), { name: "meeting_say" });

    api.registerTool?.((context) => ({
      name: "meeting_screenshot",
      label: "Meeting Screenshot",
      description:
        "Capture what the meeting currently shows (shared screen, whiteboard, or video) as a JPEG and return its path; then look at it with your image tool. Use when people refer to something on screen. Only works while this conversation is in a meeting.",
      parameters: { type: "object", additionalProperties: false, properties: {} },
      async execute() {
        return textResult(await call(METHODS.screenshot, { sessionKey: context?.sessionKey }, context));
      },
    }), { name: "meeting_screenshot" });

    api.registerTool?.((context) => ({
      name: "meeting_leave",
      label: "Leave Meeting",
      description: "Leave the meeting this conversation is in and stop listening. The brief of the meeting follows in this chat a little later. Use when asked to leave, or when the meeting is over for V.",
      parameters: { type: "object", additionalProperties: false, properties: {} },
      async execute() {
        return textResult(await call(METHODS.stop, { sessionKey: context?.sessionKey, leave: true }, context));
      },
    }), { name: "meeting_leave" });

    if (inWorker) return;

    for (const method of Object.values(METHODS)) {
      api.registerGatewayMethod?.(method, async ({ params, respond }) => {
        const manager = globalThis[HOST_KEY];
        if (!manager) return respond(false, undefined, { code: "UNAVAILABLE", message: "v-meeting-bridge is not running" });
        try {
          respond(true, await dispatch(manager, method, params ?? {}));
        } catch (err) {
          respond(false, undefined, { code: "INVALID_REQUEST", message: String(err?.message ?? err) });
        }
      }, { scope: METHOD_SCOPES[method] });
    }

    api.registerService?.({
      id: "v-meeting-bridge",
      async start(ctx) {
        if (globalThis[HOST_KEY]) return;
        const logger = ctx?.logger ?? api.logger;
        const runtime = api.runtime ?? {};
        const getConfig = () => ctx?.config ?? api.config ?? {};
        if (typeof runtime.subagent?.run !== "function") {
          logger?.error?.("v-meeting-bridge: runtime.subagent unavailable; not starting");
          return;
        }
        const stateDir = ctx?.stateDir ?? process.env.OPENCLAW_STATE_DIR;
        const dir = config.storeDir ?? (stateDir ? path.join(stateDir, "v-meeting-bridge", "meetings") : null);
        if (!dir) {
          logger?.error?.("v-meeting-bridge: no state dir; not starting");
          return;
        }
        const store = await new Store(dir).init();
        const manager = new Manager({
          store, logger, timing: config.timing, progressEmoji: config.progressEmoji,
          lark: createLarkCli(config.larkCli),
          runTurn: createTurnRunner(runtime.subagent, { runTimeoutMs: config.runTimeoutMs }),
          async postGroup(delivery, text) {
            const adapter = await runtime.channel?.outbound?.loadAdapter?.(delivery.channel);
            if (typeof adapter?.sendText !== "function") throw new Error(`${delivery.channel} has no outbound sendText`);
            await adapter.sendText({ cfg: getConfig(), to: delivery.to, text, ...(delivery.accountId ? { accountId: delivery.accountId } : {}), ...(delivery.threadId ? { threadId: delivery.threadId } : {}) });
          },
          defaultWorkspaceDir(agentId) {
            try { return agentId ? runtime.agent?.resolveAgentWorkspaceDir?.(getConfig(), agentId) ?? null : null; } catch { return null; }
          },
        });
        globalThis[HOST_KEY] = manager;
        const resumed = await manager.recover().catch((err) => { logger?.error?.(`v-meeting-bridge: recovery failed: ${err?.stack ?? err}`); return 0; });
        logger?.info?.(`v-meeting-bridge started (store ${dir}, resumed ${resumed})`);
      },
      async stop() {
        const manager = globalThis[HOST_KEY];
        globalThis[HOST_KEY] = undefined;
        await manager?.shutdown();
      },
    });
  },
});
