// A loopback stand-in for the WeCom smart-robot WebSocket channel
// (wss://openws.work.weixin.qq.com), for candidate tests.
//
// The WeCom plugin takes its socket URL from `websocketUrl`, so the real
// plugin and @wecom/aibot-node-sdk run unchanged against this server: the
// robot authenticates, the test pushes user messages, and every streamed
// reply frame and proactive message is acknowledged and recorded.
//
// Nothing here talks to WeCom. `WebSocketServer` comes from the `ws` package
// the plugin depends on.
import http from "node:http";

export function createFakeWeComAibot({ WebSocketServer, streamLifetimeMs = 6 * 60 * 1000 }) {
  const frames = [];
  const streams = new Map(); // stream id -> {chatId, history, content, finished, createdAt}
  const proactive = []; // {at, chatId, msgtype, text}
  const sockets = new Set();
  let nextId = 1;
  let authenticated = false;

  const server = http.createServer((req, res) => { res.writeHead(404).end(); });
  const wss = new WebSocketServer({ server });
  const ack = (ws, reqId, extra = {}) => ws.send(JSON.stringify({ headers: { req_id: reqId }, errcode: 0, errmsg: "ok", ...extra }));
  const callbacks = new Map(); // callback req_id -> chatId

  wss.on("connection", (ws) => {
    sockets.add(ws);
    ws.on("close", () => sockets.delete(ws));
    ws.on("message", (data) => {
      let frame;
      try { frame = JSON.parse(String(data)); } catch { return; }
      const reqId = frame.headers?.req_id ?? "";
      frames.push({ at: Date.now(), cmd: frame.cmd, reqId, body: frame.body });
      switch (frame.cmd) {
        case "aibot_subscribe": authenticated = true; ack(ws, reqId); return;
        case "ping": ack(ws, reqId); return;
        case "aibot_respond_msg": {
          const body = frame.body ?? {};
          if (body.msgtype === "stream") {
            const s = body.stream ?? {};
            let st = streams.get(s.id);
            if (!st) { st = { id: s.id, chatId: callbacks.get(reqId), history: [], content: "", finished: false, createdAt: Date.now() }; streams.set(s.id, st); }
            if (st.finished || Date.now() - st.createdAt > streamLifetimeMs) {
              ws.send(JSON.stringify({ headers: { req_id: reqId }, errcode: 846608, errmsg: "stream expired" }));
              return;
            }
            st.content = String(s.content ?? "");
            st.finished = Boolean(s.finish);
            st.history.push({ at: Date.now(), content: st.content, finish: st.finished });
          } else {
            proactive.push({ at: Date.now(), chatId: callbacks.get(reqId), msgtype: body.msgtype, text: body.markdown?.content ?? body.text?.content ?? JSON.stringify(body).slice(0, 500), passive: true });
          }
          ack(ws, reqId);
          return;
        }
        case "aibot_send_msg": {
          const body = frame.body ?? {};
          proactive.push({ at: Date.now(), chatId: body.chatid, msgtype: body.msgtype, text: body.markdown?.content ?? body.text?.content ?? JSON.stringify(body).slice(0, 500) });
          ack(ws, reqId);
          return;
        }
        default:
          ack(ws, reqId);
      }
    });
  });

  return {
    listen: () => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port))),
    close: () => new Promise((resolve) => { for (const ws of sockets) ws.terminate(); wss.close(); server.closeAllConnections?.(); server.close(() => resolve()); }),
    authenticated: () => authenticated,
    frames,
    streams: () => [...streams.values()],
    proactive,
    /** A user writes to the robot (direct chat unless `group`). */
    sendUserText({ userId, text, group = false }) {
      const chatId = group ? `group-${userId}` : userId;
      const reqId = `aibot_msg_callback_${Date.now()}_${nextId++}`;
      callbacks.set(reqId, chatId);
      const body = {
        msgid: `msg-${Date.now()}-${nextId++}`, aibotid: "candidate-bot", chattype: group ? "group" : "single",
        ...(group ? { chatid: chatId } : {}), from: { userid: userId }, msgtype: "text", text: { content: text },
        create_time: Math.floor(Date.now() / 1000),
      };
      const frame = { cmd: "aibot_msg_callback", headers: { req_id: reqId }, body };
      for (const ws of sockets) ws.send(JSON.stringify(frame));
      return { chatId, reqId, at: Date.now() };
    },
  };
}
