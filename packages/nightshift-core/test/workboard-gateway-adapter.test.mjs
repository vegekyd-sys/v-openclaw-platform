import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { gatewayIdempotencyLabel, PersistentGatewayRpcClient, WorkboardGatewayAdapter } from "../src/index.mjs";

test("reuses one persistent Gateway client across concurrent RPC calls", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nightshift-persistent-gateway-"));
  const configPath = join(dir, "openclaw.json");
  await writeFile(configPath, JSON.stringify({ gateway: { auth: { token: "test-token" } } }));
  const requests = [];
  let factoryCalls = 0;
  let closeCalls = 0;
  const rpcClient = {
    async request(method, params) {
      requests.push({ method, params });
      return method === "workboard.cards.list" ? { cards: [] } : { ok: true };
    },
    async close() {
      closeCalls += 1;
    },
  };
  const adapter = new WorkboardGatewayAdapter({
    board: "nightshift-lab",
    configPath,
    entry: "/opt/openclaw/dist/index.js",
    gatewayUrl: "ws://127.0.0.1:23793",
    rpcClientFactory(options) {
      factoryCalls += 1;
      assert.equal(options.token, "test-token");
      assert.equal(options.gatewayUrl, "ws://127.0.0.1:23793");
      return rpcClient;
    },
  });

  await Promise.all([adapter.listCards(), adapter.listCards(), adapter.listCards()]);
  assert.equal(factoryCalls, 1);
  assert.equal(requests.length, 3);
  assert.ok(requests.every((request) => request.method === "workboard.cards.list"));
  await adapter.close();
  assert.equal(closeCalls, 1);
});

test("persistent Gateway client starts once and multiplexes requests", async () => {
  const requests = [];
  let starts = 0;
  let stops = 0;
  class FakeGatewayClient {
    constructor(options) {
      this.options = options;
    }
    start() {
      starts += 1;
      queueMicrotask(() => this.options.onHelloOk({ protocol: 4 }));
    }
    async request(method, params) {
      requests.push({ method, params });
      return { method, params };
    }
    async stopAndWait() {
      stops += 1;
    }
  }
  const client = new PersistentGatewayRpcClient({
    entry: "/opt/openclaw/dist/index.js",
    gatewayClientLoader: async () => FakeGatewayClient,
    gatewayUrl: "ws://127.0.0.1:22793",
    token: "test-token",
  });

  const results = await Promise.all([
    client.request("workboard.cards.list", { boardId: "nightshift" }),
    client.request("sessions.get", { key: "session-1" }),
  ]);
  assert.equal(starts, 1);
  assert.deepEqual(client.client.options.scopes, ["operator.admin", "operator.read", "operator.write"]);
  assert.equal(requests.length, 2);
  assert.equal(results[1].method, "sessions.get");
  await client.close();
  assert.equal(stops, 1);
});

test("persistent Gateway client waits for the existing socket to reconnect", async () => {
  let instance;
  let starts = 0;
  class ReconnectingGatewayClient {
    constructor(options) {
      this.options = options;
      instance = this;
    }
    start() {
      starts += 1;
      queueMicrotask(() => this.options.onHelloOk({ protocol: 4 }));
    }
    async request(method) {
      return method;
    }
    async stopAndWait() {}
  }
  const client = new PersistentGatewayRpcClient({
    entry: "/opt/openclaw/dist/index.js",
    gatewayClientLoader: async () => ReconnectingGatewayClient,
    gatewayUrl: "ws://127.0.0.1:22793",
    requestTimeoutMs: 1000,
    token: "test-token",
  });

  assert.equal(await client.request("health", {}), "health");
  instance.options.onClose(1006, "network reset");
  const pending = client.request("workboard.cards.list", {});
  setTimeout(() => instance.options.onHelloOk({ protocol: 4 }), 10);
  assert.equal(await pending, "workboard.cards.list");
  assert.equal(starts, 1);
  await client.close();
});

