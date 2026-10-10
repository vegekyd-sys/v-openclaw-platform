import assert from "node:assert/strict";
import net from "node:net";
import { test } from "node:test";
import { connectVnc } from "../lib/rfb-proxy.mjs";
import { vncAuthResponse } from "../lib/vnc-auth.mjs";

// macOS Screen Sharing: announces RFB 003.889, offers Apple types plus VncAuth (2).
function fakeMacScreenSharing(password) {
  return net.createServer((s) => {
    let buf = Buffer.alloc(0);
    let stage = 0;
    const challenge = Buffer.alloc(16, 7);
    s.write("RFB 003.889\n");
    s.on("data", (d) => {
      buf = Buffer.concat([buf, d]);
      if (stage === 0 && buf.length >= 12) {
        assert.equal(buf.subarray(0, 12).toString(), "RFB 003.008\n");
        buf = buf.subarray(12);
        stage = 1;
        s.write(Buffer.from([3, 30, 35, 2]));
      }
      if (stage === 1 && buf.length >= 1) {
        assert.equal(buf[0], 2);
        buf = buf.subarray(1);
        stage = 2;
        s.write(challenge);
      }
      if (stage === 2 && buf.length >= 16) {
        const ok = buf.subarray(0, 16).equals(vncAuthResponse(password, challenge));
        buf = buf.subarray(16);
        stage = 3;
        s.write(Buffer.from([0, 0, 0, ok ? 0 : 1]));
        if (!ok) s.end();
      }
      if (stage === 3 && buf.length >= 1) {
        stage = 4;
        const name = Buffer.from("MacBook Pro");
        const head = Buffer.alloc(24);
        head.writeUInt16BE(3440, 0);
        head.writeUInt16BE(1440, 2);
        head.writeUInt32BE(name.length, 20);
        s.write(Buffer.concat([head, name]));
      }
    });
  });
}

test("connects to macOS Screen Sharing (RFB 003.889) with VncAuth", async () => {
  const server = fakeMacScreenSharing("t3stPw9z");
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address();
  try {
    const vnc = await connectVnc({ host: "127.0.0.1", port, password: "t3stPw9z" });
    assert.equal(vnc.serverInit.readUInt16BE(0), 3440);
    assert.equal(vnc.serverInit.subarray(24).toString(), "MacBook Pro");
    vnc.socket.destroy();
    await assert.rejects(connectVnc({ host: "127.0.0.1", port, password: "wrongpw1" }), /authentication failed/u);
  } finally {
    server.close();
  }
});
