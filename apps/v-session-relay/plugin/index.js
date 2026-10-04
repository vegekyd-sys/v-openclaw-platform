import path from "node:path";
import { Type } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { RelayDispatcher } from "./core/dispatcher.js";
import { feishuClients } from "./core/feishu.js";
import { decideSend, ownerList, resolveTrustedActor } from "./core/policy.js";
import { labelForSession, resolveTarget } from "./core/sessions.js";
import { RelayStore } from "./core/store.js";
import { sentInstruction } from "./core/text.js";

function textResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

function storeDir(config) {
  if (typeof config.storeDir === "string" && config.storeDir) {
    return config.storeDir;
  }
  const state = process.env.OPENCLAW_STATE_DIR;
  if (!state) {
    throw new Error("v-session-relay: set storeDir (no OPENCLAW_STATE_DIR in this process)");
  }
  return path.join(state, "v-session-relay");
}

export default definePluginEntry({
  id: "v-session-relay",
  name: "V Session Relay",
  description: "Lets the owner have V hand work to another conversation and get the result back here.",
  register(api) {
    const config = api.pluginConfig ?? {};
    const store = new RelayStore(storeDir(config));
    const feishuFor = feishuClients();
    const maxChain = config.maxChain ?? 8;
    const ownerName = config.ownerName ?? "Tianyi";

    api.registerTool(
      (context) => ({
        name: "session_relay_send",
        label: "Session Relay Send",
        description:
          "Hand a task to another V conversation (a Feishu group, a task room, or another session) and get its answer back here later. " +
          "Use when the user asks you to have another group/room/session do, continue or report on something there, with that conversation's own context. " +
          "The other conversation sees a small 「消息来自」 note and works on it in its own chat; when it finishes, its reply comes back to this conversation as a new message and wakes you to continue. " +
          "target is the group's name as people call it (fuzzy match against groups V is in), a Feishu chat id (oc_…), or a session key. " +
          "After calling, tell the user in one short sentence that it has been handed over and end your turn; do not wait, poll or do the task yourself. Only the owner can relay.",
        parameters: Type.Object({
          target: Type.String({ description: "Group name, Feishu chat id (oc_…) or session key of the conversation that should do it" }),
          message: Type.String({ description: "What that conversation should do, written as the owner would say it there; include the context it lacks" }),
        }),
        async execute(_toolCallId, params) {
          const cfg = context.getRuntimeConfig?.() ?? context.runtimeConfig ?? context.config ?? {};
          const feishu = feishuFor(cfg, context.deliveryContext?.accountId);
          const owners = ownerList(config, cfg);
          const target = await resolveTarget(params.target, { cfg, feishu, fromSessionKey: context.sessionKey });
          if (target.error) {
            return textResult({ ok: false, error: target.error, ...(target.candidates ? { candidates: target.candidates } : {}) });
          }
          const sessionKey = typeof context.sessionKey === "string" ? context.sessionKey : null;
          const records = store.list();
          const actor = resolveTrustedActor(context, config);
          const decision = decideSend({ records, sessionKey, targetSessionKey: target.sessionKey, actor, owners, maxChain });
          if (!decision.allow) {
            api.logger?.info?.(`session relay denied from ${sessionKey} (actor ${actor ?? "none"}): ${decision.reason}`);
            return textResult({ ok: false, error: decision.reason });
          }
          const message = String(params.message ?? "").trim();
          if (!message) {
            return textResult({ ok: false, error: "message is empty" });
          }
          const now = Date.now();
          const id = store.newId(now);
          const fromLabel = await labelForSession(sessionKey, { cfg, feishu, ownerName, owners });
          store.write({
            id,
            chainId: decision.chainId ?? id,
            via: decision.via,
            requestedBy: actor,
            status: "queued",
            createdAt: now,
            updatedAt: now,
            from: { sessionKey, label: fromLabel },
            to: { sessionKey: target.sessionKey, label: target.label },
            message,
          });
          api.logger?.info?.(`session relay ${id} queued: ${sessionKey} -> ${target.sessionKey} (${decision.via})`);
          return textResult({ ok: true, relayId: id, to: target.label, status: "queued", instruction: sentInstruction(target.label) });
        },
      }),
      { name: "session_relay_send" },
    );

    api.registerTool(
      (context) => ({
        name: "session_relay_status",
        label: "Session Relay Status",
        description: "List work this conversation relayed to other conversations (and work relayed to it), with status: queued, running, replying, done, failed.",
        parameters: Type.Object({}),
        async execute() {
          const sessionKey = typeof context.sessionKey === "string" ? context.sessionKey : null;
          const mine = store
            .list()
            .filter((r) => r.from?.sessionKey === sessionKey || r.to?.sessionKey === sessionKey)
            .slice(-20)
            .map((r) => ({
              relayId: r.id,
              direction: r.from?.sessionKey === sessionKey ? "sent" : "received",
              with: r.from?.sessionKey === sessionKey ? r.to?.label : r.from?.label,
              status: r.status,
              message: String(r.message ?? "").slice(0, 200),
              ...(r.error ? { error: r.error } : {}),
              createdAt: new Date(r.createdAt).toISOString(),
            }));
          return textResult({ relays: mine });
        },
      }),
      { name: "session_relay_status" },
    );

    let timer = null;
    api.registerService?.({
      id: "v-session-relay-dispatcher",
      start(ctx) {
        const runtime = api.runtime?.subagent;
        if (typeof runtime?.run !== "function" || typeof runtime?.waitForRun !== "function") {
          ctx.logger?.warn?.("session relay: runtime.subagent unavailable; relays will stay queued");
          return;
        }
        const dispatcher = new RelayDispatcher({
          store,
          runtime,
          feishuFor,
          getConfig: () => ctx.config ?? api.config ?? {},
          logger: ctx.logger ?? api.logger,
          ...(config.waitSliceMs ? { waitSliceMs: config.waitSliceMs } : {}),
          ...(config.maxWaitMs ? { maxWaitMs: config.maxWaitMs } : {}),
        });
        const tick = () => {
          try {
            dispatcher.tick();
          } catch (error) {
            ctx.logger?.warn?.(`session relay tick failed: ${error.message}`);
          }
        };
        tick();
        timer = setInterval(tick, config.pollMs ?? 2_000);
        timer.unref?.();
        ctx.logger?.info?.(`session relay dispatcher started (store ${store.dir})`);
      },
      stop() {
        clearInterval(timer);
        timer = null;
      },
    });
  },
});
