// node --test scripts/v-tv-mcp-bridge.test.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { DEFAULT_UPSTREAM, Upstream, createBridgeServer, readToken, readTokenAssignments, parseListen } from "./v-tv-mcp-bridge.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const TOKEN = "t".repeat(32);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tv-bridge-test-"));

// A stand-in for the Home Assistant tv_mcp component behind stdio.py: newline-delimited
// JSON-RPC, a fixed tool list, one global lock that answers "TV busy" while held, and a
// per-process counter so tests can tell how many upstream processes served them.
const FAKE = path.join(tmp, "fake-tv-mcp.mjs");
fs.writeFileSync(FAKE, `
import readline from "node:readline";
const mode = process.env.FAKE_MODE ?? "ok";
if (mode === "unavailable") { process.stderr.write("TV MCP unavailable: HA not ready\\n"); process.exit(1); }
const tools = [
  { name: "tv_status", description: "Read status", inputSchema: { type: "object", properties: {}, required: [], additionalProperties: false }, annotations: { readOnlyHint: true } },
  { name: "tv_volume", description: "Set volume", inputSchema: { type: "object", properties: { percent: { type: "integer", minimum: 1, maximum: 100 } }, required: ["percent"], additionalProperties: false } },
];
let locked = false, calls = 0;
const out = (m) => process.stdout.write(JSON.stringify(m) + "\\n");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", async (line) => {
  const m = JSON.parse(line);
  if (m.id === undefined) return;
  if (mode === "silent" && m.method !== "initialize") return;
  if (m.method === "initialize") return out({ jsonrpc: "2.0", id: m.id, result: { protocolVersion: "2025-11-25", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "v-xiaomi-tv", version: "1.2.0" } } });
  if (m.method === "tools/list") return out({ jsonrpc: "2.0", id: m.id, result: { tools } });
  if (m.method === "tools/call") {
    calls += 1;
    if (m.params.name === "crash") process.exit(3);
    if (locked) return out({ jsonrpc: "2.0", id: m.id, result: { isError: true, content: [{ type: "text", text: JSON.stringify({ error: "TV busy; retry after the current request" }) }] } });
    locked = true;
    await new Promise((r) => setTimeout(r, Number(process.env.FAKE_DELAY_MS ?? 30)));
    locked = false;
    return out({ jsonrpc: "2.0", id: m.id, result: { content: [{ type: "text", text: JSON.stringify({ response_contract: "tv-status-v3", pid: process.pid, calls }) }] } });
  }
  out({ jsonrpc: "2.0", id: m.id, error: { code: -32601, message: "Method not found" } });
});
`);

