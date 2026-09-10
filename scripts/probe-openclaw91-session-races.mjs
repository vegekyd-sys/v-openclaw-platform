#!/usr/bin/env node

import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const mode = process.argv[2];
const expected = process.argv[3];
assert(["sqlite", "live-switch"].includes(mode));
assert(["conflict", "success"].includes(expected));

const packageRoot = path.resolve(
  process.env.OPENCLAW_PACKAGE_ROOT ??
    "/srv/vlab-production-mirror/labs/instances/db91-parity/runtime/openclaw",
);
const stateRoot = path.resolve(
  process.env.OPENCLAW_STATE_DIR ??
    "/srv/vlab-production-mirror/labs/instances/db91-parity/state",
);
const configPath = path.resolve(
  process.env.OPENCLAW_CONFIG_PATH ??
    path.join(stateRoot, "shared-vlab-20260909-v3/openclaw.json"),
);
const gatewayService =
  process.env.OPENCLAW_GATEWAY_SERVICE ??
  "openclaw-vlab-production-mirror-v8.service";
const gatewayPid = execFileSync(
  "systemctl",
  ["show", gatewayService, "-p", "MainPID", "--value"],
  { encoding: "utf8" },
).trim();
assert(Number(gatewayPid) > 1, `${gatewayService} is not running`);
for (const item of (await readFile(`/proc/${gatewayPid}/environ`, "utf8")).split("\0")) {
  const separator = item.indexOf("=");
  if (separator <= 0) continue;
  const key = item.slice(0, separator);
  if (process.env[key] === undefined) process.env[key] = item.slice(separator + 1);
}
const storePath = path.join(
  stateRoot,
  "agents/makaron/agent/openclaw-agent.sqlite",
);

