// Candidate for lab/release-files/skill-review-bounded (2026-11-10): what does a skill experience
// review send, how often does it run, and does it get out of the way of foreground work?
//
// V 2026-11-02..09: reviews replayed the whole foreground session (largest request 1,518,605 tokens,
// 15-30% overflowed and re-ran compaction), up to 14 times per session per day, on the Gateway thread
// for /vds turns.
//
// Build (A runtime, once): AB_BUILD_TURNS turns on one Feishu-like session against a loopback
// DeepSeek stand-in; each turn reads a distinct ~40 KB file, so the session carries a few MB of
// tool output. The built state is frozen; every arm starts from a copy.
// Per arm (A = live bytes = V, B = release files), one Gateway at a time, embedded runtime (turns and
// reviews run in the Gateway process, as for /vds on V):
//   1. review:   a 10-tool-step turn on the big session -> after 30 s idle a review runs; the stand-in
//                answers it with one skill_workshop create, then NO_REPLY. Recorded: request bytes,
//                messages, tool schemas, max_tokens, reasoning effort, event-loop stalls, outcome.
//   2. cooldown: another 10-step turn on the same session -> is a second review sent within 75 s?
//   3. yield:    a 10-step turn on a second session -> the stand-in holds that review's answer while a
//                foreground turn runs on the first session; then releases it.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import net from "node:net";
import path from "node:path";
import { pathToFileURL } from "node:url";

const runtimeB = process.env.VLAB_CANDIDATE_RUNTIME;
const configPathB = process.env.OPENCLAW_CONFIG_PATH;
const stateB = process.env.OPENCLAW_STATE_DIR;
const sharedState = process.env.VLAB_SHARED_STATE_DIR;
const scratch = process.env.VLAB_CANDIDATE_DATA ?? path.dirname(stateB);
assert(runtimeB && configPathB && stateB && sharedState, "candidate runtime environment is required");
const BUILD_TURNS = Number(process.env.AB_BUILD_TURNS ?? 40);
const ORDER = (process.env.AB_ORDER ?? "AB").split("");
const SESSION_KEY = "agent:makaron:feishu:direct:ou_skill_review_bench";
const SESSION_KEY_2 = "agent:makaron:feishu:direct:ou_skill_review_bench_2";
const MODEL = "deepseek/deepseek-flash";
const REVIEW_MARK = "Skill review. The turn above has ended";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const sha = (value) => createHash("sha256").update(value).digest("hex");
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const log = (...args) => console.error(new Date().toISOString(), ...args);

// ---- runtimes: one runtime, bytes switched in place per arm (the candidate disk has no room for a
// second runtime copy). A = live bytes (= V, checked), B = release files. One Gateway at a time.
const repoRoot = path.resolve(path.dirname(new URL(import.meta.url).pathname), "../..");
const RELEASE = JSON.parse(fs.readFileSync(path.join(repoRoot, "lab/skill-review-bounded.plan.json"), "utf8"));
const bytesByArm = { A: new Map(), B: new Map() };
const installed = [];
for (const file of RELEASE.files) {
  const target = path.join(runtimeB, file.target);
  const live = fs.readFileSync(target);
  assert.equal(sha(live), file.before, `${file.target}: VLab runtime bytes differ from V's`);
  const next = fs.readFileSync(path.join(repoRoot, file.source));
  bytesByArm.A.set(target, live);
  bytesByArm.B.set(target, next);
  installed.push({ target: file.target, a: sha(live), b: sha(next) });
}
for (const f of installed) assert.notEqual(f.a, f.b);
const useArm = (name) => {
  for (const [target, bytes] of bytesByArm[name]) {
    fs.writeFileSync(`${target}.next`, bytes);
    fs.renameSync(`${target}.next`, target);
  }
  for (const f of RELEASE.files) assert.equal(sha(fs.readFileSync(path.join(runtimeB, f.target))), name === "A" ? f.before : installed.find((i) => i.target === f.target).b);
};
useArm("A");
log("installed", JSON.stringify(installed));
const probeUrl = pathToFileURL(path.join(repoRoot, "lab/candidate/el-gap-probe.mjs")).href;

