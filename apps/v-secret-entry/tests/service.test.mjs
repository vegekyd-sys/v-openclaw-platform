import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createService } from "../server.mjs";
import { createGatewayResolver } from "../lib/gateway.mjs";
import { LinkRegistry, hashToken } from "../lib/links.mjs";

const QUESTION = `ask_${"c".repeat(32)}`;
const VALUE = "sk-test-value-0123456789";
let service;
let ports;
let tmp;
let adminToken;
const calls = [];
let gatewayBehaviour = "ok";

const admin = async (method, route, body, token = adminToken) => {
  const res = await fetch(`http://127.0.0.1:${ports.adminPort}${route}`, {
    method,
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
};
const pub = async (route, body) => {
  const res = await fetch(`http://127.0.0.1:${ports.publicPort}/secret-entry${route}`, {
    method: body ? "POST" : "GET",
    headers: { "content-type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = undefined; }
  return { status: res.status, headers: res.headers, text, body: json };
};
const tokenOf = (url) => new URL(url).hash.slice(1);
const issue = (extra = {}) => admin("POST", "/v1/links", {
  questionId: QUESTION, name: "V_DEMO_TOKEN", reason: "测试用", allowedHosts: ["api.example.com"],
  channel: "telegram", askerId: "70000001", expiresAtMs: Date.now() + 10 * 60_000, ...extra,
});

before(async () => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), "v-secret-entry-"));
  adminToken = "test-admin-token-0123456789abcdef";
  fs.writeFileSync(path.join(tmp, "admin-token"), `${adminToken}\n`);
  const resolve = createGatewayResolver({
    call: async (method, params) => {
      calls.push({ method, params });
      if (gatewayBehaviour === "down") throw Object.assign(new Error("gateway closed"), { gatewayCode: "UNAVAILABLE" });
      if (gatewayBehaviour === "gone") throw Object.assign(new Error("terminal"), { details: { reason: "QUESTION_ALREADY_TERMINAL" } });
      return { status: "answered" };
    },
  });
  service = createService({
    bind: "127.0.0.1", publicBind: "127.0.0.1", publicPort: 0, adminPort: 0, pathPrefix: "/secret-entry",
    publicBaseUrl: "https://openclaw.example.test", stateDir: path.join(tmp, "state"), adminTokenFile: path.join(tmp, "admin-token"),
    limits: { maxAttempts: 2 },
  }, { resolve, log: { error: () => {} } });
  ports = await service.listen();
});

after(async () => {
  await service.close();
  fs.rmSync(tmp, { recursive: true, force: true });
});

test("admin API needs the bearer token and validates the request", async () => {
  assert.equal((await admin("POST", "/v1/links", {}, "wrong-token-0123456789")).status, 401);
  assert.equal((await issue({ name: "not a name" })).status, 400);
  assert.equal((await issue({ askerId: "" })).status, 400);
  assert.equal((await issue({ expiresAtMs: Date.now() - 1000 })).status, 400);
});

test("a link is shown, submitted once through question.resolve, then dead", async () => {
  calls.length = 0;
  gatewayBehaviour = "ok";
  const issued = await issue();
  assert.equal(issued.status, 200);
  assert.match(issued.body.url, /^https:\/\/openclaw\.example\.test\/secret-entry\/#[\w-]{40,}$/u);
  const token = tokenOf(issued.body.url);
  assert(issued.body.expiresAtMs <= Date.now() + 15 * 60_000);

  const page = await pub("/");
  assert.equal(page.status, 200);
  assert.match(page.text, /type="password"/u);
  assert.equal(page.headers.get("referrer-policy"), "no-referrer");
  assert.match(page.headers.get("content-security-policy"), /frame-ancestors 'none'/u);
  assert.equal(page.headers.get("cache-control"), "no-store");
  assert.equal((await pub("/app.js")).status, 200);

  const info = await pub("/api/info", { token });
  assert.equal(info.status, 200);
  assert.deepEqual({ name: info.body.name, reason: info.body.reason, hosts: info.body.allowedHosts }, { name: "V_DEMO_TOKEN", reason: "测试用", hosts: ["api.example.com"] });
  assert.equal((await pub("/api/info", { token })).status, 200, "opening the page does not use the link");
  assert.equal((await pub("/api/info", { token: "x".repeat(43) })).status, 404);

  assert.equal((await pub("/api/submit", { token, value: "   " })).status, 400, "empty value refused");
  const saved = await pub("/api/submit", { token, value: VALUE });
  assert.equal(saved.status, 200);
  assert.deepEqual(calls, [{ method: "question.resolve", params: { id: QUESTION, answers: { answers: { secret_value: [VALUE] } }, resolvedBy: "telegram:secret-link:70000001" } }]);

  const again = await pub("/api/submit", { token, value: VALUE });
  assert.equal(again.status, 410);
  assert.equal(again.body.error, "used");
  assert.equal(calls.length, 1, "the second submission never reached the Gateway");

  const audit = fs.readFileSync(path.join(tmp, "state", "audit.jsonl"), "utf8");
  assert(!audit.includes(VALUE), "the value is not in the audit");
  assert(!audit.includes(token), "the token is not in the audit");
  const listed = JSON.stringify((await admin("GET", "/v1/links")).body);
  assert(!listed.includes(token) && !listed.includes(hashToken(token)), "the admin list carries neither token nor hash");
});

test("an ended question closes the link; a Gateway outage allows a retry until the limit", async () => {
  gatewayBehaviour = "gone";
  let token = tokenOf((await issue()).body.url);
  const gone = await pub("/api/submit", { token, value: VALUE });
  assert.equal(gone.status, 410);
  assert.equal(gone.body.error, "closed");

  gatewayBehaviour = "down";
  token = tokenOf((await issue()).body.url);
  assert.equal((await pub("/api/submit", { token, value: VALUE })).status, 502);
  assert.equal((await pub("/api/info", { token })).status, 200, "still usable after one failure");
  assert.equal((await pub("/api/submit", { token, value: VALUE })).status, 502);
  assert.equal((await pub("/api/submit", { token, value: VALUE })).status, 410, "closed after maxAttempts");
});

test("a new link for the same question replaces the old one; revoke closes it", async () => {
  gatewayBehaviour = "ok";
  const first = tokenOf((await issue()).body.url);
  const second = await issue();
  assert.equal((await pub("/api/info", { token: first })).status, 410);
  assert.equal((await pub("/api/info", { token: tokenOf(second.body.url) })).status, 200);
  assert.equal((await admin("DELETE", `/v1/links/${second.body.id}`)).status, 200);
  assert.equal((await pub("/api/info", { token: tokenOf(second.body.url) })).status, 410);
});

test("a link expires with its question and never outlives the cap", async () => {
  let now = 1_000_000;
  const registry = new LinkRegistry({ now: () => now });
  const { link, token } = registry.issue({ questionId: QUESTION, name: "V_DEMO", channel: "wecom", askerId: "u1", expiresAtMs: now + 60 * 60_000 });
  assert.equal(link.expiresAtMs, now + 15 * 60_000);
  now += 15 * 60_000;
  assert.throws(() => registry.describe(token), { code: "expired" });
  const short = registry.issue({ questionId: `${QUESTION}x`, name: "V_DEMO", channel: "wecom", askerId: "u1", expiresAtMs: now + 120_000 });
  assert.equal(short.link.expiresAtMs, now + 120_000);
});