test("persistent Gateway client authenticates a Tailscale endpoint with the existing device identity", async () => {
  const identity = { deviceId: "device-1", publicKeyPem: "public", privateKeyPem: "private" };
  let options;
  class FakeGatewayClient {
    constructor(value) { options = value; }
    start() { queueMicrotask(() => options.onHelloOk({ protocol: 4 })); }
    async request() { return { cards: [] }; }
    async stopAndWait() {}
  }
  const client = new PersistentGatewayRpcClient({
    deviceIdentityLoader: async () => identity,
    entry: "/opt/openclaw/dist/index.js",
    gatewayClientLoader: async () => FakeGatewayClient,
    gatewayUrl: "ws://100.82.39.107:22793",
    token: "test-token",
  });

  await client.request("workboard.cards.list", { boardId: "nightshift" });
  assert.equal(options.deviceIdentity, identity);
  await client.close();
});

test("creates and reuses native cards through Gateway RPC", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nightshift-gateway-"));
  const configPath = join(dir, "openclaw.json");
  await writeFile(configPath, JSON.stringify({ gateway: { auth: { token: "test-token" } } }));
  const calls = [];
  let cards = [];
  const runner = async (_command, args, env) => {
    calls.push({ args, env });
    const method = args[2];
    const params = JSON.parse(args[args.indexOf("--params") + 1]);
    if (method === "workboard.cards.list") return JSON.stringify({ cards });
    if (method === "workboard.cards.create") {
      const card = { id: "card-1", ...params };
      cards = [card];
      return JSON.stringify({ card });
    }
    if (method === "sessions.get") {
      return JSON.stringify({ messages: [{ role: "assistant", content: [{ type: "text", text: params.key }] }] });
    }
    if (method === "skills.status") {
      return JSON.stringify({ agentId: params.agentId, skills: [{ name: "night-shift-operator", eligible: true }] });
    }
    throw new Error(`unexpected ${method}`);
  };
  const adapter = new WorkboardGatewayAdapter({
    board: "nightshift-lab",
    configPath,
    gatewayUrl: "ws://127.0.0.1:23793",
    runner,
  });
  const action = {
    type: "create_workboard_card",
    instanceId: "NS-1",
    stageId: "plan",
    idempotencyKey: "stable-key",
    card: {
      title: "Plan",
      status: "todo",
      assignedAgent: "main",
      labels: ["instance:NS-1"],
      automation: { workflowId: "xingqing", maxAttempts: 2, maxRuntimeSeconds: 14_400 },
    },
  };
  const first = await adapter.applyAction(action);
  const second = await adapter.applyAction(action);
  assert.equal(first.status, "created");
  assert.equal(second.status, "reused");
  assert.equal(first.card.metadata.automation.boardId, "nightshift-lab");
  assert.equal(first.card.boardId, "nightshift-lab");
  assert.equal(first.card.maxRetries, 2);
  assert.equal(first.card.maxRuntimeSeconds, 14_400);
  assert.ok(calls.every(({ args }) => !args.includes("--token")));
  assert.ok(calls.every(({ args }) => !args.includes("--url")));
  assert.ok(calls.every(({ args }) => !args.join(" ").includes("test-token")));
  assert.ok(calls.every(({ env }) => env.OPENCLAW_GATEWAY_TOKEN === "test-token"));
  assert.ok(calls.every(({ env }) => env.OPENCLAW_GATEWAY_URL === "ws://127.0.0.1:23793"));
  const session = await adapter.getSession("agent:main:subagent:workboard-card-1", { limit: 25 });
  assert.equal(session.messages[0].content[0].text, "agent:main:subagent:workboard-card-1");
  const sessionCall = calls.find(({ args }) => args[2] === "sessions.get");
  assert.deepEqual(JSON.parse(sessionCall.args[sessionCall.args.indexOf("--params") + 1]), {
    key: "agent:main:subagent:workboard-card-1",
    limit: 25,
  });
  const skills = await adapter.getSkillsStatus("main");
  assert.equal(skills.skills[0].name, "night-shift-operator");
  const skillsCall = calls.find(({ args }) => args[2] === "skills.status");
  assert.deepEqual(JSON.parse(skillsCall.args[skillsCall.args.indexOf("--params") + 1]), { agentId: "main" });

  await adapter.listCards({ cardIds: ["card-1", "card-1", "  "] });
  const scopedListCall = calls.at(-1);
  assert.deepEqual(JSON.parse(scopedListCall.args[scopedListCall.args.indexOf("--params") + 1]), {
    boardId: "nightshift-lab",
    cardIds: ["card-1"],
  });

  await adapter.dispatch(4, { cardIds: ["card-1"] }).catch(() => undefined);
  const dispatchCall = calls.at(-1);
  assert.equal(dispatchCall.args[2], "workboard.cards.dispatchWithOptions");
  assert.deepEqual(JSON.parse(dispatchCall.args[dispatchCall.args.indexOf("--params") + 1]), {
    boardId: "nightshift-lab",
    maxStarts: 4,
    cardIds: ["card-1"],
  });

  const beforePrefetch = calls.length;
  const prefetch = await adapter.prefetchSessions(["session-a", "session-b", "session-a"], { concurrency: 2, limit: 12 });
  assert.deepEqual(prefetch, { count: 2, failed: 0 });
  assert.equal(calls.length, beforePrefetch + 2);
  const cached = await adapter.getSession("session-a", { limit: 12 });
  assert.equal(cached.messages[0].content[0].text, "session-a");
  assert.equal(calls.length, beforePrefetch + 2);
  adapter.clearSessionSnapshots();
  await adapter.getSession("session-a", { limit: 12 });
  assert.equal(calls.length, beforePrefetch + 3);
});

