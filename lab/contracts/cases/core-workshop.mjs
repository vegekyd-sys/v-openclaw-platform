// An agent may apply its own update proposal to an operator-authored workspace skill.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { lastToolResult } from "../lib/fake-model.mjs";

export default [
  {
    id: "WORKSHOP/agent-applies-its-update-proposal",
    ledger: ["#497", "skill-workshop-agent-apply"],
    boot: {},
    timeoutMs: 120_000,
    async run({ gw, assert }) {
      const dir = path.join(gw.workspace, "skills", "contract-skill");
      mkdirSync(dir, { recursive: true });
      const file = path.join(dir, "SKILL.md");
      writeFileSync(file, "---\nname: contract-skill\ndescription: Contract skill.\n---\n\n旧内容\n");
      let step = 0;
      gw.script.current = (body) => {
        const last = lastToolResult(body);
        if (step === 0) {
          step = 1;
          return { toolCalls: [{ name: "skill_workshop", args: { action: "update", skill_name: "contract-skill", description: "Contract skill.", proposal_content: "新内容 CONTRACT-APPLIED\n", goal: "contract", evidence: "contract" } }] };
        }
        if (step === 1) {
          step = 2;
          const id = String(last?.content).match(/proposal (\S+) \(pending\)/)?.[1];
          if (!id) return { text: `没有提案: ${String(last?.content).slice(0, 300)}` };
          return { toolCalls: [{ name: "skill_workshop", args: { action: "apply", proposal_id: id, reason: "contract" } }] };
        }
        return { text: `结果: ${String(last?.content).slice(0, 300)}` };
      };
      const r = await gw.turn("改技能", { timeoutMs: 100_000 });
      const now = readFileSync(file, "utf8");
      assert(now.includes("CONTRACT-APPLIED"), `the proposal was not applied: ${r.text.slice(0, 320)}`);
      return "applied";
    },
  },
];
