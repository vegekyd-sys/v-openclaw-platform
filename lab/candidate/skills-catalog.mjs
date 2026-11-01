// Candidate (2026-10-26): does V's skills catalog get truncated, and does config/v-skills-catalog.json
// (skills.limits + skills.entries.<key>.enabled=false, scripts/v-skills-catalog.mjs) fix it as a hot
// change, with the Gateway running and a Worker roll instead of a restart?
//
// V's skill set is rebuilt from tmp/v-skills-catalog-capture.json (lab/candidate/skills-catalog-capture.mjs:
// each skill's SKILL.md frontmatter, no bodies) into a private makaron workspace; bundled and
// custodian skills come from the runtime itself. One private Gateway, one Worker, real DeepSeek.
//   before   new session S1: list the catalog; new session S0: "use makaron"      (V's config, no limits)
//   apply    write the proposal into openclaw.json only, vlab.workers.roll
//   after    S1 again (existing session), new session S2: list, S3: "use makaron"
// Checks per turn: systemPromptReport.skills from session_nodes (what entered the prompt), the
// truncation note in skillsSnapshot, whether the agent reads .../makaron/SKILL.md, and the reply.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";

const runtimeB = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateB = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
const scratch = process.env.VLAB_CANDIDATE_DATA ?? path.dirname(stateB);
assert(runtimeB && configPath && stateB && sharedState, "candidate runtime environment is required");
const MODEL = process.env.SKILLS_MODEL ?? "deepseek/deepseek-v4-flash";
const TURN_TIMEOUT_MS = 600_000;
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const { readProposal, applyProposal, describePrompt } = await import(path.join(repoRoot, "scripts/v-skills-catalog.mjs"));
const proposal = readProposal(path.join(repoRoot, "config/v-skills-catalog.json"));
const capture = JSON.parse(fs.readFileSync(path.join(repoRoot, "tmp/v-skills-catalog-capture.json"), "utf8"));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const log = (...args) => console.error(new Date().toISOString(), ...args);
const out = { capturedAt: capture.capturedAt, model: MODEL, proposal: { limits: proposal.limits, disable: proposal.disable.length }, steps: [] };

// ---- V's skill set in a private workspace ----
const ws = path.join(scratch, "v-skills-workspace");
fs.rmSync(ws, { recursive: true, force: true });
fs.mkdirSync(path.join(ws, "skills"), { recursive: true });
{
  // Bootstrap files from the candidate's makaron workspace, so the prompt keeps its usual shape.
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const from = config.agents.entries.makaron.workspace;
  for (const f of fs.existsSync(from) ? fs.readdirSync(from) : []) if (/\.md$/u.test(f)) fs.copyFileSync(path.join(from, f), path.join(ws, f));
  // Later sources win, as in workspace-skill-loader; every captured skill lands in workspace/skills.
  const winners = new Map();
  for (const s of capture.skills) {
    const name = s.frontmatter ? /^name:\s*["']?(.+?)["']?\s*$/mu.exec(s.frontmatter)?.[1] : undefined;
    winners.set(name ?? `invalid:${s.source}:${s.dir}`, s);
  }
  for (const [name, s] of winners) {
    const dir = path.join(ws, "skills", s.dir);
    if (fs.existsSync(dir)) continue; // same dir name under two names: keep the first
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "SKILL.md"), `${s.frontmatter ?? ""}\n\n# ${name}\n\nskills-catalog candidate fixture for ${name}.\n`);
  }
  out.workspaceSkills = fs.readdirSync(path.join(ws, "skills")).length;
  // Only V's set: the candidate's managed skills would add names V does not have.
  for (const d of ["skills"]) if (fs.existsSync(path.join(stateB, d))) fs.renameSync(path.join(stateB, d), path.join(stateB, `${d}.off-skills-catalog`));
}

