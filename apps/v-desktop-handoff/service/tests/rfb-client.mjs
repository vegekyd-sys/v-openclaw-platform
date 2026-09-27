// Minimal RFB-over-WebSocket client for tests: performs the "None" handshake
// the proxy offers and exposes helpers to send input messages like noVNC does.
export async function openViewer(wsUrl, { protocols = ["binary"] } = {}) {
  const ws = new WebSocket(wsUrl, protocols);
  ws.binaryType = "arraybuffer";
  const state = { chunks: [], closed: null, serverInit: null, frames: 0 };
  let waiters = [];
  const feed = () => {
    for (const w of [...waiters]) {
      const total = Buffer.concat(state.chunks);
      if (total.length >= w.n) {
        waiters = waiters.filter((x) => x !== w);
        state.chunks = [total.subarray(w.n)];
        w.resolve(total.subarray(0, w.n));
      } else if (state.closed) {
        waiters = waiters.filter((x) => x !== w);
        w.reject(new Error(`closed ${state.closed.code} ${state.closed.reason}`));
      }
    }
  };
  ws.addEventListener("message", (e) => {
    state.chunks.push(Buffer.from(e.data));
    feed();
  });
  const closed = new Promise((resolve) => {
    ws.addEventListener("close", (e) => {
      state.closed = { code: e.code, reason: e.reason };
      feed();
      resolve(state.closed);
    });
  });
  const read = (n) => new Promise((resolve, reject) => { waiters.push({ n, resolve, reject }); feed(); });
  await new Promise((resolve, reject) => {
    ws.addEventListener("open", resolve, { once: true });
    ws.addEventListener("error", () => reject(new Error("ws error")), { once: true });
    ws.addEventListener("close", (e) => reject(new Error(`closed before open: ${e.code} ${e.reason}`)), { once: true });
  });
  const send = (buf) => ws.send(buf);
  const handshake = async () => {
    const version = (await read(12)).toString("ascii");
    if (version !== "RFB 003.008\n") throw new Error(`bad version ${version}`);
    send(Buffer.from("RFB 003.008\n"));
    const count = (await read(1))[0];
    const types = [...(await read(count))];
    if (!types.includes(1)) throw new Error(`no None security offered: ${types}`);
    send(Buffer.from([1]));
    const result = (await read(4)).readUInt32BE(0);
    if (result !== 0) throw new Error("security result not ok");
    send(Buffer.from([1]));
    const head = await read(24);
    const nameLength = head.readUInt32BE(20);
    const name = await read(nameLength);
    state.serverInit = { width: head.readUInt16BE(0), height: head.readUInt16BE(2), name: name.toString("latin1") };
    return state.serverInit;
  };
  return {
    ws,
    state,
    read,
    closed,
    handshake,
    setEncodings(encodings) {
      const b = Buffer.alloc(4 + encodings.length * 4);
      b[0] = 2;
      b.writeUInt16BE(encodings.length, 2);
      encodings.forEach((e, i) => b.writeInt32BE(e, 4 + i * 4));
      send(b);
    },
    requestUpdate() {
      const b = Buffer.alloc(10);
      b[0] = 3;
      b[1] = 1;
      b.writeUInt16BE(64, 6);
      b.writeUInt16BE(48, 8);
      send(b);
    },
    pointer(x, y, mask = 0) {
      const b = Buffer.alloc(6);
      b[0] = 5;
      b[1] = mask;
      b.writeUInt16BE(x, 2);
      b.writeUInt16BE(y, 4);
      send(b);
    },
    key(keysym, down = true) {
      const b = Buffer.alloc(8);
      b[0] = 4;
      b[1] = down ? 1 : 0;
      b.writeUInt32BE(keysym, 4);
      send(b);
    },
    close() {
      ws.close(1000, "done");
    },
  };
}

export async function readFrame(client) {
  // FramebufferUpdate header (4 bytes) + one raw 1x1 rect (12 + 4 bytes) from the fake server
  const head = await client.read(4);
  if (head[0] !== 0) throw new Error(`unexpected server message ${head[0]}`);
  const rects = head.readUInt16BE(2);
  for (let i = 0; i < rects; i += 1) {
    await client.read(16);
  }
  return rects;
}
