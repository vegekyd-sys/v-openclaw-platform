// Candidate end-to-end: does a Feishu conversation's background work become
// visible to the Feishu monitor, from start until it is done?
//
// Three parts, each reported separately; a part that could not run is "not
// covered", never "passed".
//   link    The patched core and Feishu monitor import against this runtime.
//   sdk     The plugin-SDK task runtime the Codex native subagent mirror uses
//           (runtime subagent, taskKind codex-native) drives the bridge: the
//           task is listed while running and gone when finalized, and
//           listeners are told which session changed.
//   gateway A private Gateway (no channels) runs real agent turns on
//           Feishu-shaped session keys. Each turn starts a subagent and a
//           background command, then answers without waiting. A probe in the
//           Gateway process samples bridge.listActive(session) and must see the
//           work while it runs (also after the turn has answered) and see it
//           drop to zero when it ends.
//   cardkit The VLab bot creates a card entity (never sent to any chat),
//           streams, closes it, then rewrites its footer twice, as the monitor
//           does after a reply closes. Every CardKit write must be accepted.
//
// TASK_STATUS_EXPECT=absent runs the unpatched core: the bridge must not exist.
import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { feishuBackgroundTasks } from "../release-files/feishu-task-status/feishu-task-status-render.mjs";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
const configPath = process.env.OPENCLAW_CONFIG_PATH;
const stateDir = process.env.OPENCLAW_STATE_DIR;
const expect = process.env.TASK_STATUS_EXPECT ?? "visible";
const parts = (process.env.TASK_STATUS_PARTS ?? "link,sdk,cardkit,gateway").split(",").map((s) => s.trim()).filter(Boolean);
const scenarioNames = (process.env.TASK_STATUS_SCENARIOS ?? "worker,claude-cli").split(",").map((s) => s.trim()).filter(Boolean);
assert(runtime && configPath && stateDir, "candidate runtime environment is required");
assert(["visible", "absent"].includes(expect));

