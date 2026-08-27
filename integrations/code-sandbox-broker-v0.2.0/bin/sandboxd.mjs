#!/usr/bin/env node
import { chmod, mkdir } from "node:fs/promises";
import path from "node:path";
import { JobManager } from "../src/manager.mjs";
import { listenUnix } from "../src/http.mjs";

const socketPath = process.env.VLAB_SANDBOX_SOCKET ?? "/srv/vlab/state/sandbox-broker/broker.sock";
await mkdir(path.dirname(socketPath), { recursive: true });
const manager = new JobManager();
await manager.init();
const server = await listenUnix(manager, socketPath);
await chmod(socketPath, 0o660);
process.stdout.write(`${JSON.stringify({ ok: true, socketPath, ...manager.health() })}\n`);

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
