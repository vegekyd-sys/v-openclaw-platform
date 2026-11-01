// Turns running in V's Worker plugin. The plugin bytes are the same on both sides; what is
// under test is the core it depends on. These compare V and the fork and assert the behavior:
// stock lacks the bridge the Worker needs, so it cannot serve as the reverse control.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { lastToolResult } from "../lib/fake-model.mjs";

const toolThen = (name, args, after) => (body) => {
  const last = lastToolResult(body);
  return last ? { text: after(String(last.content)) } : { toolCalls: [{ name, args }] };
};

export default [
  {
    id: "C3-B1/turn-runs-in-a-worker",
    ledger: ["B1", "WORKER-port-status"],
    parity: true,
    boot: { worker: true, modelScript: () => ({ text: "from worker" }) },
    async run({ gw, assert }) {
      const r = await gw.turn("hello");
      const status = await gw.rpc.call("vlab.workers.status", {});
      assert(r.text.includes("from worker"), `reply: ${r.text}`);
      assert(r.result.meta.agentMeta.agentHarnessId === "vlab-worker", `harness: ${r.result.meta.agentMeta.agentHarnessId}`);
      assert(/worker-command-enter|worker/.test(JSON.stringify(status)), "no worker in status");
      return { harness: r.result.meta.agentMeta.agentHarnessId, statusKeys: Object.keys(status).sort() };
    },
  },
  {
    id: "C3-B7/exec-in-a-worker",
    ledger: ["B7", "WORKER-second-config-exec-env"],
    parity: true,
    boot: { worker: true, config: { tools: { exec: { security: "full", ask: "off" } } }, modelScript: toolThen("exec", { command: "echo EXEC-$((6*7))" }, (c) => `said ${c.slice(0, 300)}`) },
    async run({ gw, assert }) {
      const r = await gw.turn("run");
      assert(r.text.includes("EXEC-42"), `reply: ${r.text.slice(0, 300)}`);
      return { ran: true };
    },
  },
  {
    id: "C3-B2/spawn-yield-completion-wakes-parent",
    ledger: ["B2", "WORKER-subagent-completion-relay"],
    parity: true,
    timeoutMs: 170_000,
    boot: { worker: true },
    async run({ gw, assert }) {
      gw.script.current = (body) => {
        const all = JSON.stringify(body.messages);
        if (all.includes("CHILD-TASK-MARK") && body.messages.some((m) => m.role === "system" && /subagent/i.test(JSON.stringify(m.content))) && !all.includes("sessions_spawn")) return { text: "CHILD-RESULT-MARK" };
        if (all.includes("CHILD-RESULT-MARK")) return { text: "PARENT-SAW-CHILD" };
        const last = lastToolResult(body);
        if (!last) return { toolCalls: [{ name: "sessions_spawn", args: { task: "CHILD-TASK-MARK" } }] };
        if (/accepted|runId|childSessionKey/i.test(String(last.content)) && !all.includes('"sessions_yield"')) return { toolCalls: [{ name: "sessions_yield", args: { message: "waiting" } }] };
        return { text: "waiting" };
      };
      await gw.turn("delegate", { timeoutMs: 120_000 });
      await gw.until(() => gw.model.requests.some((q) => JSON.stringify(q.body.messages).includes("CHILD-RESULT-MARK")), { what: "the child result reaching the parent", timeoutMs: 100_000 });
      return { relayed: true };
    },
  },
  {
    id: "C3-B3/skill-workshop-from-a-worker",
    ledger: ["B3", "WORKER-skills-telemetry-workshop", "#497"],
    parity: true,
    boot: { worker: true },
    async run({ gw, assert }) {
      const dir = path.join(gw.workspace, "skills", "contract-skill");
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, "SKILL.md");
      writeFileSync(file, "---\nname: contract-skill\ndescription: Contract skill.\n---\n\nold\n");
      let step = 0;
      gw.script.current = (body) => {
        const last = lastToolResult(body);
        if (step === 0) {
          step = 1;
          return { toolCalls: [{ name: "skill_workshop", args: { action: "update", skill_name: "contract-skill", description: "Contract skill.", proposal_content: "CONTRACT-APPLIED\n", goal: "contract", evidence: "contract" } }] };
        }
        if (step === 1) {
          step = 2;
          const id = String(last?.content).match(/proposal (\S+) \(pending\)/)?.[1];
          if (!id) return { text: `no proposal: ${String(last?.content).slice(0, 300)}` };
          return { toolCalls: [{ name: "skill_workshop", args: { action: "apply", proposal_id: id, reason: "contract" } }] };
        }
        return { text: "done" };
      };
      const r = await gw.turn("change the skill", { timeoutMs: 100_000 });
      assert(readFileSync(file, "utf8").includes("CONTRACT-APPLIED"), `not applied: ${r.text.slice(0, 320)}`);
      return { applied: true };
    },
  },
  {
    id: "C3-memory/search-from-a-worker",
    ledger: ["WORKER-session-agentdb-access", "WORKER-PREWARM"],
    parity: true,
    boot: {
      worker: true,
      config: { agents: { defaults: { memorySearch: { enabled: true, provider: "openai", model: "e1", remote: { baseUrl: "FAKE_MODEL_URL", apiKey: "contract" } } } } },
    },
    async run({ gw, assert }) {
      writeFileSync(path.join(gw.workspace, "MEMORY.md"), "MEMORY-MARK the secret word is cobalt\n");
      await gw.cli(["memory", "index", "--force"]);
      gw.script.current = toolThen("memory_search", { query: "secret word" }, (c) => `found ${c.slice(0, 400)}`);
      const r = await gw.turn("search", { timeoutMs: 100_000 });
      assert(r.text.includes("MEMORY-MARK"), `reply: ${r.text.slice(0, 400)}`);
      return { found: true };
    },
  },
  {
    id: "C3-compaction/fast-compaction-runs-in-a-worker-session",
    ledger: "WORKER-fast-compaction",
    parity: true,
    boot: () => ({
      worker: true,
      config: { plugins: { entries: { "vlab-agent-worker-isolation": { config: { fastCompactionModel: "fake/m1", fastCompactionMaxInputChars: 420000, fastCompactionMaxOutputTokens: 2000, fastCompactionMaxQualityRetries: 0 } } } } },
    }),
    async run({ gw, assert }) {
      for (let i = 0; i < 4; i++) {
        gw.script.current = () => ({ text: `long answer ${i} ${"x".repeat(4000)}` });
        await gw.turn(`turn ${i} ${"y".repeat(4000)}`);
      }
      const before = gw.model.requests.length;
      gw.script.current = () => ({ text: "## Summary\nCOMPACT-MARK everything so far." });
      const r = await gw.rpc.call("sessions.compact", { key: "agent:main:contract" }, { timeoutMs: 100_000 });
      assert(r.compacted === true, `compact: ${JSON.stringify(r).slice(0, 400)}`);
      assert(gw.model.requests.length > before, "compaction never called the model");
      gw.script.current = () => ({ text: "after" });
      await gw.turn("next");
      assert(JSON.stringify(gw.model.requests.at(-1).body.messages).includes("COMPACT-MARK"), "next turn does not carry the summary");
      return { compacted: true };
    },
  },
  {
    id: "C3-feishu/worker-reply-reaches-the-card",
    ledger: ["WORKER-ipc-rpc-bridge", "FEISHU-visible-progress"],
    parity: true,
    boot: {
      worker: true,
      feishu: { streaming: { mode: "partial", block: { enabled: false } }, renderMode: "card" },
      config: { messages: { visibleReplies: "automatic", groupChat: { visibleReplies: "automatic" } } },
      modelScript: (body) => (lastToolResult(body) ? { text: "CARD-ANSWER-MARK" } : { text: "NOTE-BEFORE-TOOL", toolCalls: [{ name: "session_status", args: {} }] }),
    },
    async run({ gw, assert }) {
      await gw.feishuSend({ text: "你好" });
      await gw.until(() => gw.feishu.outboundText().includes("CARD-ANSWER-MARK"), { what: "the answer", timeoutMs: 120_000 });
      assert(gw.feishu.outboundText().includes("NOTE-BEFORE-TOOL"), "the text before the tool never reached the card");
      return { answered: true };
    },
  },
  {
    id: "C3-worker-death/next-turn-survives-a-killed-worker",
    ledger: ["WORKER-pool-admission"],
    parity: true,
    boot: { worker: true, modelScript: (_b, i) => ({ text: `answer ${i}` }) },
    async run({ gw, assert }) {
      await gw.turn("first");
      const status = await gw.rpc.call("vlab.workers.status", {});
      const pids = JSON.stringify(status).match(/"pid":(\d+)/g)?.map((m) => Number(m.slice(6))) ?? [];
      assert(pids.length > 0, `no worker pid in status: ${JSON.stringify(status).slice(0, 300)}`);
      for (const p of pids) process.kill(p, "SIGKILL");
      const r = await gw.turn("second", { timeoutMs: 120_000 });
      assert(/answer/.test(r.text), `reply after the kill: ${r.text.slice(0, 200)}`);
      return { recovered: true };
    },
  },
];
