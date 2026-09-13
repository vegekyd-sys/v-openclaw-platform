import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";

assert.equal(os.hostname(), "VM-8-2-ubuntu");
assert.equal(process.getuid(), 0);

const mode = process.argv[2];
assert(["status", "apply", "rollback"].includes(mode));

const state = "/home/openclaw/.openclaw";
const core = "/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1/core";
const source = "/opt/openclaw-experiments/db91-release-v2026.9.1-db91.1/source/scripts";
const unit = "openclaw-gateway.service";
const timer = "openclaw-gateway-memory-snapshot.timer";
const target = `${core}/dist/sessions-spawn-tool-1FQMTkIo.js`;
const staged = "/tmp/sessions-send-owner-sessions-spawn-tool-1FQMTkIo.js";
const backup = `${state}/backups/sessions-send-owner-91-20260913-v2`;
const stopPolicy = "/etc/systemd/system/openclaw-gateway.service.d/zzzz-db91-stop-policy.conf";
const beforeSha = "30dd4e987276fc0b13e18a716a46e81cd9044a4362a8e8881642c783a4c6f9c3";
const afterSha = "52b6ea5448e758f6d764200d946853be80a0fe5b419629801ee761173741d848";
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const run = (command, args, options = {}) => execFileSync(command, args, {
  encoding: "utf8",
  timeout: 120_000,
  ...options,
}).trim();
const sha = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const digest = (value) => createHash("sha256").update(String(value)).digest("hex").slice(0, 12);
const pid = () => Number(run("systemctl", ["show", unit, "-p", "MainPID", "--value"]));
const record = (phase, details = {}) => {
  const value = { phase, at: new Date().toISOString(), ...details };
  process.stdout.write(`${JSON.stringify(value)}\n`);
  return value;
};

assert.equal(JSON.parse(fs.readFileSync(`${core}/package.json`)).version, "2026.9.1");

function loadLiveEnvironment(livePid) {
  assert(livePid > 1);
  return Object.fromEntries(
    fs.readFileSync(`/proc/${livePid}/environ`, "utf8")
      .split("\0")
      .filter(Boolean)
      .map((entry) => {
        const index = entry.indexOf("=");
        return [entry.slice(0, index), entry.slice(index + 1)];
      }),
  );
}

function resolveToken(value, env) {
  return value.replace(/\$\{([^}]+)\}/g, (_, key) => {
    assert(env[key], `Missing Gateway token environment variable ${key}`);
    return env[key];
  });
}

async function connect(livePid) {
  const env = loadLiveEnvironment(livePid);
  Object.assign(process.env, env);
  const configPath = env.OPENCLAW_CONFIG_PATH ?? `${state}/openclaw.json`;
  const config = JSON.parse(fs.readFileSync(configPath));
  const { GatewayClient } = await import(`${core}/dist/plugin-sdk/gateway-runtime.js`);
  let client;
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      client?.stop();
      reject(new Error("Gateway connect timeout"));
    }, 30_000);
    client = new GatewayClient({
      url: `ws://127.0.0.1:${config.gateway.port}`,
      token: resolveToken(config.gateway.auth.token, env),
      deviceIdentity: null,
      clientName: "cli",
      mode: "cli",
      scopes: ["operator.read", "operator.write", "operator.admin"],
      onHelloOk: () => {
        clearTimeout(timeout);
        resolve();
      },
      onConnectError: (error) => {
        clearTimeout(timeout);
        reject(error);
      },
      onEvent() {},
    });
    client.start();
  });
  return client;
}

async function snapshot({ requireIdle = false } = {}) {
  const livePid = pid();
  assert(livePid > 1, "Gateway is not running");
  const client = await connect(livePid);
  try {
    const health = await client.request("health", {}, { timeoutMs: 30_000 });
    const workers = await client.request("vlab.workers.status", {}, { timeoutMs: 30_000 });
    const active = [];
    let offset = 0;
    for (let page = 0; page < 20; page += 1) {
      const sessions = await client.request("sessions.list", { limit: 500, offset }, { timeoutMs: 45_000 });
      active.push(...sessions.sessions.filter((session) => session.hasActiveRun === true));
      if (!sessions.hasMore) break;
      assert(page < 19 && sessions.nextOffset > offset, "Session pagination did not advance");
      offset = sessions.nextOffset;
    }
    const result = {
      pid: livePid,
      health: health.ok,
      eventLoopDegraded: health.eventLoop?.degraded ?? null,
      pending: workers.pending,
      activeSessions: active.length,
      activeSessionSummary: active.map((session) => ({
        keyHash: digest(session.key),
        updatedAt: session.updatedAt,
        runtime: session.agentRuntime?.id ?? null,
      })),
      workerActive: workers.workers.reduce((count, worker) => count + worker.activeCount, 0),
      queued: workers.workers.reduce((count, worker) => count + (worker.queued ?? 0), 0),
      detached: workers.workers.reduce((count, worker) => count + (worker.detachedTaskCount ?? 0), 0),
      workersReady: workers.workers.every((worker) => worker.ready),
      feishu: health.channels?.feishu ? {
        configured: health.channels.feishu.configured,
        connected: health.channels.feishu.connected,
        running: health.channels.feishu.running,
        lastError: health.channels.feishu.lastError,
      } : null,
    };
    if (requireIdle) {
      assert(result.health, "Gateway health is not OK");
      assert.equal(result.pending, 0, "Worker pending work exists");
      assert.equal(result.activeSessions, 0, "Active sessions exist");
      assert.equal(result.workerActive, 0, "Active Worker runs exist");
      assert.equal(result.queued, 0, "Queued Worker runs exist");
      assert.equal(result.detached, 0, "Detached Worker runs exist");
      assert(result.workersReady, "A Worker is not ready");
    }
    return { client, result };
  } catch (error) {
    client.stop();
    throw error;
  }
}

