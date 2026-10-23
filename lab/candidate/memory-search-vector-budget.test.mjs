// Candidate test for lab/release-files/memory-search-vector-budget against V's stock bytes.
// Read-only: searches open the shared VLab makaron index with a "status" manager.
// Real cold pages cannot be reproduced here (the VLab DB's vector pages stay cached after
// posix_fadvise, and the host caches a second cold read), so the slow vector stage is
// simulated; real cold pages are measured on V with the same files (see the PR).
// 1. warm: patched and stock return identical results, and nothing is marked degraded;
// 2. a 30 s vector stage (the KNN child is held 30 s, as a cold scan of V's table takes
//    23-45 s): the patched search answers from keyword results within 10 s and says
//    degraded: "vector-timeout"; stock waits the full 30 s;
// 3. a budget far below the embedding latency still answers with keyword results.
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const runtime = path.join(process.env.VLAB_CANDIDATE_RUNTIME ?? "", "openclaw");
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
const sharedConfig = process.env.VLAB_SHARED_CONFIG_PATH;
assert(process.env.VLAB_CANDIDATE_RUNTIME && sharedState && sharedConfig, "candidate environment is required");
const db = process.env.MEMSEARCH_DB ?? path.join(sharedState, "agents/makaron/agent/openclaw-agent.sqlite");
const managerFile = (name) => path.join(runtime, "dist/extensions/memory-core", name);
const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)];
const slowKnnFlag = path.join(os.tmpdir(), `slow-knn-${process.pid}`);

process.env.OPENCLAW_STATE_DIR = sharedState;
const cfg = JSON.parse(fs.readFileSync(sharedConfig, "utf8"));
const load = async (name) => (await import(managerFile(name))).MemoryIndexManager;

async function search(Manager, q) {
  const m = await Manager.get({ cfg, agentId: "makaron", purpose: "status" });
  const debug = [];
  try {
    const t = performance.now();
    const r = await m.search(q, { maxResults: 8, activeProjectKeys: ["makaron"], onDebug: (d) => debug.push(d) });
    return {
      ms: Math.round(performance.now() - t),
      results: r.map((x) => ({ path: x.path, startLine: x.startLine, endLine: x.endLine, score: x.score, source: x.source })),
      degraded: debug.findLast((d) => d.degraded)?.degraded,
    };
  } finally {
    await m.close();
  }
}

const QUERIES = ["夜班模式是干什么用的", "我在帮哪些项目", "Makaron 项目 当前状态", "星擎 产品线 组成 天策 云机", "飞书文档生成默认流程 权限",
  "Gateway 重启 恢复 卡死", "客户群 服务规则", "Nexus 是什么 项目定位", "健康度 红灯客户治理", "绍兴挚诚 出海视频 策划案"];

test("patched files are in the candidate runtime", () => {
  const manager = fs.readFileSync(managerFile("manager-runtime.js"), "utf8");
  const stock = fs.readFileSync(managerFile("manager-runtime.stock.js"), "utf8");
  assert.equal(fs.readFileSync(managerFile("manager-runtime.stock2.js"), "utf8"), stock);
  const tools = fs.readFileSync(path.join(runtime, "dist/tools-Byg09TOP.js"), "utf8");
  assert(manager.includes("v-memory-search-stage-budget-20261020") && !stock.includes("v-memory-search-stage-budget-20261020"));
  assert(tools.includes("degraded: memoryValue.debug.degraded"));
});

