// Candidate test for lab/release-files/codex-turn-context-handoff: OpenClaw workspace context
// (SOUL/IDENTITY/USER/MEMORY, memory and skills instructions) reaches the model on catalog-backed
// Codex models.
//
// Runs a real Codex app-server (CODEX_BIN, default V's 0.159.2) against a local mock of the
// Responses API and inspects the request bodies the model would have received. The model catalog
// is V's gpt-6.1-sol entry (CODEX_TEST_CATALOG), which carries a Default-mode collaboration
// override, plus an entry without one standing in for DeepSeek/gpt-5.x.
//
// "upstream" tests drive turn/start the way unpatched OpenClaw does (context in collaborationMode
// developer_instructions) and pin the behaviour behind the bug. "handoff" tests drive the patched
// thread-lifecycle helpers from $VLAB_CANDIDATE_RUNTIME; with EXPECT_BASELINE=1 they only check
// that the helpers are absent.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import readline from "node:readline";
import test from "node:test";
import { pathToFileURL } from "node:url";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "VLAB_CANDIDATE_RUNTIME is not set");
const baseline = process.env.EXPECT_BASELINE === "1";
const codexBin = process.env.CODEX_BIN ?? "/opt/codex-0.159.2-v/node_modules/@openai/codex-linux-x64/vendor/x86_64-unknown-linux-musl/bin/codex";
const catalogSource = process.env.CODEX_TEST_CATALOG;
assert(fs.existsSync(codexBin), `codex binary not found: ${codexBin}`);
assert(catalogSource && fs.existsSync(catalogSource), "CODEX_TEST_CATALOG must point at a models catalog JSON");

const CATALOG_MODEL = "gpt-6.1-sol";
const PLAIN_MODEL = "plain-no-override";
const SOUL_A = "SOUL-MARK-a91c Core Truths: first truth A";
const SOUL_B = "SOUL-MARK-a91c Core Truths: first truth B";
const MEMORY_MARK = "MEMORY-MARK-5d2e DealClaw Admin entry";

function findCodexDist() {
  const dir = path.join(runtime, "npm", "projects", "openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2", "node_modules", "@openclaw", "codex", "dist");
  assert(fs.existsSync(dir), `no live Codex plugin generation under ${runtime}`);
  return dir;
}

// --- mock Responses API -------------------------------------------------------------------
function startMockResponses() {
  const requests = [];
  let n = 0;
  const server = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => { body += chunk; });
    req.on("end", () => {
      if (req.method !== "POST" || !req.url.endsWith("/responses")) {
        res.writeHead(404).end();
        return;
      }
      requests.push(JSON.parse(body));
      const id = `resp_${++n}`;
      const events = [
        { type: "response.created", response: { id } },
        { type: "response.output_item.done", item: { type: "message", role: "assistant", id: `msg_${n}`, content: [{ type: "output_text", text: "ok" }] } },
        { type: "response.completed", response: { id, usage: { input_tokens: 0, input_tokens_details: null, output_tokens: 0, output_tokens_details: null, total_tokens: 0 } } },
      ];
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const ev of events) res.write(`event: ${ev.type}\ndata: ${JSON.stringify(ev)}\n\n`);
      res.end();
    });
  });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve({ server, requests, port: server.address().port })));
}

