#!/usr/bin/env node
// Switch V's mcp.servers.xiaomi-tv-remote between per-session stdio and the shared bridge
// (scripts/v-tv-mcp-bridge.mjs), with the guards the 2026-11-27 review asked for. Run on V
// as root by scripts/install-v-tv-mcp-bridge.sh; docs/v-tv-mcp-bridge.md.
//
//   check-token  the running Gateway's V_TV_MCP_TOKEN (/proc/<pid>/environ) and the one in
//                ~/.openclaw/.env must both exist and be equal (compared by sha256; values
//                are never printed). A token added or changed after the Gateway started is
//                not seen by the Gateway's own MCP client, which then gets 401 on every call.
//   selftest     initialize + tools/list through the bridge with the .env token (read-only).
//   switch       check-token, selftest, then set the url entry. The current entry must equal
//                the expected stdio entry; it is archived for rollback.
//   rollback     set the archived entry back. The current entry must equal the url entry.
//   show         the current entry and the archive.
//
// Every write goes through OpenClaw's own `openclaw config set mcp.servers.xiaomi-tv-remote
// <json> --strict-json`, first on a private copy of openclaw.json: if the copy changed any
// path outside mcp.servers.xiaomi-tv-remote, or the entry is not exactly the target, nothing
// is written. (`openclaw mcp set`, used before, writes back the schema-defaulted config: on
// V it would also add cost/maxTokens to models.providers.moonshot.models[0].) Then the real
// file is backed up, checked unchanged since the copy, written by the same command and
// compared with the copy's result. --dry-run stops after the copy.
//
// Exit codes: 0 done or already in place, 2 usage, 3 Gateway has no token, 4 the write
// would touch other paths, 5 current entry is not the expected one, 6 the real write
// differs from the dry run, 7 token mismatch, 8 .env has no single token, 9 the config
// changed during the run, 10 bridge self-test failed, 11 the OpenClaw CLI failed,
// 12 no archived entry to roll back to.

import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { readTokenAssignments } from "./v-tv-mcp-bridge.mjs";

export const SERVER = "xiaomi-tv-remote";
export const ENTRY_PATH = `mcp.servers.${SERVER}`;
export const TOKEN_KEY = "V_TV_MCP_TOKEN";
export const TOOLS = ["tv_status", "tv_command", "tv_play", "tv_volume", "tv_pause", "tv_screen"];
const COMMON = { connectionTimeoutMs: 10000, requestTimeoutMs: 15000, supportsParallelToolCalls: false, toolFilter: { include: TOOLS } };
// The entry V runs today (2026-11-26).
export const STDIO_ENTRY = {
  enabled: true, transport: "stdio", command: "/usr/bin/ssh",
  args: ["-o", "BatchMode=yes", "-o", "ConnectTimeout=5", "vlab", "/usr/bin/python3", "-I", "/srv/v-ha-lab/tv-mcp/stdio.py"],
  ...COMMON,
};
export const urlEntry = (url = "http://127.0.0.1:18791/mcp") => ({
  enabled: true, transport: "streamable-http", url, headers: { Authorization: `Bearer \${${TOKEN_KEY}}` }, ...COMMON,
});

export class SwitchError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export const canonical = (v) => JSON.stringify(v, (_k, x) => (x && typeof x === "object" && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, x[k]])) : x));
const isRecord = (x) => x !== null && typeof x === "object" && !Array.isArray(x);

/** Leaf paths that differ between two JSON values (a missing side counts as {} when the other is an object). */
export function changedPaths(a, b, prefix = "") {
  const out = [];
  const walk = (x, y, p) => {
    if ((isRecord(x) || x === undefined) && (isRecord(y) || y === undefined) && (isRecord(x) || isRecord(y))) {
      for (const k of new Set([...Object.keys(x ?? {}), ...Object.keys(y ?? {})])) walk(x?.[k], y?.[k], p ? `${p}.${k}` : k);
    } else if (canonical(x) !== canonical(y)) out.push(p);
  };
  walk(a, b, prefix);
  return out.sort();
}
export const outsideEntry = (paths) => paths.filter((p) => p !== ENTRY_PATH && !p.startsWith(`${ENTRY_PATH}.`));
export const entryOf = (config) => config?.mcp?.servers?.[SERVER];

const sha = (s) => crypto.createHash("sha256").update(s).digest();

