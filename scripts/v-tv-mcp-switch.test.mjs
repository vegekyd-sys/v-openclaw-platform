#!/usr/bin/env node
import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  STDIO_ENTRY, SwitchError, applyEntry, canonical, changedPaths, environValues, main, outsideEntry, tokenCheck, urlEntry,
} from "./v-tv-mcp-switch.mjs";

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "tv-switch-test-"));
process.on("exit", () => fs.rmSync(tmp, { recursive: true, force: true }));
const TOKEN = "a".repeat(43);
const OTHER = "b".repeat(43);

// Stand-in for `openclaw config set <path> <json> --strict-json` on $OPENCLAW_CONFIG_PATH.
// FAKE_CLI_MODE: ok | normalise (also persists schema defaults elsewhere, as `openclaw mcp
// set` does on V) | fail | real-differs (only when writing a file outside the dry-run dir).
const CLI = path.join(tmp, "fake-openclaw.mjs");
fs.writeFileSync(CLI, `
import fs from "node:fs";
const [cmd, sub, key, value, flag] = process.argv.slice(2);
if (cmd !== "config" || sub !== "set" || flag !== "--strict-json") { console.error("bad usage", process.argv.slice(2)); process.exit(2); }
const mode = process.env.FAKE_CLI_MODE ?? "ok";
if (mode === "fail") { console.error("Config invalid"); process.exit(1); }
const file = process.env.OPENCLAW_CONFIG_PATH;
const config = JSON.parse(fs.readFileSync(file, "utf8"));
let node = config; const parts = key.split(".");
for (const p of parts.slice(0, -1)) node = node[p] ??= {};
node[parts.at(-1)] = JSON.parse(value);
if (mode === "normalise") Object.assign(config.models.providers.moonshot.models[0], { cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, maxTokens: 8192 });
if (mode === "real-differs" && !file.includes("tv-mcp-dryrun-")) config.gateway.port += 1;
fs.writeFileSync(file, JSON.stringify(config, null, 2) + "\\n");
console.log("Updated " + key + ". Change will apply without restarting the gateway.");
`);
const cli = [process.execPath, CLI];

const baseConfig = () => ({
  gateway: { port: 18789, auth: { token: "${GATEWAY_TOKEN}" } },
  models: { providers: { moonshot: { apiKey: "${MOONSHOT_API_KEY}", models: [{ id: "kimi-k3", name: "Kimi" }] } } },
  mcp: { servers: { other: { command: "x" }, "xiaomi-tv-remote": STDIO_ENTRY } },
});
let n = 0;
function fixture(config = baseConfig()) {
  const dir = path.join(tmp, `case-${(n += 1)}`);
  fs.mkdirSync(dir);
  const configPath = path.join(dir, "openclaw.json");
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
  return { dir, configPath, archiveDir: path.join(dir, "archive"), bytes: () => fs.readFileSync(configPath, "utf8") };
}
const withMode = (mode, fn) => { const prev = process.env.FAKE_CLI_MODE; process.env.FAKE_CLI_MODE = mode; try { return fn(); } finally { if (prev === undefined) delete process.env.FAKE_CLI_MODE; else process.env.FAKE_CLI_MODE = prev; } };
const codeOf = (fn) => { try { fn(); } catch (e) { assert(e instanceof SwitchError, e.stack); return e.code; } return 0; };
const backups = (f) => fs.readdirSync(f.dir).filter((x) => x.includes(".bak-tv-mcp-"));

test("changed paths: leaves, created subtrees, and what counts as outside the entry", () => {
  const a = { mcp: { servers: { x: 1 } }, models: { list: [1, 2] } };
  const b = { mcp: { servers: { x: 1, "xiaomi-tv-remote": { url: "u", headers: { A: "b" } } } }, models: { list: [1, 3] } };
  assert.deepEqual(changedPaths(a, b), ["mcp.servers.xiaomi-tv-remote.headers.A", "mcp.servers.xiaomi-tv-remote.url", "models.list"]);
  assert.deepEqual(outsideEntry(changedPaths(a, b)), ["models.list"]);
  assert.deepEqual(outsideEntry(["mcp.servers.xiaomi-tv-remote", "mcp.servers.xiaomi-tv-remote-2.url"]), ["mcp.servers.xiaomi-tv-remote-2.url"]);
  assert.equal(canonical({ b: 1, a: [{ d: 1, c: 2 }] }), canonical({ a: [{ c: 2, d: 1 }], b: 1 }));
});