// --- Codex app-server over stdio ----------------------------------------------------------
async function startAppServer(port) {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "turnctx-codex-home-"));
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "turnctx-cwd-"));
  // A private HOME keeps the lab user's own skills (which change under us) out of the requests.
  const userHome = fs.mkdtempSync(path.join(os.tmpdir(), "turnctx-home-"));
  const catalog = JSON.parse(fs.readFileSync(catalogSource, "utf8"));
  const sol = catalog.models.find((m) => m.slug === CATALOG_MODEL);
  assert(sol?.model_messages?.collaboration_modes?.default, `${CATALOG_MODEL} has no Default-mode override in the catalog`);
  const plain = structuredClone(sol);
  plain.slug = PLAIN_MODEL;
  plain.display_name = PLAIN_MODEL;
  delete plain.model_messages.collaboration_modes;
  fs.writeFileSync(path.join(home, "catalog.json"), JSON.stringify({ models: [sol, plain] }));
  fs.writeFileSync(path.join(home, "config.toml"), [
    `model = "${CATALOG_MODEL}"`,
    `model_provider = "mock"`,
    `model_catalog_json = "${path.join(home, "catalog.json")}"`,
    `approval_policy = "never"`,
    `sandbox_mode = "read-only"`,
    `[model_providers.mock]`,
    `name = "mock"`,
    `base_url = "http://127.0.0.1:${port}/v1"`,
    `wire_api = "responses"`,
    `env_key = "TURNCTX_MOCK_KEY"`,
    `request_max_retries = 0`,
    `stream_max_retries = 0`,
    "",
  ].join("\n"));
  const child = spawn(codexBin, ["app-server", "--listen", "stdio://"], {
    cwd,
    env: { ...process.env, HOME: userHome, CODEX_HOME: home, TURNCTX_MOCK_KEY: "test", RUST_LOG: "warn" },
    stdio: ["pipe", "pipe", "pipe"],
  });
  let stderr = "";
  child.stderr.on("data", (c) => { stderr += c; });
  let nextId = 1;
  const pending = new Map();
  const listeners = new Set();
  readline.createInterface({ input: child.stdout }).on("line", (line) => {
    let msg;
    try { msg = JSON.parse(line); } catch { return; }
    if (msg.id !== undefined && pending.has(msg.id) && (msg.result !== undefined || msg.error)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(`${JSON.stringify(msg.error)}`));
      else resolve(msg.result);
    } else if (msg.method && msg.id !== undefined) {
      // Server-initiated request (approvals etc.): decline.
      child.stdin.write(JSON.stringify({ id: msg.id, result: { decision: "decline" } }) + "\n");
    } else if (msg.method) {
      for (const l of listeners) l(msg);
    }
  });
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    setTimeout(() => {
      if (pending.delete(id)) reject(new Error(`${method} timed out; stderr: ${stderr.slice(-2000)}`));
    }, 60_000);
  });
  await request("initialize", { clientInfo: { name: "turnctx-test", version: "0" }, capabilities: { experimentalApi: true } });
  child.stdin.write(JSON.stringify({ method: "initialized" }) + "\n");
  const waitForTurn = (threadId) => new Promise((resolve) => {
    const l = (msg) => {
      if (msg.method === "turn/completed" && (msg.params?.threadId === threadId || !msg.params?.threadId)) {
        listeners.delete(l);
        resolve(msg.params);
      }
    };
    listeners.add(l);
  });
  const close = () => {
    child.kill("SIGTERM");
    fs.rmSync(home, { recursive: true, force: true });
    fs.rmSync(cwd, { recursive: true, force: true });
    fs.rmSync(userHome, { recursive: true, force: true });
  };
  return { request, waitForTurn, close, cwd, stderr: () => stderr };
}

function collaborationMode(model, developerInstructions) {
  return { mode: "default", settings: { model, reasoning_effort: null, developer_instructions: developerInstructions } };
}

async function runTurn(app, threadId, { model, text, developerInstructions }) {
  const done = app.waitForTurn(threadId);
  await app.request("turn/start", {
    threadId,
    input: [{ type: "text", text, text_elements: [] }],
    model,
    ...(developerInstructions === undefined ? {} : { collaborationMode: collaborationMode(model, developerInstructions) }),
  });
  await done;
}

function developerTexts(request) {
  const out = [];
  for (const item of request.input ?? []) {
    if (item.type === "message" && item.role === "developer") {
      for (const c of item.content ?? []) if (typeof c.text === "string") out.push(c.text);
    }
  }
  return out;
}
const countMark = (request, mark) => developerTexts(request).filter((t) => t.includes(mark)).length;
const inputJson = (request) => JSON.stringify(request.input);

let mock;
let app;
test.before(async () => {
  mock = await startMockResponses();
  app = await startAppServer(mock.port);
});
test.after(() => {
  app?.close();
  mock?.server.close();
});

