// A loopback stand-in for the DingTalk open platform, for candidate tests.
//
// The DingTalk connector (Stream mode robot + AI cards) talks to
// api.dingtalk.com and oapi.dingtalk.com. A candidate rewrites those hosts in
// its private copy of the plugin and of dingtalk-stream to this server, so the
// real connector code runs: it opens a Stream connection here, receives robot
// messages the test injects, creates and streams AI cards, and posts session
// webhook messages. Every card state and message is recorded with history.
//
// Nothing here talks to DingTalk. `WebSocketServer` comes from the `ws`
// package the connector itself depends on.
//
// For the sessions_send inbound bridge (docs/inter-session/design.md §10.5):
// `sessionWebhookCalls()` lists every session-webhook request (a synthetic
// inter-session turn must make none), `failRoute()` makes an endpoint fail
// (e.g. AI card creation 403, so the proactive fallback runs), and `sendRaw()`
// delivers an arbitrary robot callback (e.g. the robot's own message, which
// the bridge must drop).
import http from "node:http";

// With `strictGroupIds`, robot group messages are accepted only for a group id
// a user wrote from, spelled exactly (DingTalk's openConversationId is
// case-sensitive: a folded id gets 400 invalid.openConversationId).
const STATUS = Symbol("status");
export function createFakeDingTalkOpenApi({ WebSocketServer, strictGroupIds = false }) {
  const calls = [];
  const cards = new Map(); // outTrackId -> {target, history, content, status}
  const webhookMessages = []; // {at, conversationId, msgtype, text, actionCard?}
  const robotMessages = []; // robot OpenAPI sends: {at, path, userIds|openConversationId, msgKey, msgParam}
  const mediaUploads = []; // oapi media uploads: {at, type, bytes}
  const sockets = new Set();
  const groups = new Set(); // group conversation ids users wrote from
  const rejected = []; // robot group sends refused for their id: {at, openConversationId, msgKey}
  const failures = new Map(); // "METHOD /path" -> {status, body, times}
  let nextMsg = 1;
  let port;

  const record = (method, path, body) => { const call = { at: Date.now(), method, path, body }; calls.push(call); return call; };
  const cardFor = (id) => {
    if (!cards.has(id)) cards.set(id, { outTrackId: id, history: [], content: "", status: undefined, createdAt: Date.now() });
    return cards.get(id);
  };
  const applyCardData = (card, map, op) => {
    if (!map) return;
    if (typeof map.msgContent === "string") card.content = map.msgContent;
    if (map.flowStatus !== undefined) card.status = String(map.flowStatus);
    card.history.push({ at: Date.now(), op, content: card.content, status: card.status });
  };

  const robotSend = (path, body) => {
    let msgParam = body.msgParam;
    try { msgParam = JSON.parse(body.msgParam); } catch {}
    if (strictGroupIds && body.openConversationId !== undefined && !groups.has(body.openConversationId)) {
      rejected.push({ at: Date.now(), openConversationId: body.openConversationId, msgKey: body.msgKey });
      return { [STATUS]: 400, code: "invalid.openConversationId", message: "openConversationId is invalid", requestid: "candidate" };
    }
    const processQueryKey = `candidate-pqk-${robotMessages.length + 1}`;
    robotMessages.push({ at: Date.now(), path, userIds: body.userIds, openConversationId: body.openConversationId, robotCode: body.robotCode, msgKey: body.msgKey, msgParam, processQueryKey });
    return { processQueryKey, invalidStaffIdList: [], flowControlledStaffIdList: [] };
  };
  const routes = {
    "POST /v1.0/gateway/connections/open": () => ({ endpoint: `ws://127.0.0.1:${port}/connect`, ticket: "candidate-ticket" }),
    "GET /gettoken": () => ({ errcode: 0, errmsg: "ok", access_token: "candidate-oapi-token", expires_in: 7200 }),
    "POST /v1.0/oauth2/accessToken": () => ({ accessToken: "candidate-api-token", expireIn: 7200 }),
    "POST /v1.0/card/instances": (body) => {
      const card = cardFor(body.outTrackId);
      card.templateId = body.cardTemplateId;
      applyCardData(card, body.cardData?.cardParamMap, "create");
      return { success: true, result: body.outTrackId };
    },
    "POST /v1.0/card/instances/deliver": (body) => {
      const card = cardFor(body.outTrackId);
      card.delivered = { openSpaceId: body.openSpaceId, at: Date.now() };
      card.history.push({ at: Date.now(), op: "deliver", content: card.content, status: card.status });
      return { success: true, result: [{ spaceId: body.openSpaceId, success: true }] };
    },
    "POST /v1.0/card/instances/createAndDeliver": (body) => {
      const card = cardFor(body.outTrackId);
      card.templateId = body.cardTemplateId;
      applyCardData(card, body.cardData?.cardParamMap, "createAndDeliver");
      card.delivered = { openSpaceId: body.openSpaceId, at: Date.now() };
      return { success: true, result: { outTrackId: body.outTrackId } };
    },
    "PUT /v1.0/card/instances": (body) => {
      const card = cardFor(body.outTrackId);
      applyCardData(card, body.cardData?.cardParamMap, "update");
      return { success: true };
    },
    "PUT /v1.0/card/streaming": (body) => {
      const card = cardFor(body.outTrackId);
      if (body.key === "msgContent") card.content = String(body.content ?? "");
      card.history.push({ at: Date.now(), op: body.isFinalize ? "stream-final" : "stream", content: card.content, status: card.status });
      return { success: true };
    },
    "POST /robot/sendBySession": (body, query) => {
      const text = body.msgtype === "markdown" ? body.markdown?.text : body.msgtype === "text" ? body.text?.content : body.msgtype === "actionCard" ? body.actionCard?.text : JSON.stringify(body);
      webhookMessages.push({ at: Date.now(), conversationId: query.get("conversation"), msgtype: body.msgtype, title: body.markdown?.title ?? body.actionCard?.title, text, ...(body.actionCard ? { actionCard: body.actionCard } : {}) });
      return { errcode: 0, errmsg: "ok" };
    },
    // Robot media (oapi): the multipart body is only measured.
    "POST /media/upload": (body, query) => {
      mediaUploads.push({ at: Date.now(), type: query.get("type"), bytes: body.raw ?? 0, token: Boolean(query.get("access_token")) });
      return { errcode: 0, errmsg: "ok", type: query.get("type"), media_id: `@lADPcandidate${mediaUploads.length}`, created_at: Date.now() };
    },
    // Robot OpenAPI: 1:1 messages and group messages (msgKey sampleMarkdown, sampleActionCard, ...).
    "POST /v1.0/robot/oToMessages/batchSend": (body) => robotSend("/v1.0/robot/oToMessages/batchSend", body),
    "POST /v1.0/robot/groupMessages/send": (body) => robotSend("/v1.0/robot/groupMessages/send", body),
  };

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const chunks = [];
    for await (const c of req) chunks.push(c);
    let body = {};
    try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString("utf8")) : {}; } catch { body = { raw: Buffer.concat(chunks).length }; }
    const key = `${req.method} ${url.pathname}`;
    const call = record(req.method, url.pathname, body);
    const failure = failures.get(key);
    if (failure && failure.times > 0 && (!failure.when || failure.when(body))) {
      failure.times -= 1;
      call.failed = failure.status;
      res.writeHead(failure.status, { "content-type": "application/json" });
      res.end(JSON.stringify(failure.body));
      return;
    }
    const handler = routes[key];
    // Unknown endpoints (emotion reply/recall, user lookups, media) succeed quietly.
    const result = handler ? handler(body, url.searchParams) : (url.pathname.startsWith("/topapi") || url.pathname.startsWith("/user") ? { errcode: 0, errmsg: "ok", result: {} } : { success: true, result: {} });
    res.writeHead(result?.[STATUS] ?? 200, { "content-type": "application/json" });
    res.end(JSON.stringify(result));
  });

  const wss = new WebSocketServer({ noServer: true });
  server.on("upgrade", (req, socket, head) => {
    if (!req.url.startsWith("/connect")) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => {
      sockets.add(ws);
      ws.on("close", () => sockets.delete(ws));
      ws.on("message", (data) => { try { calls.push({ at: Date.now(), method: "WS", path: "ack", body: JSON.parse(String(data)) }); } catch {} });
      ws.send(JSON.stringify({ specVersion: "1.0", type: "SYSTEM", headers: { topic: "CONNECTED", messageId: "sys-connected" }, data: "" }));
      ws.send(JSON.stringify({ specVersion: "1.0", type: "SYSTEM", headers: { topic: "REGISTERED", messageId: "sys-registered" }, data: "" }));
    });
  });

  return {
    listen: () => new Promise((resolve) => server.listen(0, "127.0.0.1", () => { port = server.address().port; resolve(port); })),
    close: () => new Promise((resolve) => { for (const ws of sockets) ws.terminate(); wss.close(); server.closeAllConnections?.(); server.close(() => resolve()); }),
    connected: () => sockets.size > 0,
    calls,
    cards: () => [...cards.values()],
    webhookMessages,
    robotMessages,
    mediaUploads,
    rejected,
    /** Every request to a session webhook (`/robot/sendBySession`), failed ones included. */
    sessionWebhookCalls: () => calls.filter((c) => c.path === "/robot/sendBySession"),
    /** Robot OpenAPI sends (proactive messages) at or after `at`. */
    robotMessagesSince: (at = 0) => robotMessages.filter((m) => m.at >= at),
    /**
     * The next `times` requests to `key` ("POST /v1.0/card/instances") answer `status` with `body`;
     * with `when(body)`, only the requests it accepts (e.g. one chat's card deliveries).
     */
    failRoute(key, { status = 403, body = { code: "Forbidden.AccessDenied", message: "candidate failure" }, times = 1, when } = {}) {
      failures.set(key, { status, body, times, when });
    },
    /** Delivers a robot callback with exactly this `data` (e.g. a message whose sender is the robot). */
    sendRaw(data) {
      const msgId = data?.msgId ?? `raw${Date.now()}${nextMsg++}`;
      const frame = { specVersion: "1.0", type: "CALLBACK", headers: { topic: "/v1.0/im/bot/messages/get", messageId: `stream-${msgId}`, contentType: "application/json", time: String(Date.now()), appId: "candidate" }, data: JSON.stringify({ ...data, msgId }) };
      for (const ws of sockets) ws.send(JSON.stringify(frame));
      return { msgId, at: Date.now() };
    },
    /** A user taps a control on an interactive card; resolves with the client's ack. */
    pressCard({ outTrackId, userId, params }) {
      const messageId = `card-${Date.now()}-${nextMsg++}`;
      const frame = { specVersion: "1.0", type: "CALLBACK", headers: { topic: "/v1.0/card/instances/callback", messageId, contentType: "application/json", time: String(Date.now()), appId: "candidate" },
        data: JSON.stringify({ type: "actionCallback", outTrackId, userId, corpId: "dingcandidate", content: JSON.stringify({ cardPrivateData: { actionIds: ["candidate"], params } }) }) };
      for (const ws of sockets) ws.send(JSON.stringify(frame));
      return new Promise((resolve) => {
        const started = Date.now();
        const poll = setInterval(() => {
          const ack = calls.find((c) => c.method === "WS" && c.body?.headers?.messageId === messageId);
          if (ack || Date.now() - started > 15000) { clearInterval(poll); resolve(ack?.body); }
        }, 100);
      });
    },
    /** A user writes to the robot (direct chat unless `group`); groups may carry their own title. */
    sendUserText({ userId, text, group = false, conversationId, senderNick = "Tianyi", conversationTitle = "VLab candidate group" }) {
      const conv = conversationId ?? (group ? `cidGroup${userId}` : `cidDirect${userId}`);
      if (group) groups.add(conv);
      const msgId = `msg${Date.now()}${nextMsg++}`;
      const data = {
        conversationId: conv, conversationType: group ? "2" : "1", conversationTitle: group ? conversationTitle : undefined,
        msgId, msgtype: "text", text: { content: text },
        senderId: `$:LWCP_v1:$${userId}`, senderStaffId: userId, senderNick,
        chatbotUserId: "$:LWCP_v1:$candidate-bot", chatbotCorpId: "dingcandidate", robotCode: "candidate-robot",
        isInAtList: true, createAt: Date.now(),
        sessionWebhook: `http://127.0.0.1:${port}/robot/sendBySession?conversation=${encodeURIComponent(conv)}`,
        sessionWebhookExpiredTime: Date.now() + 3600_000,
      };
      const frame = { specVersion: "1.0", type: "CALLBACK", headers: { topic: "/v1.0/im/bot/messages/get", messageId: `stream-${msgId}`, contentType: "application/json", time: String(Date.now()), appId: "candidate" }, data: JSON.stringify(data) };
      for (const ws of sockets) ws.send(JSON.stringify(frame));
      return { conversationId: conv, msgId, at: Date.now() };
    },
  };
}
