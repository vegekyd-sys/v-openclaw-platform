import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { BrokerClient } from "../plugin/core/broker-client.js";
import { listenUnix } from "../src/http.mjs";

test("Unix transport accepts the full validated 2 MB patch envelope", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "project-sandbox-http-"));
  const socketPath = path.join(root, "broker.sock");
  const patch = "x".repeat(2_000_000);
  let received;
  const server = await listenUnix(fakeManagers({
    files: async (_id, input, actor) => {
      received = { input, actor };
      return { workspace: { id: "vws-http-test" }, result: { sizeBytes: Buffer.byteLength(input.patch) } };
    },
  }), socketPath);
  try {
    const client = new BrokerClient({ socketPath });
    const response = await client.request("/workspaces/vws-http-test/files", {
      method: "POST",
      body: {
        input: { action: "patch", patch },
        actor: { owner: "agent:test", session: "agent:test:session", fencingToken: "fencing-http-test" },
      },
    });
    assert.equal(response.result.sizeBytes, 2_000_000);
    assert.equal(received.input.patch.length, 2_000_000);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

test("Unix transport still rejects an oversized JSON envelope", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "project-sandbox-http-"));
  const socketPath = path.join(root, "broker.sock");
  const server = await listenUnix(fakeManagers(), socketPath);
  try {
    const client = new BrokerClient({ socketPath });
    await assert.rejects(
      client.request("/workspaces/vws-http-test/files", {
        method: "POST",
        body: {
          input: { action: "patch", patch: "x".repeat(13_100_000) },
          actor: { owner: "agent:test", session: "agent:test:session", fencingToken: "fencing-http-test" },
        },
      }),
      /13 MB transport limit|socket hang up|ECONNRESET|EPIPE/,
    );
  } finally {
    await new Promise((resolve) => server.close(resolve));
    await rm(root, { recursive: true, force: true });
  }
});

function fakeManagers(workspaceOverrides = {}) {
  return {
    jobs: {
      health: () => ({ ok: true, running: 0, queued: 0 }),
      prune: async () => ({ deleted: [] }),
    },
    workspaces: {
      health: () => ({ queued: 0, opening: 0, active: 0 }),
      files: workspaceOverrides.files ?? (async () => ({ workspace: {}, result: {} })),
      prune: async () => ({ expired: [], deleted: [] }),
    },
    capacity: { snapshot: () => ({ max: 1, active: 0, waiting: 0 }) },
  };
}