// ---- config: V's skills section, makaron on DeepSeek through the Worker ----
const vSkills = (skills) => {
  const entries = {};
  for (const [key, entry] of Object.entries(capture.skillsEntries ?? {})) entries[key] = { enabled: entry.enabled };
  return { ...skills, entries, limits: undefined };
};
const asV = (config, runtimeId) => {
  config.channels = {};
  config.cron = { ...(config.cron ?? {}), enabled: false };
  config.skills = vSkills(config.skills ?? {});
  const entry = { alias: "deepseek", agentRuntime: { id: runtimeId } };
  const model = { primary: MODEL, fallbacks: [] };
  config.agents.defaults.model = model;
  (config.agents.defaults.models ??= {})[MODEL] = entry;
  const makaron = config.agents.entries.makaron;
  makaron.workspace = ws;
  makaron.model = model;
  (makaron.models ??= {})[MODEL] = entry;
  const ds = config.models.providers.deepseek;
  if (!ds.models.some((m) => `deepseek/${m.id}` === MODEL)) {
    const base = ds.models.find((m) => /flash/u.test(m.id)) ?? ds.models[0];
    ds.models.push({ ...base, id: MODEL.split("/")[1], name: "DeepSeek Flash (V)" });
  }
  if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
  const allow = config.agents.defaults.modelPolicy?.allow;
  if (Array.isArray(allow) && !allow.includes(MODEL)) allow.push(MODEL);
  return config;
};
const configB = JSON.parse(fs.readFileSync(configPath, "utf8"));
const port = Number(configB.gateway?.port);
const token = configB.gateway?.auth?.token;
assert(Number.isInteger(port) && token, "candidate Gateway port/token missing");
const workerPlugin = configB.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPlugin, "candidate Worker plugin configuration is missing");
Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0, gatewayConfigPath: configPath });
const workerRel = path.relative(stateB, workerPlugin.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const workerFile = workerPlugin.workerConfigPath;
const sharedRuntime = "/srv/vlab-production-mirror/labs/instances/db91-parity/runtime";
const workerConfig = asV(JSON.parse(fs.readFileSync(path.join(sharedState, workerRel), "utf8")
  .replaceAll(sharedState, stateB).replaceAll(sharedRuntime, runtimeB)), "openclaw");
fs.mkdirSync(path.dirname(workerFile), { recursive: true });
fs.writeFileSync(workerFile, `${JSON.stringify(workerConfig, null, 2)}\n`, { mode: 0o600 });
fs.writeFileSync(configPath, `${JSON.stringify(asV(configB, "vlab-worker"), null, 2)}\n`, { mode: 0o600 });
if (!fs.existsSync(path.join(stateB, "npm"))) assert.equal(spawnSync("cp", ["-a", path.join(sharedState, "npm"), path.join(stateB, "npm")]).status, 0, "copy managed npm plugins");
const dbFile = path.join(stateB, "agents", "makaron", "agent", "openclaw-agent.sqlite");
for (const s of ["", "-wal", "-shm"]) fs.rmSync(dbFile + s, { force: true });

// ---- offline report: the runtime's own buildSkillSnapshot on the current config ----
const report = (label, file) => {
  const r = spawnSync(process.execPath, [path.join(repoRoot, "scripts/v-skills-catalog.mjs"), "report", "--core", path.join(runtimeB, "openclaw"), "--config", file, "--agent", "makaron"],
    { encoding: "utf8", env: { ...process.env, OPENCLAW_LOG_LEVEL: "error" } });
  assert.equal(r.status, 0, `report ${label} failed: ${redact(r.stderr).slice(-800)}`);
  const j = JSON.parse(r.stdout);
  const row = { label, eligible: j.eligible, included: j.included, promptChars: j.promptChars, withDescription: j.withDescription, longestDescription: j.longestDescription, note: j.note, excluded: j.excluded.length, makaronIncluded: !j.excluded.includes("makaron") };
  log("report", JSON.stringify(row));
  return { ...row, excludedNames: j.excluded };
};

// ---- Gateway ----
const startGateway = async () => {
  const tmp = path.join(scratch, "tmp-gw");
  fs.mkdirSync(tmp, { recursive: true, mode: 0o700 });
  const env = { ...process.env, OPENCLAW_GATEWAY_PORT: String(port), TMPDIR: tmp, XDG_CACHE_HOME: path.join(scratch, "cache-gw") };
  delete env.VLAB_OPENCLAW_AGENT_RUNTIME;
  const dist = path.join(runtimeB, "openclaw", "dist");
  const lines = [];
  let proc, starts = 0;
  const launch = () => {
    starts += 1;
    proc = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], { env, stdio: ["ignore", "pipe", "pipe"] });
    for (const s of [proc.stdout, proc.stderr]) {
      s.setEncoding("utf8");
      s.on("data", (chunk) => { for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line }); if (lines.length > 40000) lines.splice(0, lines.length - 40000); });
    }
  };
  launch();
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const gw = { lines, events: [], get proc() { return proc; } };
  const t0 = Date.now();
  for (;;) {
    assert(Date.now() - t0 < 900_000, "Gateway did not become ready");
    if (proc.exitCode !== null) {
      if (starts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { launch(); continue; }
      throw new Error(`Gateway exited ${proc.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
    }
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { gw.client?.stop(); reject(new Error("hello timeout")); }, 5_000);
        gw.client = new GatewayClient({
          url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli",
          scopes: ["operator.admin", "operator.read", "operator.write"],
          onHelloOk: () => { clearTimeout(timeout); resolve(); },
          onConnectError: (error) => { clearTimeout(timeout); reject(error); },
          onEvent: (e) => { if (e.event === "chat" && e.payload?.runId) gw.events.push({ at: Date.now(), ...e.payload }); },
        });
        gw.client.start();
      });
      out.gatewayReadyMs = Date.now() - t0;
      await sleep(15_000);
      log(`Gateway ready in ${out.gatewayReadyMs} ms`);
      return gw;
    } catch {
      gw.client?.stop();
      await sleep(1_000);
    }
  }
};

// ---- turns ----
const textOf = (m) => !m ? "" : typeof m === "string" ? m : typeof m.content === "string" ? m.content : (m.content ?? []).filter((b) => b?.type === "text").map((b) => b.text).join("");
const sessionState = (sessionKey) => {
  const db = new DatabaseSync(dbFile, { readOnly: true });
  try {
    const row = db.prepare("SELECT current_session_id, entry_json FROM session_nodes WHERE session_key = ?").get(sessionKey);
    if (!row) return null;
    const e = JSON.parse(row.entry_json);
    const tools = [];
    for (const { event_json } of db.prepare("SELECT event_json FROM transcript_events WHERE session_id = ? ORDER BY created_at, seq").all(row.current_session_id)) {
      const j = JSON.parse(event_json);
      for (const b of j.message?.role === "assistant" ? j.message.content ?? [] : []) if (b?.type === "toolCall") tools.push(`${b.name}:${JSON.stringify(b.arguments ?? {}).slice(0, 160)}`);
    }
    const snap = describePrompt(e.skillsSnapshot?.prompt ?? "");
    return {
      snapshotVersion: e.skillsSnapshot?.version, snapshotEligible: e.skillsSnapshot?.skills?.length, snapshotIncluded: snap.included, snapshotNote: snap.note,
      reportEntries: e.systemPromptReport?.skills?.entries?.length ?? null, reportPromptChars: e.systemPromptReport?.skills?.promptChars ?? null,
      systemPromptChars: e.systemPromptReport?.systemPrompt?.chars ?? null, harness: e.agentHarnessId, tools,
    };
  } finally { db.close(); }
};
const turn = async (gw, label, sessionKey, message, judge) => {
  const t0 = Date.now();
  const sent = await gw.client.request("chat.send", { agentId: "makaron", sessionKey, message, deliver: false, timeoutMs: TURN_TIMEOUT_MS, idempotencyKey: `skills-${label}-${t0}` });
  let waited;
  try { waited = await gw.client.request("agent.wait", { runId: sent.runId, timeoutMs: TURN_TIMEOUT_MS }, { timeoutMs: TURN_TIMEOUT_MS + 20_000 }); }
  catch (error) { waited = { status: `wait-error:${error.message}` }; }
  await sleep(2_000);
  const terminal = gw.events.filter((e) => e.runId === sent.runId && ["final", "error", "aborted"].includes(e.state));
  const text = terminal.map((e) => textOf(e.message) || e.errorMessage || "").join(" | ");
  const state = sessionState(sessionKey);
  const r = { label, sessionKey, waitStatus: waited?.status, totalS: (Date.now() - t0) / 1000, text: text.slice(0, 600), ...state, ...judge(text, state) };
  log(JSON.stringify(r));
  out.steps.push(r);
  return r;
};
const LIST = "不要调用任何工具。请逐字列出系统提示 <available_skills> 里的全部技能名，用英文逗号分隔，只输出这个列表。";
const listJudge = (text) => {
  const names = text.split(/[,，\n]/u).map((s) => s.trim().replace(/^[`*-]+|[`*]+$/gu, "")).filter(Boolean);
  return { listedCount: names.length, listedMakaron: names.includes("makaron"), listedSceneCli: names.includes("scene-cli"), listedLarkDoc: names.includes("lark-doc"), listedNightShift: names.includes("night-shift-operator") };
};
const USE = "我要用 makaron 生成一张产品主图。先找到并读取对应技能的 SKILL.md（只读这个文件，不要执行别的命令），然后只回复它 frontmatter 里的 name 字段和文件路径。";
const useJudge = (text, state) => {
  const readSkill = (state?.tools ?? []).filter((t) => /makaron\/SKILL\.md/u.test(t));
  return { readMakaronSkill: readSkill.length > 0, searchedFilesystem: (state?.tools ?? []).some((t) => /^(exec|bash|find|grep|ls)/u.test(t) && /SKILL|skills/u.test(t)), toolCalls: state?.tools?.slice(0, 8) };
};

// ---- run ----
let gw;
try {
  out.reportBefore = report("before", configPath);
  gw = await startGateway();
  const workers = async () => { try { const s = await gw.client.request("vlab.workers.status", {}); return { generation: s.generation, workers: s.workers?.length }; } catch (error) { return { error: error.message }; } };
  out.workersBefore = await workers();
  const sk = (n) => `agent:makaron:feishu:direct:ou_skills_catalog_${n}`;
  await turn(gw, "before-list", sk("s1"), `[skills before list] ${LIST}`, listJudge);
  await turn(gw, "before-use", sk("s0"), `[skills before use] ${USE}`, useJudge);

  const writeAt = Date.now();
  {
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
    out.applied = applyProposal(config, proposal).length;
    const tmp = `${configPath}.tmp-skills`;
    fs.writeFileSync(tmp, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, configPath);
  }
  await sleep(10_000);
  const rollAt = Date.now();
  try { out.roll = await gw.client.request("vlab.workers.roll", { reason: "skills-catalog" }, { timeoutMs: 600_000 }); }
  catch (error) { out.roll = { error: error.message }; }
  out.rollS = (Date.now() - rollAt) / 1000;
  out.workersAfter = await workers();
  const worker = JSON.parse(fs.readFileSync(workerFile, "utf8"));
  out.workerFileAfter = { limits: worker.skills?.limits ?? null, disabled: proposal.disable.filter((k) => worker.skills?.entries?.[k]?.enabled === false).length };
  out.reportAfter = report("after", configPath);
  out.gatewayLinesAfterWrite = gw.lines.filter((l) => l.at >= writeAt && /reload|config|rolled generation|draining|skills/iu.test(l.line) && !/Skipping invalid skill|precedence collision/u.test(l.line))
    .map((l) => `${((l.at - writeAt) / 1000).toFixed(1)}s ${redact(l.line).replace(/\s+/gu, " ").slice(0, 240)}`).slice(0, 30);

  await turn(gw, "after-list-existing", sk("s1"), `[skills after list existing] ${LIST}`, listJudge);
  await turn(gw, "after-list-new", sk("s2"), `[skills after list new] ${LIST}`, listJudge);
  await turn(gw, "after-use", sk("s3"), `[skills after use] ${USE}`, useJudge);
  out.invalidSkillWarnings = [...new Set(gw.lines.filter((l) => /Skipping invalid skill/u.test(l.line)).map((l) => /file=(\S+)/u.exec(l.line)?.[1]))];
  out.collisionWarnings = gw.lines.filter((l) => /precedence collision/u.test(l.line)).length;
} catch (error) {
  out.error = redact(error.stack ?? error.message);
} finally {
  gw?.client?.stop();
  if (gw?.proc) {
    gw.proc.kill("SIGTERM");
    for (let i = 0; i < 40 && gw.proc.exitCode === null; i++) await sleep(1_000);
    if (gw.proc.exitCode === null) gw.proc.kill("SIGKILL");
  }
}
const b = out.reportBefore, a = out.reportAfter;
const step = (l) => out.steps.find((s) => s.label === l) ?? {};
out.verdict = {
  beforeTruncated: !!b && b.included < b.eligible,
  afterAllIncluded: !!a && a.included === a.eligible,
  existingSessionRefreshed: step("after-list-existing").reportEntries === a?.included,
  newSessionAll: step("after-list-new").reportEntries === a?.included,
  workerFileDerived: out.workerFileAfter?.limits?.maxSkillsPromptChars === proposal.limits.maxSkillsPromptChars,
  makaronReadAfter: step("after-use").readMakaronSkill === true,
};
console.log(JSON.stringify(out, null, 1));
