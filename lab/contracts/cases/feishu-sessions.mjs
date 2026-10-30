// Session-level behavior seen through Feishu: bootstrap files, background work and
// who may manage scheduled jobs.
import { writeFileSync } from "node:fs";
import path from "node:path";
import { lastToolResult } from "../lib/fake-model.mjs";

const said = (body, text) => JSON.stringify(body.messages.filter((m) => m.role === "user")).includes(text);

export default [
  {
    id: "#506/memory-md-in-group-sessions",
    ledger: ["#506", "v-bootstrap-memory-everywhere"],
    boot: { feishu: true, modelScript: () => ({ text: "群里回答" }) },
    async run({ gw, assert }) {
      writeFileSync(path.join(gw.workspace, "MEMORY.md"), "CONTRACT-MEMORY-SENTINEL 项目约定\n");
      await gw.feishuSend({ text: "群里一句", chatType: "group", chatId: "oc_group" });
      await gw.until(() => gw.model.requests.length > 0, { what: "the model call" });
      const prompt = JSON.stringify(gw.model.requests[0].body.messages);
      assert(prompt.includes("CONTRACT-MEMORY-SENTINEL"), "MEMORY.md is not in a group session's prompt");
      return "in the prompt";
    },
  },
  {
    id: "FEISHU-task-status/card-shows-background-work",
    ledger: ["FEISHU-task-status"],
    boot: { feishu: true, config: { agents: { defaults: { subagents: { allowAgents: ["*"] } } } } },
    timeoutMs: 120_000,
    async run({ gw, assert }) {
      let release;
      const held = new Promise((r) => (release = r));
      gw.script.current = async (body) => {
        if (said(body, "CHILD-TASK-MARK")) {
          if (said(body, "父任务")) {
            return lastToolResult(body) ? { text: "父回答已发" } : { toolCalls: [{ name: "sessions_spawn", args: { task: "CHILD-TASK-MARK 慢慢做" } }] };
          }
          await held;
          return { text: "子任务完成" };
        }
        return lastToolResult(body) ? { text: "父回答已发" } : { toolCalls: [{ name: "sessions_spawn", args: { task: "CHILD-TASK-MARK 慢慢做" } }] };
      };
      await gw.feishuSend({ text: "父任务" });
      const seen = await gw
        .until(() => gw.feishu.outboundText().includes("后台 1 项"), { timeoutMs: 40_000, what: "the background line" })
        .catch((e) => e);
      release();
      assert(seen === true, `no background line on the card: ${gw.feishu.outboundText().slice(-300)}`);
      return "background line shown";
    },
  },
  {
    id: "C/shared-cron-across-senders",
    ledger: ["C"],
    boot: {
      feishu: true,
      env: { OPENCLAW_CRON_SHARED_POLICY: "POLICY_FILE" },
    },
    timeoutMs: 120_000,
    async run({ gw, assert }) {
      // Calls alternate: tool, then the closing text of that turn.
      let jobId;
      gw.script.current = (body, i) => {
        if (i % 2 === 1) return { text: `工具做完 ${i}` };
        if (i === 0) {
          return { toolCalls: [{ name: "automations", args: { action: "add", job: { name: "contract-shared-job", schedule: { kind: "every", everyMs: 3600000 }, sessionTarget: "isolated", payload: { kind: "agentTurn", message: "hi" } } } }] };
        }
        return { toolCalls: [{ name: "automations", args: { action: "remove", jobId } }] };
      };
      await gw.feishuSend({ text: "建任务", sender: "ou_alice", chatId: "oc_alice" });
      await gw.until(() => gw.feishu.outboundText().includes("工具做完 1"), { what: "the add turn" });
      const jobs = await gw.rpc.call("cron.list", {});
      const job = jobs.jobs.find((j) => j.name === "contract-shared-job");
      assert(job, `the job was not created: ${String(JSON.stringify(gw.model.requests.map((q) => lastToolResult(q.body)).find(Boolean))).slice(0, 300)}`);
      jobId = job.id;
      await gw.feishuSend({ text: "删任务", sender: "ou_bob", chatId: "oc_bob" });
      await gw.until(() => gw.feishu.outboundText().includes("工具做完 3"), { what: "the remove turn" });
      const after = await gw.rpc.call("cron.list", {});
      assert(!after.jobs.some((j) => j.id === job.id), `another admitted user could not manage the job: ${String(JSON.stringify(gw.model.requests.map((q) => lastToolResult(q.body)).findLast(Boolean))).slice(0, 300)}`);
      return "second sender removed the first sender's job";
    },
  },
];