async function waitReady() {
  const deadline = Date.now() + 360_000;
  let lastError;
  while (Date.now() < deadline) {
    try {
      if (run("systemctl", ["is-active", unit]) === "active" && pid() > 1) {
        const { client, result } = await snapshot();
        client.stop();
        if (result.health && result.workersReady) return result;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(2_000);
  }
  throw new Error(`Gateway did not become ready: ${lastError?.message ?? "unknown"}`);
}

function atomicReplace(from, to, suffix) {
  const stat = fs.statSync(to);
  const temporary = `${to}.${suffix}-${process.pid}`;
  fs.copyFileSync(from, temporary, fs.constants.COPYFILE_EXCL);
  fs.chownSync(temporary, stat.uid, stat.gid);
  fs.chmodSync(temporary, stat.mode & 0o777);
  fs.renameSync(temporary, to);
}

async function controlledStop() {
  const livePid = pid();
  assert(livePid > 1, "Gateway is not running before controlled stop");
  Object.assign(process.env, loadLiveEnvironment(livePid));
  const { db91SignalPolicy } = await import(`${source}/db91-production-plan.mjs`);
  assert(!fs.existsSync(stopPolicy), "A maintenance stop policy already exists");
  fs.writeFileSync(stopPolicy, db91SignalPolicy, { flag: "wx", mode: 0o644 });
  run("systemctl", ["daemon-reload"]);
  assert.equal(run("systemctl", ["show", unit, "-p", "KillMode", "--value"]), "mixed");
  assert.equal(run("systemctl", ["show", unit, "-p", "KillSignal", "--value"]), "10");
  run("/usr/sbin/runuser", [
    "-u", "openclaw", "--", process.execPath,
    `${source}/write-db91-restart-intent.mjs`, core, String(livePid),
  ], { env: process.env });
  record("native-stop-requested", { beforePid: livePid, signal: "SIGUSR1", terminalPolicy: "preserve" });
  run("systemctl", ["stop", unit], { timeout: 65_000 });
  assert.equal(pid(), 0, "Gateway did not stop");
}

function controlledStart() {
  assert.equal(pid(), 0, "Gateway is already running");
  run("systemctl", ["start", unit], { timeout: 65_000 });
}

async function cleanupStopPolicy() {
  if (!fs.existsSync(stopPolicy)) return;
  const { db91SignalPolicy } = await import(`${source}/db91-production-plan.mjs`);
  assert.equal(fs.readFileSync(stopPolicy, "utf8"), db91SignalPolicy, "Stop policy drift");
  fs.unlinkSync(stopPolicy);
  run("systemctl", ["daemon-reload"]);
}

if (mode === "status") {
  const { client, result } = await snapshot();
  client.stop();
  record("status", {
    ...result,
    targetSha: sha(target),
    configSha: sha(`${state}/openclaw.json`),
    timerActive: run("systemctl", ["show", timer, "-p", "ActiveState", "--value"]) === "active",
  });
  process.exit(0);
}

if (mode === "rollback") {
  assert(fs.existsSync(`${backup}/before.js`), "Rollback backup is missing");
  assert.equal(sha(target), afterSha, "Target is not the patched artifact");
  const timerWasActive = run("systemctl", ["show", timer, "-p", "ActiveState", "--value"]) === "active";
  if (timerWasActive) run("systemctl", ["stop", timer]);
  try {
    const { client } = await snapshot({ requireIdle: true });
    client.stop();
    await controlledStop();
    atomicReplace(`${backup}/before.js`, target, "sessions-send-owner-rollback");
    assert.equal(sha(target), beforeSha);
    controlledStart();
    const ready = await waitReady();
    await cleanupStopPolicy();
    record("rolled-back", { ready, targetSha: sha(target) });
  } finally {
    if (timerWasActive) run("systemctl", ["start", timer]);
  }
  process.exit(0);
}

assert.equal(sha(target), beforeSha, "Production target drift");
assert.equal(sha(staged), afterSha, "Staged artifact drift");
assert(!fs.existsSync(backup), "Backup path already exists");
let timerWasActive = false;
let stopped = false;
let patched = false;
let suspensionClient;
let suspensionId;
try {
  const first = await snapshot();
  suspensionClient = first.client;
  assert(first.result.health, "Gateway health is not OK");
  assert(first.result.workersReady, "A Worker is not ready");
  record("preflight", first.result);
  const requestId = `sessions-send-owner-${randomUUID()}`;
  const suspension = await first.client.request("gateway.suspend.prepare", {
    requestId,
    drain: true,
    terminalPolicy: "preserve",
  }, { timeoutMs: 30_000 });
  suspensionId = suspension.suspensionId;
  const deadline = Date.now() + 75_000;
  let suspensionStatus;
  let lastProgressAt = 0;
  while (Date.now() < deadline) {
    suspensionStatus = await first.client.request("gateway.suspend.status", {
      suspensionId: suspension.suspensionId,
    }, { timeoutMs: 30_000 });
    if (suspensionStatus.status === "ready" && suspensionStatus.expiresAtMs > Date.now()) break;
    if (Date.now() - lastProgressAt >= 15_000) {
      record("draining", {
        status: suspensionStatus.status,
        activeCount: suspensionStatus.activeCount,
        queuedCount: suspensionStatus.queuedCount,
      });
      lastProgressAt = Date.now();
    }
    await sleep(500);
  }
  const drainReady = suspensionStatus?.status === "ready" && suspensionStatus.expiresAtMs > Date.now();
  if (!drainReady) {
    assert.equal(suspensionStatus?.status, "draining", "Gateway suspension left the draining state");
    assert((suspensionStatus.expiresAtMs ?? 0) > Date.now(), "Gateway suspension expired");
    assert((suspensionStatus.activeCount ?? 0) > 0, "Drain blocked without an active run");
    assert.equal(suspensionStatus.queuedCount ?? 0, 0, "Queued work exists at cutover");
    record("preserve-inflight-cutover", {
      activeCount: suspensionStatus.activeCount,
      blockers: suspensionStatus.blockers?.map((blocker) => ({
        kind: blocker.kind,
        count: blocker.count,
      })) ?? [],
    });
  }
  first.client.stop();
  suspensionClient = undefined;

  fs.mkdirSync(backup, { mode: 0o700 });
  fs.copyFileSync(target, `${backup}/before.js`, fs.constants.COPYFILE_EXCL);
  fs.chmodSync(`${backup}/before.js`, 0o600);
  fs.writeFileSync(`${backup}/release.json`, `${JSON.stringify({
    release: "sessions-send-owner-91-v1",
    sourceCommit: "a5d8518f320df3a47c82911d29f2c51f1940a58d",
    artifactSha: "ccca017b351ab4da0d8e5b31f7de8d02ceb36c6db3d85074cfca038947e011f9",
    target,
    beforeSha,
    afterSha,
    configSha: sha(`${state}/openclaw.json`),
    preparedAt: new Date().toISOString(),
  }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  assert.equal(sha(`${backup}/before.js`), beforeSha);
  record("prepared", { backup, liveUnchanged: true });

  timerWasActive = run("systemctl", ["show", timer, "-p", "ActiveState", "--value"]) === "active";
  if (timerWasActive) run("systemctl", ["stop", timer]);
  await controlledStop();
  stopped = true;
  assert.equal(sha(target), beforeSha, "Concurrent target mutation");
  atomicReplace(staged, target, "sessions-send-owner");
  patched = true;
  assert.equal(sha(target), afterSha);
  record("installed", { targetSha: afterSha, configChanged: false });
  controlledStart();
  stopped = false;
  const ready = await waitReady();
  await cleanupStopPolicy();
  const receipt = {
    release: "sessions-send-owner-91-v1",
    sourceCommit: "a5d8518f320df3a47c82911d29f2c51f1940a58d",
    artifactSha: "ccca017b351ab4da0d8e5b31f7de8d02ceb36c6db3d85074cfca038947e011f9",
    targetSha: sha(target),
    configSha: sha(`${state}/openclaw.json`),
    ready,
    completedAt: new Date().toISOString(),
  };
  fs.writeFileSync(`${backup}/installed.json`, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  record("completed", receipt);
} catch (error) {
  record("apply-failed", { error: String(error?.stack ?? error).slice(0, 1200), stopped, patched });
  if (suspensionClient) {
    if (suspensionId && pid() > 1) {
      await suspensionClient.request("gateway.suspend.resume", { suspensionId }).catch(() => {});
    }
    suspensionClient.stop();
    suspensionClient = undefined;
  }
  if (patched && fs.existsSync(`${backup}/before.js`)) {
    if (!stopped && pid() > 1) await controlledStop();
    stopped = true;
    atomicReplace(`${backup}/before.js`, target, "sessions-send-owner-auto-rollback");
    assert.equal(sha(target), beforeSha);
  }
  if (stopped || pid() === 0) {
    controlledStart();
    stopped = false;
    await waitReady();
  }
  await cleanupStopPolicy();
  if (fs.existsSync(backup)) fs.writeFileSync(`${backup}/auto-rollback.json`, `${JSON.stringify({
    at: new Date().toISOString(),
    targetSha: sha(target),
    error: String(error?.message ?? error),
  }, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  throw error;
} finally {
  if (timerWasActive) run("systemctl", ["start", timer]);
}
