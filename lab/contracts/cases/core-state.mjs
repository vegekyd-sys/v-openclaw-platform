// Workboard limits and memory search, through the RPC and the tool the agent uses.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { lastToolResult } from "../lib/fake-model.mjs";

const search = (query) => (body) =>
  lastToolResult(body) ? { text: "查完了" } : { toolCalls: [{ name: "memory_search", args: { query } }] };

const memoryOnly = { agents: { defaults: { memorySearch: { enabled: true, provider: "none", fallback: "none" } } } };

export default [
  {
    id: "D2/workboard-long-notes",
    ledger: ["D2"],
    boot: { config: { plugins: { entries: { workboard: { enabled: true } } } } },
    async run({ gw, assert }) {
      const notes = "笔记".repeat(5500);
      const created = await gw.rpc.call("workboard.cards.create", { title: "contract", notes }).catch((e) => {
        assert(false, `a card with ${notes.length} characters of notes was refused: ${e.message}`);
      });
      assert(created.card.notes?.length === notes.length, `notes cut to ${created.card.notes?.length}`);
      return `${notes.length} characters kept`;
    },
  },
  {
    id: "MEMSEARCH-QUALITY/rare-term-outranks-common-terms",
    ledger: ["MEMSEARCH-QUALITY"],
    boot: { config: memoryOnly, modelScript: search("memory tianyi history 星擎路线") },
    timeoutMs: 180_000,
    async run({ gw, assert }) {
      const dir = path.join(gw.workspace, "memory");
      mkdirSync(dir, { recursive: true });
      for (let i = 0; i < 40; i++) {
        writeFileSync(path.join(dir, `common-${i}.md`), `# 记录 ${i}\nmemory tianyi history main 第 ${i} 条流水，没有别的内容。\n`);
      }
      writeFileSync(path.join(dir, "rare.md"), "# 决定\n星擎路线 是夜班 D 走的那条。\n");
      const index = await gw.cli(["memory", "index", "--force"]);
      assert(index.code === 0, `memory index failed: ${index.out.slice(-300)}`);
      await gw.turn("查一下", { timeoutMs: 100_000 });
      const out = JSON.parse(lastToolResult(gw.model.requests.at(-1).body)?.content ?? gw.model.requests.map((q) => lastToolResult(q.body)?.content).find(Boolean));
      const top = out.results?.[0]?.path ?? "";
      assert(top.endsWith("rare.md"), `top hit is ${top || JSON.stringify(out).slice(0, 240)}, not the one holding the rare term`);
      return `top hit ${top}`;
    },
  },
];
