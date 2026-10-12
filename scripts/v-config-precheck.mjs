#!/usr/bin/env node
// Tell, before writing, what a config change will do to the running production V Gateway.
//
// The authority is the live Gateway: `config.schema.lookup` returns reloadKind
// (hot | none | restart) from the same rule table the config watcher uses,
// including rules that loaded plugins register (browser.profiles is hot,
// plugins.allow restarts because canvas is installed). The CLI's own hint is
// not used: it is printed only after the write and misses plugin rules.
// See docs/config-reload-matrix.md.
//
// Usage (on V, as a user that can run `openclaw gateway call`):
//   v-config-precheck --set 'browser.ssrfPolicy.allowedHostnames=["ha.lan"]' --path browser.profiles.ha-lab
//   v-config-precheck --json --path plugins.entries.xai.config.xSearch
// Exit: 0 every path hot/none, 2 at least one path restarts the Gateway, 1 error.
import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

// Side effects of a hot reload in 2026.9.1 (src/gateway/config-reload-plan.ts,
// server-reload-hot.ts). Longest prefix wins, same as the Gateway.
const HOT_EFFECTS = [
  ["plugins.entries", "重载全部插件：插件服务停再起、MCP 运行时被丢弃；渠道插件的渠道会先等在途工作（≤300 s）再断开重连"],
  ["plugins.slots", "重载全部插件（同上）"],
  ["talk.provider", "重载全部插件（同上）"],
  ["talk.realtime.provider", "重载全部插件（同上）"],
  ["channels", "该渠道断开重连：先等在途工作（≤300 s），超时也照样重连"],
  ["mcp", "丢弃 MCP 运行时，下次调用重建"],
  ["cron", "重启定时任务调度器"],
  ["hooks.gmail", "重启 Gmail watcher 和 hooks"],
  ["hooks", "重新加载 hooks"],
  ["agents.defaults.mediaMaxMb", "所有渠道断开重连"],
  ["agents.defaults.heartbeat", "重启心跳"],
  ["agents.defaults.model", "重启心跳"],
  ["agents.defaults.models", "重启心跳"],
  ["agents.defaults.modelPolicy", "重启心跳"],
  ["agents.entries", "重启心跳"],
  ["agent.heartbeat", "重启心跳"],
  ["models", "重启心跳"],
];

const WORKER_NOTE = "Worker 配置随后自动推导；Worker 那份有变化就排空式换代（旧回合做完再退，约 10–30 s）";

export function parseArgs(argv) {
  const opts = { paths: [], json: false, openclaw: "openclaw", unit: "openclaw-gateway" };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const value = () => {
      if (i + 1 >= argv.length) throw new Error(`${arg} needs a value`);
      return argv[++i];
    };
    if (arg === "--set") opts.paths.push(setPath(value()));
    else if (arg === "--path") opts.paths.push(normalizePath(value()));
    else if (arg === "--json") opts.json = true;
    else if (arg === "--openclaw") opts.openclaw = value();
    else if (arg === "--unit") opts.unit = value();
    else if (arg === "-h" || arg === "--help") opts.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!opts.help && opts.paths.length === 0) throw new Error("give at least one --set PATH=JSON or --path PATH");
  return opts;
}

// Same --set PATH=JSON / PATH=@file shape as v-self-restart; only the path matters here.
export function setPath(spec) {
  const eq = spec.indexOf("=");
  if (eq <= 0) throw new Error(`--set expects PATH=JSON, got: ${spec}`);
  return normalizePath(spec.slice(0, eq));
}

export function normalizePath(path) {
  const out = path.trim().replace(/\[["']?([^\]"']+)["']?\]/g, ".$1").replace(/^\.+|\.+$/g, "");
  if (!out) throw new Error("empty config path");
  return out;
}

export function hotEffect(path) {
  let best = null;
  for (const [prefix, effect] of HOT_EFFECTS) {
    if ((path === prefix || path.startsWith(`${prefix}.`)) && (!best || prefix.length > best[0].length)) {
      best = [prefix, effect];
    }
  }
  return best ? best[1] : "只更新运行时配置快照，下一次读取时生效";
}

