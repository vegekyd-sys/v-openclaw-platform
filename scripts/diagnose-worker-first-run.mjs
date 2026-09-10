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
const cpuProfile = process.env.NATIVE_FIRST_RUN_PROFILE === "1";
const concurrency = Number(process.env.NATIVE_FIRST_RUN_CONCURRENCY ?? "1");
if (![1, 3].includes(concurrency)) throw new Error("Diagnostic concurrency must be 1 or 3");
if (!root?.startsWith("/")) throw new Error("Absolute installed runtime root required");
const feishuPath = process.argv[3];
if (feishuPath && (!feishuPath.startsWith(root + "/npm/") ||
    JSON.parse(readFileSync(join(feishuPath, "package.json"), "utf8")).name !== "@openclaw/feishu")) {
  throw new Error("Optional Feishu path must reference the installed runtime plugin");
}
const scratch = mkdtempSync(join(tmpdir(), "native-first-run-"));
let calls = 0;
const requests = new Map();
let pluginBlocked = false;
const observations = new Map();
const server = createServer(async (req, res) => {
  if (req.method !== "POST" || !req.url.endsWith("/chat/completions") || ++calls > 4 * concurrency) {
    res.writeHead(503); res.end("Diagnostic responder rejected unexpected request"); return;
  }
  const receivedAt = performance.now();
  try {
    const chunks = []; let bytes = 0;
    for await (const chunk of req) {
      bytes += chunk.length;
      if (bytes > 16 * 1024 * 1024) throw new Error("Diagnostic request too large");
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    const lastUser = body.messages?.findLast(m => m.role === "user");
    const marker = JSON.stringify(lastUser?.content).match(/DIAGNOSTIC_ID_([a-f0-9-]{36})/)?.[1];
    const current = requests.get(marker);
    if (!current) throw new Error("Unrecognized diagnostic turn");
    current.modelAtMs ??= Math.round(receivedAt - current.start);
    current.modelCalls = (current.modelCalls ?? 0) + 1;
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
function makeFixture(variant) {
  let code = variant === "baseline" ? readFileSync(join(root, "production-worker/worker.mjs"), "utf8") : source;
  code = code.replace(/from (["'])(\.\/[^"']+)\1/g, (_match, quote, specifier) =>
    `from ${quote}${specifier === "./native-module-resolution-cache.mjs" ? helperURL : pathToFileURL(join(root, "production-worker", specifier)).href}${quote}`);
  if (cpuProfile) {
    const needle = "result = await runAgent(message, controller.signal);";
    if (code.split(needle).length !== 2) throw new Error("Native diagnostic profile boundary drift");
    code = code.replace(needle, "result = await profileDiagnosticAgent(message, () => runAgent(message, controller.signal));");
    code += `
import {Session as DiagnosticInspectorSession} from 'node:inspector';
import {summarizeProfile as summarizeDiagnosticProfile} from ${JSON.stringify(new URL("../lab/release-files/concurrency-cpu-memory-profiler.mjs", import.meta.url).href)};
let diagnosticProfileStarted = false;
async function profileDiagnosticAgent(message, operation) {
  if (diagnosticProfileStarted) return await operation();
  diagnosticProfileStarted = true;
  const session = new DiagnosticInspectorSession(); session.connect();
  const post = (method, params={}) => new Promise((resolve,reject) => session.post(method,params,(e,r)=>e?reject(e):resolve(r)));
  await post('Profiler.enable'); await post('Profiler.setSamplingInterval',{interval:1000}); await post('Profiler.start');
  try {return await operation();}
  finally {
    try {const {profile} = await post('Profiler.stop'); process.stderr.write('[native-first-run-cpu] '+JSON.stringify({runId:message.runId,...summarizeDiagnosticProfile(profile)})+'\\n');}
    finally {session.disconnect();}
  }
}
`;
  }
  const target = join(scratch, variant + "-worker.mjs"); writeFileSync(target, code); return target;
}
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
      OPENCLAW_AGENT_DIR: join(state, "agent"),
      VLAB_OPENCLAW_AGENT_RUNTIME: join(root, "openclaw/dist/plugin-sdk/agent-runtime.js"),
      VLAB_REQUIRE_OPENCLAW_AGENT_RUNTIME: "1", VLAB_REQUIRE_SKILL_USAGE_TELEMETRY: "1",
      OPENCLAW_DIAGNOSTICS: "1", OPENCLAW_DIAGNOSTICS_TIMELINE_PATH: timeline,
      OPENCLAW_FIRSTTEXT_WORKER_PHASES: "1", NODE_DISABLE_COMPILE_CACHE: "1",
      OPENCLAW_WORKER_RESOLVE_CACHE: variant === "candidate" ? "1" : "0"};
    delete env.NODE_COMPILE_CACHE;
    const pool = new WorkerPool({minWorkers: 1, maxWorkers: 1, warmSpareWorkers: 0,
      sessionsPerWorker: concurrency, startupTimeoutMs: 60_000, requestTimeoutMs: 60_000,
      requestCancelGraceMs: 1000, workerEnv: env,
      workerPath: variant === "baseline" && !cpuProfile ? join(root, "production-worker/worker.mjs") : makeFixture(variant)});
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
            } else if (/native-first-run-cpu|Error|error=|feishu|plugin.*(?:warn|fail|skip|invalid|block)/i.test(line)) {
              if (/blocked plugin|plugin present but blocked/.test(line)) pluginBlocked = true;
              process.stderr.write(line + "\n");
            }
          }
        });
      }
      for (const turn of ["first", "second"]) {
        await Promise.all(Array.from({length: concurrency}, async (_, index) => {
        const id = randomUUID();
        const current = {start: performance.now()}; requests.set(id, current);
        const result = await pool.dispatch(`agent:diagnostic:explicit:${id}`, {
          kind: "agent", nativeAttempt91: true, agentId: "diagnostic", sessionId: id, runId: id,
          message: `DIAGNOSTIC_ID_${id} Reply DIAGNOSTIC_OK without calling tools.`, timeoutSeconds: 45,
          eventCallbackNames: ["onAgentEvent", "onPartialReply"],
        }, {onEvent(event) {
          if (event.name === "onPartialReply") current.firstTextAtMs ??= Math.round(performance.now() - current.start);
        }});
        const output = result.payloads?.map(p => p.text ?? "").join("") ?? "";
        const observed = observations.get(id) ?? {phases: {}};
        const delta = (end, start) => observed.phases[end] - observed.phases[start];
        console.log(JSON.stringify({variant, turn, index, concurrency, runId: id, modelAtMs: current.modelAtMs,
          firstTextAtMs: current.firstTextAtMs, totalMs: Math.round(performance.now() - current.start),
          outputCorrect: output.includes("DIAGNOSTIC_OK"), modelCalls: current.modelCalls,
          preparedMs: delta("worker-prepared-runtime-end", "worker-prepared-runtime-enter"),
          hooksToBundleMs: delta("bundle-start", "worker-hooks-end"),
          hooksToModelMs: delta("model-call-enter", "worker-hooks-end"),
          bundleMs: observed.bundleMs, promptMs: observed.promptMs,
          projectMemoryMs: observed.projectMemoryMs, toolCount: observed.toolCount,
          modelToolCount: current.modelToolCount, feishuToolCount: current.feishuToolCount}));
        if (!output.includes("DIAGNOSTIC_OK")) throw new Error("Offline native response did not match");
        if (current.modelCalls !== 1) throw new Error("Expected exactly one model call for each diagnostic turn");
        if (feishuPath && (pluginBlocked || !(current.feishuToolCount > 0))) {
          throw new Error("Feishu fixture did not load additional native tools; not a valid plugin-shaped sample");
        }
        }));
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
