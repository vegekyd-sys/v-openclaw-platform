// Read-only state artifacts: A9 receipts / integrity dir / revocations (A9, 3cce8b2, 2aaf8c3, 78dbe94),
// startup migration leftovers (c7879215b95), memory FTS triggers + sampled row alignment (192851b7f6d / A7),
// vec chunk_size (A19), A10 verifier cgroup, A2/A4 coordinator lock holders, worker env names.
// SQLite is opened read-only (mode=ro) as the Gateway's own user so no root-owned side files appear.
//   node r7-state.mjs <label> <outDir>
import fs from "node:fs";
import path from "node:path";
import { discoverGateway, writeReceipt, run, sleep } from "./lib.mjs";

const [label, outDir] = process.argv.slice(2);
const gw = discoverGateway();
const S = gw.env.OPENCLAW_STATE_DIR;
const user = run("stat", ["-c", "%U", `/proc/${gw.pid}`]);
const sql = (db, q, timeout = 240_000) => {
  try { return run("runuser", ["-u", user, "--", "timeout", String(Math.floor(timeout / 1000)), "sqlite3", "-readonly", "-json", `file:${db}?mode=ro`, q], timeout + 5_000); }
  catch (e) { return `ERR ${String(e.stderr ?? e.message).slice(0, 300)}`; }
};
const parse = (s) => { try { return s ? JSON.parse(s) : []; } catch { return s; } };
const out = { label, at: new Date().toISOString(), pid: gw.pid };
const startedMs = Date.parse(`${(gw.startedAt.match(/\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/) ?? [])[0].replace(" ", "T")}+08:00`);
const agentDbs = fs.readdirSync(path.join(S, "agents")).map((a) => ({ agentId: a, db: path.join(S, "agents", a, "agent", "openclaw-agent.sqlite") })).filter((x) => fs.existsSync(x.db));