async function startBridge(env = {}, opts = {}) {
  const logs = [];
  const upstream = new Upstream({
    argv: [process.execPath, FAKE],
    requestTimeoutMs: opts.requestTimeoutMs ?? 2_000,
    connectTimeoutMs: 2_000,
    retryAfterMs: opts.retryAfterMs ?? 500,
    log: (l) => logs.push(l),
  });
  const prev = { ...process.env };
  Object.assign(process.env, env); // child inherits FAKE_* at spawn time
  const server = createBridgeServer({ upstream, token: TOKEN, log: (l) => logs.push(l) });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/mcp`;
  return {
    upstream, url, logs,
    async close() { upstream.close(); await new Promise((r) => server.close(r)); for (const k of Object.keys(env)) { if (prev[k] === undefined) delete process.env[k]; else process.env[k] = prev[k]; } },
  };
}

let nextId = 1;
async function rpc(url, method, params, { token = TOKEN, headers = {} } = {}) {
  const body = method === null ? params : { jsonrpc: "2.0", id: nextId++, method, ...(params ? { params } : {}) };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}`, ...headers },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: text ? JSON.parse(text) : null, headers: res.headers };
}
const session = async (url) => {
  const init = await rpc(url, "initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "t", version: "1" } });
  await rpc(url, null, { jsonrpc: "2.0", method: "notifications/initialized" });
  return init;
};

test("initialize answers with the upstream's identity and negotiates the client's version", async () => {
  const b = await startBridge();
  try {
    const init = await session(b.url);
    assert.equal(init.status, 200);
    assert.equal(init.body.result.protocolVersion, "2025-06-18");
    assert.deepEqual(init.body.result.serverInfo, { name: "v-xiaomi-tv", version: "1.2.0" });
    assert.deepEqual(init.body.result.capabilities, { tools: { listChanged: false } });
    assert.equal(init.headers.get("mcp-session-id"), null);
    const odd = await rpc(b.url, "initialize", { protocolVersion: "1999-01-01", capabilities: {}, clientInfo: { name: "t", version: "1" } });
    assert.equal(odd.body.result.protocolVersion, "2025-11-25");
  } finally { await b.close(); }
});

test("tools/list and tools/call are forwarded unchanged", async () => {
  const b = await startBridge();
  try {
    await session(b.url);
    const list = await rpc(b.url, "tools/list", {});
    assert.deepEqual(list.body.result.tools.map((t) => t.name), ["tv_status", "tv_volume"]);
    assert.deepEqual(list.body.result.tools[0].annotations, { readOnlyHint: true });
    const call = await rpc(b.url, "tools/call", { name: "tv_status", arguments: {} });
    assert.equal(JSON.parse(call.body.result.content[0].text).response_contract, "tv-status-v3");
    const unknown = await rpc(b.url, "resources/list", {});
    assert.equal(unknown.body.error.code, -32601);
    const ping = await rpc(b.url, "ping");
    assert.deepEqual(ping.body.result, {});
    assert.ok(b.logs.some((l) => /tools\/call tv_status ok \d+ms/u.test(l)));
  } finally { await b.close(); }
});

test("many sessions share one upstream process; the global TV lock still applies", async () => {
  const b = await startBridge({ FAKE_DELAY_MS: "200" });
  try {
    await Promise.all(Array.from({ length: 40 }, () => session(b.url)));
    const results = await Promise.all([1, 2].map(() => rpc(b.url, "tools/call", { name: "tv_status", arguments: {} })));
    const texts = results.map((r) => JSON.parse(r.body.result.content[0].text));
    assert.equal(texts.filter((t) => t.error?.startsWith("TV busy")).length, 1, "second concurrent call meets the busy lock");
    assert.equal(b.upstream.stats.spawns, 1);
    const pids = new Set(texts.filter((t) => t.pid).map((t) => t.pid));
    assert.equal(pids.size, 1);
  } finally { await b.close(); }
});

test("batches, notifications and client responses", async () => {
  const b = await startBridge();
  try {
    const batch = await rpc(b.url, null, [
      { jsonrpc: "2.0", id: "a", method: "ping" },
      { jsonrpc: "2.0", method: "notifications/initialized" },
      { jsonrpc: "2.0", id: "b", method: "tools/list" },
    ]);
    assert.equal(batch.status, 200);
    assert.deepEqual(batch.body.map((r) => r.id), ["a", "b"]);
    const note = await rpc(b.url, null, { jsonrpc: "2.0", method: "notifications/cancelled", params: { requestId: 9 } });
    assert.equal(note.status, 202);
    const resp = await rpc(b.url, null, { jsonrpc: "2.0", id: 5, result: {} });
    assert.equal(resp.status, 202);
    const bad = await rpc(b.url, null, { id: 1, method: "ping" });
    assert.equal(bad.body.error.code, -32600);
  } finally { await b.close(); }
});

test("auth, origin, method and path are enforced", async () => {
  const b = await startBridge();
  try {
    assert.equal((await rpc(b.url, "ping", undefined, { token: "wrong" })).status, 401);
    const noAuth = await fetch(b.url, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(noAuth.status, 401);
    assert.equal((await rpc(b.url, "ping", undefined, { headers: { origin: "http://evil.example" } })).status, 403);
    const get = await fetch(b.url, { headers: { authorization: `Bearer ${TOKEN}`, accept: "text/event-stream" } });
    assert.equal(get.status, 405);
    const del = await fetch(b.url, { method: "DELETE", headers: { authorization: `Bearer ${TOKEN}` } });
    assert.equal(del.status, 405);
    assert.equal((await fetch(b.url.replace("/mcp", "/other"), { method: "POST" })).status, 404);
    await rpc(b.url, "ping", undefined, { token: "${V_TV_MCP_TOKEN}" });
    const health = await (await fetch(b.url.replace("/mcp", "/healthz"))).json();
    assert.equal(health.ok, true);
    assert.ok(health.unauthorized >= 2);
    assert.ok(b.logs.some((l) => /^unauthorized \(mismatch\)/u.test(l)), "first 401 is logged with its kind");
    assert.ok(!b.logs.some((l) => l.includes("wrong")), "the presented token is never logged");
    assert.equal(b.upstream.stats.spawns, 0, "nothing authorised reached the upstream");
  } finally { await b.close(); }
});

test("host header must be loopback when an allow-list is given", async () => {
  const upstream = new Upstream({ argv: [process.execPath, FAKE] });
  const server = createBridgeServer({ upstream, token: TOKEN, allowedHosts: new Set(["127.0.0.1:1"]) });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/mcp`, { method: "POST", headers: { authorization: `Bearer ${TOKEN}` }, body: "{}" });
    assert.equal(res.status, 403);
  } finally { await new Promise((r) => server.close(r)); }
});

test("an upstream that dies fails its in-flight request and is replaced on the next one", async () => {
  const b = await startBridge();
  try {
    await session(b.url);
    const crash = await rpc(b.url, "tools/call", { name: "crash", arguments: {} });
    assert.match(crash.body.error.message, /upstream disconnected/u);
    const again = await rpc(b.url, "tools/call", { name: "tv_status", arguments: {} });
    assert.equal(JSON.parse(again.body.result.content[0].text).response_contract, "tv-status-v3");
    assert.equal(b.upstream.stats.spawns, 2);
  } finally { await b.close(); }
});

test("an unavailable TV MCP reports the upstream's reason and fails fast for a moment", async () => {
  const b = await startBridge({ FAKE_MODE: "unavailable" }, { retryAfterMs: 5_000 });
  try {
    const init = await rpc(b.url, "initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "t", version: "1" } });
    assert.match(init.body.error.message, /HA not ready/u);
    const second = await rpc(b.url, "tools/list", {});
    assert.match(second.body.error.message, /HA not ready/u);
    assert.equal(b.upstream.stats.spawns, 1, "no respawn storm while it is down");
  } finally { await b.close(); }
});

test("a silent upstream times out and is dropped so the next request reconnects", async () => {
  const b = await startBridge({ FAKE_MODE: "silent" }, { requestTimeoutMs: 300 });
  try {
    await session(b.url);
    const r = await rpc(b.url, "tools/list", {});
    assert.match(r.body.error.message, /timed out/u);
    for (let i = 0; i < 50 && b.upstream.state() !== "idle"; i += 1) await new Promise((x) => setTimeout(x, 20));
    assert.equal(b.upstream.state(), "idle");
  } finally { await b.close(); }
});

test("token file: dotenv key or a bare token; listen parsing", () => {
  const env = path.join(tmp, "env");
  fs.writeFileSync(env, `OTHER=1\nV_TV_MCP_TOKEN="${TOKEN}"\n`);
  assert.equal(readToken(env), TOKEN);
  const bare = path.join(tmp, "bare");
  fs.writeFileSync(bare, `${TOKEN}\n`);
  assert.equal(readToken(bare), TOKEN);
  // systemd's EnvironmentFile: the last assignment wins
  fs.writeFileSync(env, `V_TV_MCP_TOKEN=old\nexport V_TV_MCP_TOKEN='${TOKEN}'\n`);
  assert.equal(readToken(env), TOKEN);
  assert.deepEqual(readTokenAssignments(env), ["old", TOKEN]);
  fs.writeFileSync(env, "OTHER=1\n");
  assert.throws(() => readToken(env), /no V_TV_MCP_TOKEN/u);
  assert.deepEqual(readTokenAssignments(env), []);
  assert.deepEqual(parseListen("127.0.0.1:18791"), { host: "127.0.0.1", port: 18791 });
  assert.deepEqual(parseListen("[::1]:5"), { host: "::1", port: 5 });
});

test("the default upstream is V's per-session command on its own ssh connection", () => {
  const i = DEFAULT_UPSTREAM.indexOf("ControlPath=none");
  assert(i > 0 && DEFAULT_UPSTREAM[i - 1] === "-o", "ControlPath=none must be an ssh option");
  assert(DEFAULT_UPSTREAM.indexOf("vlab") > i, "ssh options must precede the host");
  assert.deepEqual(DEFAULT_UPSTREAM.slice(-4), ["vlab", "/usr/bin/python3", "-I", "/srv/v-ha-lab/tv-mcp/stdio.py"]);
});

process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));
void here;