// ---- workspace files read by the turns ----
const configB = JSON.parse(fs.readFileSync(configPathB, "utf8"));
const benchDir = path.join(configB.agents.entries.makaron.workspace, "skill-review-bench");
fs.mkdirSync(benchDir, { recursive: true });
const bigFile = (n) => path.join(benchDir, `log-${String(n).padStart(3, "0")}.txt`);
const smallFile = path.join(benchDir, "step.txt");
for (let n = 1; n <= BUILD_TURNS; n++) {
  const lines = Array.from({ length: 400 }, (_, i) => `${n}:${i} 渲染任务 job-${n}-${i} 状态 ok，输出 /tmp/render/${n}/${i}.mp4 时长 ${(i % 60) + 1}s`);
  fs.writeFileSync(bigFile(n), lines.join("\n"));
}
fs.writeFileSync(smallFile, "step ok\n");

// ---- loopback DeepSeek stand-in ----
const requests = [];
const holds = new Map();
const textOfContent = (content) => typeof content === "string" ? content : (Array.isArray(content) ? content : []).map((b) => b?.text ?? "").join("");
const lastUserText = (messages) => {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i]?.role === "user") return { index: i, text: textOfContent(messages[i].content) };
  return { index: -1, text: "" };
};
const tagIn = (text) => {
  const m = /\[(build|rev|fg) (\w+) (\d+)\]/u.exec(text);
  return m ? { kind: m[1], arm: m[2], n: Number(m[3]) } : undefined;
};
const tagOf = (messages) => {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role !== "user") continue;
    const tag = tagIn(textOfContent(messages[i].content));
    if (tag) return { ...tag, toolSteps: messages.slice(i + 1).filter((x) => x?.role === "tool").length };
  }
};
const isSummaryRequest = (messages) => messages.some((m) => /\[User\]:|<conversation>|summar/iu.test(textOfContent(m.content)) && m.role !== "system")
  && !messages.some((m) => m.role === "tool");