test("switch writes only the entry, after a dry run on a copy; keeps a backup and archives the old entry", () => {
  const f = fixture();
  const logs = [];
  const r = withMode("ok", () => applyEntry({ configPath: f.configPath, target: urlEntry(), expectCurrent: STDIO_ENTRY, cli, archiveDir: f.archiveDir, tmpRoot: f.dir, log: (l) => logs.push(l) }));
  assert.equal(r.status, "written");
  assert(r.changed.length > 0 && outsideEntry(r.changed).length === 0, r.changed.join(","));
  const after = JSON.parse(f.bytes());
  assert.deepEqual(after.mcp.servers["xiaomi-tv-remote"], urlEntry());
  assert.equal(after.mcp.servers["xiaomi-tv-remote"].headers.Authorization, "Bearer ${V_TV_MCP_TOKEN}");
  assert.deepEqual(changedPaths(baseConfig(), after).filter((p) => !p.startsWith("mcp.servers.xiaomi-tv-remote")), []);
  assert.equal(backups(f).length, 1);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.dir, backups(f)[0]), "utf8")), baseConfig());
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.archiveDir, "latest.json"), "utf8")).entry, STDIO_ENTRY);
  assert(!fs.readdirSync(f.dir).some((x) => x.startsWith("tv-mcp-dryrun-")), "dry-run copy left behind");
  // second run: already in place, nothing written
  assert.equal(withMode("ok", () => applyEntry({ configPath: f.configPath, target: urlEntry(), expectCurrent: STDIO_ENTRY, cli, archiveDir: f.archiveDir, tmpRoot: f.dir })).status, "already");
  assert.equal(backups(f).length, 1);
});

test("a writer that also touches other paths is stopped before the real config is written", () => {
  const f = fixture();
  const before = f.bytes();
  const opts = { configPath: f.configPath, target: urlEntry(), expectCurrent: STDIO_ENTRY, cli, archiveDir: f.archiveDir, tmpRoot: f.dir };
  let message = "";
  const code = withMode("normalise", () => { try { applyEntry(opts); return 0; } catch (e) { message = e.message; return e.code; } });
  assert.equal(code, 4);
  assert.match(message, /models\.providers\.moonshot\.models/u);
  assert.equal(f.bytes(), before);
  assert.equal(backups(f).length, 0);
  assert(!fs.existsSync(f.archiveDir), "archive written although nothing was switched");
  assert.equal(withMode("fail", () => codeOf(() => applyEntry(opts))), 11);
  assert.equal(f.bytes(), before);
});

test("--dry-run reports and writes nothing", () => {
  const f = fixture();
  const before = f.bytes();
  const r = withMode("ok", () => applyEntry({ configPath: f.configPath, target: urlEntry(), expectCurrent: STDIO_ENTRY, cli, archiveDir: f.archiveDir, tmpRoot: f.dir, dryRun: true }));
  assert.equal(r.status, "dry-run");
  assert.equal(f.bytes(), before);
  assert.equal(backups(f).length, 0);
  assert(!fs.existsSync(f.archiveDir));
});

test("an unexpected current entry is not replaced unless forced", () => {
  const config = baseConfig();
  config.mcp.servers["xiaomi-tv-remote"] = { ...STDIO_ENTRY, args: [...STDIO_ENTRY.args.slice(0, 4), "vlab-new", ...STDIO_ENTRY.args.slice(5)] };
  const f = fixture(config);
  const before = f.bytes();
  const opts = { configPath: f.configPath, target: urlEntry(), expectCurrent: STDIO_ENTRY, cli, archiveDir: f.archiveDir, tmpRoot: f.dir };
  assert.equal(withMode("ok", () => codeOf(() => applyEntry(opts))), 5);
  assert.equal(f.bytes(), before);
  assert.equal(withMode("ok", () => applyEntry({ ...opts, force: true })).status, "written");
  // what was actually there is what gets archived, not the built-in entry
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.archiveDir, "latest.json"), "utf8")).entry.args[4], "vlab-new");
});

test("a real write that differs from the dry run is reported with the backup to restore", () => {
  const f = fixture();
  let message = "";
  const code = withMode("real-differs", () => { try { applyEntry({ configPath: f.configPath, target: urlEntry(), expectCurrent: STDIO_ENTRY, cli, tmpRoot: f.dir }); return 0; } catch (e) { message = e.message; return e.code; } });
  assert.equal(code, 6);
  assert.match(message, /gateway\.port/u);
  assert.match(message, /cp -p .*\.bak-tv-mcp-/u);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.dir, backups(f)[0]), "utf8")), baseConfig());
});

