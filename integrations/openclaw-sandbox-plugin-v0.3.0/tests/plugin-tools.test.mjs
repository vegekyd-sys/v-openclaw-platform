import assert from "node:assert/strict";
import test from "node:test";

import { BrokerClient } from "../plugin/core/broker-client.js";
import { resolveTrustedActor } from "../plugin/core/identity.js";
import {
  createSandboxTools,
  isProjectSandboxContextAllowed,
  TOOL_NAMES,
} from "../plugin/core/tools.js";

const WORKSPACE_ID = "vws-contract-0001";
const FENCING_TOKEN = "fencing-contract-0001";

test("one tool factory exposes the same four tools to default and Codex runtimes", async () => {
  const broker = new FakeBroker();
  const defaultContext = channelContext({ runtime: "openclaw" });
  const codexContext = channelContext({ runtime: "codex" });

  const defaultTools = createSandboxTools(defaultContext, { broker, config: pluginConfig() });
  const codexTools = createSandboxTools(codexContext, { broker, config: pluginConfig() });

  assert.deepEqual(defaultTools.map(({ name }) => name), TOOL_NAMES);
  assert.deepEqual(codexTools.map(({ name }) => name), TOOL_NAMES);
  assert.equal(new Set(defaultTools.map(({ name }) => name)).size, 4);
  assert.deepEqual(
    resolveTrustedActor(defaultContext),
    resolveTrustedActor(codexContext),
    "runtime selection must not change the trusted Session actor",
  );

  const codexBridgeActor = resolveTrustedActor({
    sessionKey: "agent:v-codex:task:contract",
    agentId: "v-codex",
    agentRuntime: { id: "codex" },
  });
  assert.deepEqual(codexBridgeActor, {
    owner: "agent:v-codex",
    session: "agent:v-codex:task:contract",
  });
});

test("tool exposure is fail-closed and scoped to configured Agent ids", () => {
  const broker = new FakeBroker();
  const allowed = channelContext({
    agentId: " V-Codex ",
    sessionKey: "agent:v-codex:feishu:group:oc-contract",
  });
  const denied = channelContext({ agentId: "makaron" });
  const config = {
    ...pluginConfig(),
    allowedAgentIds: ["v-codex"],
    allowedSessionKeys: ["agent:v-codex:feishu:group:oc-contract"],
    allowedSessionPrefixes: [],
  };

  assert.equal(isProjectSandboxContextAllowed(allowed, config), true);
  assert.equal(isProjectSandboxContextAllowed(denied, config), false);
  assert.deepEqual(createSandboxTools(denied, { broker, config }), []);
  assert.deepEqual(createSandboxTools(allowed, { broker, config }).map(({ name }) => name), TOOL_NAMES);
  assert.deepEqual(createSandboxTools(allowed, { broker, config: { ...config, allowedAgentIds: [] } }), []);
  assert.deepEqual(createSandboxTools(allowed, { broker, config: { ...config, allowedAgentIds: undefined } }), []);
  assert.deepEqual(createSandboxTools(allowed, { broker, config: { ...config, allowedSessionKeys: [] } }), []);
  assert.deepEqual(createSandboxTools({ ...allowed, sessionKey: "agent:v-codex:other" }, { broker, config }), []);
  assert.deepEqual(
    createSandboxTools(allowed, {
      broker,
      config: { ...config, allowedSessionKeys: [], allowedSessionPrefixes: ["agent:v-codex:feishu:group:"] },
    }).map(({ name }) => name),
    TOOL_NAMES,
  );
});

test("tool schemas never let the model provide trusted identity or a host project path", () => {
  const tools = createSandboxTools(channelContext(), {
    broker: new FakeBroker(),
    config: pluginConfig(),
  });

  for (const tool of tools) {
    assert.equal(tool.parameters.additionalProperties, false, `${tool.name} must reject unknown model fields`);
    for (const forbidden of ["owner", "session", "sessionKey", "requesterSenderId", "projectPath"]) {
      assert.equal(
        Object.hasOwn(tool.parameters.properties, forbidden),
        false,
        `${tool.name} exposes forbidden model field ${forbidden}`,
      );
    }
  }
});