// 78dbe94b3c2 / 3cce8b21848: validation receipts
const RD = gw.env.OPENCLAW_AGENT_DB_VALIDATION_RECEIPT_DIR;
const epoch = gw.env.OPENCLAW_AGENT_DB_VALIDATION_EPOCH;
out.validationReceipts = { dir: RD, epochSet: Boolean(epoch), files: [] };
if (RD && fs.existsSync(RD)) for (const f of fs.readdirSync(RD).filter((f) => f.endsWith(".json"))) {
  const st = fs.statSync(path.join(RD, f));
  let j = {}; try { j = JSON.parse(fs.readFileSync(path.join(RD, f), "utf8")); } catch {}
  out.validationReceipts.files.push({ f, agentId: j.agentId, ownerPidIsGateway: j.ownerPid === gw.pid, epochMatches: j.epoch === epoch, canonicalReady: j.canonicalReady, durable: j.durable, mtimeAfterStart: st.mtimeMs >= startedMs });
}
// A9: per-lifecycle integrity dir (newest dir created after start), receipts + revocations
const IDIR = path.join(S, ".db91-integrity");
const dirs = fs.existsSync(IDIR) ? fs.readdirSync(IDIR).map((d) => ({ d, m: fs.statSync(path.join(IDIR, d)).mtimeMs, c: fs.statSync(path.join(IDIR, d)).ctimeMs })).filter((x) => x.c >= startedMs - 5_000).sort((a, b) => b.c - a.c) : [];
out.a9 = { lifecycleDirs: dirs.map((x) => x.d) };
if (dirs[0]) {
  const D = path.join(IDIR, dirs[0].d);
  const files = fs.readdirSync(D);
  out.a9.dir = dirs[0].d;
  out.a9.receipts = files.filter((f) => f.endsWith(".json") && !f.endsWith(".revoked.json")).map((f) => { let j = {}; try { j = JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch {} return { f: f.slice(0, 12), source: j.source, version: j.identity?.version, epochMatchesDir: j.epoch === dirs[0].d, format: j.format }; });
  out.a9.revoked = files.filter((f) => f.endsWith(".revoked.json")).map((f) => { let j = {}; try { j = JSON.parse(fs.readFileSync(path.join(D, f), "utf8")); } catch {} return { f: f.slice(0, 12), reason: j.reason }; });
  out.a9.globalRevoked = files.includes("global.revoked.json");
}
// c7879215b95: no duplicate pre-migration backups, no leftover startup-migration lease
out.migration = {
  preMigrationBaks: run("bash", ["-c", `find ${S} -maxdepth 5 -name '*.pre-startup-migration-*.bak' 2>/dev/null | wc -l`]),
  startupLeases: parse(sql(path.join(S, "state/openclaw.sqlite"), "select count(*) n from state_leases where scope='startup-migrations'", 60_000)),
  userVersions: agentDbs.map((x) => ({ agentId: x.agentId, v: parse(sql(x.db, "pragma user_version", 60_000))?.[0]?.user_version })),
};
// 192851b7f6d (A7 x 9.6 body FTS) + A19 vec chunk_size, per agent DB that has memory tables
out.memory = [];
for (const x of agentDbs) {
  const tables = parse(sql(x.db, "select name from sqlite_master where name like 'memory_index%' and type in ('table','trigger')", 60_000));
  if (!Array.isArray(tables) || tables.length === 0) continue;
  const names = tables.map((t) => t.name);
  const trig = ["memory_index_chunks_fts_after_insert", "memory_index_chunks_fts_after_update", "memory_index_chunks_fts_after_delete", "memory_index_paths_fts_after_insert", "memory_index_paths_fts_after_update", "memory_index_paths_fts_after_delete"];
  const row = { agentId: x.agentId, triggers: trig.filter((t) => names.includes(t)).length, hasVec: names.includes("memory_index_chunks_vec") };
  if (names.includes("memory_index_chunks") && names.includes("memory_index_chunks_fts")) {
    row.chunks = parse(sql(x.db, "select count(*) n from memory_index_chunks"))?.[0]?.n;
    row.sampledMisaligned = parse(sql(x.db, "select count(*) bad from (select chunk_rowid, id from memory_index_chunks where rowid >= (abs(random()) % (select max(rowid) from memory_index_chunks)) limit 500) c left join memory_index_chunks_fts f on f.rowid=c.chunk_rowid where f.rowid is null or f.id is not c.id"))?.[0]?.bad;
  }
  if (row.hasVec) {
    row.vecChunkSize = parse(sql(x.db, "select case when instr(sql,'chunk_size=')>0 then cast(substr(sql,instr(sql,'chunk_size=')+11) as int) else 1024 end cs from sqlite_master where name='memory_index_chunks_vec'", 60_000))?.[0]?.cs;
  }
  out.memory.push(row);
}
// A10: verifier cgroup
const cg = `/sys/fs/cgroup${run("systemctl", ["show", "openclaw-vlab-production-mirror-v8", "-p", "ControlGroup", "--value"])}/database-verifier`;
const rd = (f) => { try { return fs.readFileSync(path.join(cg, f), "utf8").trim(); } catch { return null; } };
out.a10 = { cgroup: cg, exists: fs.existsSync(cg), high: rd("memory.high"), max: rd("memory.max"), swapMax: rd("memory.swap.max"), peak: rd("memory.peak"),
  pass: rd("memory.high") === "536870912" && rd("memory.max") === "1073741824" && rd("memory.swap.max") === "0" };
// A2 / A4: coordinator lock holders sampled for ~20 s
const makaronDb = path.join(S, "agents/makaron/agent/openclaw-agent.sqlite");
const inode = (f) => { try { return fs.statSync(f).ino; } catch { return null; } };
const coord = { writer: inode(`${makaronDb}.session-writer-coordinator`), maint: inode(`${makaronDb}.automatic-maintenance-coordinator`) };
const samples = { writer: new Set(), maint: new Set(), writerMaxConcurrent: 0 };
for (let i = 0; i < 20; i++) {
  const locks = fs.readFileSync("/proc/locks", "utf8").split("\n");
  const holders = (ino) => locks.filter((l) => ino && new RegExp(`:${ino} `).test(l) && !/->/.test(l)).map((l) => l.trim().split(/\s+/)[4]);
  const w = holders(coord.writer); w.forEach((p) => samples.writer.add(p)); samples.writerMaxConcurrent = Math.max(samples.writerMaxConcurrent, new Set(w).size);
  holders(coord.maint).forEach((p) => samples.maint.add(p));
  await sleep(1_000);
}
out.coordinators = { inodes: coord, writerHolders: [...samples.writer], writerMaxConcurrent: samples.writerMaxConcurrent, maintHolders: [...samples.maint] };
// worker processes: env NAMES only
const kids = run("bash", ["-c", `pgrep -P ${gw.pid} || true`]).split("\n").filter(Boolean);
const workerEnv = [];
for (const pid of kids) {
  try {
    const names = fs.readFileSync(`/proc/${pid}/environ`, "utf8").split("\0").map((e) => e.split("=")[0]);
    const cmd = fs.readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0").filter(Boolean).slice(-2).join(" ").slice(-120);
    workerEnv.push({ pid, cmd, VLAB_WORKER_CHILD: names.includes("VLAB_WORKER_CHILD"), receiptDir: names.includes("OPENCLAW_AGENT_DB_VALIDATION_RECEIPT_DIR"), receiptEpoch: names.includes("OPENCLAW_AGENT_DB_VALIDATION_EPOCH"),
      db91Epoch: names.includes("OPENCLAW_DB91_INTEGRITY_EPOCH"), db91Maint: names.includes("OPENCLAW_DB91_MAINTENANCE_ENABLE"), gatewayConfigPath: names.includes("VLAB_GATEWAY_CONFIG_PATH") });
  } catch {}
}
out.children = workerEnv;
out.gatewayEnvNames = gw.envNames.filter((n) => /^OPENCLAW_|^VLAB_/.test(n));
const file = writeReceipt(outDir, `r7-state-${label}`, out);
console.log(JSON.stringify({ file, receipts: out.validationReceipts.files.length, a9: { dir: out.a9.dir, receipts: out.a9.receipts?.length, revoked: out.a9.revoked, global: out.a9.globalRevoked },
  migration: out.migration, memory: out.memory, a10: out.a10.pass, coordinators: out.coordinators, children: workerEnv.length }));
process.exit(0);