const ownerOf = (port) => {
  const r = spawnSync("ss", ["-tnpH", "state", "established", `( sport = :${port} )`], { encoding: "utf8" });
  const pid = /pid=(\d+)/u.exec(r.stdout ?? "")?.[1];
  return pid ? Number(pid) : null;
};
const sse = (res, model, delta, finish) => {
  const chunk = (d, f, usage) => `data: ${JSON.stringify({ id: "c1", object: "chat.completion.chunk", created: 1, model, choices: [{ index: 0, delta: d, finish_reason: f }], ...(usage ? { usage } : {}) })}\n\n`;
  res.writeHead(200, { "content-type": "text/event-stream" });
  res.end(chunk(delta, null) + chunk({}, finish, { prompt_tokens: 12000, completion_tokens: 20, total_tokens: 12020 }) + "data: [DONE]\n\n");
};
const toolCall = (id, name, args) => ({ role: "assistant", content: "", tool_calls: [{ index: 0, id, type: "function", function: { name, arguments: JSON.stringify(args) } }] });
const server = http.createServer((req, res) => {
  const at = Date.now();
  const chunks = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", async () => {
    const raw = Buffer.concat(chunks);
    let body = {};
    try { body = JSON.parse(raw.toString("utf8")); } catch {}
    const messages = Array.isArray(body.messages) ? body.messages : [];
    const last = lastUserText(messages);
    const review = last.text.includes(REVIEW_MARK);
    const summary = !review && isSummaryRequest(messages);
    const tag = summary ? undefined : tagOf(review ? messages.slice(0, last.index) : messages);
    const rec = { at, pid: ownerOf(req.socket.remotePort), bytes: raw.length, messages: messages.length,
      kind: review ? "review" : summary ? "summary" : tag?.kind ?? "other", arm: tag?.arm, n: tag?.n };
    if (review) {
      const afterPrompt = messages.slice(last.index + 1);
      Object.assign(rec, {
        reviewStep: afterPrompt.filter((m) => m.role === "tool").length,
        tools: (body.tools ?? []).map((t) => t.function?.name ?? t.name).toSorted(),
        maxTokens: body.max_tokens ?? body.max_completion_tokens ?? null,
        reasoningEffort: body.reasoning_effort ?? body.thinking?.type ?? null,
        systemChars: messages.filter((m) => m.role === "system").reduce((s, m) => s + textOfContent(m.content).length, 0),
        historyMessages: last.index,
        historyHasOldestBuild: messages.some((m) => m.role === "user" && textOfContent(m.content).includes(`[build x 1]`)),
        promptListsSkillsCap: /Writable skills \(check this list/u.test(last.text),
        boundedExcerptLine: last.text.includes("bounded excerpt of the most recent events"),
      });
    }
    requests.push(rec);
    if (summary) return sse(res, body.model, { role: "assistant", content: "## 摘要\n渲染日志逐个读过，都正常。" }, "stop");
    if (review) {
      const hold = holds.get(`${rec.arm}:${rec.n}`);
      if (hold && rec.reviewStep === 0) {
        hold.arrived(rec);
        await hold.released;
        rec.releasedAt = Date.now();
        if (req.socket.destroyed) { rec.clientGone = true; return; }
      }
      if (rec.reviewStep === 0 && process.env.AB_REVIEW_CREATE !== "0") {
        return sse(res, body.model, toolCall(`call_review_${rec.arm}_${rec.n}`, "skill_workshop", {
          action: "create", name: `render-log-check-${rec.arm.toLowerCase()}-${rec.n}`,
          description: "Check a batch of render logs: read each log once, report failed jobs only.",
          proposal_content: `# Render log check\n\n1. Read each render log once with read.\n2. Report only jobs whose status is not ok.\n3. Do not re-read logs already reported.\n`,
        }), "tool_calls");
      }
      return sse(res, body.model, { role: "assistant", content: "NO_REPLY" }, "stop");
    }
    if (tag?.kind === "build") {
      if (tag.toolSteps === 0) return sse(res, body.model, toolCall(`call_build_${tag.n}`, "read", { path: bigFile(tag.n) }), "tool_calls");
      return sse(res, body.model, { role: "assistant", content: `第 ${tag.n} 份渲染日志看过了，都是 ok。` }, "stop");
    }
    if (tag?.kind === "rev") {
      if (tag.toolSteps < 10) return sse(res, body.model, toolCall(`call_rev_${tag.arm}_${tag.n}_${tag.toolSteps}`, "read", { path: smallFile }), "tool_calls");
      return sse(res, body.model, { role: "assistant", content: `检查完了（${tag.arm} ${tag.n}）。` }, "stop");
    }
    if (tag?.kind === "fg") return sse(res, body.model, { role: "assistant", content: "前台回复：收到。" }, "stop");
    sse(res, body.model, { role: "assistant", content: "ok" }, "stop");
  });
});
// The stand-in must not take a port the candidate Gateways will use (base port .. +400).
const gatewayBasePort = Number(configB.gateway?.port);
for (;;) {
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const p = server.address().port;
  if (!(p >= gatewayBasePort - 20 && p <= gatewayBasePort + 400)) break;
  await new Promise((resolve) => server.close(resolve));
}
const standinPort = server.address().port;

