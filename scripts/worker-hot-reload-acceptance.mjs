// Explicitly limited to this task's isolated VLab. Never connects a channel or
// accepts a production target. Config changes only exercise Talk hot reload.
import fs from "node:fs";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const root = "/srv/vlab-production-mirror/labs/instances/worker-reload";
assert.equal(process.env.OPENCLAW_HOME, root);
assert.equal(process.getuid(), fs.statSync(root).uid);
const cfgPath = `${root}/state/openclaw.json`;
const cfg = JSON.parse(fs.readFileSync(cfgPath));
assert.equal(cfg.gateway.port, 26260);
assert.equal(cfg.gateway.reload.mode, "hybrid");
assert.deepEqual(cfg.channels, {});
assert.equal(cfg.cron.enabled, false);
assert.equal(cfg.browser.enabled, false);
const expectBug = process.argv.includes("--expect-bug");
const initialTalk = cfg.talk;
let expectedTalk = initialTalk;
const pid = () => execFileSync("systemctl", ["show", "openclaw-lab-worker-reload.service", "-p", "MainPID", "--value"], { encoding: "utf8" }).trim();
const gatewayPid = pid();
assert(Number(gatewayPid) > 1);
for (const entry of fs.readFileSync(`/proc/${gatewayPid}/environ`, "utf8").split("\0").filter(Boolean)) {
  const i = entry.indexOf("=");
  process.env[entry.slice(0, i)] = entry.slice(i + 1);
}
const stamp = Date.now(), results = [];
const output = `${root}/tmp/hot-reload-${expectBug ? "baseline" : "candidate"}-${stamp}.json`;
const emit = entry => { results.push({ at: Date.now(), ...entry }); console.log(JSON.stringify(results.at(-1))); };
const { GatewayClient } = await import(`${root}/runtime/openclaw/dist/plugin-sdk/gateway-runtime.js`);
let client;

function writeTalk(value) {
  const before = fs.readFileSync(cfgPath, "utf8"), current = JSON.parse(before);
  assert.deepEqual(current.talk, expectedTalk, "Another writer changed Talk config");
  if (value === undefined) delete current.talk;
  else current.talk = value;
  const staged = `${root}/state/worker-hot-reload-pending.json`;
  fs.writeFileSync(staged, `${JSON.stringify(current, null, 2)}\n`, { mode: 0o600, flag: "wx" });
  assert.equal(fs.readFileSync(cfgPath, "utf8"), before, "Concurrent config write");
  fs.renameSync(staged, cfgPath);
  expectedTalk = value;
}

