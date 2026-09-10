// Existing shared VLab, exact lease owner, bounded test requests and CPU sampling.
// Temporarily enables inspector and creates dedicated test sessions/hold requests.
// No runtime/config edits, Gateway restart, new Gateway or business-session use.
import fs from "node:fs";
import os from "node:os";
import assert from "node:assert/strict";
import {execFileSync} from "node:child_process";
import {createHash, randomUUID} from "node:crypto";
import {setTimeout as delay} from "node:timers/promises";
import {summarizeProfile} from "../lab/release-files/concurrency-cpu-memory-profiler.mjs";

assert.equal(os.hostname(), "VM-0-4-ubuntu");
assert.equal(process.getuid(), 0);
const owner = process.argv[2], count = Number(process.argv[3] ?? "1");
assert(/^[a-f0-9-]{36}$/.test(owner)); assert([1, 3].includes(count));
const lab = "/srv/vlab-production-mirror/labs";
const root = lab + "/instances/db91-parity";
const runtime = root + "/runtime";
const unit = "openclaw-vlab-production-mirror-v8.service";
const read = path => JSON.parse(fs.readFileSync(path, "utf8"));
const hash = path => createHash("sha256").update(fs.readFileSync(path)).digest("hex");
const assertLease = () => assert.equal(read(lab + "/control/integration.json").owner, owner);
assertLease();
assert(!fs.existsSync(lab + "/shared-workflow/pending.json"));
const gatewayPid = Number(execFileSync("systemctl", ["show", unit, "-p", "MainPID", "--value"], {encoding: "utf8"}).trim());
assert(gatewayPid > 1);
const env = Object.fromEntries(fs.readFileSync(`/proc/${gatewayPid}/environ`, "utf8").split("\0").filter(Boolean).map(s => {
  const i = s.indexOf("="); return [s.slice(0, i), s.slice(i + 1)];
}));
assert(env.OPENCLAW_CONFIG_PATH.startsWith(root + "/state/"));
const cfg = read(env.OPENCLAW_CONFIG_PATH); assert.equal(cfg.gateway.port, 24993);
assert.equal(cfg.gateway.reload?.mode, "off");
const configSha = hash(env.OPENCLAW_CONFIG_PATH), workerSha = hash(runtime + "/production-worker/worker.mjs");
const stamp = Date.now(), report = {stamp, gatewayPid, count, configSha, workerSha, jobs: []};
const token = cfg.gateway.auth.token.replace(/\$\{([^}]+)\}/g, (_, key) => {assert(env[key]); return env[key];});
Object.assign(process.env, env);
const {GatewayClient} = await import(runtime + "/openclaw/dist/plugin-sdk/gateway-runtime.js");
let client, inspector, inspectorEnabled = false, inspectorPid, finished = false;
const operations = [], jobs = new Map();
await new Promise((resolve, reject) => {
  const timer = setTimeout(() => reject(Error("Gateway connect deadline")), 20_000);
  client = new GatewayClient({url: "ws://127.0.0.1:24993", token, deviceIdentity: null,
    clientName: "cli", mode: "cli", caps: ["tool-events"], scopes: ["operator.read", "operator.write", "operator.admin"],
    onHelloOk: () => {clearTimeout(timer); resolve();}, onConnectError: e => {clearTimeout(timer); reject(e);},
    onEvent: event => {
      const p = event.payload, j = jobs.get(p?.runId); if (!j) return;
      const text = event.event === "agent" && p.stream === "assistant" ? p.data?.text :
        event.event === "chat" && ["delta", "final"].includes(p.state) ? p.message?.content?.filter(c => c.type === "text").map(c => c.text).join("") : "";
      if (text?.trim()) j.firstTextMs ??= Date.now() - j.start;
      if (event.event === "chat" && p.state === "final") j.finalMs = Date.now() - j.start;
      if (event.event === "chat" && ["error", "aborted"].includes(p.state)) j.error = p.state;
    }});
  client.start();
});
const call = (method, params = {}, timeoutMs = 20_000) => client.request(method, params, {timeoutMs});
function hotStacks(profile) {
  const nodes = new Map(profile.nodes.map(n => [n.id, n])), parents = new Map();
  for (const n of nodes.values()) for (const child of n.children ?? []) parents.set(child, n.id);
  const targets = ["withOpenClawAgentDatabaseReadOnly", "assertCanonicalSqliteSessionKeysCurrent", "prepareAgentCommandExecution"];
  return Object.fromEntries(targets.map(target => {
    const groups = new Map();
    for (let i = 0; i < (profile.samples?.length ?? 0); i++) {
      const frames = []; let at = profile.samples[i], included = false;
      while (at) {
        const f = nodes.get(at).callFrame;
        included ||= f.functionName === target;
        frames.push(`${f.functionName || "(anonymous)"} @ ${f.url.split("/").at(-1)}:${f.lineNumber + 1}`);
        at = parents.get(at);
      }
      if (!included) continue;
      const key = JSON.stringify(frames.reverse()); groups.set(key, (groups.get(key) ?? 0) + profile.timeDeltas[i]);
    }
    return [target, [...groups].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([key, us]) => ({ms: us / 1000, frames: JSON.parse(key)}))];
  }));
}
async function until(fn, timeoutMs) {
  const end = Date.now() + timeoutMs;
  do {const value = await fn(); if (value) return value; await delay(100);} while (Date.now() < end);
  throw Error("Bounded diagnostic condition not reached");
}
async function attach() {
  const targets = await (await fetch("http://127.0.0.1:9229/json/list", {signal: AbortSignal.timeout(1000)})).json();
  assert.equal(targets.length, 1); const url = new URL(targets[0].webSocketDebuggerUrl);
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "9229");
  const socket = new WebSocket(url), pending = new Map(); let seq = 0;
  socket.addEventListener("message", e => {
    const row = JSON.parse(e.data), entry = pending.get(row.id); if (!entry) return;
    pending.delete(row.id); clearTimeout(entry.timer);
    row.error ? entry.reject(Error("Inspector protocol failure: " + row.error.code)) : entry.resolve(row.result);
  });
  await new Promise((resolve, reject) => {socket.addEventListener("open", resolve, {once: true}); socket.addEventListener("error", reject, {once: true});});
  return {close: () => socket.close(), post: (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++seq, timer = setTimeout(() => {pending.delete(id); reject(Error("Inspector command deadline: " + method));}, 10_000);
    pending.set(id, {resolve, reject, timer}); socket.send(JSON.stringify({id, method, params}));
  })};
}
try {
  const initial = await call("vlab.workers.status");
  assert.equal(initial.pending, 0); assert.equal(initial.workers.length, 1, "Need naturally idle single-Worker pool; do not kill or restart to manufacture cold state");
  assert.equal(initial.sessionsPerWorker, 3);
  assert(initial.workers.every(w => w.ready && !w.activeCount && !w.queued));
  const initialPid = initial.workers[0].pid;
  // Refuse an existing debug listener; never attach to or close someone else's inspector.
  let portAvailable = false;
  try {await fetch("http://127.0.0.1:9229/json/list", {signal: AbortSignal.timeout(1000)});} catch {portAvailable = true;}
  assert(portAvailable, "Inspector port is already occupied");
  for (let i = 0; i < 3; i++) {
    assertLease();
    const result = await call("vlab.workers.start", {kind: "hold", durationMs: 90_000,
      sessionKey: `agent:makaron:explicit:vlab-worker-firstprep-hold-${stamp}-${i}`,
      idempotencyKey: randomUUID()});
    assert(result.operation?.operationId); operations.push(result.operation.operationId);
  }
  const cold = await until(async () => {
    const s = await call("vlab.workers.status");
    assert.equal(s.pending, 0);
    assert.equal(s.workers.find(w => w.pid === initialPid)?.activeCount, 3);
    return s.workers.find(w => w.pid !== initialPid && w.ready && !w.activeCount && !w.queued);
  }, 30_000);
  inspectorPid = cold.pid;
  assert(fs.readFileSync(`/proc/${inspectorPid}/cmdline`, "utf8").includes(runtime + "/production-worker/worker.mjs"));
  const processStatus = fs.readFileSync(`/proc/${inspectorPid}/status`, "utf8");
  assert.equal(Number(processStatus.match(/^PPid:\s*(\d+)/m)?.[1]), gatewayPid);
  assertLease(); process.kill(inspectorPid, "SIGUSR1"); inspectorEnabled = true;
  inspector = await until(async () => {try {return await attach();} catch {return null;}}, 10_000);
  assert.equal((await inspector.post("Runtime.evaluate", {expression: "process.pid", returnByValue: true})).result.value, inspectorPid);
  report.workerPid = inspectorPid;
  await inspector.post("Profiler.enable"); await inspector.post("Profiler.setSamplingInterval", {interval: 1000}); await inspector.post("Profiler.start");
  report.profileStart = Date.now(); console.log(JSON.stringify({phase: "profile-start", gatewayPid, workerPid: inspectorPid, count, stamp}));
  for (let i = 0; i < count; i++) {
    assertLease(); const runId = randomUUID(), sessionKey = `agent:makaron:explicit:vlab-dev-firstprep-profile-${stamp}-${i}`;
    const marker = `FIRSTPREP_${stamp}_${i}`;
    const j = {runId, sessionKey, marker, start: Date.now()}; jobs.set(runId, j); report.jobs.push(j);
    await call("sessions.messages.subscribe", {agentId: "makaron", key: sessionKey});
    const ack = await call("chat.send", {agentId: "makaron", sessionKey, deliver: false, thinking: "high",
      message: `这是专用冷启动诊断，不执行工具，不发送外部消息，不修改文件。只回复 ${marker}。`, timeoutMs: 90_000, idempotencyKey: runId});
    assert.equal(ack.runId, runId);
  }
  await until(async () => {
    assertLease(); const s = await call("vlab.workers.status");
    for (const w of s.workers) for (const a of w.active ?? []) if (jobs.has(a.runId)) {
      assert.equal(w.pid, inspectorPid, "Diagnostic request did not use selected cold Worker"); jobs.get(a.runId).workerObserved = true;
    }
    for (const j of jobs.values()) assert(!j.error, "Diagnostic request failed");
    return [...jobs.values()].every(j => j.finalMs !== undefined);
  }, 65_000);
  const {profile} = await inspector.post("Profiler.stop"); report.profile = summarizeProfile(profile); report.hotStacks = hotStacks(profile); report.profileEnd = Date.now();
  for (const j of jobs.values()) {
    const history = await call("chat.history", {agentId: "makaron", sessionKey: j.sessionKey, limit: 10});
    const reply = history.messages?.filter(m => m.role === "assistant").at(-1);
    const text = reply?.content?.filter(c => c.type === "text").map(c => c.text).join("");
    assert(text?.includes(j.marker)); assert(j.workerObserved); assert(Number.isFinite(j.firstTextMs));
    assert.equal(history.sessionInfo?.agentRuntime?.id, "vlab-worker");
    j.outputCorrect = true; j.model = reply.model; j.stopReason = reply.stopReason;
  }
  finished = true;
} finally {
  if (!finished) for (const j of jobs.values()) if (j.finalMs === undefined) await call("vlab.workers.native.cancel", {runId: j.runId}).catch(() => {});
  if (inspectorEnabled) {
    inspector ??= await attach().catch(() => null);
    if (inspector) {
      const actual = await inspector.post("Runtime.evaluate", {expression: "process.pid", returnByValue: true}).catch(() => null);
      if (actual?.result.value === inspectorPid) {
        await inspector.post("Runtime.evaluate", {expression: "setImmediate(() => process.getBuiltinModule('node:inspector').close()); true", returnByValue: true}).catch(() => {});
      }
      inspector.close();
    }
  }
  for (const operationId of operations) await call("vlab.workers.cancel", {operationId}).catch(() => {});
  assert.equal(hash(env.OPENCLAW_CONFIG_PATH), configSha); assert.equal(hash(runtime + "/production-worker/worker.mjs"), workerSha);
  assert.equal(Number(execFileSync("systemctl", ["show", unit, "-p", "MainPID", "--value"], {encoding: "utf8"}).trim()), gatewayPid);
  report.completed = finished; console.log(JSON.stringify(report)); client.stop();
}
