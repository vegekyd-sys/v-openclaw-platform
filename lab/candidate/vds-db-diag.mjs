// Diagnostic: which sqlite files does a candidate Gateway open during DB91 preflight?
// Stops the Gateway after 45s, long before it could admit traffic.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const cfg = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, "utf8"));
const shared = process.env.VLAB_SHARED_STATE_DIR;
console.log(JSON.stringify({ state: process.env.OPENCLAW_STATE_DIR, integrityRoot: process.env.OPENCLAW_DB91_INTEGRITY_STATE_ROOT,
  agentDirs: Object.fromEntries(Object.entries(cfg.agents?.entries ?? {}).map(([k, v]) => [k, v.agentDir])),
  agentsList: (cfg.agents?.list ?? []).map((a) => [a.id, a.agentDir]) }));
const sq = spawnSync("bash", ["-c", `find ${process.env.OPENCLAW_STATE_DIR} -name '*.sqlite' -printf '%p %s %l\\n' | head -20; find ${process.env.OPENCLAW_STATE_DIR}/agents -maxdepth 2 -type l -printf 'LINK %p -> %l\\n' | head`], { encoding: "utf8" });
console.log("sqlite-before:\n" + sq.stdout);
cfg.channels = {}; cfg.cron = { ...(cfg.cron ?? {}), enabled: false };
fs.writeFileSync(process.env.OPENCLAW_CONFIG_PATH, JSON.stringify(cfg, null, 2));
const gw = spawn(process.execPath, [`${runtime}/openclaw/dist/index.js`, "gateway", "--port", String(cfg.gateway.port)], { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
let err = "";
gw.stderr.on("data", (c) => { err += c; });
const seen = new Set();
for (let i = 0; i < 15; i++) {
  await new Promise((r) => setTimeout(r, 3000));
  const kids = spawnSync("bash", ["-c", `pgrep -P ${gw.pid}; echo ${gw.pid}`], { encoding: "utf8" }).stdout.split(/\s+/).filter(Boolean);
  for (const pid of kids) {
    const out = spawnSync("bash", ["-c", `ls -l /proc/${pid}/fd 2>/dev/null | grep -o '/[^ ]*\\.sqlite[^ ]*'`], { encoding: "utf8" }).stdout;
    for (const f of out.split("\n").filter(Boolean)) if (!seen.has(f)) { seen.add(f); console.log(`t=${(i + 1) * 3}s pid=${pid} open ${f} ${f.startsWith(shared) ? "<<SHARED>>" : ""}`); }
  }
}
gw.kill("SIGKILL"); spawnSync("bash", ["-c", `pkill -9 -P ${gw.pid} || true`]);
console.log("stderr-trace:\n" + err.split("\n").filter((l) => /db91|parity-native|integrity/i.test(l)).slice(0, 20).join("\n"));