test("projectId maps to operator configuration and forged identity/path fields are ignored", async () => {
  const broker = new FakeBroker();
  const open = toolNamed(createSandboxTools(channelContext(), {
    broker,
    config: pluginConfig(),
  }), "project_sandbox_open");

  const listed = await open.execute("call-list", { action: "list" });
  assert.deepEqual(listed.details.projects, [
    { projectId: "demo", description: "Demo application" },
    { projectId: "second", description: "Second project" },
  ]);
  assert.equal(JSON.stringify(listed).includes("/srv/vlab/projects"), false, "project paths must not be listed");

  const opened = await open.execute("call-open", {
    action: "open",
    projectId: "demo",
    request: "Run the tests",
    owner: "attacker",
    session: "attacker-session",
    projectPath: "/etc",
  });
  assert.equal(opened.details.workspace.id, WORKSPACE_ID);
  assert.equal(broker.calls.length, 1);
  assert.deepEqual(broker.calls[0], {
    path: "/workspaces",
    method: "POST",
    body: {
      owner: "agent:makaron",
      session: "agent:makaron:feishu:group:oc-contract",
      request: "Run the tests",
      idempotencyKey: broker.calls[0].body.idempotencyKey,
      projectPath: "/srv/vlab/projects/demo",
      cpu: "2",
      memory: "4Gi",
      networkProfile: "packages",
      leaseSeconds: 900,
    },
  });
  assert.match(broker.calls[0].body.idempotencyKey, /^[a-f0-9]{64}$/);

  await assert.rejects(
    open.execute("call-unknown", { action: "open", projectId: "not-approved" }),
    /Unknown approved projectId/,
  );
  assert.equal(broker.calls.length, 1, "unknown projects must fail before reaching Broker");
});

test("workspace operations always send trusted Session and fencing token for Broker authorization", async () => {
  const broker = new FakeBroker();
  const tools = createSandboxTools(channelContext(), { broker, config: pluginConfig() });

  await toolNamed(tools, "project_sandbox_open").execute("status-call", {
    action: "status",
    workspaceId: WORKSPACE_ID,
    fencingToken: FENCING_TOKEN,
    owner: "forged-owner",
    session: "forged-session",
  });
  await toolNamed(tools, "project_sandbox_files").execute("files-call", {
    action: "read",
    workspaceId: WORKSPACE_ID,
    fencingToken: FENCING_TOKEN,
    path: "README.md",
    owner: "forged-owner",
    session: "forged-session",
    projectPath: "/etc",
  });
  await toolNamed(tools, "project_sandbox_finish").execute("finish-cancel-call", {
    action: "cancel",
    workspaceId: WORKSPACE_ID,
    fencingToken: FENCING_TOKEN,
    owner: "forged-owner",
    session: "forged-session",
  });

  assert.equal(broker.calls.length, 3);
  for (const call of broker.calls) {
    assert.deepEqual(call.body.actor, {
      owner: "agent:makaron",
      session: "agent:makaron:feishu:group:oc-contract",
      fencingToken: FENCING_TOKEN,
    });
    assert.equal(Object.hasOwn(call.body, "owner"), false);
    assert.equal(Object.hasOwn(call.body, "session"), false);
    assert.equal(JSON.stringify(call.body).includes("/etc"), false);
  }
});

test("different people in one group Session resume the same Agent-owned Workspace", () => {
  const first = resolveTrustedActor(channelContext({ requesterSenderId: "ou-first" }));
  const second = resolveTrustedActor(channelContext({ requesterSenderId: "ou-second" }));
  assert.deepEqual(first, second);
  assert.deepEqual(first, {
    owner: "agent:makaron",
    session: "agent:makaron:feishu:group:oc-contract",
  });
});

test("project_sandbox_exec is an asynchronous start, status, and cancel protocol", async () => {
  const broker = new FakeBroker();
  const exec = toolNamed(createSandboxTools(channelContext(), {
    broker,
    config: pluginConfig(),
  }), "project_sandbox_exec");

  const started = await exec.execute("exec-call", {
    action: "start",
    workspaceId: WORKSPACE_ID,
    fencingToken: FENCING_TOKEN,
    command: ["npm", "test"],
    timeoutSeconds: 7200,
  });
  assert.equal(started.details.operation.status, "running");
  assert.match(started.details.instruction, /action=status/);

  const startCall = broker.calls.at(-1);
  assert.deepEqual(startCall.body.input.command, ["npm", "test"]);
  assert.equal(startCall.body.input.timeoutSeconds, 7200);
  assert.match(startCall.body.input.idempotencyKey, /^[a-f0-9]{64}$/);
  assert.equal(Object.hasOwn(startCall.body.input, "operationId"), false);

  const status = await exec.execute("status-call", {
    action: "status",
    workspaceId: WORKSPACE_ID,
    fencingToken: FENCING_TOKEN,
    operationId: "vop-contract-0001",
    maxBytes: 12345,
  });
  assert.equal(status.details.operation.status, "completed");
  assert.equal(status.details.instruction, undefined);
  assert.deepEqual(broker.calls.at(-1).body.input, {
    action: "status",
    operationId: "vop-contract-0001",
    maxBytes: 12345,
  });

  const cancelled = await exec.execute("cancel-call", {
    action: "cancel",
    workspaceId: WORKSPACE_ID,
    fencingToken: FENCING_TOKEN,
    operationId: "vop-contract-0002",
  });
  assert.equal(cancelled.details.operation.status, "cancelled");
  assert.deepEqual(broker.calls.at(-1).body.input, {
    action: "cancel",
    operationId: "vop-contract-0002",
    maxBytes: 200000,
  });
});