// ---- configuration: V's model and Workshop setup on the embedded runtime ----
const portB = Number(configB.gateway?.port);
const token = configB.gateway?.auth?.token;
assert(Number.isInteger(portB) && token, "candidate Gateway port/token missing");
const V_FLASH = { id: "deepseek-flash", name: "DeepSeek V4.1 Flash", reasoning: true, input: ["text", "image"], cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, contextWindow: 1000000, maxTokens: 384000, api: "openai-completions", compat: { supportsUsageInStreaming: true, supportsReasoningEffort: true, maxTokensField: "max_tokens", thinkingFormat: "deepseek" } };
const asV = (config) => {
  config.channels = {};
  config.cron = { ...(config.cron ?? {}), enabled: false };
  const ds = config.models.providers.deepseek;
  Object.assign(ds, { baseUrl: `http://127.0.0.1:${standinPort}/v1`, apiKey: "sk-standin-loopback" });
  delete ds.agentRuntime;
  ds.models = [...(ds.models ?? []).filter((m) => m.id !== V_FLASH.id), V_FLASH];
  const entry = { alias: "deepseek", agentRuntime: { id: "openclaw" }, params: { thinking: "high" } };
  config.agents.defaults.model = { primary: MODEL, fallbacks: [] };
  config.agents.defaults.models = { ...(config.agents.defaults.models ?? {}), [MODEL]: entry };
  const makaron = config.agents.entries.makaron;
  makaron.model = { primary: MODEL, fallbacks: [] };
  makaron.models = { ...(makaron.models ?? {}), [MODEL]: entry };
  makaron.agentRuntime = undefined;
  const allow = config.agents.defaults.modelPolicy?.allow;
  if (Array.isArray(allow) && !allow.includes(MODEL)) allow.push(MODEL);
  config.agents.defaults.compaction = { ...(config.agents.defaults.compaction ?? {}), mode: "safeguard", model: MODEL, provider: undefined,
    qualityGuard: { enabled: false }, midTurnPrecheck: { enabled: false }, notifyUser: false };
  // V's Workshop settings (autonomous mode is the default: auto).
  config.skills = { ...(config.skills ?? {}), workshop: { approvalPolicy: "auto", maxSkillBytes: 100000, allowSymlinkTargetWrites: true } };
  if (config.plugins?.entries?.codex) config.plugins.entries.codex.enabled = false;
  if (config.auth?.order?.openai) delete config.auth.order.openai;
  return config;
};
const workerPluginB = configB.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
assert(workerPluginB, "candidate Worker plugin configuration is missing");
Object.assign(workerPluginB, { minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0, gatewayConfigPath: configPathB });
const workerRel = path.relative(stateB, workerPluginB.workerConfigPath);
assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
const sharedRuntime = "/srv/vlab-production-mirror/labs/instances/db91-parity/runtime";
const workerConfigB = asV(JSON.parse(fs.readFileSync(path.join(sharedState, workerRel), "utf8")
  .replaceAll(sharedState, stateB).replaceAll(sharedRuntime, runtimeB)));
fs.mkdirSync(path.dirname(workerPluginB.workerConfigPath), { recursive: true });
fs.writeFileSync(workerPluginB.workerConfigPath, `${JSON.stringify(workerConfigB, null, 2)}\n`, { mode: 0o600 });
fs.writeFileSync(configPathB, `${JSON.stringify(asV(configB), null, 2)}\n`, { mode: 0o600 });
if (!fs.existsSync(path.join(stateB, "npm"))) assert.equal(spawnSync("cp", ["-a", path.join(sharedState, "npm"), path.join(stateB, "npm")]).status, 0, "copy managed npm plugins");