test("refuses an insecure remote Gateway instead of exposing its token", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nightshift-remote-gateway-"));
  const configPath = join(dir, "openclaw.json");
  await writeFile(configPath, JSON.stringify({ gateway: { auth: { token: "test-token" } } }));
  const adapter = new WorkboardGatewayAdapter({
    configPath,
    gatewayUrl: "ws://192.0.2.10:22793",
    runner: async () => { throw new Error("runner must not be called"); },
  });
  await assert.rejects(() => adapter.listCards(), /must use loopback, Tailscale, or secure WebSocket/);
});

test("allows a Tailscale-protected Gateway for isolated VLab", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nightshift-tailscale-gateway-"));
  const configPath = join(dir, "openclaw.json");
  await writeFile(configPath, JSON.stringify({ gateway: { auth: { token: "test-token" } } }));
  const adapter = new WorkboardGatewayAdapter({
    configPath,
    gatewayUrl: "ws://100.82.39.107:22793",
    rpcClientFactory: () => ({
      async request() { return { cards: [] }; },
      async close() {},
    }),
  });
  assert.deepEqual(await adapter.listCards(), []);
  await adapter.close();
});

test("bounds scoped card reads with batches and never expands an empty scope", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nightshift-gateway-list-batches-"));
  const configPath = join(dir, "openclaw.json");
  await writeFile(configPath, JSON.stringify({ gateway: { auth: { token: "test-token" } } }));
  const scopes = [];
  const runnerOptions = [];
  const runner = async (_command, args, _env, options) => {
    const params = JSON.parse(args[args.indexOf("--params") + 1]);
    scopes.push(params.cardIds);
    runnerOptions.push(options);
    return JSON.stringify({ cards: params.cardIds.map((id) => ({ id })) });
  };
  const adapter = new WorkboardGatewayAdapter({
    board: "nightshift-lab",
    configPath,
    gatewayUrl: "ws://127.0.0.1:23793",
    listBatchSize: 100,
    listConcurrency: 2,
    maxBufferBytes: 32 * 1024 * 1024,
    runner,
  });

  assert.deepEqual(await adapter.listCards({ cardIds: [] }), []);
  assert.equal(scopes.length, 0);
  const cards = await adapter.listCards({ cardIds: Array.from({ length: 205 }, (_, index) => `card-${index}`) });
  assert.equal(cards.length, 205);
  assert.deepEqual(scopes.map((scope) => scope.length), [100, 100, 5]);
  assert.ok(runnerOptions.every((options) => options.maxBufferBytes === 32 * 1024 * 1024));
});