test("upstream: catalog Default override replaces collaboration developer_instructions", async () => {
  const { thread } = await app.request("thread/start", { model: CATALOG_MODEL, cwd: app.cwd });
  const before = mock.requests.length;
  await runTurn(app, thread.id, { model: CATALOG_MODEL, text: "hi 1", developerInstructions: `# Collaboration Mode: Default\n\n${SOUL_A}\n${MEMORY_MARK}` });
  await runTurn(app, thread.id, { model: CATALOG_MODEL, text: "hi 2", developerInstructions: `# Collaboration Mode: Default\n\n${SOUL_B}\n${MEMORY_MARK}` });
  const [r1, r2] = mock.requests.slice(before);
  const collab = developerTexts(r1).filter((t) => t.includes("<collaboration_mode>"));
  console.log(JSON.stringify({ catalogModel: { collabItems: collab.length, collabChars: collab.map((t) => t.length), soulInR1: inputJson(r1).includes("SOUL-MARK-a91c"), soulInR2: inputJson(r2).includes("SOUL-MARK-a91c"), memoryInR2: inputJson(r2).includes(MEMORY_MARK) } }));
  assert.equal(collab.length, 1, "one collaboration item (the catalog text)");
  assert.equal(inputJson(r1).includes("SOUL-MARK-a91c"), false, "SOUL never reaches a catalog-backed model");
  assert.equal(inputJson(r2).includes("SOUL-MARK-a91c"), false, "changed instructions are not re-sent either");
  assert.equal(inputJson(r2).includes(MEMORY_MARK), false);
  // Turn 2 sends turn 1's request input unchanged as its prefix: nothing was inserted.
  assert.deepEqual(r2.input.slice(0, r1.input.length), r1.input);
});

test("upstream: without an override, instructions are sent and re-sent only on change", async () => {
  const { thread } = await app.request("thread/start", { model: PLAIN_MODEL, cwd: app.cwd });
  const before = mock.requests.length;
  const a = `# Collaboration Mode: Default\n\n${SOUL_A}`;
  await runTurn(app, thread.id, { model: PLAIN_MODEL, text: "p1", developerInstructions: a });
  await runTurn(app, thread.id, { model: PLAIN_MODEL, text: "p2", developerInstructions: a });
  await runTurn(app, thread.id, { model: PLAIN_MODEL, text: "p3", developerInstructions: `# Collaboration Mode: Default\n\n${SOUL_B}` });
  const [r1, r2, r3] = mock.requests.slice(before);
  const counts = [r1, r2, r3].map((r) => countMark(r, "SOUL-MARK-a91c"));
  console.log(JSON.stringify({ plainModel: { soulDeveloperItemsPerRequest: counts } }));
  assert.deepEqual(counts, [1, 1, 2], "sent once, unchanged not re-sent, re-sent once after the change");
  assert.deepEqual(r2.input.slice(0, r1.input.length), r1.input);
});

async function loadHandoff() {
  const dist = findCodexDist();
  const file = fs.readdirSync(dist).find((f) => /^thread-lifecycle-[\w-]+\.js$/u.test(f));
  const mod = await import(pathToFileURL(path.join(dist, file)).href);
  const fns = Object.values(mod).filter((fn) => typeof fn === "function");
  return {
    deliver: fns.find((fn) => fn.name === "deliverCodexTurnContextHandoff"),
    invalidate: fns.find((fn) => fn.name === "invalidateCodexTurnContextHandoff"),
    buildTurnStartParams: fns.find((fn) => fn.name === "buildTurnStartParams"),
  };
}

