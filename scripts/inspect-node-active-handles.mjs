#!/usr/bin/env node

const endpoint = process.argv[2];
if (!endpoint) {
  throw new Error("Usage: inspect-node-active-handles.mjs <websocket-url>");
}

const socket = new WebSocket(endpoint);
const requestId = 1;
const timeout = setTimeout(() => {
  socket.close();
  throw new Error("Inspector evaluation timed out");
}, 5000);

socket.addEventListener("open", () => {
  socket.send(
    JSON.stringify({
      id: requestId,
      method: "Runtime.evaluate",
      params: {
        expression: `(async () => JSON.stringify({
          activeWork: (await import("file:///opt/openclaw-2026.8.1/node_modules/openclaw/dist/cli/gateway-lifecycle.runtime.js")).createGatewayActiveWorkSnapshot(),
          handles: process._getActiveHandles().map((handle) => ({
            type: handle?.constructor?.name,
            address: typeof handle?.address === "function" ? handle.address() : undefined,
            destroyed: handle?.destroyed,
            connecting: handle?.connecting,
            pending: handle?.pending,
            path: handle?.path,
            fd: handle?._handle?.fd,
          })),
          requests: process._getActiveRequests().map((request) => ({
            type: request?.constructor?.name,
          })),
        }))()`,
        awaitPromise: true,
        returnByValue: true,
      },
    }),
  );
});

socket.addEventListener("message", (event) => {
  const response = JSON.parse(event.data);
  if (response.id !== requestId) return;
  clearTimeout(timeout);
  if (response.error) throw new Error(JSON.stringify(response.error));
  process.stdout.write(`${response.result.result.value}\n`);
  socket.close();
});
