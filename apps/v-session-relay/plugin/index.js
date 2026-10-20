// v-session-relay 2.0 (docs/inter-session/design.md §3.10, §13): the Gateway-side ledger and
// engine behind the core's sessions_send. No tool of its own; the core patch calls vrelay.send.
// In Worker children (VLAB_WORKER_CHILD=1) it registers nothing, or only the poll guard when
// config.workerGuard is true. register() may run several times per process; core/host.js keeps
// one engine per process.
import { onAgentEvent, resolveActiveEmbeddedRunSessionId } from "openclaw/plugin-sdk/agent-harness-runtime";
import { callGatewayFromCli } from "openclaw/plugin-sdk/gateway-runtime";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { getHost } from "./core/host.js";

const host = getHost({ sdk: { onAgentEvent, resolveActiveEmbeddedRunSessionId, callGatewayFromCli } });
// A host created before the SDK was at hand (tests, another copy of the module) learns it now.
host.sdk = { onAgentEvent, resolveActiveEmbeddedRunSessionId, callGatewayFromCli, ...host.sdk };

// Config validation uses openclaw.plugin.json's configSchema (= contracts CONFIG_SCHEMA).
export default definePluginEntry({
  id: "v-session-relay",
  name: "V Session Relay",
  description: "Gateway ledger for sessions_send: visible requests in the target chat, one hand-back per batch, restart recovery and loop limits.",
  register(api) {
    host.register(api);
  },
});
