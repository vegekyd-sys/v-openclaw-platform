import { lastToolResult } from "../lib/fake-model.mjs";

// The fork must present exactly what V presents. These have no reverse control:
// stock differs from both by construction, and the comparison is V against fork.
// Temp paths and ports differ per boot, so they are normalized away.
const normalize = (value, gw) =>
  JSON.parse(
    JSON.stringify(value)
      .replaceAll(gw.workspace, "<ws>")
      .replaceAll(gw.stateDir, "<state>")
      .replaceAll(gw.dir, "<dir>")
      .replace(/targets\/(?:v|fork-c5|fork|stock)\//g, "targets/<t>/")
      .replace(/\/(?:private\/)?var\/folders\/[^"\\ ]+/g, "<tmp>")
      .replace(/\b\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(?::\d{2})?[^"\\ ]*/g, "<time>")
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>"),
  );

// The full conversation with Feishu for one scripted turn. Ids and timestamps vary,
// the order and content must not. The typing reaction repeats on a timer, so it is left out.
function feishuCalls(gw) {
  const ids = new Map();
  const stable = (text) =>
    text.replace(/\b(om_(?:in|out)_[\w]+|card_\d+)\b/g, (m) => {
      if (!ids.has(m)) ids.set(m, `<id${ids.size}>`);
      return ids.get(m);
    });
  return gw.feishu.calls
    .filter((c) => !/tenant_access_token|bot\/v[13]|contact\/v3|\/reactions/.test(c.path))
    .map((c) => stable(`${c.method} ${c.path} ${JSON.stringify(normalize(c.body, gw))}`).replace(/"uuid":"[^"]+"/g, '"uuid":"-"'));
}

const feishuScenario = (id, modelScript, message = "你好") => ({
  id: `PARITY/feishu-${id}`,
  ledger: ["feishu-sequence"],
  parity: true,
  boot: { feishu: true, modelScript },
  async run({ gw }) {
    await gw.feishuSend({ text: message });
    await gw.until(() => /dispatch complete/.test(gw.logs()), { what: "dispatch" });
    await new Promise((r) => setTimeout(r, 1500));
    return feishuCalls(gw);
  },
});

export default [
  feishuScenario("plain-reply", () => ({ text: "普通回答" })),
  feishuScenario("tool-then-reply", (body) =>
    lastToolResult(body) ? { text: "工具之后的回答" } : { text: "先查一下", toolCalls: [{ name: "session_status", args: {} }] },
  ),
  feishuScenario("server-error", () => ({ httpStatus: 503, errorMessage: "down" })),
  feishuScenario("truncated", () => ({ text: "半截", finishReason: "length" })),
  {
    id: "PARITY/gateway-surface",
    ledger: ["packaging"],
    parity: true,
    async run({ gw }) {
      const hello = gw.rpc.hello;
      return { methods: [...(hello.features?.methods ?? [])].sort(), events: [...(hello.features?.events ?? [])].sort(), protocol: hello.protocol };
    },
  },
  {
    id: "PARITY/model-catalog",
    ledger: ["packaging"],
    parity: true,
    async run({ gw }) {
      const { models } = await gw.rpc.call("models.list", { view: "all" });
      return models.map((m) => `${m.provider}/${m.id}`).sort();
    },
  },
  {
    id: "PARITY/plugins-loaded",
    ledger: ["packaging"],
    parity: true,
    async run({ gw }) {
      const h = await gw.rpc.call("health", { probe: false });
      return { loaded: [...(h.plugins?.loaded ?? [])].sort(), errors: h.plugins?.errors ?? [] };
    },
  },
  {
    id: "PARITY/first-turn-request",
    ledger: ["packaging", "prompt"],
    parity: true,
    boot: { modelScript: () => ({ text: "ok" }) },
    async run({ gw }) {
      await gw.turn("你好");
      const body = normalize(gw.model.requests[0].body, gw);
      const tools = (body.tools ?? []).map((t) => t.function);
      return {
        toolNames: tools.map((t) => t.name).sort(),
        tools: Object.fromEntries(tools.map((t) => [t.name, t])),
        system: body.messages.filter((m) => m.role === "system" || m.role === "developer").map((m) => m.content),
        rest: Object.fromEntries(Object.entries(body).filter(([k]) => !["tools", "messages"].includes(k))),
      };
    },
  },
];
