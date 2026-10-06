// A tiny RFB 3.8 server with VncAuth for tests. It records every client
// message it receives after the handshake and can push framebuffer updates.
import net from "node:net";
import crypto from "node:crypto";
import zlib from "node:zlib";
import { vncAuthResponse } from "../lib/vnc-auth.mjs";

export async function startFakeVnc({ password = "secret", name = "fake desktop", width = 64, height = 48, frame = null } = {}) {
  const clients = [];
  const server = net.createServer((socket) => {
    const client = { socket, messages: [], setEncodings: [], authenticated: false, shared: null };
    clients.push(client);
    let buffer = Buffer.alloc(0);
    let phase = "version";
    const challenge = crypto.randomBytes(16);
    socket.write("RFB 003.008\n");
    socket.on("data", (chunk) => {
      buffer = Buffer.concat([buffer, chunk]);
      for (;;) {
        if (phase === "version") {
          if (buffer.length < 12) return;
          buffer = buffer.subarray(12);
          socket.write(Buffer.from([1, 2])); // one type: VncAuth
          phase = "security";
        } else if (phase === "security") {
          if (buffer.length < 1) return;
          const chosen = buffer[0];
          buffer = buffer.subarray(1);
          if (chosen !== 2) {
            socket.destroy();
            return;
          }
          socket.write(challenge);
          phase = "auth";
        } else if (phase === "auth") {
          if (buffer.length < 16) return;
          const response = buffer.subarray(0, 16);
          buffer = buffer.subarray(16);
          if (!response.equals(vncAuthResponse(password, challenge))) {
            const reason = Buffer.from("Authentication failure");
            const out = Buffer.alloc(8 + reason.length);
            out.writeUInt32BE(1, 0);
            out.writeUInt32BE(reason.length, 4);
            reason.copy(out, 8);
            socket.end(out);
            return;
          }
          client.authenticated = true;
          socket.write(Buffer.from([0, 0, 0, 0]));
          phase = "clientInit";
        } else if (phase === "clientInit") {
          if (buffer.length < 1) return;
          client.shared = buffer[0];
          buffer = buffer.subarray(1);
          const nameBuffer = Buffer.from(name, "latin1");
          const init = Buffer.alloc(24 + nameBuffer.length);
          init.writeUInt16BE(width, 0);
          init.writeUInt16BE(height, 2);
          // pixel format: 32bpp depth 24 big-endian=0 true-colour=1, max 255 each, shifts 16/8/0
          Buffer.from([32, 24, 0, 1, 0, 255, 0, 255, 0, 255, 16, 8, 0, 0, 0, 0]).copy(init, 4);
          init.writeUInt32BE(nameBuffer.length, 20);
          nameBuffer.copy(init, 24);
          socket.write(init);
          phase = "messages";
        } else {
          // messages: parse the same shapes the proxy forwards
          if (buffer.length < 1) return;
          const type = buffer[0];
          let length;
          switch (type) {
            case 0: length = 20; break;
            case 2: length = buffer.length < 4 ? null : 4 + buffer.readUInt16BE(2) * 4; break;
            case 3: length = 10; break;
            case 4: length = 8; break;
            case 5: length = buffer.length < 2 ? null : (buffer[1] & 0x80 ? 7 : 6); break;
            case 6: length = buffer.length < 8 ? null : 8 + Math.abs(buffer.readInt32BE(4)); break;
            case 150: length = 10; break;
            case 248: length = buffer.length < 9 ? null : 9 + buffer[8]; break;
            case 251: length = 24; break;
            case 255: length = 12; break;
            default:
              client.messages.push({ type, error: "unknown" });
              socket.destroy();
              return;
          }
          if (length === null || buffer.length < length) return;
          const message = buffer.subarray(0, length);
          buffer = buffer.subarray(length);
          if (type === 2) {
            const encodings = [];
            for (let i = 0; i < message.readUInt16BE(2); i += 1) encodings.push(message.readInt32BE(4 + i * 4));
            client.setEncodings.push(encodings);
          }
          client.messages.push({ type, bytes: Buffer.from(message) });
          if (type === 3 && frame) {
            // a full-screen raw rectangle from frame(x, y) -> [r, g, b], in the 32-bit BGRX format the capture asks for
            const pixels = Buffer.alloc(width * height * 4);
            for (let y = 0; y < height; y += 1) {
              for (let x = 0; x < width; x += 1) {
                const [r, g, b] = frame(x, y);
                const i = (y * width + x) * 4;
                pixels[i] = b;
                pixels[i + 1] = g;
                pixels[i + 2] = r;
              }
            }
            // Zlib (6) when the client listed it first, like macOS Screen Sharing does; else raw.
            const zlibFirst = client.setEncodings.at(-1)?.[0] === 6;
            const head = Buffer.alloc(16);
            head.writeUInt16BE(1, 2);
            head.writeUInt16BE(width, 8);
            head.writeUInt16BE(height, 10);
            head.writeInt32BE(zlibFirst ? 6 : 0, 12);
            if (zlibFirst) {
              const compressed = zlib.deflateSync(pixels, { finishFlush: zlib.constants.Z_SYNC_FLUSH });
              const length = Buffer.alloc(4);
              length.writeUInt32BE(compressed.length, 0);
              socket.write(Buffer.concat([head, length, compressed]));
            } else {
              socket.write(Buffer.concat([head, pixels]));
            }
          } else if (type === 3) {
            // answer with one raw rectangle so the client sees a frame
            const rect = Buffer.alloc(4 + 12 + 4);
            rect[0] = 0; // FramebufferUpdate
            rect.writeUInt16BE(1, 2);
            rect.writeUInt16BE(0, 4); rect.writeUInt16BE(0, 6); rect.writeUInt16BE(1, 8); rect.writeUInt16BE(1, 10);
            rect.writeInt32BE(0, 12);
            rect.writeUInt32BE(0x00ff00ff, 16);
            socket.write(rect);
          }
        }
      }
    });
    socket.on("error", () => {});
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return {
    port: server.address().port,
    password,
    clients,
    close: () => new Promise((resolve) => { for (const c of clients) c.socket.destroy(); server.close(() => resolve()); }),
  };
}