try {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error("Gateway connection deadline")), 30_000);
    client = new GatewayClient({
      url: `ws://127.0.0.1:${cfg.gateway.port}`, token: cfg.gateway.auth.token,
      deviceIdentity: null, clientName: "cli", mode: "cli",
      scopes: ["operator.read", "operator.write"],
      onHelloOk: () => { clearTimeout(timer); resolve(); },
      onConnectError: e => { clearTimeout(timer); reject(e); },
    });
    client.start();
  });
  const call = (method, params = {}, timeoutMs = 15_000) => client.request(method, params, { timeoutMs });
  const status = () => call("vlab.workers.status");
  const ping = () => call("vlab.workers.ping", { sessionKey: `agent:makaron:explicit:vlab-worker-reload-${stamp}` });
  const summary = s => ({ started: s.started, closing: s.closing, generation: s.generation,
    workers: s.workers.map(w => ({ pid: w.pid, ready: w.ready, activeCount: w.activeCount, queued: w.queued })),
    pending: s.pending, stats: { admitted: s.integration?.nativeHarnessStats?.admitted,
      completed: s.integration?.nativeHarnessStats?.completed, failed: s.integration?.nativeHarnessStats?.failed } });
  async function modelTool(label) {
    const key = `agent:lab:explicit:worker-reload-${stamp}-${label}`;
    const marker = `RELOAD_${stamp}_${label}_TOOL`, final = `RELOAD_${stamp}_${label}_DONE`;
    const start = Date.now();
    await call("sessions.patch", { key, agentId: "lab", model: "deepseek/deepseek-v4-pro" });
    const accepted = await call("chat.send", { agentId: "lab", sessionKey: key, deliver: false,
      idempotencyKey: `reload-${stamp}-${label}`, thinking: "low", timeoutMs: 120_000,
      message: `这是独立 VLab 生命周期验收。只使用 exec 执行 printf '${marker}\\n'，核对真实工具输出后最终只回复 ${final}。不要读取额外文件、访问外部消息或委派。失败请如实说明。` });
    let terminal;
    try {
      for (let n = 0; n < 60; n++) {
        const r = await call("agent.wait", { runId: accepted.runId, timeoutMs: 1 });
        if (!["running", "timeout"].includes(r.status)) { terminal = r.status; break; }
        await delay(2_000);
      }
      assert.equal(terminal, "ok");
      let history;
      for (let n = 0; n < 6; n++) {
        try { history = await call("chat.history", { agentId: "lab", sessionKey: key, limit: 24 }); break; }
        catch (e) { if (!e.retryable || n === 5) throw e; await delay(500); }
      }
      const messages = history.messages ?? [];
      const text = m => typeof m.content === "string" ? m.content : (m.content ?? []).filter(c => c.type === "text").map(c => c.text).join("\n");
      const tool = messages.some(m => m.role === "toolResult" && text(m).includes(marker));
      const reply = messages.some(m => m.role === "assistant" && text(m).includes(final));
      const models = [...new Set(messages.filter(m => m.role === "assistant").map(m => m.model).filter(Boolean))];
      assert(tool && reply); assert.deepEqual(models, ["deepseek-v4-pro"]);
      assert.equal(history.sessionInfo?.agentRuntime?.id, "vlab-worker");
      assert.equal(history.sessionInfo?.status, "done");
      emit({ phase: "model-tool", label, elapsedMs: Date.now() - start, tool, reply, models, runtime: "vlab-worker", passed: true });
    } finally {
      if (!terminal && accepted.runId) await call("chat.abort", { sessionKey: key, runId: accepted.runId }).catch(() => {});
    }
  }

  const before = await status();
  assert(before.workers.some(w => w.ready));
  await ping();
  emit({ phase: "before", gatewayPid, ...summary(before) });
  await modelTool("before");
  for (let cycle = 1; cycle <= (expectBug ? 1 : 3); cycle++) {
    const previous = await status();
    const previousPids = previous.workers.map(w => w.pid);
    const nextTalk = { ...initialTalk, realtime: { ...initialTalk?.realtime,
      instructions: `Private VLab hot-reload lifecycle acceptance ${stamp}, cycle ${cycle}.` } };
    writeTalk(nextTalk);
    const start = Date.now();
    let after, emptySince;
    while (Date.now() - start < 100_000) {
      assert.equal(pid(), gatewayPid, "Gateway restarted; this is not hot-reload acceptance");
      try { after = await status(); } catch { await delay(1_000); continue; }
      if (after.workers.some(w => w.ready && !previousPids.includes(w.pid))) break;
      if (after.workers.length === 0) {
        emptySince ??= Date.now();
        if (Date.now() - emptySince > 8_000) break;
      } else emptySince = undefined;
      await delay(1_000);
    }
    assert(after);
    if (expectBug) {
      let error;
      try { await ping(); } catch (e) { error = e.message; }
      assert.match(error ?? "", /worker pool is closing/);
      assert.equal(after.workers.length, 0);
      emit({ phase: "reproduced", cycle, gatewayPid, ...summary(after), error, expectedFailure: true });
      break;
    }
    assert(after.workers.some(w => w.ready && !previousPids.includes(w.pid)), "No fresh ready Worker after reload");
    assert.equal(after.closing, false);
    assert.equal(after.generation, previous.generation + 1);
    await ping();
    emit({ phase: "reloaded", cycle, elapsedMs: Date.now() - start, gatewayPid, ...summary(after) });
    await modelTool(`cycle${cycle}`);
  }
  emit({ phase: "summary", expectBug, passed: true, gatewayPidUnchanged: pid() === gatewayPid });
} catch (error) {
  emit({ phase: "failure", error: String(error.message).slice(0, 500), passed: false });
  process.exitCode = 1;
} finally {
  try { writeTalk(initialTalk); emit({ phase: "config-restored", passed: true }); }
  catch (e) { emit({ phase: "restore-failed", error: e.message }); process.exitCode = 1; }
  client?.stop();
  fs.writeFileSync(output, `${JSON.stringify(results, null, 2)}\n`, { mode: 0o600 });
  console.log(JSON.stringify({ evidence: output }));
}