test("warm: identical results to stock, nothing degraded", { timeout: 900_000 }, async () => {
  // Two module instances of the byte-identical stock file do not agree on every score: a
  // keyword hit's final score varies per instance (seen on VLab 2026-10-20: 0.4646, 0.4610,
  // 0.4701 for one hit, each stable on repeat). So: the patched hits must be the stock hits,
  // and every score on which the two stock instances agree must match exactly.
  const stock = await load("manager-runtime.stock.js");
  const stock2 = await load("manager-runtime.stock2.js");
  const patched = await load("manager-runtime.js");
  for (const M of [stock, stock2, patched]) await search(M, "warm up");
  const key = (r) => `${r.path}#${r.startLine}-${r.endLine}`;
  const times = { stock: [], patched: [] };
  let compared = 0, unstable = 0;
  for (const q of QUERIES) {
    const a = await search(stock, q), p = await search(patched, q), b = await search(stock2, q);
    assert.equal(p.degraded, undefined, `warm search degraded for ${q}`);
    const sa = new Map(a.results.map((r) => [key(r), r.score])), sb = new Map(b.results.map((r) => [key(r), r.score]));
    const hits = p.results.map(key).sort();
    assert(hits.join() === [...sa.keys()].sort().join() || hits.join() === [...sb.keys()].sort().join(), `results differ for ${q}`);
    for (const r of p.results) {
      const x = sa.get(key(r)), y = sb.get(key(r));
      if (x === undefined || y === undefined || Math.abs(x - y) > 1e-12) { unstable++; continue; }
      assert(Math.abs(r.score - x) < 1e-12, `score ${r.score} vs stock ${x} for ${key(r)} (${q})`);
      compared++;
    }
    times.stock.push(a.ms);
    times.patched.push(p.ms);
  }
  console.log(JSON.stringify({ warm: { queries: QUERIES.length, scoresComparedExactly: compared, scoresUnstableAcrossStockInstances: unstable, stockMsMedian: median(times.stock), patchedMsMedian: median(times.patched), patchedMsMax: Math.max(...times.patched) } }));
  assert(compared >= 50, `only ${compared} stable scores to compare`);
});

test("30 s vector stage: keyword results within 10 s, marked vector-timeout", { timeout: 1_800_000 }, async () => {
  const managers = { stock: await load("manager-runtime.stock.js"), patched: await load("manager-runtime.js") };
  const rows = [];
  fs.writeFileSync(slowKnnFlag, "");
  try {
    for (const [i, q] of QUERIES.slice(0, 4).entries()) {
      for (const label of i % 2 ? ["stock", "patched"] : ["patched", "stock"]) {
        const r = await search(managers[label], q);
        rows.push({ q, side: label, ms: r.ms, degraded: r.degraded ?? null, hits: r.results.length });
      }
    }
  } finally {
    fs.rmSync(slowKnnFlag, { force: true });
  }
  console.log(JSON.stringify({ slowVector: rows }));
  for (const r of rows.filter((x) => x.side === "patched")) {
    assert(r.ms < 10_000, `patched took ${r.ms} ms for ${r.q}`);
    assert.equal(r.degraded, "vector-timeout", `patched not degraded for ${r.q}`);
    assert(r.hits > 0, `no keyword results for ${r.q}`);
  }
  for (const r of rows.filter((x) => x.side === "stock")) assert(r.ms > 29_000, `stock did not wait for the slow vector stage (${r.ms} ms)`);
});

test("tiny budget: still answers from keyword results", { timeout: 300_000 }, async () => {
  process.env.OPENCLAW_MEMORY_SEARCH_STAGE_BUDGET_MS = "200";
  const small = await load("manager-runtime.small-budget.js");
  delete process.env.OPENCLAW_MEMORY_SEARCH_STAGE_BUDGET_MS;
  const rows = [];
  for (const q of QUERIES.slice(0, 5)) {
    const r = await search(small, q);
    rows.push({ q, ms: r.ms, degraded: r.degraded ?? null, hits: r.results.length });
    assert(["embedding-timeout", "vector-timeout"].includes(r.degraded), `not degraded with a 200 ms budget for ${q}`);
    assert(r.ms < 5_000, `degraded search took ${r.ms} ms`);
  }
  console.log(JSON.stringify({ tinyBudget: rows }));
  assert(rows.filter((r) => r.hits > 0).length >= 4, "keyword-only answers should usually have hits");
});
