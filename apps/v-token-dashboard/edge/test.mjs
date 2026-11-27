import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { partition, publicUsage } from "./publish.mjs";
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
test("public worker exposes only static assets and public usage routes", async () => {
  const request = (path, method) =>
    worker.fetch(new Request("https://example.test" + path, { method }), {});
  for (const path of [
    "/key",
    "/api/usage",
    "/api/status",
    "/snapshot.json.gz",
    "/home.bin",
    "/datasets/1795348375-7133c1752aa6023e.bin",
    "/usage/datasets/junk.gz",
  ])
    assert.equal((await request(path, "GET")).status, 404);
  assert.equal((await request("/usage/home.gz", "POST")).status, 405);
});

test("public feed preserves user totals and distinct sessions and display labels without internal references", () => {
  const user = '["feishu","tenant123","ou_secret"]',
    session = "agent/private-session";
  const raw = {
    rows: [
      ["d", "feishu", user, session, "p", "m", 1, 2, 3, 4, 10, 1],
      ["d", "内部任务", "未归属", session, "p", "m", 1, 2, 3, 4, 10, 1],
    ],
    names: { [user]: "小王" },
    sessions: { [session]: { kind: "group", title: "保密项目" } },
    workloads: { [session]: "子代理" },
    nightshift: { [session]: "private-card" },
    unknownReasons: [["d", "内部任务", session, "p", "m", "缺失", 10]],
  };
  const salt = Buffer.alloc(32, 7),
    view = publicUsage(raw, salt);
  const [homeId, sid] = view.rows[0].slice(2, 4);
  assert.equal(view.names[homeId], "小王");
  assert.equal(view.rows[1][3], sid);
  assert.equal(view.unknownReasons[0][2], sid);
  assert.equal(publicUsage(raw, salt).rows[0][2], homeId);
  const wire = partition(view, "v");
  assert.equal(wire.home.rows[0][10], 10);
  assert.equal(wire.full.rows.length, 2);
  for (const part of [wire.home, wire.full]) {
    assert.deepEqual(part.sessions[sid], raw.sessions[session]);
    assert.equal(part.names[homeId], raw.names[user]);
  }
  assert.doesNotMatch(
    JSON.stringify(wire),
    /tenant123|ou_secret|private-session|private-card/,
  );
});
