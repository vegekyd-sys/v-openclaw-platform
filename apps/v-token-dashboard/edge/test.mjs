import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { partition } from "./publish.mjs";
import worker from "./worker.mjs";

test("ranking bootstrap keeps all individual rows, detail preserves every reported amount and card grouping", () => {
  const person = '["feishu","","u"]';
  const rows = [
    [1, "feishu", person, "a/1", "p", "m", 0, 1, 2, 3, 6, 1],
    [2, "内部任务", "未归属", "a/2", "p", "m", 3, 4, 5, 6, 18, 1],
  ];
  const data = {
    start: 1,
    end: 2,
    rows,
    names: { [person]: "甲" },
    sessions: { "a/1": { kind: "direct" } },
    workloads: { "a/1": "对话", "a/2": "子代理" },
    nightshift: { "a/1": "card", "a/2": "card" },
    unknownReasons: [[2, "内部任务", "a/2", "p", "m", "缺失", 18]],
  };
  const { home, full } = partition(data, "version");
  assert.deepEqual(home.rows, [rows[0]]);
  assert.deepEqual(home.workloads, { "a/1": "对话" });
  // Run the same decoder used by the public browser.
  const src = readFileSync(new URL("../public.js", import.meta.url), "utf8");
  const unpacked = vm.runInNewContext(
    src.slice(0, src.indexOf("async function openPublishedFeed")) +
      "; unpackUsage(input)",
    { input: full },
  );
  assert.deepEqual(unpacked.rows, rows);
  assert.deepEqual(unpacked.unknownReasons, data.unknownReasons);
  assert.equal(unpacked.nightshift["a/1"], unpacked.nightshift["a/2"]);
  assert.ok(unpacked.nightshift["a/1"]);
});
test("public worker exposes only static assets and encrypted object routes", async () => {
  const request = (path, method) =>
    worker.fetch(new Request("https://example.test" + path, { method }), {});
  for (const path of [
    "/key",
    "/api/usage",
    "/api/status",
    "/snapshot.json.gz",
    "/datasets/junk.bin",
  ])
    assert.equal((await request(path, "GET")).status, 404);
  assert.equal((await request("/home.bin", "POST")).status, 405);
});
