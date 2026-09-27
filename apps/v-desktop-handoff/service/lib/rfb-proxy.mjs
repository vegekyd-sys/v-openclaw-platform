// Per-viewer RFB proxy between a WebSocket (noVNC) and the loopback VNC server.
//
// Both handshakes terminate here: the proxy authenticates to the VNC server
// with VncAuth (the password never leaves the host), and offers the browser a
// security-type "None" handshake. After ServerInit, server->client bytes are
// piped untouched; client->server bytes are split into messages so that input
// from anyone who is not the current controller is dropped on the server side.
import net from "node:net";
import { vncAuthResponse } from "./vnc-auth.mjs";
import { createRfbClientMessageSplitter, INPUT_MESSAGE_TYPES, stripCursorEncodings } from "./rfb-filter.mjs";

const RFB_VERSION = Buffer.from("RFB 003.008\n", "ascii");

class ByteReader {
  constructor() {
    this.buffer = Buffer.alloc(0);
    this.waiters = [];
    this.ended = null;
  }

  push(chunk) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : chunk;
    this.flush();
  }

  end(error) {
    this.ended = error ?? new Error("stream ended");
    this.flush();
  }

  flush() {
    while (this.waiters.length) {
      const [n, resolve, reject] = this.waiters[0];
      if (this.buffer.length >= n) {
        this.waiters.shift();
        const out = this.buffer.subarray(0, n);
        this.buffer = this.buffer.subarray(n);
        resolve(out);
      } else if (this.ended) {
        this.waiters.shift();
        reject(this.ended);
      } else {
        return;
      }
    }
  }

  read(n) {
    return new Promise((resolve, reject) => {
      this.waiters.push([n, resolve, reject]);
      this.flush();
    });
  }

  drain() {
    const out = this.buffer;
    this.buffer = Buffer.alloc(0);
    return out;
  }
}

async function readString(reader) {
  const length = (await reader.read(4)).readUInt32BE(0);
  return (await reader.read(Math.min(length, 4096))).toString("latin1");
}

/** Connects and authenticates to the VNC server; resolves with the socket and the raw ServerInit. */
export async function connectVnc({ host, port, password, timeoutMs = 10_000 }) {
  const socket = net.connect({ host, port });
  socket.setNoDelay(true);
  const reader = new ByteReader();
  socket.on("data", (chunk) => reader.push(chunk));
  socket.on("error", (error) => reader.end(error));
  socket.on("close", () => reader.end(new Error("VNC server closed the connection")));
  const timer = setTimeout(() => {
    reader.end(new Error("VNC handshake timed out"));
    socket.destroy();
  }, timeoutMs);
  try {
    await new Promise((resolve, reject) => {
      socket.once("connect", resolve);
      socket.once("error", reject);
    });
    const version = (await reader.read(12)).toString("ascii");
    if (!/^RFB 003\.00[3-8]\n$/u.test(version)) {
      throw new Error(`unexpected RFB version ${JSON.stringify(version)}`);
    }
    socket.write(RFB_VERSION);
    const count = (await reader.read(1))[0];
    if (count === 0) {
      throw new Error(`VNC server refused: ${await readString(reader)}`);
    }
    const types = [...(await reader.read(count))];
    let chosen;
    if (types.includes(2)) {
      chosen = 2;
    } else if (types.includes(1)) {
      chosen = 1;
    } else {
      throw new Error(`VNC server offers no supported security type (${types.join(",")})`);
    }
    socket.write(Buffer.from([chosen]));
    if (chosen === 2) {
      const challenge = await reader.read(16);
      socket.write(vncAuthResponse(password, challenge));
    }
    const result = (await reader.read(4)).readUInt32BE(0);
    if (result !== 0) {
      let reason = "";
      try {
        reason = await readString(reader);
      } catch {
        /* server may close right away */
      }
      throw new Error(`VNC authentication failed${reason ? `: ${reason}` : ""}`);
    }
    socket.write(Buffer.from([1])); // ClientInit: shared
    const head = await reader.read(24);
    const nameLength = head.readUInt32BE(20);
    const name = await reader.read(Math.min(nameLength, 4096));
    const serverInit = Buffer.concat([head, name]);
    socket.removeAllListeners("data");
    clearTimeout(timer);
    return { socket, serverInit, leftover: reader.drain() };
  } catch (error) {
    clearTimeout(timer);
    socket.destroy();
    throw error;
  }
}

/**
 * Runs the browser-side handshake over an accepted WebSocket and then bridges
 * it to the VNC server. `policy` decides what the viewer may send.
 */
export async function bridgeViewer({ ws, vnc, serverInit, leftover, policy, onClose }) {
  const reader = new ByteReader();
  const onMessage = (message) => reader.push(message);
  ws.on("message", onMessage);
  ws.once("close", () => reader.end(new Error("viewer closed")));
  let finished = false;
  const finish = (code, reason) => {
    if (finished) {
      return;
    }
    finished = true;
    ws.removeListener("message", onMessage);
    vnc.destroy();
    ws.close(code, reason);
    onClose?.(reason);
  };
  try {
    ws.send(RFB_VERSION);
    const version = (await reader.read(12)).toString("ascii");
    if (version !== RFB_VERSION.toString("ascii")) {
      throw new Error("viewer speaks an unsupported RFB version");
    }
    ws.send(Buffer.from([1, 1])); // one security type: None
    const chosen = (await reader.read(1))[0];
    if (chosen !== 1) {
      throw new Error(`viewer chose security type ${chosen}`);
    }
    ws.send(Buffer.from([0, 0, 0, 0])); // SecurityResult OK
    await reader.read(1); // ClientInit (shared flag ignored: the desktop is always shared)
    ws.send(serverInit);
  } catch (error) {
    finish(4003, String(error.message).slice(0, 100));
    return;
  }

  const splitter = createRfbClientMessageSplitter();
  const forwardClientBytes = (chunk) => {
    const result = splitter.split(chunk, (type, message) => {
      if (INPUT_MESSAGE_TYPES.has(type)) {
        return policy.allowInput();
      }
      if (type === 2 && policy.serverSideCursor !== false) {
        return stripCursorEncodings(message);
      }
      return true;
    });
    if (result.error) {
      finish(4003, result.error.slice(0, 100));
      return;
    }
    if (result.messages.some((t) => INPUT_MESSAGE_TYPES.has(t)) && policy.allowInput()) {
      policy.onInput();
    }
    if (result.forward.length) {
      vnc.write(result.forward);
    }
  };
  ws.removeListener("message", onMessage);
  ws.on("message", forwardClientBytes);
  const initial = reader.drain();
  if (initial.length) {
    forwardClientBytes(initial);
  }

  // server -> viewer with back-pressure
  if (leftover?.length) {
    ws.send(leftover);
  }
  vnc.on("data", (chunk) => {
    if (!ws.send(chunk)) {
      vnc.pause();
    }
  });
  ws.on("drain", () => vnc.resume());
  vnc.on("close", () => finish(4005, "desktop-disconnected"));
  vnc.on("error", () => finish(4005, "desktop-error"));
  ws.on("close", () => finish(1000, "viewer-closed"));
  return { close: finish };
}
