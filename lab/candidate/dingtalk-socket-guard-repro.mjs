// Reproduces V's 2026-11-08 / 2026-11-12 Gateway crash with the real
// connector code: dingtalk-stream@2.1.4's DWClient and ws@8 from the npm
// project V runs, and the stop() function taken verbatim from a
// connection-*.mjs chunk.
//
//   node lab/candidate/dingtalk-socket-guard-repro.mjs <node_modules dir> <old chunk> <new chunk>
//
// For each chunk a child process opens a DWClient socket to a local server
// that holds the WebSocket upgrade (the reconnect still in its handshake),
// runs that chunk's stop() (the health monitor restarting DingTalk), then
// answers the upgrade with HTTP 400 if the client is still waiting (the
// DingTalk gateway refusing the used ticket). The old chunk must exit with the
// uncaught "Unexpected server response: 400"; the new one must stay alive.
// The child prints one JSON line with what happened.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** The text of the connection chunk's `function stop() { … }`. */
export function extractStop(chunkSource) {
  const start = chunkSource.indexOf("\tfunction stop() {\n");
  assert(start >= 0, "stop() not found in the connection chunk");
  const end = chunkSource.indexOf("\n\t}\n", start);
  assert(end > start, "end of stop() not found");
  return chunkSource.slice(start, end + 3);
}

/** stop() bound to `client` and `logger`, with its other closure state fresh. */
export function buildStop(chunkSource, { client, logger }) {
  const body = `let isStopped = false, keepAliveTimer = null, messageProcessingKeepAliveTimer = null;\n${extractStop(chunkSource)}\nreturn stop;`;
  return new Function("client", "logger", body)(client, logger);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function child(nodeModules, chunkFile) {
  const require = createRequire(path.join(path.resolve(nodeModules), "noop.js"));
  const { DWClient } = require("dingtalk-stream");
  const logs = [];
  const logger = Object.fromEntries(["debug", "info", "warn", "error"].map((level) => [level, (m) => logs.push(`${level}: ${m}`)]));
  const held = [];
  const server = http.createServer();
  server.on("upgrade", (req, socket) => {
    const h = { at: Date.now(), closedByClient: false, answered: false };
    // http.Server sockets are half-open: a client that aborts shows up as "end".
    for (const event of ["end", "close"]) socket.on(event, () => { if (!h.answered) h.closedByClient = true; });
    socket.on("error", () => {});
    h.socket = socket;
    held.push(h);
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const client = new DWClient({ clientId: "dingcandidate", clientSecret: "candidate-fake-secret" });
  client.dw_url = `ws://127.0.0.1:${server.address().port}/connect?ticket=candidate-used-ticket`;
  await client._connect();
  for (let i = 0; i < 100 && held.length === 0; i += 1) await sleep(20);
  assert.equal(held.length, 1, "the upgrade did not reach the server");
  const result = { chunk: path.basename(chunkFile), errorListenersBeforeStop: client.socket.listenerCount("error"), readyStateBeforeStop: client.socket.readyState };
  buildStop(fs.readFileSync(chunkFile, "utf8"), { client, logger })();
  result.errorListenersAfterStop = client.socket.listenerCount("error");
  await sleep(200);
  const h = held[0];
  result.clientAbortedHandshake = h.closedByClient;
  if (!h.closedByClient) {
    h.answered = true;
    h.socket.end("HTTP/1.1 400 Bad Request\r\nContent-Type: application/json\r\nContent-Length: 2\r\nConnection: close\r\n\r\n{}");
  }
  result.answered400 = h.answered;
  await sleep(1000);
  result.survived = true;
  result.readyStateAtEnd = client.socket.readyState;
  result.logs = logs;
  server.close();
  console.log(JSON.stringify(result));
}

/** Runs one chunk in a child process; returns its exit status, JSON result and stderr. */
export function runChunk(nodeModules, chunkFile) {
  const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url), "--child", nodeModules, chunkFile], { encoding: "utf8", timeout: 30_000 });
  const line = r.stdout.split("\n").find((l) => l.startsWith("{"));
  return { status: r.status, result: line ? JSON.parse(line) : undefined, stderr: r.stderr };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv[2] === "--child") {
    await child(process.argv[3], process.argv[4]);
  } else {
    const [nodeModules, oldChunk, newChunk] = process.argv.slice(2);
    assert(nodeModules && oldChunk && newChunk, "usage: dingtalk-socket-guard-repro.mjs <node_modules> <old chunk> <new chunk>");
    const before = runChunk(nodeModules, oldChunk);
    const after = runChunk(nodeModules, newChunk);
    const report = {
      old: { status: before.status, crashedWith400: /Unexpected server response: 400/u.test(before.stderr), stderrTail: before.stderr.split("\n").filter(Boolean).slice(-6), result: before.result },
      new: { status: after.status, result: after.result, stderrTail: after.stderr.split("\n").filter(Boolean).slice(-6) },
    };
    console.log(JSON.stringify(report, null, 1));
    assert.notEqual(before.status, 0, "the old chunk did not crash: the fault path was not reproduced");
    assert(report.old.crashedWith400, "the old chunk crashed, but not with the server's 400");
    assert.equal(after.status, 0, "the new chunk crashed");
    assert.equal(after.result?.survived, true);
    assert.equal(after.result.errorListenersAfterStop, 1, "the stopped socket has no error listener");
    assert(after.result.clientAbortedHandshake, "the stopped connection's handshake kept running");
    assert(after.result.logs.some((l) => l.startsWith("warn: stopped connection socket error (ignored)")), "the guard did not see the socket's error");
    console.log("ok: old chunk crashes on the held handshake's 400, new chunk survives");
  }
}
