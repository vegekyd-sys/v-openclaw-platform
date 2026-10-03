// Candidate test for lab/release-files/memory-search-fast against the stock shared runtime.
// Read-only: searches open the shared VLab makaron index with a "status" manager.
// 1. the patched KNN child starts without the unused module graph;
// 2. stock and patched children return identical KNN rows;
// 3. full memory search returns identical results, faster.
import assert from "node:assert/strict";
import { test } from "node:test";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const candidate = path.join(process.env.VLAB_CANDIDATE_RUNTIME ?? "", "openclaw");
const stock = process.env.MEMSEARCH_STOCK_RUNTIME ?? "/srv/vlab-production-mirror/labs/instances/db91-parity/runtime/openclaw";
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
const sharedConfig = process.env.VLAB_SHARED_CONFIG_PATH;
assert(process.env.VLAB_CANDIDATE_RUNTIME && sharedState && sharedConfig, "candidate environment is required");
const db = process.env.MEMSEARCH_DB ?? path.join(sharedState, "agents/makaron/agent/openclaw-agent.sqlite");
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];

const childPath = (root) => path.join(root, "dist/extensions/memory-core/memory-search-knn.child.js");
function runChild(root, input) {
  return new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(process.execPath, [childPath(root)], { stdio: ["pipe", "pipe", "inherit"] });
    let out = "";
    child.stdout.on("data", (d) => (out += d));
    child.on("error", reject);
    child.on("close", () => resolve({ ms: performance.now() - started, result: JSON.parse(out) }));
    child.stdin.end(JSON.stringify(input));
  });
}
const randomVector = () => {
  const v = Array.from({ length: 3072 }, () => Math.random() - 0.5);
  const n = Math.hypot(...v);
  return v.map((x) => x / n);
};
const knnRequest = (queryVec) => ({
  vectorTable: "memory_index_chunks_vec",
  providerModels: ["gemini-embedding-2-preview"],
  queryVec,
  limit: 160,
  snippetMaxChars: 700,
  sourceFilter: { sql: " AND c.source IN (?)", params: ["memory"] },
});

test("patched files are in the candidate runtime", () => {
  const knn = fs.readFileSync(path.join(candidate, "dist/manager-search-knn-NiSMMJUM.js"), "utf8");
  const child = fs.readFileSync(childPath(candidate), "utf8");
  const manager = fs.readFileSync(path.join(candidate, "dist/extensions/memory-core/manager-runtime.js"), "utf8");
  assert(!knn.includes('import "./memory-core-host-engine-foundation-'));
  assert(!child.includes('import "../../sqlite-runtime-') && !child.includes('import "../../memory-core-host-engine-schema-'));
  assert(manager.includes("queryVec = await pendingQueryVec;"));
});

test("KNN child starts without the unused module graph", async () => {
  const invalid = { databasePath: db, request: { vectorTable: "bad-name" } };
  const times = { stock: [], patched: [] };
  for (let i = 0; i < 5; i++) {
    for (const [label, root] of [["stock", stock], ["patched", candidate]]) {
      const { ms, result } = await runChild(root, invalid);
      assert.equal(result.error, "invalid memory vector table identifier");
      times[label].push(ms);
    }
  }
  console.log(JSON.stringify({ childStartMs: { stock: Math.round(median(times.stock)), patched: Math.round(median(times.patched)) } }));
  assert(median(times.patched) < 0.5 * median(times.stock), "patched child should start in under half the stock time");
});

test("stock and patched KNN children return identical rows", async () => {
  for (let i = 0; i < 4; i++) {
    const input = { databasePath: db, request: knnRequest(randomVector()) };
    const [a, b] = [await runChild(stock, input), await runChild(candidate, input)];
    assert.equal(a.result.status, "ok");
    assert.deepEqual(b.result, a.result);
  }
});

test("memory search: identical results, lower latency", { timeout: 900_000 }, async () => {
  process.env.OPENCLAW_STATE_DIR = sharedState;
  const cfg = JSON.parse(fs.readFileSync(sharedConfig, "utf8"));
  const managers = {};
  for (const [label, root] of [["stock", stock], ["patched", candidate]]) {
    managers[label] = (await import(path.join(root, "dist/extensions/memory-core/manager-runtime.js"))).MemoryIndexManager;
  }
  const queries = ["Makaron 项目 当前状态", "夜班 QC 规则", "星擎 产品线 组成 天策 云机", "飞书文档生成默认流程 权限", "Gateway 重启 恢复 卡死", "客户群 服务规则", "Nexus 是什么 项目定位", "健康度 红灯客户治理", "remote compute 节点配对 Mac 接入", "绍兴挚诚 出海视频 策划案"];
  const search = async (label, q) => {
    const m = await managers[label].get({ cfg, agentId: "makaron", purpose: "status" });
    try {
      const t = performance.now();
      const r = await m.search(q, { maxResults: 8, activeProjectKeys: ["makaron"] });
      return { ms: performance.now() - t, paths: r.map((x) => `${x.path}#${x.startLine}`) };
    } finally {
      await m.close();
    }
  };
  await search("stock", "warm up");
  await search("patched", "warm up");
  const times = { stock: [], patched: [] };
  for (const [i, q] of queries.entries()) {
    const order = i % 2 ? ["patched", "stock"] : ["stock", "patched"];
    const out = {};
    for (const label of order) out[label] = await search(label, q);
    assert.deepEqual(out.patched.paths, out.stock.paths, `results differ for ${q}`);
    times.stock.push(out.stock.ms);
    times.patched.push(out.patched.ms);
  }
  console.log(JSON.stringify({ searchMsMedian: { stock: Math.round(median(times.stock)), patched: Math.round(median(times.patched)) }, queries: queries.length }));
  assert(median(times.patched) < median(times.stock) - 700, "patched search should be at least 0.7 s faster at the median");
});