/** Values of `key` in a NUL-separated environ block (as /proc/<pid>/environ). */
export function environValues(environ, key = TOKEN_KEY) {
  return String(environ).split("\0").filter((l) => l.startsWith(`${key}=`)).map((l) => l.slice(key.length + 1));
}

/**
 * Compare the Gateway's token with the .env token without revealing either.
 * systemd's EnvironmentFile takes the last assignment; a second assignment in .env is refused
 * as ambiguous (the bridge, OpenClaw's dotenv loader and systemd could disagree).
 */
export function tokenCheck({ environ, dotenvFile, key = TOKEN_KEY }) {
  const gw = environValues(environ, key);
  if (gw.length === 0 || !gw.at(-1)) throw new SwitchError(3, `the running Gateway has no ${key} in its environment: install the bridge, let the Gateway restart (it reads ${dotenvFile} at start), then switch`);
  let values;
  try { values = readTokenAssignments(dotenvFile, key); } catch (e) { throw new SwitchError(8, `cannot read ${dotenvFile}: ${e.message}`); }
  if (values.length !== 1 || !values[0]) throw new SwitchError(8, `${dotenvFile} must assign ${key} exactly once (found ${values.length})`);
  if (!crypto.timingSafeEqual(sha(gw.at(-1)), sha(values[0]))) {
    throw new SwitchError(7, `the Gateway's ${key} differs from ${dotenvFile} (re-installed or restored after the Gateway started?): every call would get 401. Restart the Gateway or restore the token it started with, then switch`);
  }
  return { ok: true };
}

/** initialize + tools/list through the bridge (read-only). */
export async function selftest({ url, token, fetchImpl = fetch }) {
  const post = async (body) => {
    const r = await fetchImpl(url, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if (r.status !== 200) throw new SwitchError(10, `bridge self-test: HTTP ${r.status} from ${url}`);
    return r.json();
  };
  try {
    const init = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: { name: "v-tv-mcp-switch", version: "1" } } });
    const list = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" });
    if (!init.result || !list.result) throw new SwitchError(10, `bridge self-test: ${JSON.stringify(init.error ?? list.error)}`);
    const names = list.result.tools.map((t) => t.name);
    const missing = TOOLS.filter((t) => !names.includes(t));
    if (missing.length) throw new SwitchError(10, `bridge self-test: tools missing upstream: ${missing.join(",")}`);
    return { server: `${init.result.serverInfo?.name}@${init.result.serverInfo?.version}`, tools: names };
  } catch (e) {
    throw e instanceof SwitchError ? e : new SwitchError(10, `bridge self-test: ${e.message}`);
  }
}

/** Run `openclaw config set mcp.servers.xiaomi-tv-remote <json> --strict-json` against configPath. */
export function runConfigSet({ cli, runAs, home, stateDir, configPath, entry }) {
  const args = [...cli, "config", "set", ENTRY_PATH, JSON.stringify(entry), "--strict-json"];
  const vars = { ...(home ? { HOME: home } : {}), ...(stateDir ? { OPENCLAW_STATE_DIR: stateDir } : {}), OPENCLAW_CONFIG_PATH: configPath };
  const r = runAs
    ? spawnSync("sudo", ["-n", "-u", runAs, "env", ...Object.entries(vars).map(([k, v]) => `${k}=${v}`), ...args], { encoding: "utf8", timeout: 300_000 })
    : spawnSync(args[0], args.slice(1), { env: { ...process.env, ...vars }, encoding: "utf8", timeout: 300_000 });
  const tail = `${r.stdout ?? ""}${r.stderr ?? ""}`.trim().split("\n").filter((l) => !/api.?key|token|secret/iu.test(l)).slice(-3).join(" | ");
  if (r.status !== 0) throw new SwitchError(11, `openclaw config set failed (exit ${r.status ?? r.signal ?? r.error?.message}): ${tail}`);
  return tail;
}

function ownerOf(user) {
  if (!user) return null;
  const id = (flag) => Number(spawnSync("id", [flag, user], { encoding: "utf8" }).stdout.trim());
  return { uid: id("-u"), gid: id("-g") };
}
const stampNow = () => new Date().toISOString().replace(/[-:]/gu, "").replace(/\..*/u, "").replace("T", "-");

/**
 * Write `target` as the entry, the safe way described at the top. Returns { status, ... }.
 * expectCurrent: the entry that must be in place now (null: anything); archiveDir: where
 * the replaced entry is kept (switch only).
 */
