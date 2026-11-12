// Keeps a stopped DingTalk Stream connection from taking down the Gateway.
//
//   patchSocketGuard(source)  connection-*.mjs (upstream 0.8.26 or V's v-experience build)
//
// The connector's stop() calls `client.socket.removeAllListeners()`. That also
// removes the only "error" listener dingtalk-stream@2.1.4 puts on its `ws`
// socket. When the account stops while a reconnect is still in its handshake
// (the health monitor restarts DingTalk after a keepAlive timeout, and
// onAbort only closes an OPEN socket), the socket stays alive with no
// listener; the server's later answer (HTTP 400 for the used ticket) makes
// `ws` emit "error" with nobody listening, Node throws it, and the Gateway
// exits with uncaught_exception "Unexpected server response: 400". V lost
// every channel that way on 2026-11-08 10:08 and 2026-11-12 22:08 (systemd
// restart + DB91 integrity check, about 9 minutes). Upstream issue:
// DingTalk-Real-AI/dingtalk-openclaw-connector#670, open; 0.8.27 and main
// still have the same stop().
//
// The patch keeps one "error" listener on the stopped socket (it logs) and
// aborts a handshake that is still running, since the connection is stopped.
// An OPEN socket is left to onAbort's disconnect() as before.
import assert from "node:assert/strict";

export const SOCKET_GUARD_MARKER = "v-dingtalk-socket-guard-v1";

const ANCHOR = "\t\tif (client.socket) client.socket.removeAllListeners();\n\t\tlogger.debug(`Connection 已停止`);\n";

const REPLACEMENT = `\t\t// ${SOCKET_GUARD_MARKER}: removeAllListeners() also drops dingtalk-stream's only "error"
\t\t// listener. Keep one, so a socket stopped mid-handshake that later gets the server's
\t\t// answer (HTTP 400) does not throw out of the Gateway, and abort that handshake.
\t\tif (client.socket) {
\t\t\tconst vSocket = client.socket;
\t\t\tvSocket.removeAllListeners();
\t\t\tvSocket.on("error", (err) => logger.warn(\`stopped connection socket error (ignored): \${err?.message || err}\`));
\t\t\tif (vSocket.readyState === 0) try {
\t\t\t\tvSocket.terminate();
\t\t\t} catch (err) {
\t\t\t\tlogger.warn(\`aborting the stopped connection's handshake failed: \${err?.message || err}\`);
\t\t\t}
\t\t}
\t\tlogger.debug(\`Connection 已停止\`);
`;

/** The Stream connection chunk with the guard; an already guarded chunk is returned unchanged. */
export function patchSocketGuard(source) {
  if (source.includes(SOCKET_GUARD_MARKER)) return source;
  const count = source.split(ANCHOR).length - 1;
  assert.equal(count, 1, `dingtalk socket guard anchor matched ${count} times`);
  return source.replace(ANCHOR, () => REPLACEMENT);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const fs = await import("node:fs");
  const [file] = process.argv.slice(2);
  assert(file, "usage: node patch-socket-guard.mjs <dist/connection-*.mjs>");
  const before = fs.readFileSync(file, "utf8");
  const after = patchSocketGuard(before);
  fs.writeFileSync(file, after);
  console.log(JSON.stringify({ file, changed: before !== after }));
}
