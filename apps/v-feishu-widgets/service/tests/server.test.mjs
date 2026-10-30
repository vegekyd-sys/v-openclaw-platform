import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createWidgetHost } from "../server.mjs";
import { IdentityError } from "../lib/feishu-identity.mjs";

const ADMIN = "admin-secret";
const DOC = "<!doctype html><title>t</title><button onclick=\"sendPrompt('A')\">A</button>";

async function boot(overrides = {}) {
  const stateDir = fs.mkdtempSync(path.join(os.tmpdir(), "v-widgets-"));
  const delivered = [];
  const identity = {
    exchange: async (_account, code) => {
      if (code === "bad") throw new IdentityError("code_exchange:20003");
      return { openId: code === "outsider" ? "ou_out" : "ou_member", name: "成员" };
    },
    isMember: async (_account, _chat, openId) => openId === "ou_member",
    ...overrides.identity,
  };
  const host = createWidgetHost({ publicBaseUrl: "https://pub.example", adminToken: ADMIN, stateDir, identity, deliver: async (input) => { delivered.push(input); return { messageId: "om_echo" }; }, ...overrides.host });
  await new Promise((r) => host.publicServer.listen(0, "127.0.0.1", r));
  await new Promise((r) => host.adminServer.listen(0, "127.0.0.1", r));
  const pub = `http://127.0.0.1:${host.publicServer.address().port}/v-widgets`;
  const adm = `http://127.0.0.1:${host.adminServer.address().port}`;
  const close = () => { host.publicServer.close(); host.adminServer.close(); fs.rmSync(stateDir, { recursive: true, force: true }); };
  const create = async (extra = {}) => {
    const r = await fetch(`${adm}/v1/widgets`, { method: "POST", headers: { authorization: `Bearer ${ADMIN}`, "content-type": "application/json" }, body: JSON.stringify({ html: DOC, title: "选方案", chat: "oc_group", chatType: "group", sessionKey: "agent:m:feishu:group:oc_group", appId: "cli_test", ...extra }) });
    return r.json();
  };
  const post = (route, body) => fetch(`${pub}${route}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { pub, adm, create, post, delivered, close, stateDir };
}

test("admin API needs the bearer token", async (t) => {
  const h = await boot(); t.after(h.close);
  const r = await fetch(`${h.adm}/v1/widgets`, { method: "POST", body: "{}" });
  assert.equal(r.status, 401);
});

test("shell escapes the title and frame is an opaque-origin document", async (t) => {
  const h = await boot(); t.after(h.close);
  const w = await h.create({ title: "<img src=x onerror=1>$&" });
  const shell = await fetch(`${h.pub}/open?w=${w.id}`);
  assert.equal(shell.status, 200);
  const page = await shell.text();
  assert(!page.includes("<img src=x"), "title is not HTML");
  assert(page.includes("&lt;img src=x onerror=1&gt;$&amp;"), "literal $& survives replacement");
  assert.match(shell.headers.get("content-security-policy"), /default-src 'none'/u);
  assert.match(shell.headers.get("content-security-policy"), /frame-src 'self'/u);
  assert.match(page, /src="\/v-widgets\/shell\.js"/u, "script path does not depend on the page path");
  assert.equal(w.url, `https://pub.example/v-widgets/open?w=${w.id}`);
  const frame = await fetch(`${h.pub}/w/${w.id}/frame`);
  assert.equal(frame.headers.get("content-security-policy"), "sandbox allow-scripts");
  assert.equal(await frame.text(), DOC, "document bytes are served unchanged");
});

test("a widget id is the only read capability and unknown ids are gone", async (t) => {
  const h = await boot(); t.after(h.close);
  assert.equal((await fetch(`${h.pub}/open?w=${"x".repeat(32)}`)).status, 404);
  assert.equal((await fetch(`${h.pub}/w/${"x".repeat(32)}/frame`)).status, 404);
  assert.equal((await fetch(`${h.pub}/open?w=short`)).status, 404);
  assert.equal((await fetch(`${h.pub}/open`)).status, 404);
});

test("the id does not name its directory on disk", async (t) => {
  const h = await boot(); t.after(h.close);
  const w = await h.create();
  assert(!fs.readdirSync(path.join(h.stateDir, "widgets")).includes(w.id));
});

