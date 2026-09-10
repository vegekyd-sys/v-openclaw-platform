// Offline native preparation diagnostic. Run with PrivateNetwork/PrivateTmp and
// read-only installed runtime. The local HTTP responder is not a real model.
import {createServer} from "node:http";
import {mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, existsSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {randomUUID} from "node:crypto";
import {WorkerPool} from "../experiments/agent-worker-isolation-v1/worker-pool.mjs";

const root = process.argv[2];
if (!root?.startsWith("/")) throw new Error("Absolute installed runtime root required");
const feishuPath = process.argv[3];
if (feishuPath && (!feishuPath.startsWith(root + "/npm/") ||
    JSON.parse(readFileSync(join(feishuPath, "package.json"), "utf8")).name !== "@openclaw/feishu")) {
  throw new Error("Optional Feishu path must reference the installed runtime plugin");
}
const scratch = mkdtempSync(join(tmpdir(), "native-first-run-"));
let current, calls = 0;
let pluginBlocked = false;
const observations = new Map();
const server = createServer(async (req, res) => {
  if (req.method !== "POST" || !req.url.endsWith("/chat/completions") || ++calls > 8) {
    res.writeHead(503); res.end("Diagnostic responder rejected unexpected request"); return;
  }
  if (current) current.modelAtMs ??= Math.round(performance.now() - current.start);
  try {
    const chunks = []; let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 16 * 1024 * 1024) throw new Error("Diagnostic request too large");
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    current.modelToolCount = body.tools?.length ?? 0;
    current.feishuToolCount = body.tools?.filter(t => t.function?.name?.startsWith("feishu_")).length ?? 0;
  } catch {
    res.writeHead(400); res.end("Invalid diagnostic request"); return;
  }
  res.writeHead(200, {"Content-Type": "text/event-stream"});
  const chunk = (delta, finish_reason = null) => ({id: "diagnostic", object: "chat.completion.chunk",
    created: 1, model: "diagnostic", choices: [{index: 0, delta, finish_reason}]});
  res.write(`data: ${JSON.stringify(chunk({role: "assistant", content: "DIAGNOSTIC_OK"}))}\n\n`);
  res.write(`data: ${JSON.stringify({...chunk({}, "stop"), usage: {prompt_tokens: 10, completion_tokens: 3, total_tokens: 13}})}\n\n`);
  res.end("data: [DONE]\n\n");
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const source = readFileSync(new URL("../lab/release-files/production-worker-worker.mjs", import.meta.url), "utf8");
const helperURL = new URL("../experiments/agent-worker-isolation-v1/native-module-resolution-cache.mjs", import.meta.url).href;
const fixtureWorker = join(scratch, "candidate-worker.mjs");
writeFileSync(fixtureWorker, source.replace(/from (["'])(\.\/[^"']+)\1/g, (_match, quote, specifier) =>
  `from ${quote}${specifier === "./native-module-resolution-cache.mjs" ? helperURL : pathToFileURL(join(root, "production-worker", specifier)).href}${quote}`));
try {
  for (const variant of ["baseline", "candidate"]) {
    const state = join(scratch, variant), workspace = join(state, "workspace"), configPath = join(state, "config.json");
    mkdirSync(workspace, {recursive: true, mode: 0o700});
    const config = {
      agents: {defaults: {workspace, model: {primary: "openai/diagnostic"}}, entries: {diagnostic: {}}},
      models: {providers: {openai: {baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        api: "openai-completions", apiKey: "diagnostic-placeholder-not-a-secret", models: [{id: "diagnostic", name: "Diagnostic",
          reasoning: false, input: ["text"], contextWindow: 65536, maxTokens: 1024,
          cost: {input: 0, output: 0, cacheRead: 0, cacheWrite: 0}}]}}},
      plugins: {enabled: true},
    };
    if (feishuPath) {
      config.plugins.load = {paths: [feishuPath]};
      config.plugins.entries = {feishu: {enabled: true}};
      config.tools = {alsoAllow: ["feishu"]};
      config.channels = {feishu: {enabled: true, appId: "diagnostic-not-a-real-app",
        appSecret: "diagnostic-placeholder-not-a-secret",
        tools: {doc: true, chat: true, wiki: true, drive: true, perm: true, scopes: true, bitable: true}}};
    }
    writeFileSync(configPath, JSON.stringify(config), {mode: 0o600});
    const timeline = join(state, "timeline.jsonl");
    const env = {...process.env, OPENCLAW_STATE_DIR: state, OPENCLAW_CONFIG_PATH: configPath,
      OPENCLAW_AGENT_DIR: join(state, "agent"), OPENCLAW_SKIP_CHANNELS: "1",
      VLAB_OPENCLAW_AGENT_RUNTIME: join(root, "openclaw/dist/plugin-sdk/agent-runtime.js"),
      VLAB_REQUIRE_OPENCLAW_AGENT_RUNTIME: "1", VLAB_REQUIRE_SKILL_USAGE_TELEMETRY: "1",
      OPENCLAW_DIAGNOSTICS: "1", OPENCLAW_DIAGNOSTICS_TIMELINE_PATH: timeline,
      OPENCLAW_FIRSTTEXT_WORKER_PHASES: "1", NODE_DISABLE_COMPILE_CACHE: "1",
      OPENCLAW_WORKER_RESOLVE_CACHE: variant === "candidate" ? "1" : "0"};
    delete env.NODE_COMPILE_CACHE;
    const pool = new WorkerPool({minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0,
      sessionsPerWorker: 1, startupTimeoutMs: 60_000, requestTimeoutMs: 60_000,
      requestCancelGraceMs: 1000, workerEnv: env,
      workerPath: variant === "baseline" ? join(root, "production-worker/worker.mjs") : fixtureWorker});
    const boot = performance.now();
    try {
      await pool.start();
      console.log(JSON.stringify({variant, stage: "ready", ms: Math.round(performance.now() - boot)}));
      for (const worker of pool.workers.values()) {
        let pending = "";
        worker.child.stderr.removeAllListeners("data");
        worker.child.stderr.on("data", chunk => {
          pending += chunk;
          const lines = pending.split("\n"); pending = lines.pop();
          for (const line of lines) {
            if (/firsttext-worker-phases|firsttext-metrics|bundle-prep-observer|prompt-prep-observer|project-memory-preparation/.test(line)) {
              try {
                const row = JSON.parse(line.slice(line.indexOf("{")));
                if (!row.runId) continue;
                let observation = observations.get(row.runId);
                if (!observation) observations.set(row.runId, observation = {phases: {}});
                if (line.includes("firsttext-worker-phases")) observation.phases[row.stage] = row.atMs;
                else if (line.includes("firsttext-metrics")) {
                  if (typeof row.at === "number") observation.phases[row.stage] = row.at;
                  if (Number.isInteger(row.toolCount)) observation.toolCount = row.toolCount;
                } else if (line.includes("bundle-prep-observer")) {
                  if (row.kind === "start") observation.phases["bundle-start"] = Date.parse(row.at);
                  if (row.kind === "end") observation.bundleMs = row.totalMs;
                } else if (line.includes("prompt-prep-observer") && row.stage === "total") observation.promptMs = Math.round(row.elapsedMs);
                else if (line.includes("project-memory-preparation") && row.stage === "manager") observation.projectMemoryMs = row.ms;
              } catch {}
            } else if (/Error|error=|feishu|plugin.*(?:warn|fail|skip|invalid|block)/i.test(line)) {
              if (/blocked plugin|plugin present but blocked/.test(line)) pluginBlocked = true;
              process.stderr.write(line + "\n");
            }
          }
        });
      }
      for (const turn of ["first", "second"]) {
        const id = randomUUID();
        current = {start: performance.now()};
        const result = await pool.dispatch(`agent:diagnostic:explicit:${id}`, {
          kind: "agent", nativeAttempt91: true, agentId: "diagnostic", sessionId: id, runId: id,
          message: "Reply DIAGNOSTIC_OK without calling tools.", timeoutSeconds: 45,
          eventCallbackNames: ["onAgentEvent", "onPartialReply"],
        }, {onEvent(event) {
          if (event.name === "onPartialReply") current.firstTextAtMs ??= Math.round(performance.now() - current.start);
        }});
        const output = result.payloads?.map(p => p.text ?? "").join("") ?? "";
        const observed = observations.get(id) ?? {phases: {}};
        const delta = (end, start) => observed.phases[end] - observed.phases[start];
        console.log(JSON.stringify({variant, turn, runId: id, modelAtMs: current.modelAtMs,
          firstTextAtMs: current.firstTextAtMs, totalMs: Math.round(performance.now() - current.start),
          outputCorrect: output.includes("DIAGNOSTIC_OK"), modelCalls: calls,
          preparedMs: delta("worker-prepared-runtime-end", "worker-prepared-runtime-enter"),
          hooksToBundleMs: delta("bundle-start", "worker-hooks-end"),
          hooksToModelMs: delta("model-call-enter", "worker-hooks-end"),
          bundleMs: observed.bundleMs, promptMs: observed.promptMs,
          projectMemoryMs: observed.projectMemoryMs, toolCount: observed.toolCount,
          modelToolCount: current.modelToolCount, feishuToolCount: current.feishuToolCount}));
        if (!output.includes("DIAGNOSTIC_OK")) throw new Error("Offline native response did not match");
        if (feishuPath && (pluginBlocked || !(current.feishuToolCount > 0))) {
          throw new Error("Feishu fixture did not load additional native tools; not a valid plugin-shaped sample");
        }
      }
    } finally {
      await pool.close();
      if (existsSync(timeline)) {
        const timings = readFileSync(timeline, "utf8").split("\n").filter(Boolean).flatMap(line => {
          try {
            const row = JSON.parse(line);
            return typeof row.durationMs === "number" ? [{name: row.name, stage: row.attributes?.stage,
              durationMs: row.durationMs, phase: row.phase}] : [];
          } catch {return [];}
        });
        console.log(JSON.stringify({variant, nativeTimings: timings.sort((a,b) => b.durationMs-a.durationMs).slice(0,30)}));
      }
    }
  }
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
  rmSync(scratch, {recursive: true, force: true});
}
