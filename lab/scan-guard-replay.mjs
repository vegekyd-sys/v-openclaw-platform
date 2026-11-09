// Replay every shell command of a day's Codex rollouts through v-scan-guard's decision, to
// see what the guard would have refused (and that it leaves the rest alone). Read-only.
//
//   scp apps/v-scan-guard/plugin/core/scan.js lab/scan-guard-replay.mjs v:/tmp/scanguard-replay/
//   ssh v 'cd /tmp && sudo -n -u openclaw ionice -c3 nice /opt/node-v22.23.1/bin/node \
//     /tmp/scanguard-replay/scan-guard-replay.mjs \
//     /home/openclaw/.openclaw/agents/makaron/agent/codex-home/sessions/2026/11/09'
//
// It reads the named directory's *.jsonl files only (no recursion). Output: one JSON summary
// line, then one line per refused call.
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
// scan.js next to this file (as copied above), or SCAN_JS=<path> (e.g. the repo copy).
const { findForbiddenScan } = await import(process.env.SCAN_JS ?? new URL("./scan.js", import.meta.url).href);
const dir = process.argv[2];
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl")).map((f) => path.join(dir, f));
let total = 0, sessions = 0; const hits = [];
for (const file of files) {
  let cwd; let n = 0;
  const rl = readline.createInterface({ input: fs.createReadStream(file), crlfDelay: Infinity });
  for await (const line of rl) {
    if (line.includes('"turn_context"')) { try { cwd = JSON.parse(line).payload?.cwd ?? cwd; } catch {} continue; }
    if (!line.includes('"function_call"')) continue;
    let o; try { o = JSON.parse(line); } catch { continue; }
    const p = o.payload ?? {};
    if (p.type !== "function_call" || !["exec", "exec_command", "shell"].includes(p.name)) continue;
    let a; try { a = JSON.parse(p.arguments); } catch { continue; }
    let cmd = a.command ?? a.cmd; if (Array.isArray(cmd)) cmd = cmd.join(" ");
    if (typeof cmd !== "string") continue;
    total += 1; n += 1;
    const wd = typeof a.workdir === "string" && a.workdir.startsWith("/") ? a.workdir : cwd;
    const hit = findForbiddenScan(cmd, { cwd: wd });
    if (hit) hits.push({ t: (o.timestamp ?? "").slice(11, 19), f: path.basename(file).slice(8, 27), tool: p.name, root: hit.root, how: hit.tool, cmd: cmd.replace(/\s+/g, " ").slice(0, 230) });
  }
  if (n) sessions += 1;
}
console.log(JSON.stringify({ files: files.length, sessionsWithExec: sessions, execCalls: total, blocked: hits.length }));
for (const h of hits) console.log(`${h.t} ${h.f} ${h.tool} [${h.how} → ${h.root}] ${h.cmd}`);
