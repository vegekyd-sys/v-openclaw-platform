// Boots one target runtime on a private port with an empty state directory and
// talks to it the way a client does: Gateway RPC over WebSocket and plain HTTP.
// Contracts never read dist files or the state directory's internals unless the
// contract is explicitly about what lands there.
import { spawn } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import { startFakeModel } from "./fake-model.mjs";

const TOKEN = "contract-token";

async function freePort() {
  const s = createServer();
  await new Promise((r) => s.listen(0, "127.0.0.1", r));
  const { port } = s.address();
  await new Promise((r) => s.close(r));
  return port;
}

function merge(base, over) {
  if (!over || typeof over !== "object" || Array.isArray(over)) return over ?? base;
  const out = { ...(base ?? {}) };
  for (const [k, v] of Object.entries(over)) out[k] = merge(out[k], v);
  return out;
}

export async function boot(targetDir, { config = {}, env = {}, modelScript, skipChannels = true } = {}) {
  const dir = mkdtempSync(path.join(os.tmpdir(), "c2-"));
  const stateDir = path.join(dir, "state");
  const workspace = path.join(dir, "ws");
  mkdirSync(stateDir);
  mkdirSync(workspace);
  const script = { current: modelScript ?? (() => ({ text: "ok" })) };
  const model = await startFakeModel(script);
  const port = await freePort();
  const fullConfig = merge(
    {
      gateway: { mode: "local", port, bind: "loopback", auth: { mode: "token", token: TOKEN } },
      models: {
        providers: {
          fake: {
            baseUrl: `http://127.0.0.1:${model.port}/v1`,
            apiKey: "contract",
            api: "openai-completions",
            request: { allowPrivateNetwork: true },
            models: [{ id: "m1", name: "m1", contextWindow: 200000, maxTokens: 8192, input: ["text", "image"], reasoning: false, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
          },
        },
      },
      agents: { defaults: { workspace, model: { primary: "fake/m1" } } },
      plugins: { entries: { "memory-core": { config: { dreaming: { enabled: false } } } } },
      update: { checkOnStart: false },
    },
    config,
  );
  const pluginsDir = path.join(targetDir, "plugins");
  if (existsSync(pluginsDir)) {
    fullConfig.plugins = merge(fullConfig.plugins, {
      load: { paths: ["feishu", "codex"].map((id) => path.join(pluginsDir, id)) },
    });
  }
  const configPath = path.join(dir, "openclaw.json");
  writeFileSync(configPath, JSON.stringify(fullConfig, null, 2));
  const logPath = path.join(dir, "gateway.log");
  const logs = [];
  const child = spawn(process.execPath, ["dist/index.js", "gateway", "--port", String(port)], {
    cwd: targetDir,
    env: {
      ...process.env,
      OPENCLAW_STATE_DIR: stateDir,
      OPENCLAW_CONFIG_PATH: configPath,
      ...(skipChannels ? { OPENCLAW_SKIP_CHANNELS: "1" } : {}),
      OPENCLAW_DISABLE_BONJOUR: "1",
      ...env,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  for (const s of [child.stdout, child.stderr]) s.on("data", (d) => logs.push(d.toString()));
  let exited = null;
  child.on("exit", (code, signal) => (exited = { code, signal }));
  const started = Date.now();
  let rpc;
  try {
    for (;;) {
      if (exited) throw new Error(`gateway exited during boot ${JSON.stringify(exited)}\n${logs.join("").slice(-2000)}`);
      if (Date.now() - started > 120_000) throw new Error(`gateway not ready after 120 s\n${logs.join("").slice(-2000)}`);
      if (logs.join("").includes("[gateway] ready")) {
        rpc = await connectRpc(port).catch((e) => {
          if (/retry shortly/.test(e.message)) return null;
          throw e;
        });
        if (rpc) break;
      }
      await new Promise((r) => setTimeout(r, 300));
    }
  } catch (e) {
    child.kill("SIGKILL");
    await model.stop();
    throw e;
  }
  return {
    port,
    dir,
    stateDir,
    workspace,
    configPath,
    model,
    script,
    rpc,
    logs: () => logs.join(""),
    http: (p, init) => fetch(`http://127.0.0.1:${port}${p}`, init),
    /** Runs one agent turn and resolves with its final wait result. */
    async turn(message, { sessionKey = "agent:main:contract", timeoutMs = 90_000 } = {}) {
      const key = crypto.randomUUID();
      const sent = await rpc.call("agent", { message, sessionKey, idempotencyKey: key, deliver: false }, { expectFinal: false, timeoutMs });
      const runId = sent.runId ?? key;
      const waited = await rpc.call("agent.wait", { runId, timeoutMs }, { timeoutMs: timeoutMs + 5000 });
      return { runId, ...waited };
    },
    async history(sessionKey = "agent:main:contract") {
      return (await rpc.call("chat.history", { sessionKey, limit: 200 })).messages ?? [];
    },
    async stop() {
      rpc.close();
      if (!exited) {
        child.kill("SIGTERM");
        const deadline = Date.now() + 8000;
        while (!exited && Date.now() < deadline) await new Promise((r) => setTimeout(r, 100));
        if (!exited) child.kill("SIGKILL");
      }
      await model.stop();
      writeFileSync(logPath, logs.join(""));
      if (!process.env.C2_KEEP) rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
    },
  };
}

export async function connectRpc(port) {
  const keys = crypto.generateKeyPairSync("ed25519");
  const rawKey = keys.publicKey.export({ format: "der", type: "spki" }).subarray(-32);
  const deviceId = crypto.createHash("sha256").update(rawKey).digest("hex");
  const scopes = ["operator.admin", "operator.read", "operator.write", "operator.approvals", "operator.pairing"];
  const ws = new WebSocket(`ws://127.0.0.1:${port}/`);
  const pending = new Map();
  const events = [];
  let nextId = 1;
  let onConnected, onFailed;
  const connected = new Promise((res, rej) => ((onConnected = res), (onFailed = rej)));
  ws.addEventListener("error", (e) => onFailed(new Error(`ws error ${e.message ?? ""}`)));
  ws.addEventListener("close", () => {
    onFailed(new Error("ws closed before connect"));
    for (const p of pending.values()) p.reject(new Error("ws closed"));
    pending.clear();
  });
  ws.addEventListener("message", (m) => {
    const j = JSON.parse(m.data.toString());
    if (j.event === "connect.challenge") {
      const signedAt = Date.now();
      const nonce = j.payload.nonce;
      const signed = ["v3", deviceId, "cli", "cli", "operator", scopes.join(","), String(signedAt), TOKEN, nonce, process.platform, ""].join("|");
      ws.send(
        JSON.stringify({
          type: "req",
          id: "connect",
          method: "connect",
          params: {
            minProtocol: 3,
            maxProtocol: 99,
            client: { id: "cli", version: "contract", platform: process.platform, mode: "cli" },
            role: "operator",
            scopes,
            auth: { token: TOKEN },
            device: { id: deviceId, publicKey: rawKey.toString("base64url"), signature: crypto.sign(null, Buffer.from(signed), keys.privateKey).toString("base64url"), signedAt, nonce },
          },
        }),
      );
      return;
    }
    if (j.type === "event") {
      events.push(j);
      return;
    }
    if (j.id === "connect") {
      if (j.ok) onConnected();
      else onFailed(new Error(`connect refused: ${JSON.stringify(j.error)}`));
      return;
    }
    const p = pending.get(j.id);
    if (!p) return;
    if (p.expectFinal && j.ok && j.payload?.status === "accepted") return;
    pending.delete(j.id);
    if (j.ok) p.resolve(j.payload);
    else {
      const err = new Error(j.error?.message ?? "rpc error");
      err.code = j.error?.code;
      err.details = j.error?.details;
      p.reject(err);
    }
  });
  const connectTimer = setTimeout(() => onFailed(new Error("connect got no response in 20 s")), 20_000);
  await connected.finally(() => clearTimeout(connectTimer));
  return {
    events,
    close: () => ws.close(),
    call(method, params = {}, { timeoutMs = 60_000, expectFinal = false } = {}) {
      const id = String(nextId++);
      return new Promise((resolve, reject) => {
        const t = setTimeout(() => {
          pending.delete(id);
          reject(new Error(`${method} timed out after ${timeoutMs} ms`));
        }, timeoutMs);
        pending.set(id, {
          expectFinal,
          resolve: (v) => (clearTimeout(t), resolve(v)),
          reject: (e) => (clearTimeout(t), reject(e)),
        });
        ws.send(JSON.stringify({ type: "req", id, method, params }));
      });
    },
  };
}

