#!/usr/bin/env node
import { chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import { JobManager } from "../src/manager.mjs";
import { listenUnix } from "../src/http.mjs";
import { WorkspaceManager } from "../src/workspace-manager.mjs";
import { CapacityGate } from "../src/capacity.mjs";
import { OpenShellProvider } from "../src/openshell-provider.mjs";

const socketPath = process.env.VLAB_SANDBOX_SOCKET ?? "/srv/vlab/state/sandbox-broker/broker.sock";
await mkdir(path.dirname(socketPath), { recursive: true });
const capacity = new CapacityGate();
const provider = new OpenShellProvider();
const jobs = new JobManager({ capacity, provider });
const workspaces = new WorkspaceManager({ capacity, provider });
await jobs.init();
await workspaces.init();
const server = await listenUnix({ jobs, workspaces, capacity }, socketPath);
await chmod(socketPath, 0o660);
process.stdout.write(`${JSON.stringify({ ok: true, socketPath, jobs: jobs.health(), workspaces: workspaces.health(), capacity: capacity.snapshot() })}\n`);

const pruneTimer = setInterval(() => {
  workspaces.prune().catch((error) => process.stderr.write(`workspace prune failed: ${String(error)}\n`));
}, Number(process.env.VLAB_SANDBOX_PRUNE_INTERVAL_MS ?? 60_000));
pruneTimer.unref();

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    clearInterval(pruneTimer);
    server.close(() => process.exit(0));
  });
}
