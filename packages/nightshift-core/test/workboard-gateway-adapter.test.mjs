import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { WorkboardGatewayAdapter } from "../src/index.mjs";

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
  assert.equal(dispatchCall.args[2], "workboard.cards.dispatch");
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

test("refuses a remote Gateway instead of exposing its token in process arguments", async () => {
  const dir = await mkdtemp(join(tmpdir(), "nightshift-remote-gateway-"));
  const configPath = join(dir, "openclaw.json");
  await writeFile(configPath, JSON.stringify({ gateway: { auth: { token: "test-token" } } }));
  const adapter = new WorkboardGatewayAdapter({
    configPath,
    gatewayUrl: "ws://100.82.39.107:22793",
    runner: async () => { throw new Error("runner must not be called"); },
  });
  await assert.rejects(() => adapter.listCards(), /must be loopback-local/);
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
