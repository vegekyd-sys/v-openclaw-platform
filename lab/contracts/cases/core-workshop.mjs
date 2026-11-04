// V's agent applies its own skill changes, with no operator approval.
// On 9.1 that was an update proposal the agent applied itself (#497). 2026.10.10 dropped
// proposals: Workshop skills change immediately through skill_workshop, and skills the
// operator wrote in the workspace are ordinary files the agent edits with its file tools.
// Tianyi 2026-11-04: V's skills keep applying their own changes.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { lastToolResult } from "../lib/fake-model.mjs";

export default [
  {
    id: "WORKSHOP/agent-edits-workspace-skill",
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
          const content = "---\nname: contract-skill\ndescription: Contract skill.\n---\n\n新内容 CONTRACT-APPLIED\n";
          return { toolCalls: [{ name: "write", args: { path: "skills/contract-skill/SKILL.md", content } }] };
        }
        return { text: `结果: ${String(last?.content).slice(0, 300)}` };
      };
      const r = await gw.turn("改技能", { timeoutMs: 100_000 });
      const now = readFileSync(file, "utf8");
      assert(now.includes("CONTRACT-APPLIED"), `the workspace skill was not changed: ${r.text.slice(0, 320)}`);
      return "applied";
    },
  },
  {
    id: "WORKSHOP/agent-patches-workshop-skill",
    ledger: ["#497", "skill-workshop-agent-apply"],
    boot: {},
    timeoutMs: 120_000,
    async run({ gw, assert }) {
      const skill = "---\nname: contract-learned\ndescription: Contract learned skill.\n---\n\n旧步骤\n";
      const calls = [
        { name: "skill_workshop", args: { action: "create", name: "contract-learned", content: skill, reason: "contract" } },
        { name: "skill_workshop", args: { action: "patch", name: "contract-learned", old_text: "旧步骤", new_text: "新步骤 CONTRACT-PATCHED", reason: "contract" } },
        { name: "skill_workshop", args: { action: "view", name: "contract-learned" } },
      ];
      const results = [];
      let step = 0;
      gw.script.current = (body) => {
        if (step > 0) results.push(String(lastToolResult(body)?.content ?? ""));
        if (step < calls.length) return { toolCalls: [calls[step++]] };
        return { text: "好了" };
      };
      await gw.turn("改学到的技能", { timeoutMs: 100_000 });
      const view = results.at(-1) ?? "";
      assert(
        view.includes("CONTRACT-PATCHED"),
        `the patch did not take effect: ${results.map((x) => x.slice(0, 160)).join(" | ")}`,
      );
      return "patched";
    },
  },
];
