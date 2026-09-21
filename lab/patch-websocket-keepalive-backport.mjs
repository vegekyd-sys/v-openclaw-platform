import assert from "node:assert/strict";

export const KEEPALIVE_BEFORE = `function startWebSocketKeepalive(socket, onMissedPong) {
\tlet awaitingPong = false;
\tconst onPong = () => {
\t\tawaitingPong = false;
\t};
\tconst stop = () => {
\t\tclearInterval(timer);
\t\tsocket.off("pong", onPong);
\t\tsocket.off("close", stop);
\t};
\tsocket.on("pong", onPong);
\tsocket.once("close", stop);
\tconst timer = setInterval(() => {
\t\tif (socket.readyState !== WebSocket.OPEN) {
\t\t\tstop();
\t\t\treturn;
\t\t}
\t\tif (awaitingPong && onMissedPong) {
\t\t\tonMissedPong();
\t\t\treturn;
\t\t}
\t\tawaitingPong = true;
\t\ttry {
\t\t\tsocket.ping();
\t\t} catch {}
\t}, 25e3);
\treturn stop;
}`;

export const KEEPALIVE_AFTER = `function startWebSocketKeepalive(socket, onMissedPong, transport) {
\tlet awaitingPong;
\tlet pongDeadline;
\tlet writeTimeoutActive = false;
\tconst previousTimeout = transport?.timeout ?? 0;
\tconst clearWriteTimeout = () => {
\t\tif (!writeTimeoutActive) return;
\t\twriteTimeoutActive = false;
\t\ttransport?.off("timeout", reportMissedPong);
\t\ttransport?.setTimeout(previousTimeout);
\t};
\tconst reportMissedPong = () => {
\t\tif (awaitingPong) onMissedPong?.();
\t};
\tconst onPong = () => {
\t\tawaitingPong = void 0;
\t\tpongDeadline = void 0;
\t\tclearWriteTimeout();
\t};
\tconst stop = () => {
\t\tclearInterval(timer);
\t\tawaitingPong = void 0;
\t\tclearWriteTimeout();
\t\tsocket.off("pong", onPong);
\t\tsocket.off("close", stop);
\t};
\tsocket.on("pong", onPong);
\tsocket.once("close", stop);
\tconst timer = setInterval(() => {
\t\tif (socket.readyState !== WebSocket.OPEN) {
\t\t\tstop();
\t\t\treturn;
\t\t}
\t\tif (awaitingPong && onMissedPong) {
\t\t\tif (writeTimeoutActive || pongDeadline !== void 0 && performance.now() < pongDeadline) return;
\t\t\treportMissedPong();
\t\t\treturn;
\t\t}
\t\tconst attempt = {};
\t\tawaitingPong = attempt;
\t\tpongDeadline = void 0;
\t\tif (onMissedPong && transport) {
\t\t\twriteTimeoutActive = true;
\t\t\ttransport.on("timeout", reportMissedPong);
\t\t\ttransport.setTimeout(25e3);
\t\t}
\t\ttry {
\t\t\tsocket.ping(void 0, void 0, onMissedPong ? (error) => {
\t\t\t\tif (awaitingPong !== attempt) return;
\t\t\t\tclearWriteTimeout();
\t\t\t\tif (!error) pongDeadline = performance.now() + 25e3;
\t\t\t} : void 0);
\t\t} catch {
\t\t\tclearWriteTimeout();
\t\t}
\t}, 25e3);
\treturn stop;
}`;

export const CALLER_BEFORE = `\t\t\tstopKeepalive = startWebSocketKeepalive(socket, () => {
\t\t\t\tsetCloseCause("heartbeat-timeout");
\t\t\t\ttry {
\t\t\t\t\tsocket.terminate();
\t\t\t\t} catch {
\t\t\t\t\tclose();
\t\t\t\t}
\t\t\t});`;

export const CALLER_AFTER = `\t\t\tstopKeepalive = startWebSocketKeepalive(socket, () => {
\t\t\t\tsetCloseCause("heartbeat-timeout");
\t\t\t\ttry {
\t\t\t\t\tsocket.terminate();
\t\t\t\t} catch {
\t\t\t\t\tclose();
\t\t\t\t}
\t\t\t}, upgradeReq.socket);`;

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `${label} runtime anchor drifted`);
  return source.replace(before, after);
}

export function patchWebSocketKeepalive(source) {
  return replaceExactlyOnce(source, KEEPALIVE_BEFORE, KEEPALIVE_AFTER, "keepalive");
}

export function patchGatewayKeepaliveCaller(source) {
  return replaceExactlyOnce(source, CALLER_BEFORE, CALLER_AFTER, "Gateway caller");
}
