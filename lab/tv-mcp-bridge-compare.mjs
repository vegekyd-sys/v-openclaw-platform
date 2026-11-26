// Compare the TV MCP reached directly (one stdio process, as every V session did) with
// the same MCP reached through scripts/v-tv-mcp-bridge.mjs. Read-only: only initialize,
// tools/list and tv_status are called.
//
//   node lab/tv-mcp-bridge-compare.mjs --upstream '["ssh","vlab","/usr/bin/python3","-I","/srv/v-ha-lab/tv-mcp/stdio.py"]' [--sessions 20]
//
// Starts its own bridge on a free loopback port with a throwaway token. Prints JSON.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import readline from "node:readline";
import { parseArgs } from "node:util";
import { Upstream, createBridgeServer } from "../scripts/v-tv-mcp-bridge.mjs";

const { values } = parseArgs({ options: { upstream: { type: "string" }, sessions: { type: "string", default: "20" } } });
const argv = JSON.parse(values.upstream);
const SESSIONS = Number(values.sessions);

async function direct() {
  const child = spawn(argv[0], argv.slice(1), { stdio: ["pipe", "pipe", "inherit"] });
  const rl = readline.createInterface({ input: child.stdout });
  const waiting = new Map();
  rl.on("line", (l) => { const m = JSON.parse(l); waiting.get(m.id)?.(m); });
  let id = 0;
  const call = (method, params) => new Promise((resolve) => { id += 1; waiting.set(id, resolve); child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`); });
  const t0 = Date.now();
  const init = await call("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "compare", version: "1" } });
  const initMs = Date.now() - t0;
  child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" })}\n`);
  const list = await call("tools/list", {});
  const t1 = Date.now();
  const status = await call("tools/call", { name: "tv_status", arguments: {} });
  const statusMs = Date.now() - t1;
  child.stdin.end();
  await new Promise((r) => child.on("exit", r));
  return { init: init.result, tools: list.result, status: status.result, initMs, statusMs };
}

async function viaBridge() {
  const token = crypto.randomBytes(24).toString("base64url");
  const upstream = new Upstream({ argv, log: () => {} });
  const server = createBridgeServer({ upstream, token });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const url = `http://127.0.0.1:${server.address().port}/mcp`;
  let n = 0;
  const rpc = async (method, params) => {
    const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: "2.0", id: ++n, method, params }) });
    return (await res.json()).result;
  };
  try {
    const t0 = Date.now();
    const init = await rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "compare", version: "1" } });
    const firstInitMs = Date.now() - t0;
    const t1 = Date.now();
    const inits = await Promise.all(Array.from({ length: SESSIONS }, () => rpc("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "compare", version: "1" } })));
    const laterInitMs = Date.now() - t1;
    const list = await rpc("tools/list", {});
    const t2 = Date.now();
    const status = await rpc("tools/call", { name: "tv_status", arguments: {} });
    const statusMs = Date.now() - t2;
    return { init, tools: list, status, firstInitMs, laterInitMs, sessions: inits.length, spawns: upstream.stats.spawns };
  } finally { upstream.close(); server.close(); }
}

const shape = (status) => {
  const body = JSON.parse(status.content[0].text);
  return { isError: Boolean(status.isError), keys: Object.keys(body).sort(), contract: body.response_contract, device: body.device };
};
const a = await direct();
const b = await viaBridge();
const out = {
  serverInfoEqual: JSON.stringify(a.init.serverInfo) === JSON.stringify(b.init.serverInfo),
  capabilitiesEqual: JSON.stringify(a.init.capabilities) === JSON.stringify(b.init.capabilities),
  toolsListByteEqual: JSON.stringify(a.tools) === JSON.stringify(b.tools),
  toolNames: b.tools.tools.map((t) => t.name),
  statusDirect: shape(a.status), statusBridge: shape(b.status),
  timing: { directInitMs: a.initMs, directStatusMs: a.statusMs, bridgeFirstInitMs: b.firstInitMs, bridgeLaterInitsMs: b.laterInitMs, bridgeStatusMs: b.statusMs },
  bridgeSessions: b.sessions + 1, bridgeUpstreamSpawns: b.spawns,
};
console.log(JSON.stringify(out, null, 1));
assert(out.serverInfoEqual && out.capabilitiesEqual && out.toolsListByteEqual, "bridge differs from direct");
assert.deepEqual(out.statusDirect, out.statusBridge);
assert.equal(out.bridgeUpstreamSpawns, 1);
console.log("PASS: bridge matches direct; one upstream for all sessions");