test("handoff: patched helpers deliver context to a catalog-backed model once per change", async (t) => {
  const { deliver, invalidate } = await loadHandoff();
  if (baseline) {
    assert.equal(deliver, undefined, "baseline runtime should not carry the handoff helper");
    return;
  }
  assert(deliver && invalidate, "handoff helpers not exported by thread-lifecycle");
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "turnctx-agent-"));
  t.after(() => fs.rmSync(agentDir, { recursive: true, force: true }));
  const client = { request: (method, params) => app.request(method, params) };
  const { thread } = await app.request("thread/start", { model: CATALOG_MODEL, cwd: app.cwd });
  const ctxA = `## OpenClaw Agent Soul\n\n${SOUL_A}\n\n${MEMORY_MARK}`;
  const ctxB = `## OpenClaw Agent Soul\n\n${SOUL_B}\n\n${MEMORY_MARK}`;
  const before = mock.requests.length;
  const outcomes = [];
  // What patched run-attempt does per turn: deliver, then turn/start without the context in
  // collaborationMode (developer_instructions null keeps the native Default text).
  for (const [text, ctx] of [["h1", ctxA], ["h2", ctxA], ["h3", ctxB], ["h4", ctxB]]) {
    outcomes.push(await deliver({ client, threadId: thread.id, agentDir, instructions: ctx, timeoutMs: 30_000 }));
    await runTurn(app, thread.id, { model: CATALOG_MODEL, text, developerInstructions: null });
  }
  // Standalone compaction forgets the record; the next turn delivers again.
  await invalidate({ agentDir, threadId: thread.id });
  outcomes.push(await deliver({ client, threadId: thread.id, agentDir, instructions: ctxB, timeoutMs: 30_000 }));
  await runTurn(app, thread.id, { model: CATALOG_MODEL, text: "h5", developerInstructions: null });
  const rs = mock.requests.slice(before);
  const soulA = rs.map((r) => countMark(r, SOUL_A));
  const soulB = rs.map((r) => countMark(r, SOUL_B));
  const prefixKept = rs.slice(1).map((r, i) => JSON.stringify(r.input.slice(0, rs[i].input.length)) === JSON.stringify(rs[i].input));
  const marker = JSON.parse(fs.readFileSync(path.join(agentDir, "codex-turn-context", `${thread.id}.json`), "utf8"));
  console.log(JSON.stringify({ handoff: { outcomes, soulA, soulB, memoryInR1: inputJson(rs[0]).includes(MEMORY_MARK), prefixKept, marker: { chars: marker.chars, nonEmpty: marker.nonEmpty } } }));
  assert.deepEqual(outcomes, ["delivered", "unchanged", "delivered", "unchanged", "delivered"]);
  assert.deepEqual(soulA, [1, 1, 1, 1, 1], "context A delivered once and kept in history");
  assert.deepEqual(soulB, [0, 0, 1, 1, 2], "context B delivered on change, again after invalidation");
  assert(inputJson(rs[0]).includes(MEMORY_MARK), "MEMORY.md reaches the model");
  assert(prefixKept.every(Boolean), "every request extends the previous one: cached prefix preserved");
  // The user prompt never carries the context.
  for (const r of rs) {
    const userTexts = (r.input ?? []).filter((i) => i.role === "user").flatMap((i) => i.content ?? []).map((c) => c.text ?? "");
    assert(!userTexts.some((x) => x.includes("SOUL-MARK-a91c")), "context must not be in user input");
  }
});

test("handoff: an empty context is not injected, a withdrawn one is announced once and then stays quiet", async (t) => {
  const { deliver } = await loadHandoff();
  if (baseline) return;
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "turnctx-agent-"));
  t.after(() => fs.rmSync(agentDir, { recursive: true, force: true }));
  const client = { request: (method, params) => app.request(method, params) };
  const { thread } = await app.request("thread/start", { model: CATALOG_MODEL, cwd: app.cwd });
  const outcomes = [
    await deliver({ client, threadId: thread.id, agentDir, instructions: "", timeoutMs: 30_000 }),
    await deliver({ client, threadId: thread.id, agentDir, instructions: SOUL_A, timeoutMs: 30_000 }),
    await deliver({ client, threadId: thread.id, agentDir, instructions: "  ", timeoutMs: 30_000 }),
    await deliver({ client, threadId: thread.id, agentDir, instructions: undefined, timeoutMs: 30_000 }),
  ];
  assert.deepEqual(outcomes, ["empty", "delivered", "delivered", "empty"]);
});

test("handoff: a failed injection reports failed and records nothing", async (t) => {
  const { deliver } = await loadHandoff();
  if (baseline) return;
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "turnctx-agent-"));
  t.after(() => fs.rmSync(agentDir, { recursive: true, force: true }));
  const client = { request: async () => { throw new Error("boom"); } };
  assert.equal(await deliver({ client, threadId: "thread-x", agentDir, instructions: SOUL_A, timeoutMs: 1000 }), "failed");
  assert.equal(fs.existsSync(path.join(agentDir, "codex-turn-context", "thread-x.json")), false);
});