export function applyEntry({ configPath, target, expectCurrent = null, force = false, dryRun = false, cli, runAs = "", home, stateDir, tmpRoot = os.tmpdir(), archiveDir = null, log = () => {} }) {
  const origRaw = fs.readFileSync(configPath, "utf8");
  const orig = JSON.parse(origRaw);
  const current = entryOf(orig);
  if (current !== undefined && canonical(current) === canonical(target)) return { status: "already", changed: [] };
  if (expectCurrent && canonical(current) !== canonical(expectCurrent) && !force) {
    throw new SwitchError(5, `the current ${ENTRY_PATH} is not the expected one; not touching it (--force to override). Current: ${JSON.stringify(current)}`);
  }
  const owner = ownerOf(runAs);
  const dir = fs.mkdtempSync(path.join(tmpRoot, "tv-mcp-dryrun-"));
  try {
    const copy = path.join(dir, "openclaw.json");
    fs.writeFileSync(copy, origRaw, { mode: 0o600 });
    if (owner) { fs.chownSync(dir, owner.uid, owner.gid); fs.chownSync(copy, owner.uid, owner.gid); }
    runConfigSet({ cli, runAs, home, stateDir, configPath: copy, entry: target });
    const dry = JSON.parse(fs.readFileSync(copy, "utf8"));
    const changed = changedPaths(orig, dry);
    const outside = outsideEntry(changed);
    if (outside.length) throw new SwitchError(4, `openclaw config set would also change ${outside.join(", ")}; nothing written`);
    if (canonical(entryOf(dry)) !== canonical(target)) throw new SwitchError(4, `openclaw config set did not write the entry as given (${JSON.stringify(entryOf(dry))}); nothing written`);
    log(`dry run on a copy: only ${ENTRY_PATH} changes (${changed.length} path(s))`);
    if (dryRun) return { status: "dry-run", changed };

    const stamp = stampNow();
    let archived = null;
    if (archiveDir && current !== undefined) {
      fs.mkdirSync(archiveDir, { recursive: true, mode: 0o700 });
      const record = `${JSON.stringify({ savedAt: new Date().toISOString(), configPath, entry: current }, null, 2)}\n`;
      archived = path.join(archiveDir, `pre-switch-${stamp}.json`);
      fs.writeFileSync(archived, record, { mode: 0o600 });
      fs.writeFileSync(path.join(archiveDir, "latest.json"), record, { mode: 0o600 });
      log(`archived the current entry: ${archived}`);
    }
    const st = fs.statSync(configPath);
    const backup = `${configPath}.bak-tv-mcp-${stamp}`;
    fs.copyFileSync(configPath, backup);
    fs.chmodSync(backup, st.mode & 0o777);
    try { fs.chownSync(backup, st.uid, st.gid); } catch {}
    if (!sha(fs.readFileSync(configPath)).equals(sha(origRaw))) throw new SwitchError(9, `${configPath} changed during the run; nothing written (backup ${backup})`);
    log(`backup: ${backup}`);
    runConfigSet({ cli, runAs, home, stateDir, configPath, entry: target });
    const after = JSON.parse(fs.readFileSync(configPath, "utf8"));
    if (canonical(after) !== canonical(dry)) {
      throw new SwitchError(6, `the written config differs from the dry run (${outsideEntry(changedPaths(dry, after)).join(", ") || "entry"}); restore with: cp -p ${backup} ${configPath}`);
    }
    return { status: "written", changed, backup, archived };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

export function readArchive(archiveDir) {
  const file = path.join(archiveDir, "latest.json");
  if (!fs.existsSync(file)) return null;
  const record = JSON.parse(fs.readFileSync(file, "utf8"));
  return { file, ...record };
}

function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  const opts = {};
  for (let i = 0; i < rest.length; i += 1) {
    const m = rest[i].match(/^--([a-z-]+)(?:=(.*))?$/u);
    if (!m) throw new SwitchError(2, `unexpected argument ${rest[i]}`);
    const key = m[1].replace(/-([a-z])/gu, (_s, c) => c.toUpperCase());
    if (["force", "dryRun", "builtinStdio"].includes(key)) opts[key] = true;
    else opts[key] = m[2] ?? rest[(i += 1)];
  }
  return { cmd, opts };
}

export async function main(argv = process.argv.slice(2), { out = (l) => process.stdout.write(`${l}\n`) } = {}) {
  const { cmd, opts } = parseArgs(argv);
  const o = {
    config: "/home/openclaw/.openclaw/openclaw.json",
    home: "/home/openclaw",
    stateDir: "/home/openclaw/.openclaw",
    dotenv: "/home/openclaw/.openclaw/.env",
    runAs: "openclaw",
    archiveDir: "/var/lib/v-tv-mcp-bridge",
    url: "http://127.0.0.1:18791/mcp",
    tmpRoot: os.tmpdir(),
    ...opts,
  };
  const target = urlEntry(o.url);
  const stdio = o.stdioEntry ? JSON.parse(o.stdioEntry) : STDIO_ENTRY;
  const cli = () => { if (!o.cli) throw new SwitchError(2, "--cli '<json argv of openclaw>' is required"); return JSON.parse(o.cli); };
  // --environ-file: a saved environ block instead of /proc/<pid>/environ (tests).
  const environ = () => {
    if (o.environFile) return fs.readFileSync(o.environFile, "latin1");
    if (!o.gatewayPid) throw new SwitchError(2, "--gateway-pid is required");
    return fs.readFileSync(`/proc/${o.gatewayPid}/environ`, "latin1");
  };
  const common = () => ({ configPath: o.config, cli: cli(), runAs: o.runAs, home: o.home, stateDir: o.stateDir, tmpRoot: o.tmpRoot, force: Boolean(o.force), dryRun: Boolean(o.dryRun), log: out });
  const doSelftest = async () => {
    const values = readTokenAssignments(o.dotenv, TOKEN_KEY);
    if (values.length !== 1) throw new SwitchError(8, `${o.dotenv} must assign ${TOKEN_KEY} exactly once (found ${values.length})`);
    const r = await selftest({ url: o.url, token: values[0] });
    out(`bridge ok: ${r.server} ${r.tools.join(",")}`);
  };
  switch (cmd) {
    case "check-token":
      tokenCheck({ environ: environ(), dotenvFile: o.dotenv });
      out(`Gateway ${o.gatewayPid ? `pid ${o.gatewayPid}` : o.environFile}: ${TOKEN_KEY} present and equal to ${o.dotenv}`);
      return 0;
    case "selftest":
      await doSelftest();
      return 0;
    case "switch": {
      tokenCheck({ environ: environ(), dotenvFile: o.dotenv });
      out(`Gateway ${o.gatewayPid ? `pid ${o.gatewayPid}` : o.environFile}: ${TOKEN_KEY} present and equal to ${o.dotenv}`);
      await doSelftest();
      const r = applyEntry({ ...common(), target, expectCurrent: stdio, archiveDir: o.archiveDir });
      out(`switch: ${r.status}${r.backup ? ` (backup ${r.backup})` : ""}`);
      return 0;
    }
    case "rollback": {
      const archive = readArchive(o.archiveDir);
      if (!archive && !o.builtinStdio) throw new SwitchError(12, `no archived entry in ${o.archiveDir}; --builtin-stdio rolls back to the stdio entry of 2026-11-26`);
      const back = archive?.entry ?? stdio;
      out(`rollback target: ${archive ? archive.file : "built-in stdio entry"}`);
      const r = applyEntry({ ...common(), target: back, expectCurrent: target });
      out(`rollback: ${r.status}${r.backup ? ` (backup ${r.backup})` : ""}`);
      return 0;
    }
    case "show": {
      const current = entryOf(JSON.parse(fs.readFileSync(o.config, "utf8")));
      const kind = canonical(current) === canonical(target) ? "bridge url" : canonical(current) === canonical(stdio) ? "per-session stdio" : "other";
      out(`${o.config}: ${kind} ${current?.url ?? current?.command ?? ""}`);
      const archive = readArchive(o.archiveDir);
      out(`archive: ${archive ? `${archive.file} (saved ${archive.savedAt}, ${archive.entry?.transport})` : "none"}`);
      return 0;
    }
    default:
      throw new SwitchError(2, "usage: v-tv-mcp-switch.mjs check-token|selftest|switch|rollback|show [--dry-run] [--force] [--gateway-pid N] [--cli JSON] ...");
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main().then((code) => process.exit(code), (error) => { process.stderr.write(`v-tv-mcp-switch: ${error.message}\n`); process.exit(error instanceof SwitchError ? error.code : 1); });
}