test("prompt path: only a verified member, as themselves, once per click budget", async (t) => {
  const h = await boot(); t.after(h.close);
  const w = await h.create();
  assert.equal((await h.post("/api/prompt", { id: w.id, ticket: "forged", text: "hi" })).status, 401, "no identity, no send");
  assert.equal((await h.post("/api/identity", { id: w.id, code: "bad" })).status, 401);
  assert.equal((await h.post("/api/identity", { id: w.id, code: "outsider" })).status, 403);
  const who = await (await h.post("/api/identity", { id: w.id, code: "good", openId: "ou_forged", name: "冒充" })).json();
  assert.equal(who.name, "成员", "browser-supplied identity is ignored");
  assert.equal((await h.post("/api/prompt", { id: w.id, ticket: who.ticket, text: "   " })).status, 400);
  assert.equal((await h.post("/api/prompt", { id: w.id, ticket: who.ticket, text: "x".repeat(4001) })).status, 400);
  const ok = await h.post("/api/prompt", { id: w.id, ticket: who.ticket, text: "选 A" });
  assert.equal(ok.status, 200);
  assert.equal(h.delivered.length, 1);
  assert.equal(h.delivered[0].openId, "ou_member");
  assert.equal(h.delivered[0].text, "选 A");
  assert.equal(h.delivered[0].widget.chat, "oc_group");
  for (let i = 0; i < 5; i++) await h.post("/api/prompt", { id: w.id, ticket: who.ticket, text: "again" });
  assert.equal((await h.post("/api/prompt", { id: w.id, ticket: who.ticket, text: "too many" })).status, 429);
});

test("a ticket works only for the widget it was issued on", async (t) => {
  const h = await boot(); t.after(h.close);
  const a = await h.create({ title: "一" });
  const b = await h.create({ title: "二" });
  const who = await (await h.post("/api/identity", { id: a.id, code: "good" })).json();
  assert.equal((await h.post("/api/prompt", { id: b.id, ticket: who.ticket, text: "x" })).status, 401);
});

test("leaving the chat stops a live ticket", async (t) => {
  let member = true;
  const h = await boot({ identity: { isMember: async () => member } }); t.after(h.close);
  const w = await h.create();
  const who = await (await h.post("/api/identity", { id: w.id, code: "good" })).json();
  member = false;
  assert.equal((await h.post("/api/prompt", { id: w.id, ticket: who.ticket, text: "x" })).status, 403);
  assert.equal(h.delivered.length, 0);
});

test("the same title in a session updates in place and keeps the url", async (t) => {
  const h = await boot(); t.after(h.close);
  const first = await h.create();
  await fetch(`${h.adm}/v1/widgets/${first.id}/message`, { method: "POST", headers: { authorization: `Bearer ${ADMIN}` }, body: JSON.stringify({ messageId: "om_card" }) });
  const second = await h.create({ html: "<p>v2</p>" });
  assert.equal(second.id, first.id);
  assert.equal(second.version, 2);
  assert.equal(second.messageId, "om_card");
  assert.equal(await (await fetch(`${h.pub}/w/${first.id}/frame`)).text(), "<p>v2</p>");
  assert.equal((await (await fetch(`${h.pub}/w/${first.id}/meta`)).json()).version, 2);
  const other = await h.create({ sessionKey: "agent:m:feishu:group:oc_other" });
  assert.notEqual(other.id, first.id, "another session never shares a widget");
});

test("expired widgets are gone", async (t) => {
  let clock = Date.now();
  const h = await boot({ host: { now: () => clock } }); t.after(h.close);
  const w = await h.create();
  clock += 31 * 24 * 60 * 60 * 1000;
  assert.equal((await fetch(`${h.pub}/open?w=${w.id}`)).status, 404);
});

test("the audit log never holds tickets, codes or text", async (t) => {
  const h = await boot(); t.after(h.close);
  const w = await h.create();
  const who = await (await h.post("/api/identity", { id: w.id, code: "good" })).json();
  await h.post("/api/prompt", { id: w.id, ticket: who.ticket, text: "秘密内容" });
  const log = fs.readFileSync(path.join(h.stateDir, "audit.jsonl"), "utf8");
  assert(!log.includes(who.ticket) && !log.includes("秘密内容") && !log.includes("good"));
});