const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const BRIDGE = "openclaw.v.taskRegistryBridge";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const redact = (s) => String(s).replace(/(token|api.?key|authorization|secret|bearer)([=: ]+)[^\s"]+/giu, "$1$2[redacted]");
const secret = (name) => {
  for (const line of fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u);
    if (m?.[1] === name) return m[2].replace(/^["']|["']$/gu, "");
  }
  return undefined;
};
const report = { expect, parts: {} };

const dist = path.join(runtime, "openclaw", "dist");
const coreFile = fs.readdirSync(dist).find((f) => /^task-registry-activity-[\w-]+\.js$/u.test(f));
const corePatched = fs.readFileSync(path.join(dist, coreFile), "utf8").includes("v-task-registry-bridge-v1");
assert.equal(corePatched, expect === "visible", "core patch state does not match the expectation");
const feishuDist = fs.readdirSync(path.join(runtime, "npm", "projects"))
  .filter((d) => d.startsWith("openclaw-feishu-"))
  .map((d) => path.join(runtime, "npm", "projects", d, "node_modules", "@openclaw", "feishu", "dist"))
  .find((d) => fs.existsSync(d));
const monitorFile = feishuDist && fs.readdirSync(feishuDist).find((f) => /^monitor\.account-[\w-]+\.js$/u.test(f));
const monitorSource = monitorFile ? fs.readFileSync(path.join(feishuDist, monitorFile), "utf8") : "";

// ---- link ----
if (parts.includes("link")) {
  const storeFile = fs.readdirSync(dist).find((f) => /^task-registry\.store\.sqlite-[\w-]+\.js$/u.test(f));
  const result = {
    corePatched,
    storePatched: fs.readFileSync(path.join(dist, storeFile), "utf8").includes("v-task-registry-bridge-store-v1"),
    monitorPatched: monitorSource.includes("v-feishu-task-status-v1"),
  };
  for (const [name, file] of [["core", path.join(dist, coreFile)], ["store", path.join(dist, storeFile)], ["monitor", monitorFile && path.join(feishuDist, monitorFile)]]) {
    try {
      await import(pathToFileURL(file).href);
      result[name] = "imported";
    } catch (error) {
      result[name] = `import failed: ${String(error?.message ?? error).slice(0, 300)}`;
    }
  }
  report.parts.link = result;
}

// ---- sdk: the codex-native mirror's own calls, against the real core ----
if (parts.includes("sdk")) {
  const result = {};
  try {
    const scopeFile = fs.readdirSync(dist).find((f) => /^agent-harness-task-runtime-scope-[\w-]+\.js$/u.test(f));
    const scopeModule = await import(pathToFileURL(path.join(dist, scopeFile)).href);
    const createScope = Object.values(scopeModule).find((fn) => typeof fn === "function" && fn.name === "createAgentHarnessTaskRuntimeScope");
    const { createAgentHarnessTaskRuntime } = await import(pathToFileURL(path.join(dist, "plugin-sdk", "agent-harness-task-runtime.js")).href);
    const sessionKey = `agent:makaron:feishu:group:oc_task_status_sdk_${Date.now()}`;
    const bridge = globalThis[Symbol.for(BRIDGE)];
    const notices = [];
    bridge?.listeners.add((notice) => notices.push(notice));
    const taskRuntime = createAgentHarnessTaskRuntime({
      runtime: "subagent", taskKind: "codex-native",
      scope: createScope({ requesterSessionKey: sessionKey }), runIdPrefix: "codex-native:",
    });
    const runId = `codex-native:thread-${Date.now()}`;
    const created = taskRuntime.tryCreateRunningTaskRun({
      sourceId: runId, agentId: "makaron", runId, label: "Codex subagent", task: "candidate",
      notifyPolicy: "silent", deliveryStatus: "not_applicable", preferMetadata: true,
      startedAt: Date.now(), lastEventAt: Date.now(), progressSummary: "Codex native subagent spawned.",
    });
    await sleep(50);
    result.created = Boolean(created);
    result.bridge = Boolean(bridge);
    result.whileRunning = bridge?.listActive(sessionKey).map((t) => `${t.runtime}/${t.taskKind}/${t.status}`) ?? null;
    taskRuntime.finalizeTaskRunByRunId({ runId, status: "succeeded", endedAt: Date.now(), lastEventAt: Date.now(), terminalSummary: "done" });
    await sleep(50);
    result.afterFinal = bridge?.listActive(sessionKey).map((t) => `${t.runtime}/${t.taskKind}/${t.status}`) ?? null;
    result.noticesForSession = notices.filter((n) => n.sessionKeys?.includes(sessionKey)).map((n) => n.kind);
  } catch (error) {
    result.error = redact(String(error?.stack ?? error)).slice(0, 800);
  }
  report.parts.sdk = result;
}

// ---- cardkit: post-close footer rewrites on a card nobody receives ----
if (parts.includes("cardkit")) {
  const result = {};
  try {
    const cfg = JSON.parse(fs.readFileSync(configPath, "utf8"));
    const account = { ...cfg.channels?.feishu, ...cfg.channels?.feishu?.accounts?.default };
    assert(account.appId && account.appSecret, "VLab Feishu bot is not configured");
    const auth = await fetch("https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ app_id: account.appId, app_secret: account.appSecret }), signal: AbortSignal.timeout(15000),
    }).then((r) => r.json());
    assert.equal(auth.code, 0, "Feishu authentication failed (redacted)");
    const call = async (method, url, body) => {
      const r = await fetch(`https://open.feishu.cn/open-apis/${url}`, {
        method, headers: { Authorization: `Bearer ${auth.tenant_access_token}`, "Content-Type": "application/json; charset=utf-8" },
        body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
      }).then((r) => r.json());
      return { code: r.code, msg: r.msg, data: r.data };
    };
    const line = (text) => JSON.stringify({ tag: "markdown", element_id: "v_bg_tasks", text_size: "notation", content: `<font color='grey'>${text}</font>` });
    const makeCard = async () => {
      const created = await call("POST", "cardkit/v1/cards", { type: "card_json", data: JSON.stringify({
        schema: "2.0",
        config: { streaming_mode: true, summary: { content: "[Generating...]" } },
        body: { elements: [{ tag: "markdown", content: "", element_id: "content" }, { tag: "hr" }, { tag: "markdown", content: "<font color='grey'>Agent: candidate</font>", element_id: "note" }] },
      }) });
      assert(created.data?.card_id, `card create failed: ${created.code} ${created.msg}`);
      return created.data.card_id;
    };
    const cardId = await makeCard();
    result.create = 0;
    let seq = 1;
    const tag = (id) => ({ sequence: ++seq, uuid: `t_${id}_${seq}` });
    const steps = [
      ["stream-text", "PUT", `cardkit/v1/cards/${cardId}/elements/content/content`, () => ({ content: "实验已启动。", ...tag(cardId) })],
      ["insert-while-streaming", "POST", `cardkit/v1/cards/${cardId}/elements`, () => ({ type: "insert_after", target_element_id: "content", elements: `[${line("⏳ 后台 1 项进行中 · 子 agent")}]`, ...tag(cardId) })],
      ["close", "PATCH", `cardkit/v1/cards/${cardId}/settings`, () => ({ settings: JSON.stringify({ config: { streaming_mode: false, summary: { content: "实验已启动。" } } }), ...tag(cardId) })],
      ["final-body-after-insert", "PUT", `cardkit/v1/cards/${cardId}/elements/content`, () => ({ element: JSON.stringify({ tag: "markdown", element_id: "content", content: "实验已启动。最终版。" }), ...tag(cardId) })],
      ["update-after-close", "PUT", `cardkit/v1/cards/${cardId}/elements/v_bg_tasks`, () => ({ element: line("⏳ 后台 2 项进行中 · 子 agent 1 · 后台命令 1"), ...tag(cardId) })],
      ["update-done", "PUT", `cardkit/v1/cards/${cardId}/elements/v_bg_tasks`, () => ({ element: line("☑️ 后台任务已结束"), ...tag(cardId) })],
      ["delete-after-close", "DELETE", `cardkit/v1/cards/${cardId}/elements/v_bg_tasks`, () => tag(cardId)],
    ];
    const closedFirst = await makeCard();
    let seq2 = 1;
    const tag2 = () => ({ sequence: ++seq2, uuid: `t_${closedFirst}_${seq2}` });
    steps.push(
      ["b-close", "PATCH", `cardkit/v1/cards/${closedFirst}/settings`, () => ({ settings: JSON.stringify({ config: { streaming_mode: false } }), ...tag2() })],
      ["b-insert-after-close", "POST", `cardkit/v1/cards/${closedFirst}/elements`, () => ({ type: "insert_after", target_element_id: "content", elements: `[${line("⏳ 后台 1 项进行中 · 后台命令")}]`, ...tag2() })],
    );
    result.steps = {};
    for (const [name, method, url, body] of steps) {
      const r = await call(method, url, body());
      result.steps[name] = r.code === 0 ? 0 : `${r.code} ${r.msg}`;
    }
  } catch (error) {
    result.error = redact(String(error?.message ?? error)).slice(0, 500);
  }
  report.parts.cardkit = result;
}

// ---- gateway: real turns that leave work running ----
if (parts.includes("gateway")) {
  const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
  const port = Number(config.gateway?.port);
  const token = config.gateway?.auth?.token;
  assert(Number.isInteger(port) && port > 0, "candidate Gateway port is missing");
  config.channels = {};
  config.cron = { ...(config.cron ?? {}), enabled: false };
  // Shared VLab declares the external Codex plugin, which the candidate runtime
  // does not carry; these scenarios do not use it (the sdk part covers Codex).
  if (config.plugins.entries?.codex) config.plugins.entries.codex.enabled = false;
  const workerPlugin = config.plugins.entries?.["vlab-agent-worker-isolation"]?.config;
  assert(workerPlugin, "candidate Worker plugin configuration is missing");
  Object.assign(workerPlugin, { minWorkers: 1, maxWorkers: 2, warmSpareWorkers: 0 });
  const workerRel = path.relative(stateDir, workerPlugin.workerConfigPath);
  assert(!workerRel.startsWith(".."), "candidate Worker config escaped state");
  const workerConfig = fs
    .readFileSync(path.join(process.env.VLAB_SHARED_STATE_DIR, workerRel), "utf8")
    .replaceAll(process.env.VLAB_SHARED_STATE_DIR, stateDir)
    .replaceAll("/srv/vlab-production-mirror/labs/instances/db91-parity/runtime", runtime);
  fs.mkdirSync(path.dirname(workerPlugin.workerConfigPath), { recursive: true });
  fs.writeFileSync(workerPlugin.workerConfigPath, workerConfig, { mode: 0o600 });
  workerPlugin.gatewayConfigPath = configPath;
  const allow = config.agents.defaults.modelPolicy?.allow;
  if (Array.isArray(allow)) for (const ref of ["anthropic/claude-sonnet-5"]) if (!allow.includes(ref)) allow.push(ref);
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });

  const scratch = process.env.VLAB_CANDIDATE_DATA ?? stateDir;
  for (const dir of ["tmp", "cache"]) fs.mkdirSync(path.join(scratch, dir), { recursive: true, mode: 0o700 });
  const probeLog = path.join(scratch, "task-status-probe.jsonl");
  const probeFile = path.join(scratch, "task-status-probe.mjs");
  // Worker-owned work raises no Gateway event, so the test names the sessions.
  const watchFile = path.join(scratch, "task-status-watch.txt");
  fs.writeFileSync(watchFile, "");
  // Samples every session the registry mentions, once a second while it has
  // active work and once more after it drops to zero.
  fs.writeFileSync(probeFile, `import fs from "node:fs";
if (process.argv.includes("gateway")) {
  const watched = new Map();
  const write = (row) => fs.appendFileSync(${JSON.stringify(probeLog)}, JSON.stringify({ at: Date.now(), pid: process.pid, ...row }) + "\\n");
  const sample = () => {
    const bridge = globalThis[Symbol.for(${JSON.stringify(BRIDGE)})];
    if (!bridge) return;
    for (const [key, last] of watched) {
      const active = bridge.listActive(key).map((t) => t.runtime + "/" + (t.taskKind ?? "") + "/" + t.status + "/" + (t.childSessionKey === key ? "self" : "other"));
      const sig = active.join("|");
      if (sig !== last) write({ sessionKey: key, active });
      watched.set(key, sig);
    }
  };
  let attached = false;
  const timer = setInterval(() => {
    const bridge = globalThis[Symbol.for(${JSON.stringify(BRIDGE)})];
    if (bridge && !attached) {
      attached = true;
      write({ attached: true });
      bridge.listeners.add((notice) => {
        for (const key of notice?.sessionKeys ?? []) if (/:feishu:/u.test(key) && !watched.has(key)) watched.set(key, null);
        write({ notice: notice?.kind, sessionKeys: notice?.sessionKeys });
      });
    }
    for (const key of fs.readFileSync(${JSON.stringify(watchFile)}, "utf8").split("\\n").filter(Boolean)) if (!watched.has(key)) watched.set(key, null);
    sample();
  }, 1000);
  timer.unref();
}
`);
  const probeRows = () => (fs.existsSync(probeLog) ? fs.readFileSync(probeLog, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l)) : []);

  const env = {
    ...process.env,
    OPENCLAW_GATEWAY_PORT: String(port),
    TMPDIR: path.join(scratch, "tmp"),
    XDG_CACHE_HOME: path.join(scratch, "cache"),
    npm_config_cache: path.join(scratch, "cache", "npm"),
  };
  for (const name of ["DEEPSEEK_API_KEY", "ANTHROPIC_API_KEY", "OPENAI_API_KEY"]) {
    const value = secret(name);
    if (value) env[name] = value;
  }

  const lines = [];
  let gateway;
  let gatewayStarts = 0;
  const startGateway = () => {
    gatewayStarts += 1;
    gateway = spawn(process.execPath, ["--max-old-space-size=4096", `${dist}/index.js`, "gateway", "--port", String(port)], {
      env: { ...env, NODE_OPTIONS: `${env.NODE_OPTIONS ?? ""} --import ${probeFile}`.trim() },
      stdio: ["ignore", "pipe", "pipe"],
    });
    for (const s of [gateway.stdout, gateway.stderr]) {
      s.setEncoding("utf8");
      s.on("data", (chunk) => {
        for (const line of chunk.split(/\r?\n/u).filter(Boolean)) lines.push({ at: Date.now(), line });
        if (lines.length > 20_000) lines.splice(0, lines.length - 20_000);
      });
    }
  };
  let client;
  const connectGateway = async () => {
    const { GatewayClient } = await import(`${dist}/plugin-sdk/gateway-runtime.js`);
    const deadline = Date.now() + 900_000;
    let lastError;
    while (Date.now() < deadline) {
      if (gateway.exitCode !== null) {
        if (gatewayStarts === 1 && lines.some((l) => /Restart OpenClaw so state migrations run/u.test(l.line))) {
          startGateway();
          continue;
        }
        throw new Error(`Gateway exited ${gateway.exitCode}\n${redact(lines.slice(-60).map((l) => l.line).join("\n"))}`);
      }
      try {
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(() => { client?.stop(); reject(new Error("hello timeout")); }, 5_000);
          client = new GatewayClient({
            url: `ws://127.0.0.1:${port}`, token, deviceIdentity: null, clientName: "cli", mode: "cli",
            scopes: ["operator.admin", "operator.read", "operator.write"],
            onHelloOk: () => { clearTimeout(timeout); resolve(); },
            onConnectError: (error) => { clearTimeout(timeout); reject(error); },
          });
          client.start();
        });
        return;
      } catch (error) {
        lastError = error;
        client?.stop();
        await sleep(1_000);
      }
    }
    throw lastError ?? new Error("candidate Gateway did not become ready");
  };

  const PROMPT = [
    "这是一次自动化测试，请严格照做，不要等待任何结果。",
    "第一步：调用 sessions_spawn 启动一个子 agent，task 写：`用 exec 运行 sleep 50，然后回复 CHILD_DONE。`",
    "第二步：调用 exec 在后台运行 `sleep 40`（background 设为 true，不要等它结束）。",
    "第三步：两个工具都返回后，立刻只回复 OK 两个字母。",
  ].join("");
  const SCENARIOS = {
    worker: { model: "deepseek/deepseek-v4-flash" },
    "worker-pro": { model: "deepseek/deepseek-v4-pro" },
    "claude-cli": { model: "anthropic/claude-sonnet-5" },
  };
  const runTurn = async (name) => {
    const sessionKey = `agent:makaron:feishu:group:oc_task_status_${name.replace(/\W/gu, "_")}_${Date.now()}`;
    const mark = lines.length;
    fs.appendFileSync(watchFile, `${sessionKey}\n`);
    await sleep(1_500);
    const started = Date.now();
    const r = spawnSync(process.execPath, [
      `${dist}/index.js`, "agent", "--agent", "makaron", "--session-key", sessionKey,
      "--model", SCENARIOS[name].model, "--message", PROMPT, "--json", "--timeout", "300",
    ], { env, encoding: "utf8", timeout: 360_000, maxBuffer: 64 * 1024 * 1024 });
    const answeredAt = Date.now();
    let meta;
    try { meta = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))); } catch {}
    const agentMeta = meta?.result?.meta?.agentMeta ?? meta?.meta?.agentMeta ?? meta?.agentMeta;
    // Wait for the work the turn left behind to finish, or give up.
    const deadline = Date.now() + 420_000;
    let rows = [];
    while (Date.now() < deadline) {
      rows = probeRows().filter((row) => row.sessionKey?.toLowerCase() === sessionKey.toLowerCase());
      const last = rows.at(-1);
      if (rows.some((row) => row.active.length > 0) && last?.active.length === 0 && Date.now() - answeredAt > 5_000) break;
      if (rows.length === 0 && Date.now() - answeredAt > 120_000) break;
      await sleep(2_000);
    }
    const background = (row) => feishuBackgroundTasks(row.active.map((sig) => {
      const [rt, kind, , self] = sig.split("/");
      return { runtime: rt, taskKind: kind || undefined, childSessionKey: self === "self" ? sessionKey : "" };
    }), sessionKey);
    const timeline = rows.map((row) => ({ t: Math.round((row.at - started) / 1000), raw: row.active, background: background(row).length }));
    let tools = null;
    let spawnResults = null;
    try {
      const history = await client.request("chat.history", { sessionKey, limit: 60 });
      const items = (history?.messages ?? []).flatMap((m) => (Array.isArray(m.content) ? m.content.map((c) => ({ role: m.role, ...c })) : []));
      tools = items.filter((c) => /tool/iu.test(c?.type ?? "") && c.role === "assistant").map((c) => c.name ?? c.toolName).filter(Boolean);
      spawnResults = (history?.messages ?? []).filter((m) => m.role === "toolResult" || m.role === "tool")
        .map((m) => `${m.toolName ?? m.name ?? ""}: ${JSON.stringify(m.content).slice(0, 400)}`);
    } catch (error) {
      tools = `history failed: ${String(error?.message ?? error).slice(0, 200)}`;
    }
    // Every task / subagent row created since the turn started, whoever owns it.
    const dbRows = spawnSync(process.execPath, ["-e", `
      const { DatabaseSync } = require("node:sqlite");
      const db = new DatabaseSync(process.argv[1], { readOnly: true });
      const since = Number(process.argv[2]);
      console.log(JSON.stringify({
        tasks: db.prepare("SELECT runtime, task_kind, status, owner_key, requester_session_key, child_session_key FROM task_runs WHERE created_at >= ?").all(since),
        subagents: db.prepare("SELECT run_id, requester_session_key, controller_session_key, child_session_key FROM subagent_runs WHERE created_at >= ?").all(since),
      }));
    `, path.join(stateDir, "state", "openclaw.sqlite"), String(started)], { encoding: "utf8" });
    let created = null;
    try { created = JSON.parse(dbRows.stdout); } catch { created = redact(`${dbRows.stderr}`).slice(-400); }
    return {
      name,
      sessionKey,
      exit: r.status,
      answeredAfterSecs: Math.round((answeredAt - started) / 1000),
      ran: agentMeta ? { provider: agentMeta.provider, model: agentMeta.model, harness: agentMeta.harnessId ?? agentMeta.runtime ?? agentMeta.agentRuntime } : null,
      reply: String(meta?.result?.payloads?.[0]?.text ?? meta?.payloads?.[0]?.text ?? "").slice(0, 200),
      tools,
      spawnResults,
      created,
      timeline,
      sawWork: timeline.some((row) => row.background > 0),
      sawWorkAfterAnswer: (() => {
        const atAnswer = rows.filter((row) => row.at <= answeredAt).at(-1);
        return (atAnswer ? background(atAnswer).length > 0 : false) || rows.some((row) => row.at > answeredAt && background(row).length > 0);
      })(),
      peak: Math.max(0, ...timeline.map((row) => row.background)),
      endedAtZero: timeline.length > 0 && timeline.at(-1).background === 0,
      toolLog: lines.slice(mark).filter((l) => /sessions_spawn|exec|subagent/iu.test(l.line)).map((l) => redact(l.line).slice(0, 240)).slice(-8),
      stderr: r.status === 0 ? undefined : redact(`${r.stderr}`).slice(-800),
    };
  };

  const startedAt = Date.now();
  startGateway();
  try {
    await connectGateway();
    const results = [];
    for (const name of scenarioNames) results.push(await runTurn(name));
    report.parts.gateway = { readyMs: Date.now() - startedAt, probeAttached: probeRows().some((row) => row.attached), results };
  } catch (error) {
    report.parts.gateway = { error: redact(String(error?.message ?? error)).slice(0, 2000), tail: redact(lines.slice(-40).map((l) => l.line).join("\n")) };
  } finally {
    client?.stop();
    gateway.kill("SIGTERM");
    await sleep(3_000);
    if (gateway.exitCode === null) gateway.kill("SIGKILL");
  }
}

