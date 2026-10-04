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
  const uploads = new Map(); // upload id -> {type, filename, totalSize, received}
  const media = []; // finished uploads
  const cardUpdates = []; // aibot_respond_update_msg frames
  const eventsAt = new Map(); // event req_id -> when it was pushed

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
          proactive.push({ at: Date.now(), chatId: body.chatid, msgtype: body.msgtype, text: body.markdown?.content ?? body.text?.content ?? JSON.stringify(body).slice(0, 500), ...(body.template_card ? { templateCard: body.template_card } : {}), ...(body.image ? { mediaId: body.image.media_id } : {}) });
          ack(ws, reqId);
          return;
        }
        // Temporary media over the socket (init -> chunks -> finish); only sizes are kept.
        case "aibot_upload_media_init": {
          const id = `upload-${nextId++}`;
          uploads.set(id, { type: frame.body?.type, filename: frame.body?.filename, totalSize: frame.body?.total_size, received: 0 });
          ack(ws, reqId, { body: { upload_id: id } });
          return;
        }
        case "aibot_upload_media_chunk": {
          const u = uploads.get(frame.body?.upload_id);
          if (u) u.received += Buffer.from(String(frame.body?.base64_data ?? ""), "base64").length;
          ack(ws, reqId);
          return;
        }
        case "aibot_upload_media_finish": {
          const u = uploads.get(frame.body?.upload_id);
          const mediaId = `media-${frame.body?.upload_id}`;
          if (u) media.push({ at: Date.now(), mediaId, ...u });
          ack(ws, reqId, { body: { media_id: mediaId, type: u?.type } });
          return;
        }
        // A template card rewritten in reply to its event (the event's req_id).
        case "aibot_respond_update_msg": {
          cardUpdates.push({ at: Date.now(), reqId, chatId: callbacks.get(reqId), userids: frame.body?.userids, templateCard: frame.body?.template_card, inTime: Date.now() - (eventsAt.get(reqId) ?? 0) <= 5000 });
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
    media,
    cardUpdates,
    /** A user taps a button on a template card: a template_card_event callback. */
    pressCard({ userId, taskId, eventKey, cardType = "button_interaction", group = false }) {
      const chatId = group ? `group-${userId}` : userId;
      const reqId = `aibot_event_callback_${Date.now()}_${nextId++}`;
      callbacks.set(reqId, chatId);
      eventsAt.set(reqId, Date.now());
      const body = {
        msgid: `evt-${Date.now()}-${nextId++}`, aibotid: "candidate-bot", chattype: group ? "group" : "single",
        ...(group ? { chatid: chatId } : {}), from: { userid: userId }, msgtype: "event", create_time: Math.floor(Date.now() / 1000),
        event: { eventtype: "template_card_event", template_card_event: { card_type: cardType, event_key: eventKey, task_id: taskId } },
      };
      for (const ws of sockets) ws.send(JSON.stringify({ cmd: "aibot_event_callback", headers: { req_id: reqId }, body }));
      return { chatId, reqId, at: Date.now() };
    },
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