// ---- Gateways ----
const portRangeFree = async (base, span) => {
  for (let p = base; p < base + span; p++) {
    const ok = await new Promise((resolve) => { const s = net.createServer(); s.once("error", () => resolve(false)); s.listen(p, "127.0.0.1", () => s.close(() => resolve(true))); });
    if (!ok) return false;
  }
  return true;
};
const cloneArm = async (from, name, runtime) => {
  const state = path.join(scratch, `arm-${name}`);
  fs.rmSync(state, { recursive: true, force: true });
  assert.equal(spawnSync("cp", ["-a", from.state, state]).status, 0, `copy state for ${name}`);
  let port = from.port + 40;
  while (!(await portRangeFree(port, 12))) port += 13;
  const configPath = path.join(state, `openclaw-${name}.json`);
  const rewrite = (text) => text.replaceAll(from.configPath, configPath).replaceAll(from.state, state).replaceAll(from.runtime, runtime).replaceAll(`"port": ${from.port}`, `"port": ${port}`);
  fs.writeFileSync(configPath, rewrite(fs.readFileSync(from.configPath, "utf8")), { mode: 0o600 });
  fs.writeFileSync(path.join(state, workerRel), rewrite(fs.readFileSync(path.join(from.state, workerRel), "utf8")), { mode: 0o600 });
  return { name, runtime, state, configPath, port };
};
const startGateway = async (arm) => {
  const tmp = path.join(scratch, `tmp-${arm.name}`);
  for (const dir of [tmp, path.join(scratch, `cache-${arm.name}`)]) fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const base = Object.fromEntries(Object.entries(process.env).map(([k, v]) => [k, String(v).replaceAll(configPathB, arm.configPath).replaceAll(stateB, arm.state).replaceAll(runtimeB, arm.runtime)]));
  const probeOut = path.join(scratch, `el-${arm.name}`);
  const env = { ...base, OPENCLAW_CONFIG_PATH: arm.configPath, OPENCLAW_STATE_DIR: arm.state, OPENCLAW_GATEWAY_PORT: String(arm.port),
    TMPDIR: tmp, XDG_CACHE_HOME: path.join(scratch, `cache-${arm.name}`), npm_config_cache: path.join(scratch, `cache-${arm.name}`, "npm"), EL_PROBE_OUT: probeOut };
  delete env.VLAB_OPENCLAW_AGENT_RUNTIME;
  const dist = path.join(arm.runtime, "openclaw", "dist");
  const lines = [];
  let starts = 0;
  const launch = () => {
    starts += 1;
    arm.proc = spawn(process.execPath, ["--import", probeUrl, "--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(arm.port)], { env, stdio: ["ignore", "pipe", "pipe"] });
    for (const s of [arm.proc.stdout, arm.proc.stderr]) {
      s.setEncoding("utf8");
      s.on("data", (chunk) => { for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line }); if (lines.length > 60000) lines.splice(0, lines.length - 60000); });
    }
  };
  arm.lines = lines;
  arm.events = [];
  arm.probeOut = probeOut;
  const t0 = Date.now();
  launch();
  const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
  const deadline = Date.now() + 900_000;
  let lastError;
  while (Date.now() < deadline) {
    if (arm.proc.exitCode !== null) {
      if (starts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) { launch(); continue; }
      throw new Error(`${arm.name} Gateway exited ${arm.proc.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
    }
    try {
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => { arm.client?.stop(); reject(new Error("hello timeout")); }, 5_000);
        arm.client = new GatewayClient({
          url: `ws://127.0.0.1:${arm.port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli",
          scopes: ["operator.admin", "operator.read", "operator.write"],
          onHelloOk: () => { clearTimeout(timeout); resolve(); },
          onConnectError: (error) => { clearTimeout(timeout); reject(error); },
          onEvent: (e) => { if (e.event === "chat" && e.payload?.runId) arm.events.push({ at: Date.now(), ...e.payload }); },
        });
        arm.client.start();
      });
      arm.readyMs = Date.now() - t0;
      await sleep(20_000);
      log(`${arm.name} ready in ${arm.readyMs} ms on port ${arm.port} pid ${arm.proc.pid}`);
      return arm;
    } catch (error) {
      lastError = error;
      arm.client?.stop();
      await sleep(1_000);
    }
  }
  throw lastError ?? new Error(`${arm.name} Gateway did not become ready`);
};
const stopGateway = async (arm) => {
  arm.client?.stop();
  arm.proc?.kill("SIGTERM");
  for (let i = 0; i < 30 && arm.proc?.exitCode === null; i++) await sleep(1_000);
  if (arm.proc?.exitCode === null) arm.proc.kill("SIGKILL");
  await sleep(2_000);
};
const textOf = (message) => !message ? "" : typeof message === "string" ? message : textOfContent(message.content);
const send = async (arm, sessionKey, message, key) => {
  const t0 = Date.now();
  const sent = await arm.client.request("chat.send", { agentId: "makaron", sessionKey, message, deliver: false, timeoutMs: 900_000, idempotencyKey: `${key}-${t0}` });
  assert(sent?.runId, `${key}: chat.send returned no runId`);
  const waited = await arm.client.request("agent.wait", { runId: sent.runId, timeoutMs: 900_000 }, { timeoutMs: 920_000 });
  await sleep(500);
  const terminal = arm.events.filter((e) => e.runId === sent.runId && ["final", "error", "aborted"].includes(e.state));
  return { t0, t1: Date.now(), runId: sent.runId, waitStatus: waited?.status, states: terminal.map((e) => e.state), reply: terminal.map((e) => textOf(e.message)).join("").slice(0, 80) };
};
const readGaps = (arm) => {
  const out = [];
  for (const f of fs.readdirSync(path.dirname(arm.probeOut)).filter((n) => n.startsWith(`${path.basename(arm.probeOut)}.`))) {
    const pid = Number(f.split(".").at(-2));
    for (const l of fs.readFileSync(path.join(path.dirname(arm.probeOut), f), "utf8").split("\n").filter(Boolean)) out.push({ pid, ...JSON.parse(l) });
  }
  return out;
};
const waitFor = async (predicate, ms) => {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const value = predicate();
    if (value) return value;
    await sleep(500);
  }
  return undefined;
};
const reviewRequests = (tag, n) => requests.filter((r) => r.kind === "review" && r.arm === tag && r.n === n);
const linesSince = (arm, t0, re) => arm.lines.filter((l) => l.at >= t0 && re.test(l.line));
const skillExists = (arm, name) => fs.existsSync(path.join(JSON.parse(fs.readFileSync(arm.configPath, "utf8")).agents.entries.makaron.workspace, "skills", name, "SKILL.md"));