console.log(JSON.stringify(report, null, 1));

// ---- verdicts ----
if (expect === "absent") {
  assert.equal(globalThis[Symbol.for(BRIDGE)], undefined, "unpatched core must not expose the bridge");
  if (report.parts.gateway?.results) assert.equal(report.parts.gateway.probeAttached, false, "unpatched Gateway exposed the bridge");
} else {
  if (report.parts.link) {
    assert.equal(report.parts.link.core, "imported");
    assert.equal(report.parts.link.store, "imported");
    assert.equal(report.parts.link.storePatched, true);
    assert.equal(report.parts.link.monitor, "imported");
    assert.equal(report.parts.link.monitorPatched, true);
  }
  if (report.parts.sdk) {
    assert.deepEqual(report.parts.sdk.whileRunning, ["subagent/codex-native/running"], "codex-native task not visible while running");
    assert.deepEqual(report.parts.sdk.afterFinal, [], "codex-native task still listed after it finished");
    assert(report.parts.sdk.noticesForSession.length >= 2, "listeners were not told about the session");
  }
  if (report.parts.cardkit) {
    assert.equal(report.parts.cardkit.error, undefined, report.parts.cardkit.error);
    for (const [step, code] of Object.entries(report.parts.cardkit.steps)) assert.equal(code, 0, `CardKit ${step}: ${code}`);
  }
  if (report.parts.gateway) {
    assert.equal(report.parts.gateway.error, undefined, report.parts.gateway.error);
    const covered = report.parts.gateway.results.filter((r) => r.sawWork);
    assert(covered.length > 0, "no runtime left visible background work; the probe exercised nothing");
    for (const r of covered) {
      assert(r.sawWorkAfterAnswer, `${r.name}: work was not visible after the turn answered`);
      assert(r.endedAtZero, `${r.name}: work never dropped back to zero`);
    }
    for (const r of report.parts.gateway.results) {
      if (Array.isArray(r.tools) && r.tools.includes("sessions_spawn")) assert(r.timeline.some((row) => row.raw.some((sig) => sig.startsWith("subagent/"))), `${r.name}: spawned a subagent the bridge never listed`);
    }
  }
}
