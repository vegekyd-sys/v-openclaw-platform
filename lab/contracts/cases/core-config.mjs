// Config change announcements and memory search under a stalled embedder.
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { lastToolResult } from "../lib/fake-model.mjs";

export default [
  {
    id: "PARITY/E5-back-to-baseline",
    ledger: ["E5"],
    // Stock announces this path too; the patched case needs a runtime that skipped the commit.
    parity: true,
    boot: { config: { gateway: { reload: { mode: "off" } } } },
    async run({ gw }) {
      const patch = async (color) => {
        const { hash } = await gw.rpc.call("config.get", {});
        // With reload off the write persists and the call reports it was not applied, which is the point.
        return gw.rpc.call("config.patch", { raw: JSON.stringify({ ui: { seamColor: color } }), baseHash: hash }).catch((e) => {
          if (!/persisted but was not applied/.test(e.message)) throw e;
        });
      };
      const original = (await gw.rpc.call("config.get", {})).config?.ui?.seamColor;
      await patch("#112233");
      await new Promise((r) => setTimeout(r, 800));
      const before = gw.rpc.events.length;
      await patch(original ?? null);
      await new Promise((r) => setTimeout(r, 1500));
      const events = gw.rpc.events.slice(before).map((e) => e.event);
      const now = await gw.rpc.call("config.get", {});
      return { announced: events.includes("config.changed"), staleSource: JSON.stringify(now.config).includes("#112233") };
    },
  },
  {
    id: "#444/keyword-results-when-embedding-stalls",
    ledger: ["#444"],
    boot: {
      config: {
        agents: {
          defaults: {
            memorySearch: { enabled: true, provider: "openai", model: "fake-embed", remote: { baseUrl: "FAKE_MODEL_URL", apiKey: "contract" }, fallback: "none" },
          },
        },
      },
      modelScript: (body) => (lastToolResult(body) ? { text: "查完了" } : { toolCalls: [{ name: "memory_search", args: { query: "星擎路线" } }] }),
    },
    timeoutMs: 180_000,
    async run({ gw, assert }) {
      const dir = path.join(gw.workspace, "memory");
      mkdirSync(dir, { recursive: true });
      writeFileSync(path.join(dir, "rare.md"), "# 决定\n星擎路线 是夜班 D 走的那条。\n");
      const index = await gw.cli(["memory", "index", "--force"]);
      assert(index.code === 0, `memory index failed: ${index.out.slice(-300)}`);
      let free;
      gw.script.embeddingsHang = new Promise((r) => (free = r));
      const started = Date.now();
      await gw.turn("查一下", { timeoutMs: 120_000 });
      free();
      const ms = Date.now() - started;
      const out = String(gw.model.requests.map((q) => lastToolResult(q.body)?.content).find(Boolean));
      assert(out.includes("星擎路线"), `no keyword results with a stalled embedder after ${ms} ms: ${out.slice(0, 260)}`);
      return `keyword results in ${ms} ms`;
    },
  },
];
