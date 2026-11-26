// The MCP SDK client OpenClaw ships (bundle-mcp) against scripts/v-tv-mcp-bridge.mjs, with a
// fake TV upstream: three clients, one upstream. Not in CI (needs the SDK from a runtime):
//   MCP_SDK_ROOT=<runtime>/openclaw/node_modules/@modelcontextprotocol/sdk node lab/tv-mcp-bridge-sdk-check.mjs
// 2026-11-26 on VLab with SDK 1.30.0: PASS.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { Upstream, createBridgeServer } from "../scripts/v-tv-mcp-bridge.mjs";

const sdkRoot = process.env.MCP_SDK_ROOT;
assert(sdkRoot, "set MCP_SDK_ROOT to a node_modules/@modelcontextprotocol/sdk directory");
const { Client } = await import(path.join(sdkRoot, "dist/esm/client/index.js"));
const { StreamableHTTPClientTransport } = await import(path.join(sdkRoot, "dist/esm/client/streamableHttp.js"));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tv-bridge-sdk-"));
const fake = path.join(tmp, "fake.mjs");
fs.writeFileSync(fake, `import readline from "node:readline";
readline.createInterface({ input: process.stdin }).on("line", (l) => { const m = JSON.parse(l); if (m.id === undefined) return;
  const r = m.method === "initialize" ? { protocolVersion: "2025-11-25", capabilities: { tools: { listChanged: false } }, serverInfo: { name: "v-xiaomi-tv", version: "1.2.0" } }
    : m.method === "tools/list" ? { tools: [{ name: "tv_status", inputSchema: { type: "object", properties: {} } }] }
    : { content: [{ type: "text", text: JSON.stringify({ response_contract: "tv-status-v3" }) }] };
  process.stdout.write(JSON.stringify({ jsonrpc: "2.0", id: m.id, result: r }) + "\\n"); });`);
const TOKEN = "s".repeat(32);
const upstream = new Upstream({ argv: [process.execPath, fake] });
const server = createBridgeServer({ upstream, token: TOKEN });
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const url = new URL(`http://127.0.0.1:${server.address().port}/mcp`);
try {
  const clients = [];
  for (let i = 0; i < 3; i += 1) {
    const c = new Client({ name: "sdk-check", version: "1" });
    await c.connect(new StreamableHTTPClientTransport(url, { requestInit: { headers: { authorization: `Bearer ${TOKEN}` } } }));
    clients.push(c);
  }
  assert.deepEqual((await clients[0].listTools()).tools.map((t) => t.name), ["tv_status"]);
  const r = await clients[2].callTool({ name: "tv_status", arguments: {} });
  assert.equal(JSON.parse(r.content[0].text).response_contract, "tv-status-v3");
  for (const c of clients) await c.close();
  assert.equal(upstream.stats.spawns, 1);
  console.log("PASS: MCP SDK clients share one upstream through the bridge");
} finally { upstream.close(); server.close(); fs.rmSync(tmp, { recursive: true, force: true }); }