test("creates independent Workboard actions with bounded control-plane concurrency", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nightshift-gateway-concurrency-"));
  const configPath = join(dir, "openclaw.json");
  await writeFile(configPath, JSON.stringify({ gateway: { auth: { token: "test-token" } } }));
  let inFlight = 0;
  let maxInFlight = 0;
  const runner = async (_command, args) => {
    const method = args[2];
    if (method !== "workboard.cards.create") throw new Error(`unexpected ${method}`);
    const params = JSON.parse(args[args.indexOf("--params") + 1]);
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    return JSON.stringify({ card: { id: params.title, ...params } });
  };
  const adapter = new WorkboardGatewayAdapter({
    applyConcurrency: 3,
    maxCreatesPerPlan: 7,
    board: "nightshift-lab",
    configPath,
    gatewayUrl: "ws://127.0.0.1:23793",
    runner,
  });
  const actions = Array.from({ length: 7 }, (_, index) => ({
    type: "create_workboard_card",
    idempotencyKey: `key-${index}`,
    instanceId: "NS-CONCURRENT",
    stageId: "work",
    card: { title: `card-${index}`, status: "ready", labels: [] },
  }));

  const result = await adapter.applyPlan(actions, { cards: [] });

  assert.equal(result.length, 7);
  assert.equal(maxInFlight, 3);
});

test("defers excess new cards per plan while reusing known cards without consuming the budget", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nightshift-gateway-budget-"));
  const configPath = join(dir, "openclaw.json");
  await writeFile(configPath, JSON.stringify({ gateway: { auth: { token: "test-token" } } }));
  const calls = [];
  const adapter = new WorkboardGatewayAdapter({
    applyConcurrency: 4,
    configPath,
    gatewayUrl: "ws://127.0.0.1:22793",
    maxCreatesPerPlan: 2,
    runner: async (_command, args) => {
      const params = JSON.parse(args[args.indexOf("--params") + 1]);
      calls.push(params);
      return JSON.stringify({ card: { id: params.title, ...params } });
    },
  });
  const actions = Array.from({ length: 4 }, (_, index) => ({
    type: "create_workboard_card",
    idempotencyKey: `budget-key-${index}`,
    card: { title: `budget-card-${index}`, status: "ready", labels: [] },
  }));
  const known = [{ id: "existing", labels: [gatewayIdempotencyLabel("budget-key-0")] }];

  const result = await adapter.applyPlan(actions, { cards: known });

  assert.deepEqual(result.map((item) => item.status), ["reused", "created", "created", "deferred"]);
  assert.equal(result[3].reason, "create_budget_exhausted");
  assert.equal(calls.length, 2);
});

test("normalizes every label at the Gateway write boundary", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nightshift-gateway-labels-"));
  const configPath = join(dir, "openclaw.json");
  await writeFile(configPath, JSON.stringify({ gateway: { auth: { token: "test-token" } } }));
  const calls = [];
  const adapter = new WorkboardGatewayAdapter({
    configPath,
    gatewayUrl: "ws://127.0.0.1:22793",
    runner: async (_command, args) => {
      const method = args[args.indexOf("call") + 1];
      const params = JSON.parse(args[args.indexOf("--params") + 1]);
      calls.push({ method, params });
      return JSON.stringify({ card: { id: "created" } });
    },
  });

  await adapter.applyAction({
    type: "request_approval",
    idempotencyKey: "approval-long-label",
    instanceId: `NS-${"INSTANCE".repeat(8)}`,
    contentItemId: `video-${"CONTENT".repeat(8)}`,
    stageId: "review",
    approval: { effect: "publish" },
  }, { knownCards: [] });

  const labels = calls[0].params.labels;
  assert.ok(labels.every((label) => label.length <= 40));
  assert.ok(labels.some((label) => label.startsWith("instance:") && /~[a-f0-9]{8}$/.test(label)));
  assert.equal(calls[0].params.metadata.automation.instanceId, `NS-${"INSTANCE".repeat(8)}`);
  assert.equal(calls[0].params.metadata.automation.contentItemId, `video-${"CONTENT".repeat(8)}`);
});
