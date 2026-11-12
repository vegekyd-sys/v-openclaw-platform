# dingtalk-socket-guard — a stopped DingTalk reconnect no longer crashes the Gateway

V's Gateway exited with `uncaught_exception` "Unexpected server response: 400"
on 2026-11-08 10:08:35 and 2026-11-12 22:08:50 CST. Each time systemd
restarted it and the DB91 integrity check after an unclean exit kept V down
for about 9 minutes, all channels included. The stability bundles carry only
the message.

The 400 came from the DingTalk connector (`@dingtalk-real-ai/dingtalk-connector`
0.8.26), not from WeCom: on 11-12 WeCom's reconnect was still in its 1 s
back-off (no `Connecting to WebSocket` line) when the process died, and on
11-08 WeCom logged nothing around the crash. Both times the health monitor had
restarted DingTalk 6 s / 16 s earlier while a Stream reconnect was in its
handshake:

1. keepAlive timeout → `doReconnect()` → `client.connect()` opens a new `ws`
   socket (dingtalk-stream@2.1.4 attaches its only `"error"` listener);
   the handshake hangs (event-loop stall), the 10 s wait gives up.
2. health monitor → abort → `stop()` → `client.socket.removeAllListeners()`.
   `onAbort` closes only an OPEN socket, so the CONNECTING one stays, with no
   listeners at all.
3. The DingTalk gateway refuses the used ticket with HTTP 400; `ws` emits
   `"error"`, nobody listens, Node throws it: uncaught exception.

Upstream has the same diagnosis open since 2026-09-13
(DingTalk-Real-AI/dingtalk-openclaw-connector#670); 0.8.27 and `main` still
ship the same `stop()`, so there is no upstream fix to take. OpenClaw's
process-wide `registerUncaughtExceptionHandler` (plugin SDK) could only match
the error by its message, which any `ws` client in the Gateway can produce,
so the fix is at the source.

## Change

`apps/v-experience/dingtalk/patch-socket-guard.mjs` (marker
`v-dingtalk-socket-guard-v1`) rewrites `stop()` in
`dist/connection-DCvu-l09.mjs`: after removing the listeners it puts one
`"error"` listener back (logs `stopped connection socket error (ignored): …`)
and terminates a socket that is still CONNECTING. An OPEN socket is left to
`onAbort`'s `disconnect()` as before. `patchDingtalkConnector()` applies it on
every build of the connection chunk, so a rebuild from the 0.8.26 baseline
cannot drop it; `patch-inter-session.mjs` still applies on top.

`dist/connection-DCvu-l09.mjs` here = `patchSocketGuard(V's current bytes)`.
`manifest.json`: `before` = V's sha256 on 2026-11-12 (also
`patchConnectionChunk(baseline)`), `after` = the new file. Release plan:
`lab/dingtalk-socket-guard.plan.json`. The file is in the connector's npm
project on V, outside the core capture; it takes effect at the next Gateway
start (no restart is needed just for this: it can ride the next planned one).

## Evidence

- `tests/dingtalk-socket-guard.test.mjs` (CI): the chunk's real `stop()`
  against a ws-like socket; old: the refused handshake throws, new: logged,
  handshake aborted, OPEN socket untouched; shipped bytes = patch output.
- `lab/candidate/dingtalk-socket-guard-repro.mjs <node_modules> <old> <new>`:
  real `ws`@8.21.3 and dingtalk-stream@2.1.4 from V's project, a local server
  holding the upgrade then answering 400. Old chunk: the child dies with
  `Emitted 'error' event on WebSocket instance … Unexpected server response:
  400`; new chunk: alive.
- `lab/candidate/dingtalk-socket-guard-{crash,survive}.plan.json`: the
  connector in a private VLab Gateway against the fake open platform; drop
  the Stream connection, hold the reconnect's handshake, `channels.stop`,
  answer 400. Results in the PR.
