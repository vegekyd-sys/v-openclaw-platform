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
      .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, "<uuid>")
      .replace(/om_in_\d+_\d+/g, "<msg>")
      .replace(/ask_[0-9a-f]{16,}/g, "ask_<hex>")
      .replace(/\b(?=[0-9]*[a-f])[0-9a-f]{16,}\b/g, "<hex>")
      // /status names the build's commit: the release's on V, the fork's own on the fork.
      .replace(/OpenClaw 2026\.9\.1 \([0-9a-f]+\)/g, "OpenClaw 2026.9.1 (<commit>)")
      .replace(/Current time: [^\\"]+/g, "Current time: <t>")
      .replace(/Uptime: [^\\"]+/g, "Uptime: <t>")
      .replace(/duration [^ \\"]+/g, "duration <t>")
      .replace(/updated [a-z0-9 ]+ago|updated just now/g, "updated <t>"),
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

const feishuScenario = (id, modelScript, message = "你好", send = {}, { waitFor, ...extra } = {}) => ({
  id: `PARITY/feishu-${id}`,
  ledger: ["feishu-sequence"],
  parity: true,
  timeoutMs: 120_000,
  boot: { feishu: true, modelScript, ...extra },
  async run({ gw }) {
    await gw.feishuSend({ text: message, ...send });
    await gw.until(() => (waitFor ? gw.feishu.outboundText().includes(waitFor) : /dispatch complete/.test(gw.logs())), { what: waitFor ?? "dispatch" });
    await new Promise((r) => setTimeout(r, 2500));
    return { calls: feishuCalls(gw), modelRequests: gw.model.requests.length, prompt: requestShape(gw, 0) };
  },
});

// What the model was sent in a channel turn: system prompt, tools and the context message.
function requestShape(gw, index) {
  const body = gw.model.requests[index]?.body;
  if (!body) return null;
  const n = normalize(body, gw);
  return { system: n.messages.filter((m) => m.role === "system"), toolNames: (n.tools ?? []).map((t) => t.function.name).sort(), last: n.messages.at(-1), params: Object.fromEntries(Object.entries(n).filter(([k]) => !["tools", "messages"].includes(k))) };
}

const ask = { questions: [{ id: "drink", header: "饮料", question: "喝什么", options: [{ label: "茶", description: "绿茶" }, { label: "咖啡", description: "美式" }] }] };
const oneTool = (name, args, text = "工具后回答") => (body) => (lastToolResult(body) ? { text } : { toolCalls: [{ name, args }] });
const owner = { commands: { ownerAllowFrom: ["feishu:ou_owner"], allowFrom: { feishu: ["*"] } } };

export default [
  feishuScenario("plain-reply", () => ({ text: "普通回答" })),
  feishuScenario("tool-then-reply", (body) =>
    lastToolResult(body) ? { text: "工具之后的回答" } : { text: "先查一下", toolCalls: [{ name: "session_status", args: {} }] },
  ),
  feishuScenario("server-error", () => ({ httpStatus: 503, errorMessage: "down" })),
  feishuScenario("truncated", () => ({ text: "半截", finishReason: "length" })),
  feishuScenario("no-reply", () => ({ text: "NO_REPLY" })),
  feishuScenario("group", () => ({ text: "群里回答" }), "群消息", { chatType: "group", chatId: "oc_group" }),
  feishuScenario("slash-status", () => ({ text: "不该走模型" }), "/status", {}, { config: owner }),
  feishuScenario("non-owner-model", () => ({ text: "不该走模型" }), "/model", { sender: "ou_guest", chatId: "oc_guest" }, { config: owner }),
  feishuScenario("non-owner-new", () => ({ text: "新会话" }), "/new", { sender: "ou_guest", chatId: "oc_guest" }, { config: owner }),
  feishuScenario("progress-plan", oneTool("progress_card", { plan: [{ step: "第一步", status: "in_progress" }, { step: "第二步", status: "pending" }] }), "开工"),
  feishuScenario("secret-request", oneTool("secrets", { action: "request", name: "CONTRACT_API_KEY", kind: "secret", reason: "contract" }), "要 key", {}, { config: owner, waitFor: "CONTRACT_API_KEY" }),
  {
    id: "PARITY/feishu-ask-user-card",
    ledger: ["FEISHU-ask-user"],
    parity: true,
    timeoutMs: 120_000,
    boot: { feishu: true, config: owner, modelScript: oneTool("ask_user", ask) },
    async run({ gw }) {
      await gw.feishuSend({ text: "问我" });
      const q = await gw.until(() => gw.feishu.outboundText().match(/\\*"q\\*":\\*"(ask_[0-9a-f]+)\\*"/)?.[1], { what: "the question card" });
      await gw.feishuEvent(
        { operator: { open_id: "ou_owner", user_id: "ou_owner", union_id: "ou_owner" }, token: "t", action: { tag: "button", value: { a: "v.ask_user.submit", q, qi: 0, oi: 1 } }, context: { open_message_id: gw.feishu.calls.findLast((c) => c.messageId).messageId, open_chat_id: "oc_contract" } },
        "card.action.trigger",
      );
      await gw.until(() => gw.feishu.outboundText().includes("工具后回答"), { what: "the closing text" });
      await new Promise((r) => setTimeout(r, 2000));
      return { calls: feishuCalls(gw).map((c) => c.replace(/ask_[0-9a-f]+/g, "<q>")), answer: lastToolResult(gw.model.requests.at(-1).body)?.content ?? null };
    },
  },
  {
    id: "PARITY/feishu-subagent-report",
    ledger: ["feishu-bound-task", "subagent-settle"],
    parity: true,
    timeoutMs: 150_000,
    boot: {
      feishu: true,
      modelScript: (body) => {
        const text = JSON.stringify(body.messages);
        if (text.includes("CHILD-MARK") && !text.includes("父任务")) return { text: "子任务结果" };
        return lastToolResult(body) ? { text: "父回答" } : { toolCalls: [{ name: "sessions_spawn", args: { task: "CHILD-MARK 做一件事" } }] };
      },
    },
    async run({ gw }) {
      await gw.feishuSend({ text: "父任务" });
      await gw.until(() => gw.model.requests.length >= 3, { what: "the child and the parent's next call" });
      await new Promise((r) => setTimeout(r, 6000));
      return { calls: feishuCalls(gw).map((c) => c.replace(/agent:main:subagent:[\w-]+/g, "<child>")).length > 0, modelRequests: gw.model.requests.length, childPrompt: requestShape(gw, gw.model.requests.findIndex((q) => { const t = JSON.stringify(q.body.messages); return t.includes("CHILD-MARK") && !t.includes("父任务"); })) };
    },
  },
  {
    id: "PARITY/cron-isolated-run-request",
    ledger: ["cron", "bootstrap"],
    parity: true,
    timeoutMs: 120_000,
    boot: { modelScript: () => ({ text: "定时完成" }) },
    async run({ gw }) {
      const added = await gw.rpc.call("cron.add", { name: "contract", schedule: { kind: "every", everyMs: 3600000 }, sessionTarget: "isolated", wakeMode: "now", payload: { kind: "agentTurn", message: "定时任务内容" } });
      await gw.rpc.call("cron.run", { id: added.id ?? added.job?.id, mode: "force" });
      await gw.until(() => gw.model.requests.length > 0, { what: "the cron turn" });
      return requestShape(gw, 0);
    },
  },
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