test("token check: present, equal, single assignment; values never appear in messages", () => {
  const dotenv = path.join(tmp, "dotenv");
  const environ = (v) => `PATH=/usr/bin\0${v === undefined ? "" : `V_TV_MCP_TOKEN=${v}\0`}HOME=/home/openclaw\0`;
  fs.writeFileSync(dotenv, `DEEPSEEK_API_KEY=x\nV_TV_MCP_TOKEN=${TOKEN}\n`);
  assert.deepEqual(environValues(environ(TOKEN)), [TOKEN]);
  assert.deepEqual(tokenCheck({ environ: environ(TOKEN), dotenvFile: dotenv }), { ok: true });
  const fail = (env) => { try { tokenCheck({ environ: env, dotenvFile: dotenv }); } catch (e) { assert(!e.message.includes(TOKEN) && !e.message.includes(OTHER), "token leaked"); return e.code; } return 0; };
  assert.equal(fail(environ(undefined)), 3); // Gateway started before install
  assert.equal(fail(environ(OTHER)), 7); // install re-run or .env restored after the Gateway started
  fs.writeFileSync(dotenv, `V_TV_MCP_TOKEN="${TOKEN}"\n`);
  assert.equal(fail(environ(TOKEN)), 0); // quotes as systemd strips them
  fs.writeFileSync(dotenv, `V_TV_MCP_TOKEN=${TOKEN}\nV_TV_MCP_TOKEN=${OTHER}\n`);
  assert.equal(fail(environ(TOKEN)), 8);
  fs.writeFileSync(dotenv, "OTHER=1\n");
  assert.equal(fail(environ(TOKEN)), 8);
});

// A bridge stand-in answering initialize + tools/list for the self-test.
async function fakeBridge(token = TOKEN) {
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      if (req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end(); return; }
      const m = JSON.parse(body);
      const result = m.method === "initialize"
        ? { protocolVersion: "2025-11-25", capabilities: { tools: {} }, serverInfo: { name: "v-xiaomi-tv", version: "1.2.0" } }
        : { tools: ["tv_status", "tv_command", "tv_play", "tv_volume", "tv_pause", "tv_screen"].map((name) => ({ name, inputSchema: { type: "object" } })) };
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ jsonrpc: "2.0", id: m.id, result }));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${server.address().port}/mcp`, close: () => new Promise((r) => server.close(r)) };
}

test("main: switch then rollback restores the archived entry; guards stop a bad switch", async () => {
  const f = fixture();
  const bridge = await fakeBridge();
  const dotenv = path.join(f.dir, ".env");
  fs.writeFileSync(dotenv, `V_TV_MCP_TOKEN=${TOKEN}\n`);
  const environFile = path.join(f.dir, "environ");
  fs.writeFileSync(environFile, `V_TV_MCP_TOKEN=${TOKEN}\0`);
  const out = [];
  const args = (cmd, extra = []) => [cmd, "--config", f.configPath, "--dotenv", dotenv, "--run-as", "", "--home", "", "--state-dir", "",
    "--archive-dir", f.archiveDir, "--tmp-root", f.dir, "--url", bridge.url, "--cli", JSON.stringify(cli), "--environ-file", environFile, ...extra];
  const run = async (cmd, extra) => { try { return await withMode("ok", () => main(args(cmd, extra), { out: (l) => out.push(l) })); } catch (e) { if (e instanceof SwitchError) return e.code; throw e; } };
  try {
    assert.equal(await run("rollback"), 12); // nothing archived yet
    // the Gateway holds another token: refused, config untouched
    fs.writeFileSync(environFile, `V_TV_MCP_TOKEN=${OTHER}\0`);
    const before = f.bytes();
    assert.equal(await run("switch"), 7);
    assert.equal(f.bytes(), before);
    fs.writeFileSync(environFile, `V_TV_MCP_TOKEN=${TOKEN}\0`);

    assert.equal(await run("switch", ["--dry-run"]), 0);
    assert.equal(f.bytes(), before);
    assert.equal(await run("switch"), 0);
    assert.deepEqual(JSON.parse(f.bytes()).mcp.servers["xiaomi-tv-remote"].url, bridge.url);
    assert(out.some((l) => l.startsWith("bridge ok: v-xiaomi-tv@1.2.0")), out.join("\n"));
    assert.equal(await run("show"), 0);
    assert(out.some((l) => l.includes("bridge url")), out.join("\n"));

    assert.equal(await run("rollback"), 0);
    assert.deepEqual(JSON.parse(f.bytes()), baseConfig());
    assert.equal(await run("rollback"), 0); // already
    assert(out.at(-1).includes("already"), out.at(-1));
  } finally { await bridge.close(); }
});

test("main: a bridge that rejects the token fails the self-test before any write", async () => {
  const f = fixture();
  const bridge = await fakeBridge(OTHER);
  const dotenv = path.join(f.dir, ".env");
  fs.writeFileSync(dotenv, `V_TV_MCP_TOKEN=${TOKEN}\n`);
  const environFile = path.join(f.dir, "environ");
  fs.writeFileSync(environFile, `V_TV_MCP_TOKEN=${TOKEN}\0`);
  const before = f.bytes();
  try {
    await assert.rejects(main(["switch", "--config", f.configPath, "--dotenv", dotenv, "--run-as", "", "--archive-dir", f.archiveDir, "--tmp-root", f.dir,
      "--url", bridge.url, "--cli", JSON.stringify(cli), "--environ-file", environFile], { out: () => {} }), (e) => e.code === 10 && /HTTP 401/u.test(e.message));
    assert.equal(f.bytes(), before);
  } finally { await bridge.close(); }
});
