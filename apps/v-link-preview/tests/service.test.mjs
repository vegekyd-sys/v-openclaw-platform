import test from "node:test";
import assert from "node:assert/strict";
import { createPreviewService, startServer } from "../server.mjs";
import { deliveryFacts, parseLink } from "../lib/preview.mjs";

const BASE = "https://board.example/";
const API = "http://board.internal";
const LINK = `${BASE}?view=workflows&project=DL-1`;
const manifestUrl = "https://cdn.makaron.app/x/manifest.json";
const DELIVERY = `${BASE}deliver/?m=${encodeURIComponent(manifestUrl)}`;
const json = (value, status = 200) => new Response(JSON.stringify(value), { status });

function board(state) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url: String(url), init });
    if (state.down) throw new Error("ECONNREFUSED");
    if (String(url).startsWith(`${API}/api/instances/`)) return state.project ? json(state.project) : json({}, 404);
    if (String(url).startsWith(`${API}/api/decisions`)) return json({ decisions: state.decisions ?? [] });
    if (String(url) === manifestUrl) return json(state.manifest);
    if (String(url).endsWith("/tenant_access_token/internal")) return json({ code: 0, tenant_access_token: "t", expire: 7200 });
    if (String(url).endsWith("/url_previews/batch_update")) {
      state.updates = [...(state.updates ?? []), JSON.parse(init.body).preview_tokens];
      return json(state.updateFails ? { code: 99, msg: "no" } : { code: 0 });
    }
    throw new Error(`unexpected ${url}`);
  };
  return { calls, fetchImpl };
}
const project = (over = {}) => ({
  id: "DL-1", name: "广东哆比 20 条", status: "active", contentItems: Array.from({ length: 20 }, (_, id) => ({ id })),
  stageRuns: [{ stageId: "plan", attempt: 1, status: "done" }],
  contentItemRuns: [
    { contentItemId: "a", stageId: "make", attempt: 1, status: "blocked" },
    { contentItemId: "a", stageId: "make", attempt: 2, status: "running" },
    { contentItemId: "b", stageId: "make", attempt: 1, status: "running" },
  ],
  ...over,
});
const silent = () => {};
const service = (state, now = Date.now, extra = {}) => {
  const { calls, fetchImpl } = board(state);
  return { calls, svc: createPreviewService({ publicBaseUrl: BASE, boardApiBaseUrl: API, credentials: { appId: "a", appSecret: "s" }, ...extra }, { fetchImpl, now, log: silent }) };
};

test("parseLink recognises only our two pages", () => {
  assert.equal(parseLink(LINK, BASE).projectId, "DL-1");
  assert.equal(parseLink(DELIVERY, BASE).manifestUrl, manifestUrl);
  for (const url of [`https://other.example/?project=DL-1`, `${BASE}`, `${BASE}settings?project=DL-1`, `${BASE}?project=../x`, "not a url",
    `${BASE}deliver/?m=${encodeURIComponent("https://evil.example/m.json")}`, `${BASE}deliver/?m=${encodeURIComponent("http://cdn.makaron.app/m.json")}`])
    assert.equal(parseLink(url, BASE), null, url);
  assert.equal(parseLink("https://a.example/lab/?project=X", "https://a.example/lab/").projectId, "X");
  assert.equal(parseLink("https://a.example/labx/?project=X", "https://a.example/lab/"), null);
});

test("project card reports the latest attempt of each piece of work", async () => {
  const { svc } = service({ project: project() });
  const result = await svc.preview({ url: LINK });
  assert.equal(result.inline.title, "夜班｜广东哆比 20 条｜进行中");
  assert.equal(result.card.type, "raw");
  const text = JSON.stringify(result.card.data.elements);
  assert.match(text, /在做\*\*\\n2/);   // the blocked first attempt was retried
  assert.doesNotMatch(text, /卡住/);
  assert.match(text, /20 条/);
  const button = result.card.data.elements.at(-1).actions[0];
  assert.equal(button.url, LINK);
});

test("each state reads and colours differently, most urgent first", async () => {
  const cases = [
    [{ project: project({ status: "done" }) }, "已交付", "green"],
    [{ project: project({ status: "paused" }) }, "已暂停", "grey"],
    [{ project: project({ contentItemRuns: [{ contentItemId: "a", stageId: "m", status: "blocked" }] }) }, "卡住 1 项", "red"],
    [{ project: project(), decisions: [{}, {}] }, "需要你处理 2 件", "orange"],
    [{ project: project({ contentItemRuns: [] }) }, "排队中", "blue"],
  ];
  for (const [state, label, color] of cases) {
    const result = await service(state).svc.preview({ url: LINK });
    assert.match(result.inline.title, new RegExp(label));
    assert.equal(result.card.data.header.template, color);
  }
});

