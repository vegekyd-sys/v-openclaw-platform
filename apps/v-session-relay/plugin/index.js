import path from "node:path";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { RelayDispatcher } from "./core/dispatcher.js";
import { feishuClients } from "./core/feishu.js";
import { recordFromSend, targetRunIdOf } from "./core/native.js";
import { describeRequester, guardSend, ownerList } from "./core/policy.js";
import { labelForSession } from "./core/sessions.js";
import { RelayStore } from "./core/store.js";
import { TurnMarkers, interSessionSource } from "./core/turns.js";
import { STANDING_GUIDANCE, requestGuidance, resultGuidance } from "./core/text.js";

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
    const markers = new TurnMarkers(store.dir);
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
        const callId = ctx?.toolCallId ?? event.toolCallId;
        if (callId) {
          markers.put("sends", callId, { fromSessionKey: ctx?.sessionKey ?? null, fromRunId: ctx?.runId ?? null, requester: describeRequester(ctx?.requester, { ownerName }) });
        }
        const requestTurn = ctx?.runId ? markers.get("request-turns", ctx.runId) : null;
        const verdict = guardSend({ records: store.list(), runId: ctx?.runId, requestTurn, maxChain });
        if (verdict) {
          api.logger?.info?.(`session relay: blocked sessions_send from ${ctx?.sessionKey}: ${verdict.blockReason}`);
          markers.put("blocked", `${ctx?.runId}:${callId}`, { sessionKey: ctx?.sessionKey ?? null, runId: ctx?.runId ?? null });
        }
        return verdict;
      },
      { priority: 50, timeoutMs: 5_000 },
    );

    api.on("after_tool_call", async (event, ctx) => {
      // A send whose target run failed comes back as a tool error that still carries the
      // JSON result (runId, sentBeforeError); recordFromSend decides from the result.
      if (event.toolName !== "sessions_send") {
        return;
      }
      const callId = ctx?.toolCallId ?? event.toolCallId;
      const send = callId ? markers.get("sends", callId) : null;
      const record = recordFromSend({
        id: store.newId(),
        params: event.params,
        result: event.result,
        ctx: { ...ctx, sessionKey: ctx?.sessionKey ?? send?.fromSessionKey, runId: ctx?.runId ?? event.runId ?? send?.fromRunId },
        records: store.list(),
        requester: send?.requester ?? null,
      });
      if (record) {
        store.write(record);
        api.logger?.info?.(`session relay ${record.id}: following sessions_send ${record.from.sessionKey} -> ${record.to.sessionKey} run ${record.runId} (${record.status})`);
      }
    });

    // Marks the turns of an exchange and gives them a few lines on how to talk to the other V.
    api.on("before_prompt_build", async (event, ctx) => {
      const runId = ctx?.runId;
      const standing = config.guidance === false ? {} : { appendSystemContext: STANDING_GUIDANCE };
      if (!runId) {
        return standing;
      }
      const records = store.list();
      const answering = targetRunIdOf(runId);
      if (answering) {
        const record = records.find((r) => r.runId === answering);
        return record && config.guidance !== false ? { ...standing, prependContext: resultGuidance(withLabels(record)) } : standing;
      }
      const source = interSessionSource(event?.prompt);
      if (!source || source.sourceTool !== "sessions_send" || !source.sourceSession) {
        return standing;
      }
      markers.put("request-turns", runId, { sessionKey: ctx.sessionKey ?? null, sourceSession: source.sourceSession });
      if (config.guidance === false) {
        return undefined;
      }
      // The requester's record may not exist yet (inline send); its send marker does.
      const known = records.filter((r) => r.from?.sessionKey === source.sourceSession && r.to?.sessionKey === ctx.sessionKey).at(-1);
      const send = markers.latest("sends", (m) => m.fromSessionKey === source.sourceSession);
      const request = known && known.runId === runId
        ? known
        : {
            id: null,
            chainId: null,
            requester: send?.requester ?? known?.requester ?? null,
            from: { sessionKey: source.sourceSession, label: known?.from?.label ?? null },
            to: { sessionKey: ctx.sessionKey, label: known?.to?.label ?? null },
          };
      return { ...standing, prependContext: requestGuidance(withLabels(request)) };
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
        markers.prune();
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