async function resolveBundle(pattern, marker) {
  const dist = path.join(packageRoot, "dist");
  const matches = [];
  for (const name of (await readdir(dist)).filter((value) => pattern.test(value))) {
    const filename = path.join(dist, name);
    if ((await readFile(filename, "utf8")).includes(marker)) matches.push(filename);
  }
  assert.equal(matches.length, 1, `expected one runtime bundle for ${marker}`);
  return matches[0];
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function spawnModule(source) {
  const child = spawn(
    process.execPath,
    ["--input-type=module", "--eval", source],
    { env: process.env, stdio: ["ignore", "pipe", "pipe"] },
  );
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => {
    stdout += chunk;
  });
  child.stderr.on("data", (chunk) => {
    stderr += chunk;
  });
  const completion = new Promise((resolve) => {
    child.on("close", (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
  return { child, completion, stdout: () => stdout };
}

async function runSqliteProbe() {
  const accessorPath = await resolveBundle(
    /^session-accessor\.sqlite-entry-[A-Za-z0-9_-]+\.js$/,
    "patchSessionEntryCore",
  );
  const accessorUrl = pathToFileURL(accessorPath).href;
  const sessionKey = `agent:makaron:explicit:oc64-sqlite-${Date.now()}`;
  const sessionId = randomUUID();
  const runtime = await import(accessorUrl);
  const patchEntry = runtime.p;
  const loadEntry = runtime.f;
  const scope = { storePath, sessionKey };
  const initialEntry = {
    sessionId,
    status: "done",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    label: "initial",
  };
  await patchEntry(scope, () => initialEntry, {
    fallbackEntry: initialEntry,
    replaceEntry: true,
    skipMaintenance: true,
  });

  const common = `
    const runtime = await import(${JSON.stringify(accessorUrl)});
    const scope = ${JSON.stringify(scope)};
  `;
  const slow = spawnModule(`${common}
    await runtime.p(scope, async () => {
      process.stdout.write("PREPARED\\n");
      await new Promise((resolve) => setTimeout(resolve, 350));
      return { label: "slow-writer", updatedAt: Date.now() };
    }, { retrySnapshotConflicts: true, skipMaintenance: true });
    process.stdout.write("COMMITTED\\n");
  `);
  // A cold process validates the full 7.5 GiB mirrored database before it can
  // enter the callback. Keep this a real full-data probe instead of silently
  // replacing it with a small synthetic database.
  const preparedDeadline = Date.now() + 240_000;
  while (!slow.stdout().includes("PREPARED\n")) {
    assert(Date.now() < preparedDeadline, "slow writer did not prepare");
    await sleep(10);
  }
  assert.match(sessionKey, /^[a-z0-9:-]+$/);
  const fastUpdatedAt = Date.now();
  execFileSync("sqlite3", [
    storePath,
    `update session_nodes set entry_json=json_set(entry_json,'$.displayName','fast-writer','$.updatedAt',${fastUpdatedAt}),updated_at=${fastUpdatedAt} where session_key='${sessionKey}';`,
  ]);
  const slowResult = await slow.completion;
  const entry = loadEntry({ ...scope, hydrateSkillPromptRefs: false });
  const conflict =
    slowResult.stderr.includes("SqliteSessionMutationConflictError") &&
    slowResult.stderr.includes(
      "SQLite session state changed while preparing session-entry.patch",
    );
  const preservedBoth =
    entry?.label === "slow-writer" && entry?.displayName === "fast-writer";
  const report = {
    mode,
    expected,
    sessionKey,
    slowExitCode: slowResult.code,
    conflict,
    preservedBoth,
  };
  if (expected === "conflict") {
    assert.notEqual(slowResult.code, 0, "baseline unexpectedly retried conflict");
    assert.equal(conflict, true);
  } else {
    assert.equal(slowResult.code, 0, slowResult.stderr);
    assert.equal(preservedBoth, true);
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

async function runLiveSwitchProbe() {
  const cfg = JSON.parse(await readFile(configPath, "utf8"));
  assert.equal(cfg.gateway.port, 24993);
  const accessorPath = await resolveBundle(
    /^session-accessor\.sqlite-entry-[A-Za-z0-9_-]+\.js$/,
    "patchSessionEntryCore",
  );
  const { p: patchEntry } = await import(pathToFileURL(accessorPath).href);
  const { GatewayClient } = await import(
    pathToFileURL(path.join(packageRoot, "dist/plugin-sdk/gateway-runtime.js")).href
  );
  const sessionKey = `agent:makaron:explicit:oc64-live-switch-${Date.now()}`;
  const runId = `OC64_LIVE_SWITCH_${Date.now()}`;
  const finalMarker = `${runId}_FINAL`;
  let firstAssistantResolve;
  let terminalResolve;
  const firstAssistant = new Promise((resolve) => {
    firstAssistantResolve = resolve;
  });
  const terminal = new Promise((resolve) => {
    terminalResolve = resolve;
  });
  let firstAssistantSeen = false;
  let terminalState;
  let client;
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Gateway connect deadline")), 20_000);
    client = new GatewayClient({
      url: "ws://127.0.0.1:24993",
      token: cfg.gateway.auth.token,
      deviceIdentity: null,
      clientName: "cli",
      mode: "cli",
      caps: ["tool-events"],
      scopes: ["operator.read", "operator.write", "operator.admin"],
      onHelloOk: () => {
        clearTimeout(timer);
        resolve();
      },
      onConnectError: (error) => {
        clearTimeout(timer);
        reject(error);
      },
      onEvent: (event) => {
        const payload = event.payload ?? {};
        if (payload.runId !== runId && payload.sessionKey !== sessionKey) return;
        if (
          !firstAssistantSeen &&
          event.event === "agent" &&
          payload.stream === "assistant" &&
          typeof payload.data?.text === "string" &&
          payload.data.text.length > 0
        ) {
          firstAssistantSeen = true;
          firstAssistantResolve();
        }
        if (
          event.event === "chat" &&
          ["final", "error", "aborted"].includes(payload.state)
        ) {
          terminalState = payload.state;
          terminalResolve(payload.state);
        }
      },
    });
    client.start();
  });

  const call = (method, params = {}, timeoutMs = 30_000) =>
    client.request(method, params, { timeoutMs });
  try {
    const status = await call("vlab.workers.status");
    assert.equal(status.pending, 0, "shared VLab has pending work");
    assert.equal(
      status.workers.reduce((sum, worker) => sum + worker.activeCount, 0),
      0,
      "shared VLab has active work",
    );
    await call("sessions.messages.subscribe", { agentId: "makaron", key: sessionKey });
    const material = Array.from(
      { length: 180 },
      (_, index) => `第${index + 1}项：共享VLab在线切换状态机回归材料。`,
    ).join("\n");
    const accepted = await call("chat.send", {
      agentId: "makaron",
      sessionKey,
      deliver: false,
      idempotencyKey: runId,
      thinking: "high",
      timeoutMs: 180_000,
      message:
        `这是共享VLab内部状态机验收，不要调用工具、不要访问网络、不要发送外部消息。` +
        `请逐项概括以下材料，正文至少1200个中文字符，最后一行必须只写 ${finalMarker}。\n${material}`,
    });
    assert.equal(accepted.runId, runId);
    await Promise.race([
      firstAssistant,
      sleep(120_000).then(() => {
        throw new Error("first assistant text deadline");
      }),
    ]);

    await patchEntry(
      { storePath, sessionKey },
      (entry) => ({
        authProfileOverride: entry.authProfileOverride ?? "deepseek:default",
        authProfileOverrideSource: "user",
        liveModelSwitchPending: true,
        updatedAt: Date.now(),
      }),
      { skipMaintenance: true },
    );

    await Promise.race([
      terminal,
      sleep(180_000).then(() => "deadline"),
    ]);
    let waitResult;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      waitResult = await call("agent.wait", { runId, timeoutMs: 30_000 }, 35_000);
      if (!["running", "timeout"].includes(waitResult.status)) break;
    }
    const history = await call("chat.history", {
      agentId: "makaron",
      sessionKey,
      limit: 40,
    });
    const finalMessages = (history.messages ?? []).filter(
      (message) =>
        message.role === "assistant" &&
        (message.content ?? []).some(
          (item) => item.type === "text" && item.text.includes(finalMarker),
        ),
    );
    const report = {
      mode,
      expected,
      sessionKey,
      runId,
      terminalState,
      waitStatus: waitResult?.status,
      sessionStatus: history.sessionInfo?.status,
      runtime: history.sessionInfo?.agentRuntime?.id,
      finalMarkerMessages: finalMessages.length,
    };
    if (expected === "conflict") {
      assert.notEqual(waitResult?.status, "ok", "baseline unexpectedly succeeded");
    } else {
      assert.equal(waitResult?.status, "ok");
      assert.equal(terminalState, "final");
      assert.equal(history.sessionInfo?.agentRuntime?.id, "vlab-worker");
      assert.ok(finalMessages.length >= 1, "successful retry did not persist final marker");
    }
    process.stdout.write(`${JSON.stringify(report)}\n`);
  } finally {
    client.stop();
  }
}

if (mode === "sqlite") await runSqliteProbe();
else await runLiveSwitchProbe();
