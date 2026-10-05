import path from "node:path";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { RelayDispatcher } from "./core/dispatcher.js";
import { feishuClients } from "./core/feishu.js";
import { recordFromSend, targetRunIdOf } from "./core/native.js";
import { describeRequester, guardSend, ownerList } from "./core/policy.js";
import { labelForSession } from "./core/sessions.js";
import { RelayStore } from "./core/store.js";
import { requestGuidance, resultGuidance } from "./core/text.js";

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

// No tool of its own: this plugin follows the native sessions_send. Hooks run wherever
// the turn runs (Gateway or worker) and only write ledger files; the Gateway-only
// service follows the runs, paints the Feishu thread cards and makes replies durable.
export default definePluginEntry({
  id: "v-session-relay",
  name: "V Session Relay",
  description: "Makes the native sessions_send visible in Feishu and durable: one thread card per exchange, the requester's closing words posted, replies survive restarts.",
  register(api) {
    const config = api.pluginConfig ?? {};
    const store = new RelayStore(storeDir(config));
    const feishuFor = feishuClients();
    const maxChain = config.maxChain ?? 8;
    const ownerName = config.ownerName ?? "Tianyi";
    const requesters = new Map(); // toolCallId -> requester context, from before_tool_call to after_tool_call
    const agentName = (sessionKey) => {
      const agentId = String(sessionKey ?? "").split(":")[1];
      return (config.agentNames && typeof config.agentNames[agentId] === "string" && config.agentNames[agentId]) || "V";
    };
    const withLabels = (record) => ({
      ...record,
      from: { ...record.from, label: record.from.label ?? record.from.sessionKey },
      to: { ...record.to, label: record.to.label ?? record.to.sessionKey },
    });

    api.on(
      "before_tool_call",
      async (event, ctx) => {
        if (event.toolName !== "sessions_send") {
          return undefined;
        }
        if (ctx?.toolCallId) {
          requesters.set(ctx.toolCallId, ctx.requester ?? null);
          setTimeout(() => requesters.delete(ctx.toolCallId), 30 * 60_000).unref?.();
        }
        const verdict = guardSend({ records: store.list(), sessionKey: ctx?.sessionKey, runId: ctx?.runId, maxChain });
        if (verdict) {
          api.logger?.info?.(`session relay: blocked sessions_send from ${ctx?.sessionKey}: ${verdict.blockReason}`);
        }
        return verdict;
      },
      { priority: 50, timeoutMs: 5_000 },
    );

    api.on("after_tool_call", async (event, ctx) => {
      if (event.toolName !== "sessions_send" || event.error) {
        return;
      }
      const callId = ctx?.toolCallId ?? event.toolCallId;
      const requester = describeRequester(requesters.get(callId), { ownerName });
      requesters.delete(callId);
      const record = recordFromSend({
        id: store.newId(),
        params: event.params,
        result: event.result,
        ctx: { ...ctx, runId: ctx?.runId ?? event.runId },
        records: store.list(),
        requester,
      });
      if (record) {
        store.write(record);
        api.logger?.info?.(`session relay ${record.id}: following sessions_send ${record.from.sessionKey} -> ${record.to.sessionKey} run ${record.runId} (${record.status})`);
      }
    });

    // The two turns of an exchange get a few lines on how to talk to the other V.
    api.on("before_prompt_build", async (_event, ctx) => {
      const runId = ctx?.runId;
      if (!runId) {
        return undefined;
      }
      const records = store.list();
      const answering = targetRunIdOf(runId);
      if (answering) {
        const record = records.find((r) => r.runId === answering);
        return record ? { prependContext: resultGuidance(withLabels(record)) } : undefined;
      }
      const request = records.find((r) => r.runId === runId && r.to?.sessionKey === ctx.sessionKey);
      return request ? { prependContext: requestGuidance(withLabels(request)) } : undefined;
    });

    let timer = null;
    api.registerService?.({
      id: "v-session-relay-follower",
      start(ctx) {
        const runtime = api.runtime?.subagent;
        if (typeof runtime?.run !== "function" || typeof runtime?.waitForRun !== "function") {
          ctx.logger?.warn?.("session relay: runtime.subagent unavailable; sessions_send will not be followed");
          return;
        }
        const getConfig = () => ctx.config ?? api.config ?? {};
        const dispatcher = new RelayDispatcher({
          store,
          runtime,
          feishuFor,
          getConfig,
          describe: async (sessionKey) => {
            const cfg = getConfig();
            return {
              label: await labelForSession(sessionKey, { cfg, feishu: feishuFor(cfg, undefined), ownerName, owners: ownerList(config, cfg) }),
              name: agentName(sessionKey),
            };
          },
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
        ctx.logger?.info?.(`session relay follower started (store ${store.dir})`);
      },
      stop() {
        clearInterval(timer);
        timer = null;
      },
    });
  },
});
