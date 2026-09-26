// Minimal RFC 6455 server side: enough for noVNC (binary frames, ping/pong,
// close handshake, client-side masking). No extensions, no compression.
import crypto from "node:crypto";
import { EventEmitter } from "node:events";

const GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
const MAX_MESSAGE_BYTES = 16 * 1024 * 1024;

export function isWebSocketUpgrade(req) {
  return (
    req.method === "GET" &&
    /\bupgrade\b/iu.test(String(req.headers.connection ?? "")) &&
    String(req.headers.upgrade ?? "").toLowerCase() === "websocket" &&
    typeof req.headers["sec-websocket-key"] === "string"
  );
}

export function rejectUpgrade(socket, status, message) {
  const body = message ?? "";
  socket.write(
    `HTTP/1.1 ${status} ${message ?? "Rejected"}\r\nConnection: close\r\nContent-Type: text/plain\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`,
  );
  socket.destroy();
}

export function acceptWebSocket(req, socket, head, { protocols = [] } = {}) {
  const key = req.headers["sec-websocket-key"];
  const accept = crypto.createHash("sha1").update(`${key}${GUID}`).digest("base64");
  const offered = String(req.headers["sec-websocket-protocol"] ?? "")
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  const protocol = protocols.find((p) => offered.includes(p));
  const headers = [
    "HTTP/1.1 101 Switching Protocols",
    "Upgrade: websocket",
    "Connection: Upgrade",
    `Sec-WebSocket-Accept: ${accept}`,
  ];
  if (protocol) {
    headers.push(`Sec-WebSocket-Protocol: ${protocol}`);
  }
  socket.write(`${headers.join("\r\n")}\r\n\r\n`);
  const connection = new WebSocketConnection(socket, protocol ?? null);
  if (head?.length) {
    connection._onData(head);
  }
  return connection;
}

export class WebSocketConnection extends EventEmitter {
  constructor(socket, protocol) {
    super();
    this.socket = socket;
    this.protocol = protocol;
    this.closed = false;
    this._pending = Buffer.alloc(0);
    this._fragments = [];
    this._fragmentOpcode = null;
    this._closeSent = false;
    socket.setNoDelay(true);
    socket.on("data", (chunk) => this._onData(chunk));
    socket.on("drain", () => this.emit("drain"));
    socket.on("error", (error) => this.emit("error", error));
    socket.on("close", () => {
      if (!this.closed) {
        this.closed = true;
        this.emit("close", 1006, "socket closed");
      }
    });
  }

  /** @returns {boolean} false when the kernel buffer is full (back-pressure). */
  send(data) {
    if (this.closed) {
      return false;
    }
    const payload = Buffer.isBuffer(data) ? data : Buffer.from(String(data), "utf8");
    const opcode = Buffer.isBuffer(data) ? 0x2 : 0x1;
    return this.socket.write(encodeFrame(opcode, payload));
  }

  close(code = 1000, reason = "") {
    if (this.closed) {
      return;
    }
    const reasonBuffer = Buffer.from(String(reason).slice(0, 120), "utf8");
    const payload = Buffer.alloc(2 + reasonBuffer.length);
    payload.writeUInt16BE(code, 0);
    reasonBuffer.copy(payload, 2);
    if (!this._closeSent) {
      this._closeSent = true;
      this.socket.write(encodeFrame(0x8, payload));
    }
    this.closed = true;
    this.socket.end();
    setTimeout(() => this.socket.destroy(), 1_000).unref();
    this.emit("close", code, String(reason));
  }

  _onData(chunk) {
    if (this.closed) {
      return;
    }
    this._pending = this._pending.length ? Buffer.concat([this._pending, chunk]) : chunk;
    while (!this.closed) {
      const frame = decodeFrame(this._pending);
      if (frame === null) {
        return;
      }
      if (typeof frame === "string") {
        this.close(1002, frame);
        return;
      }
      this._pending = this._pending.subarray(frame.totalLength);
      this._onFrame(frame);
    }
  }

  _onFrame(frame) {
    switch (frame.opcode) {
      case 0x0:
      case 0x1:
      case 0x2: {
        if (frame.opcode === 0x0) {
          if (this._fragmentOpcode === null) {
            this.close(1002, "unexpected continuation frame");
            return;
          }
        } else {
          if (this._fragmentOpcode !== null) {
            this.close(1002, "new data frame during fragmented message");
            return;
          }
          this._fragmentOpcode = frame.opcode;
        }
        this._fragments.push(frame.payload);
        const size = this._fragments.reduce((n, b) => n + b.length, 0);
        if (size > MAX_MESSAGE_BYTES) {
          this.close(1009, "message too large");
          return;
        }
        if (frame.fin) {
          const message = this._fragments.length === 1 ? this._fragments[0] : Buffer.concat(this._fragments);
          const binary = this._fragmentOpcode === 0x2;
          this._fragments = [];
          this._fragmentOpcode = null;
          this.emit("message", message, binary);
        }
        return;
      }
      case 0x8: {
        const code = frame.payload.length >= 2 ? frame.payload.readUInt16BE(0) : 1005;
        const reason = frame.payload.length > 2 ? frame.payload.subarray(2).toString("utf8") : "";
        this.close(code === 1005 ? 1000 : code, reason);
        return;
      }
      case 0x9:
        if (!this.closed) {
          this.socket.write(encodeFrame(0xa, frame.payload));
        }
        return;
      case 0xa:
        return;
      default:
        this.close(1002, `unsupported opcode ${frame.opcode}`);
    }
  }
}

export function encodeFrame(opcode, payload) {
  const length = payload.length;
  let header;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[1] = length;
  } else if (length < 65_536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }
  header[0] = 0x80 | (opcode & 0x0f);
  return Buffer.concat([header, payload]);
}

/** @returns {null | string | {fin: boolean, opcode: number, payload: Buffer, totalLength: number}} */
export function decodeFrame(buffer) {
  if (buffer.length < 2) {
    return null;
  }
  const fin = (buffer[0] & 0x80) !== 0;
  const rsv = buffer[0] & 0x70;
  const opcode = buffer[0] & 0x0f;
  const masked = (buffer[1] & 0x80) !== 0;
  let length = buffer[1] & 0x7f;
  let offset = 2;
  if (rsv !== 0) {
    return "reserved bits set";
  }
  if (!masked) {
    return "client frames must be masked";
  }
  if (length === 126) {
    if (buffer.length < 4) {
      return null;
    }
    length = buffer.readUInt16BE(2);
    offset = 4;
  } else if (length === 127) {
    if (buffer.length < 10) {
      return null;
    }
    const big = buffer.readBigUInt64BE(2);
    if (big > BigInt(MAX_MESSAGE_BYTES)) {
      return "frame too large";
    }
    length = Number(big);
    offset = 10;
  }
  if (opcode >= 0x8 && (length > 125 || !fin)) {
    return "invalid control frame";
  }
  const totalLength = offset + 4 + length;
  if (buffer.length < totalLength) {
    return null;
  }
  const mask = buffer.subarray(offset, offset + 4);
  const payload = Buffer.allocUnsafe(length);
  for (let i = 0; i < length; i += 1) {
    payload[i] = buffer[offset + 4 + i] ^ mask[i & 3];
  }
  return { fin, opcode, payload, totalLength };
}