test("project_sandbox_finish strips Broker host paths from both details and visible tool content", async () => {
  const broker = new FakeBroker({ finishWithArtifacts: true });
  const finish = toolNamed(createSandboxTools(channelContext(), {
    broker,
    config: pluginConfig(),
  }), "project_sandbox_finish");

  const response = await finish.execute("finish-call", {
    action: "finish",
    workspaceId: WORKSPACE_ID,
    fencingToken: FENCING_TOKEN,
    collect: ["reports/result.json"],
  });

  assert.deepEqual(response.details.result.diff, {
    sha256: "diff-sha256",
    bytes: 42,
  });
  assert.deepEqual(response.details.result.artifacts, [{
    name: "result.json",
    sha256: "artifact-sha256",
    bytes: 24,
  }]);
  assert.equal(JSON.stringify(response).includes("/srv/vlab/state/private"), false);
});

test("missing trusted identity fails closed before any Broker request", async () => {
  for (const context of [{}, { sessionKey: "agent:makaron:task:no-owner" }]) {
    const broker = new FakeBroker();
    assert.deepEqual(createSandboxTools(context, { broker, config: pluginConfig() }), []);
    assert.equal(broker.calls.length, 0);
  }

  for (const context of [
    { requesterSenderId: "ou-no-session", agentId: "makaron" },
    { agentId: "makaron" },
  ]) {
    const broker = new FakeBroker();
    assert.deepEqual(createSandboxTools(context, { broker, config: pluginConfig() }), []);
    assert.equal(broker.calls.length, 0);
  }
});

test("Broker errors propagate and a missing Unix socket never falls back to host execution", async () => {
  const broker = new FakeBroker({ error: new Error("Broker unavailable") });
  const open = toolNamed(createSandboxTools(channelContext(), {
    broker,
    config: pluginConfig(),
  }), "project_sandbox_open");
  await assert.rejects(
    open.execute("broker-error", { action: "open", projectId: "demo" }),
    /Broker unavailable/,
  );
  assert.equal(broker.calls.length, 1);

  const missingSocket = new BrokerClient({
    socketPath: `/tmp/openclaw-sandbox-broker-does-not-exist-${process.pid}-${Date.now()}.sock`,
  });
  await assert.rejects(missingSocket.request("/health"), (error) => {
    assert.ok(error.code === "ENOENT" || error.code === "ECONNREFUSED", error.message);
    return true;
  });
});

function channelContext(overrides = {}) {
  return {
    sessionKey: "agent:makaron:feishu:group:oc-contract",
    requesterSenderId: "ou-contract-user",
    messageChannel: "feishu",
    agentId: "makaron",
    ...overrides,
  };
}

function pluginConfig() {
  return {
    allowedAgentIds: ["makaron", "v-codex"],
    allowedSessionPrefixes: ["agent:makaron:", "agent:v-codex:"],
    openWaitMs: 0,
    projects: {
      second: {
        path: "/srv/vlab/projects/second",
        description: "Second project",
      },
      demo: {
        path: "/srv/vlab/projects/demo",
        description: "Demo application",
        cpu: "2",
        memory: "4Gi",
        networkProfile: "packages",
        leaseSeconds: 900,
      },
    },
  };
}

function toolNamed(tools, name) {
  const tool = tools.find((candidate) => candidate.name === name);
  assert.ok(tool, `missing tool ${name}`);
  return tool;
}

class FakeBroker {
  constructor({ error, finishWithArtifacts = false } = {}) {
    this.error = error;
    this.finishWithArtifacts = finishWithArtifacts;
    this.calls = [];
  }

  async request(path, options = {}) {
    this.calls.push({
      path,
      method: options.method ?? "GET",
      body: structuredClone(options.body),
    });
    if (this.error) throw this.error;

    const workspace = {
      id: WORKSPACE_ID,
      status: "active",
      phase: "ready",
      fencingToken: FENCING_TOKEN,
      sandbox: { provider: "openshell", name: "vsw-contract" },
    };
    if (path === "/workspaces") return { workspace, existing: false };
    if (path.endsWith("/files")) return { workspace, result: { ok: true, content: "fixture" } };
    if (path.endsWith("/status")) return { workspace };
    if (path.endsWith("/cancel")) return { workspace: { ...workspace, status: "cancelled" } };
    if (path.endsWith("/finish")) {
      return {
        workspace: { ...workspace, status: "completed" },
        result: this.finishWithArtifacts ? {
          ok: true,
          status: "completed",
          diff: {
            path: "/srv/vlab/state/private/change.patch",
            sha256: "diff-sha256",
            bytes: 42,
          },
          artifacts: [{
            path: "/srv/vlab/state/private/result.json",
            name: "result.json",
            sha256: "artifact-sha256",
            bytes: 24,
          }],
        } : { ok: true, status: "completed", artifacts: [] },
      };
    }
    if (path.endsWith("/exec")) {
      const action = options.body.input.action;
      const status = action === "start" ? "running" : action === "status" ? "completed" : "cancelled";
      return {
        workspace,
        operation: { id: options.body.input.operationId ?? "vop-contract-0001", status },
        existing: false,
      };
    }
    throw new Error(`Unexpected fake Broker path: ${path}`);
  }
}