const results = [];
const builder = { name: "build", runtime: runtimeB, state: stateB, configPath: configPathB, port: portB };
let build;
let frozen;
try {
  const b0 = Date.now();
  await startGateway(builder);
  for (let n = 1; n <= BUILD_TURNS; n++) {
    const r = await send(builder, SESSION_KEY, `[build x ${n}] 帮我看看这份渲染日志：${bigFile(n)}`, `build-${n}`);
    assert(r.states.includes("final") && r.reply.includes("看过了"), `build turn ${n} did not finish: ${JSON.stringify(r)}`);
    if (n % 20 === 0) log(`built ${n}/${BUILD_TURNS} turns in ${Date.now() - b0} ms`);
  }
  build = { turns: BUILD_TURNS, ms: Date.now() - b0, lastBuildRequestBytes: requests.filter((r) => r.kind === "build").at(-1)?.bytes,
    reviewsDuringBuild: requests.filter((r) => r.kind === "review").length,
    compactionsDuringBuild: builder.lines.filter((l) => /auto-compaction|context overflow detected/u.test(l.line)).length };
  log("build", JSON.stringify(build));
  await stopGateway(builder);
  frozen = await cloneArm(builder, "frozen", runtimeB);

  for (const name of ORDER) {
    useArm(name);
    const arm = await cloneArm(frozen, name, runtimeB);
    await startGateway(arm);
    const row = { arm: name, gatewayPid: arm.proc.pid };
    // 1. review after a deep turn on the big session
    const t1 = await send(arm, SESSION_KEY, `[rev ${name} 1] 再把渲染日志逐个检查一遍，最后告诉我结论。`, `rev-${name}-1`);
    assert(t1.states.includes("final"), `${name}: review-trigger turn did not finish ${JSON.stringify(t1)}`);
    const first = await waitFor(() => reviewRequests(name, 1)[0], 150_000);
    const done = first ? await waitFor(() => reviewRequests(name, 1).find((r) => r.reviewStep >= 1), 150_000) : undefined;
    await sleep(5_000);
    const gaps = readGaps(arm).filter((g) => g.pid === arm.proc.pid && first && g.at >= first.at - 5_000 && g.at <= (done?.at ?? first.at) + 5_000);
    Object.assign(row, {
      turnMs: t1.t1 - t1.t0,
      review: first ? { bytes: first.bytes, messages: first.messages, historyMessages: first.historyMessages, historyHasOldestBuild: first.historyHasOldestBuild,
        tools: first.tools, maxTokens: first.maxTokens, reasoningEffort: first.reasoningEffort, systemChars: first.systemChars,
        promptListsSkillsCap: first.promptListsSkillsCap, boundedExcerptLine: first.boundedExcerptLine, pid: first.pid,
        delayAfterTurnMs: first.at - t1.t1 } : null,
      reviewRequests: reviewRequests(name, 1).length,
      reviewMaxStallMs: Math.max(0, ...gaps.map((g) => g.gapMs)),
      reviewCompactions: first ? linesSince(arm, first.at - 1_000, /auto-compaction|context overflow detected/u).length : null,
      evidenceLog: linesSince(arm, t1.t0, /experience review evidence:/u).map((l) => l.line.replace(/^.*experience review evidence: /u, "")).slice(0, 2),
      skillCreated: skillExists(arm, `render-log-check-${name.toLowerCase()}-1`),
    });
    // 2. cooldown: another deep turn on the same session
    const t2 = await send(arm, SESSION_KEY, `[rev ${name} 2] 再检查一遍新生成的日志。`, `rev-${name}-2`);
    assert(t2.states.includes("final"), `${name}: second turn did not finish`);
    await sleep(75_000);
    row.secondReviewSameSession = reviewRequests(name, 2).length;
    // 3. yield: a review on another session, held while a foreground turn runs
    let arrived;
    let release;
    const hold = { arrived: (r) => arrived?.(r), released: new Promise((resolve) => { release = resolve; }) };
    const arrival = new Promise((resolve) => { arrived = resolve; });
    holds.set(`${name}:3`, hold);
    const t3 = await send(arm, SESSION_KEY_2, `[rev ${name} 3] 第二个会话：把渲染日志检查一遍。`, `rev-${name}-3`);
    assert(t3.states.includes("final"), `${name}: second-session turn did not finish`);
    const heldReview = await Promise.race([arrival, sleep(150_000).then(() => undefined)]);
    let fg;
    if (heldReview) {
      fg = await send(arm, SESSION_KEY, `[fg ${name} 1] 前台：在吗？`, `fg-${name}-1`);
      await sleep(3_000);
    }
    release();
    await sleep(15_000);
    Object.assign(row, {
      yield: {
        heldReviewArrived: Boolean(heldReview),
        foregroundFinished: fg?.states.includes("final") ?? false,
        foregroundMs: fg ? fg.t1 - fg.t0 : null,
        yieldedLog: linesSince(arm, t3.t0, /skill experience review yielded to foreground work/u).length,
        reviewContinuedAfterRelease: reviewRequests(name, 3).filter((r) => r.reviewStep >= 1).length,
        skillCreated: skillExists(arm, `render-log-check-${name.toLowerCase()}-3`),
      },
      errors: arm.lines.filter((l) => l.at >= t1.t0 && /\bERROR\b|Unhandled|uncaught|skill experience review failed/iu.test(l.line)).slice(0, 8).map((l) => redact(l.line).slice(0, 300)),
    });
    results.push(row);
    log(JSON.stringify(row));
    await stopGateway(arm);
    fs.rmSync(arm.state, { recursive: true, force: true });
  }
} finally {
  if (builder.proc && builder.proc.exitCode === null) await stopGateway(builder);
  if (frozen) fs.rmSync(frozen.state, { recursive: true, force: true });
  server.close();
}

