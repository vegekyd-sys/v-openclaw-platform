import { WebSocket } from "ws";
//#region src/gateway/websocket-keepalive.ts
/** Keep idle transports active; only the connection owner may impose a pong deadline. */
function startWebSocketKeepalive(socket, onMissedPong, transport) {
	let awaitingPong;
	let pongDeadline;
	let writeTimeoutActive = false;
	const previousTimeout = transport?.timeout ?? 0;
	const clearWriteTimeout = () => {
		if (!writeTimeoutActive) return;
		writeTimeoutActive = false;
		transport?.off("timeout", reportMissedPong);
		transport?.setTimeout(previousTimeout);
	};
	const reportMissedPong = () => {
		if (awaitingPong) onMissedPong?.();
	};
	const onPong = () => {
		awaitingPong = void 0;
		pongDeadline = void 0;
		clearWriteTimeout();
	};
	const stop = () => {
		clearInterval(timer);
		awaitingPong = void 0;
		clearWriteTimeout();
		socket.off("pong", onPong);
		socket.off("close", stop);
	};
	socket.on("pong", onPong);
	socket.once("close", stop);
	const timer = setInterval(() => {
		if (socket.readyState !== WebSocket.OPEN) {
			stop();
			return;
		}
		if (awaitingPong && onMissedPong) {
			if (writeTimeoutActive || pongDeadline !== void 0 && performance.now() < pongDeadline) return;
			reportMissedPong();
			return;
		}
		const attempt = {};
		awaitingPong = attempt;
		pongDeadline = void 0;
		if (onMissedPong && transport) {
			writeTimeoutActive = true;
			transport.on("timeout", reportMissedPong);
			transport.setTimeout(25e3);
		}
		try {
			socket.ping(void 0, void 0, onMissedPong ? (error) => {
				if (awaitingPong !== attempt) return;
				clearWriteTimeout();
				if (!error) pongDeadline = performance.now() + 25e3;
			} : void 0);
		} catch {
			clearWriteTimeout();
		}
	}, 25e3);
	return stop;
}
//#endregion
export { startWebSocketKeepalive as t };