test("a burst of viewers costs one read; the next read happens after the cache window", async () => {
  let at = 1000;
  const state = { project: project() };
  const { svc, calls } = service(state, () => at);
  await Promise.all(Array.from({ length: 50 }, () => svc.preview({ url: LINK })));
  assert.equal(calls.filter((call) => call.url.includes("/api/instances/")).length, 1);
  at += 20_000;
  await svc.preview({ url: LINK });
  assert.equal(calls.filter((call) => call.url.includes("/api/instances/")).length, 2);
});

test("board down: recent state is shown and labelled, otherwise no preview at all", async () => {
  let at = 1000;
  const state = { project: project() };
  const { svc } = service(state, () => at);
  await svc.preview({ url: LINK });
  state.down = true;
  at += 120_000;
  const stale = await svc.preview({ url: LINK });
  assert.match(JSON.stringify(stale.card.data.elements), /2 分钟前/);
  at += 3_600_000;
  assert.equal(await svc.preview({ url: LINK }), null);
  assert.equal(await service({ down: true }).svc.preview({ url: LINK }), null);
  assert.equal(await service({ project: null }).svc.preview({ url: LINK }), null);
});

test("a state change asks tracked previews to pull again, once; no change, no call", async () => {
  let at = 1000;
  const state = { project: project() };
  const { svc } = service(state, () => at);
  await svc.preview({ url: LINK, previewToken: "t1" });
  await svc.preview({ url: LINK, previewToken: "t2" });
  at += 20_000;
  await svc.refreshTracked();
  assert.equal(state.updates, undefined);
  state.decisions = [{}];
  at += 20_000;
  await svc.refreshTracked();
  assert.deepEqual(state.updates, [["t1", "t2"]]);
  at += 20_000;
  await svc.refreshTracked();
  assert.equal(state.updates.length, 1);
});

test("a failed update is retried on the next round", async () => {
  let at = 1000;
  const state = { project: project(), updateFails: true };
  const { svc } = service(state, () => at);
  await svc.preview({ url: LINK, previewToken: "t1" });
  state.project = project({ status: "done" });
  at += 20_000;
  await svc.refreshTracked();
  assert.equal(state.updates.length, 1);
  state.updateFails = false;
  at += 20_000;
  await svc.refreshTracked();
  assert.equal(state.updates.length, 2);
});

test("old tokens expire and the tracked total is capped", async () => {
  let at = 1000;
  const state = { project: project() };
  const { svc } = service(state, () => at, { maxTokens: 2 });
  for (const token of ["a", "b", "c"]) await svc.preview({ url: LINK, previewToken: token });
  assert.equal(svc.stats().tokens, 2);
  at += 8 * 86_400_000;
  await svc.refreshTracked();
  assert.deepEqual([svc.stats().tokens, svc.stats().projects], [0, 0]);
});

test("delivery card shows what the page would, and never fetches an untrusted manifest", async () => {
  const manifest = { version: 1, title: "客户 英语 2条", deliveredAt: "2026-10-02T08:00:00+08:00", items: [
    { title: "a", url: "https://cdn.makaron.app/a.mp4", bytes: 1_500_000_000 },
    { title: "b", url: "https://cdn.makaron.app/b.mp4", bytes: 500_000_000 },
    { title: "bad", url: "https://evil.example/c.mp4" },
  ] };
  const { svc, calls } = service({ manifest });
  const result = await svc.preview({ url: DELIVERY, previewToken: "t" });
  assert.equal(result.inline.title, "交付｜客户 英语 2条｜2 条");
  assert.match(JSON.stringify(result.card.data.elements), /2\.0 GB/);
  assert.equal(svc.stats().tokens, 0);
  calls.length = 0;
  assert.equal(await svc.preview({ url: `${BASE}deliver/?m=${encodeURIComponent("https://evil.example/m.json")}` }), null);
  assert.equal(calls.length, 0);
  assert.equal(deliveryFacts({ version: 2, items: [] }), null);
});

test("an oversized or garbled manifest gives no preview", async () => {
  const { svc } = service({ manifest: { version: 1, items: [] } }, Date.now, { maxManifestBytes: 5 });
  assert.equal(await svc.preview({ url: DELIVERY }), null);
});

test("HTTP surface: card, nothing to say, bad input, health", async () => {
  const { fetchImpl } = board({ project: project() });
  const { server } = await startServer({ publicBaseUrl: BASE, boardApiBaseUrl: API, port: 0 }, { fetchImpl, log: silent });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body) => fetch(`${base}/v1/preview`, { method: "POST", body });
  try {
    assert.equal((await (await post(JSON.stringify({ url: LINK }))).json()).card.type, "raw");
    assert.equal((await post(JSON.stringify({ url: "https://other.example/" }))).status, 204);
    assert.equal((await post("{")).status, 500);
    assert.equal((await post("x".repeat(20_000))).status, 413);
    assert.equal((await (await fetch(`${base}/healthz`)).json()).ok, true);
    assert.equal(server.address().address, "127.0.0.1");
  } finally {
    server.close();
  }
});