// Map keys such as browser.profiles.<name> or a new plugins.entries.<id> may not
// resolve in the schema; reload rules are prefix rules, so the deepest ancestor
// that resolves carries the same kind.
export function classify(path, lookup) {
  const parts = path.split(".");
  for (let n = parts.length; n > 0; n--) {
    const candidate = parts.slice(0, n).join(".");
    const result = lookup(candidate);
    if (result && result.reloadKind) {
      return { path, resolvedAt: candidate, reloadKind: result.reloadKind };
    }
  }
  return { path, resolvedAt: null, reloadKind: "restart", note: "schema 里找不到这个路径，Gateway 对未匹配路径默认整体重启" };
}

export function verdict(entries, gatewayActive) {
  const restart = entries.filter((e) => e.reloadKind === "restart");
  const lines = [];
  if (!gatewayActive) {
    lines.push("Gateway 当前没有运行：现在写配置不会触发任何重载，下次启动时生效。");
  } else if (restart.length > 0) {
    lines.push(`需要整体重启 Gateway：${restart.map((e) => e.path).join(", ")}`);
    lines.push("不要用 openclaw config set/patch 直接写：写入后 Gateway 会立刻自行重启；有在途回合时先等最多 300 s（新消息照收，但会在强制重启时被中止），然后强制重启、中止所有在途回合和夜班任务，再停机约 3–5 分钟。");
    lines.push("改用：sudo v-self-restart --reason ... --requested-by ... --chat ... --session-key ... --set 'PATH=JSON'（停机期间写入，起不来自动回滚）。需要 Tianyi 明确同意重启。");
  } else {
    lines.push("可以热生效，不会重启 Gateway。");
  }
  for (const e of entries) {
    if (e.reloadKind === "hot") e.effect = hotEffect(e.path);
    if (e.reloadKind === "none") e.effect = "运行时配置快照更新后，下一次读取即生效";
  }
  return { ok: true, gatewayActive, restartRequired: gatewayActive && restart.length > 0, entries, advice: lines, worker: WORKER_NOTE };
}

function gatewayIsActive(unit) {
  try {
    return execFileSync("systemctl", ["is-active", unit], { encoding: "utf8" }).trim() === "active";
  } catch {
    return false;
  }
}

function liveLookup(openclaw) {
  const cache = new Map();
  return (path) => {
    if (cache.has(path)) return cache.get(path);
    let result = null;
    try {
      const out = execFileSync(
        openclaw,
        ["gateway", "call", "config.schema.lookup", "--params", JSON.stringify({ path }), "--json"],
        { encoding: "utf8", timeout: 60_000, stdio: ["ignore", "pipe", "pipe"] },
      );
      result = JSON.parse(out.slice(out.indexOf("{")));
    } catch {
      result = null;
    }
    cache.set(path, result);
    return result;
  };
}

function render(report) {
  const kindText = { hot: "热生效", none: "无需动作", restart: "需整体重启" };
  const out = [];
  for (const e of report.entries) {
    const at = e.resolvedAt && e.resolvedAt !== e.path ? `（按 ${e.resolvedAt} 判定）` : "";
    out.push(`- ${e.path}: ${kindText[e.reloadKind] ?? e.reloadKind}${at}${e.effect ? `；${e.effect}` : ""}${e.note ? `；${e.note}` : ""}`);
  }
  out.push("");
  out.push(...report.advice);
  out.push(report.worker);
  return out.join("\n");
}

const USAGE = `Usage: v-config-precheck (--set PATH=JSON | --path PATH)... [--json] [--openclaw BIN] [--unit UNIT]
Asks the running Gateway (config.schema.lookup) whether each path is hot, none or restart.
Exit 0 = no restart, 2 = restart required, 1 = error.`;

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`${err.message}\n${USAGE}`);
    process.exit(1);
  }
  if (opts.help) {
    console.log(USAGE);
    return;
  }
  const active = gatewayIsActive(opts.unit);
  const lookup = active ? liveLookup(opts.openclaw) : () => null;
  if (active && !lookup("gateway")) {
    console.error("config.schema.lookup failed against the running Gateway; cannot tell. Treat the change as restart-required.");
    process.exit(1);
  }
  const entries = active ? opts.paths.map((p) => classify(p, lookup)) : opts.paths.map((p) => ({ path: p, reloadKind: "none", resolvedAt: null, note: "Gateway 未运行" }));
  const report = verdict(entries, active);
  console.log(opts.json ? JSON.stringify(report, null, 2) : render(report));
  process.exit(report.restartRequired ? 2 : 0);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