const out = { installed, build, order: ORDER, results };
console.log(JSON.stringify(out, null, 1));
const by = (name) => results.find((r) => r.arm === name);
for (const r of results) {
  assert(r.review, `${r.arm}: no review request after the deep turn`);
  assert.equal(r.review.pid, r.gatewayPid, `${r.arm}: review did not run in the Gateway process`);
  assert(r.skillCreated, `${r.arm}: the review's skill_workshop create was not applied`);
}
const A = by("A");
const B = by("B");
if (A && B) {
  if (build.compactionsDuringBuild === 0) assert(A.review.historyHasOldestBuild, "A should replay the whole session");
  assert(!B.review.historyHasOldestBuild, "B must not replay the oldest turns");
  assert(B.review.bytes * 10 < A.review.bytes, `B review request (${B.review.bytes}) is not an order of magnitude below A (${A.review.bytes})`);
  assert.deepEqual(B.review.tools, ["skill_workshop"]);
  assert.equal(B.review.maxTokens, 8192);
  assert(B.review.boundedExcerptLine && B.review.promptListsSkillsCap);
  assert.equal(A.secondReviewSameSession >= 1, true, "A should review the same session again");
  assert.equal(B.secondReviewSameSession, 0, "B must not review the same session twice within the cooldown");
  assert(B.yield.yieldedLog >= 1 && B.yield.reviewContinuedAfterRelease === 0 && !B.yield.skillCreated, "B must yield to the foreground turn before mutating");
  assert(A.yield.reviewContinuedAfterRelease >= 1, "A completes the held review");
}
