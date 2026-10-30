// vapp: V's iOS app as a V Experience channel (docs/v-app-channel.md).
//
// The app talks to the Gateway over the WebSocket it already has: it calls
// `vapp.hello` / `vapp.send` / `vapp.action`, and this module pushes
// `plugin.vapp.card` and `plugin.vapp.message` back to that user's connections.
// A turn is shown the way Feishu shows it: one card per reply, rewritten in
// place while V works (answer so far, then the work view), finished with only
// the answer and the background line; ask_user questions get their own card
// with buttons and can also be answered by typing.
//
// No SDK imports here: index.js passes the Gateway pieces in, the tests pass fakes.

export const CHANNEL_ID = "vapp";
export const ACCOUNT_ID = "default";
const UPDATE_MS = 300; // Feishu-like streaming cadence
const MAX_CONNS_PER_USER = 8;
const MAX_MEDIA_BYTES = 18 * 1024 * 1024; // base64 of this still fits one 25 MiB Gateway frame
const LOG_CAP = 600; // entries kept per user
const REPLY_FOOTER_PARTS = [["Agent", "identityName"], ["Model", "model"], ["Provider", "provider"], ["Runtime", "agentRuntime"]];

const text = (value) => (typeof value === "string" ? value : "");
const randomId = (prefix) => `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** `channels.vapp` as {enabled, defaultUser, users: {id: {name, owner, devices}}}. */
export function vappConfig(cfg) {
  const raw = cfg?.channels?.[CHANNEL_ID] ?? {};
  return { enabled: raw.enabled !== false, defaultUser: text(raw.defaultUser).trim(), users: raw.users && typeof raw.users === "object" ? raw.users : {} };
}

/**
 * The V user a connection speaks for: the user whose `devices` list holds the
 * paired device id, else `defaultUser` (the owner's phones before per-user
 * login exists). Undefined when the device belongs to nobody.
 */
export function resolveUser(cfg, client) {
  const config = vappConfig(cfg);
  if (!config.enabled) return undefined;
  const deviceId = text(client?.connect?.device?.id);
  let id = deviceId ? Object.keys(config.users).find((u) => (config.users[u]?.devices ?? []).includes(deviceId)) : undefined;
  id ??= config.defaultUser || undefined;
  if (!id) return undefined;
  const entry = config.users[id] ?? {};
  return { id, name: text(entry.name) || id, owner: entry.owner === true || id === config.defaultUser, deviceId };
}

/** Where a user's chat log lives; the plugin passes a file store, tests this one. */
export function memoryStore() {
  const lines = new Map();
  return {
    load: async (userId) => [...(lines.get(userId) ?? [])],
    append: async (userId, entry) => { lines.set(userId, [...(lines.get(userId) ?? []), entry]); },
    rewrite: async (userId, entries) => { lines.set(userId, [...entries]); },
  };
}

/**
 * The app's chat as V showed it: what the user sent, each finished card, each
 * message. `vapp.history` serves this, so a reopened chat has its cards and
 * reading it never touches the session transcript (a big one blocks the Gateway).
 * Later entries with the same id replace earlier ones; a `removed` entry drops it.
 */
function createChatLog(store, log) {
  const users = new Map(); // userId -> {ready: Promise<Map>, appended}
  const open = (userId) => {
    let user = users.get(userId);
    if (!user) {
      user = {
        appended: 0,
        ready: Promise.resolve().then(() => store.load(userId)).catch((error) => {
          log(`vapp: chat log of ${userId} unreadable: ${String(error?.message ?? error)}`);
          return [];
        }).then((lines) => {
          const entries = new Map();
          for (const line of lines) {
            if (line.removed) entries.delete(line.id);
            else entries.set(line.id, line);
          }
          return entries;
        }),
      };
      users.set(userId, user);
    }
    return user;
  };
  let tail = Promise.resolve();
  return {
    record(userId, entry) {
      const user = open(userId);
      tail = tail.then(async () => {
        const entries = await user.ready;
        if (entry.removed) entries.delete(entry.id);
        else entries.set(entry.id, { ...entries.get(entry.id), ...entry });
        while (entries.size > LOG_CAP) entries.delete(entries.keys().next().value);
        user.appended += 1;
        if (user.appended > LOG_CAP) {
          user.appended = 0;
          await store.rewrite(userId, [...entries.values()]);
        } else {
          await store.append(userId, entry);
        }
      }).catch((error) => log(`vapp: chat log of ${userId} not written: ${String(error?.message ?? error)}`));
      return tail;
    },
    async page(userId, { before, limit = 60 } = {}) {
      await tail;
      const list = [...(await open(userId).ready).values()].sort((a, b) => a.at - b.at);
      const end = before ? Math.max(0, list.findIndex((e) => e.id === before)) : list.length;
      const size = Math.min(Math.max(1, Number(limit) || 60), 200);
      return { items: list.slice(Math.max(0, end - size), end), hasMore: end > size };
    },
  };
}

/**
 * @param {object} deps
 * @param {object} deps.vx          the v-experience module
 * @param {() => object} deps.getConfig
 * @param {(method: string, params: object) => Promise<any>} deps.call   in-process Gateway call (question.get/resolve)
 * @param {object} deps.inbound     {resolveRoute, buildContext, dispatch, saveMedia, toMediaFacts}
 * @param {(msg: string) => void} [deps.log]
 */
export function createVapp({ vx, getConfig, call, inbound, log = () => {}, updateMs = UPDATE_MS, startTurn = (job) => job(), store = memoryStore() }) {
  const chatLog = createChatLog(store, log);
  const liveCards = new Map(); // userId -> Map(cardId -> payload) of cards still changing
  const running = new Map(); // userId -> Set of turns
  const cardTimes = new Map(); // cardId -> first shown, so a rewrite keeps its place
  const connections = new Map(); // userId -> Map(connId -> at)
  let broadcastToConnIds; // set by the first vapp.* request (the Gateway's context)
  const questions = new Map(); // question id -> {turn, record, staged, state, answers}
  const records = new Map(); // question id -> record, so the ask runtime needs no Gateway read
  const asks = vx.createAskRuntime({
    getQuestion: async (id) => records.get(id) ?? (await call("question.get", { id }))?.question,
    resolve: (id, answers, resolvedBy) => call("question.resolve", { id, answers, resolvedBy }),
    log,
  });

  const route = (cfg, user) => inbound.resolveRoute({ cfg, channel: CHANNEL_ID, accountId: ACCOUNT_ID, peer: { kind: "direct", id: user.id } });

  const attach = (user, client, context) => {
    if (typeof context?.broadcastToConnIds === "function") broadcastToConnIds = context.broadcastToConnIds;
    const connId = client?.connId;
    if (!connId) return;
    const conns = connections.get(user.id) ?? new Map();
    conns.delete(connId);
    conns.set(connId, Date.now());
    while (conns.size > MAX_CONNS_PER_USER) conns.delete(conns.keys().next().value);
    connections.set(user.id, conns);
  };

  /** Sends `plugin.vapp.<event>` to every connection of the user; false when none is known. */
  const push = (userId, event, payload) => {
    const conns = connections.get(userId);
    if (!broadcastToConnIds || !conns?.size) return false;
    try {
      broadcastToConnIds(`plugin.vapp.${event}`, payload, new Set(conns.keys()));
      return true;
    } catch (error) {
      log(`vapp: push ${event} to ${userId} failed: ${String(error?.message ?? error)}`);
      return false;
    }
  };

  /** One card change: pushed now, kept for a reconnect while live, logged once it settles. */
  const publishCard = (userId, payload) => {
    const at = cardTimes.get(payload.cardId) ?? Date.now();
    cardTimes.set(payload.cardId, at);
    while (cardTimes.size > 300) cardTimes.delete(cardTimes.keys().next().value);
    const full = { ...payload, at };
    push(userId, "card", full);
    const live = liveCards.get(userId) ?? new Map();
    liveCards.set(userId, live);
    if (full.live) {
      live.set(full.cardId, full);
      return;
    }
    live.delete(full.cardId);
    const id = `card:${full.cardId}`;
    chatLog.record(userId, full.removed ? { id, removed: true } : { id, kind: "card", at, sessionKey: full.sessionKey, cardId: full.cardId, card: full.card });
  };

  const requireUser = (client) => {
    const user = resolveUser(getConfig(), client);
    if (!user) throw Object.assign(new Error("这台设备还没有绑定 V 用户"), { code: "UNAVAILABLE" });
    return user;
  };

  // ------------------------------------------------------------------ turns

  function createTurn({ user, sessionKey, silent = false, footer = () => "" }) {
    const turnId = randomId("t");
    let seq = 0;
    let segment = 0;
    let answer = ""; // the assistant message being written (partials restart per message)
    const finals = []; // delivered final/block texts of this segment
    let phase = "thinking";
    let timer;
    let lastPush = 0;
    let finished = false;
    let shown = false; // something was pushed for the current segment
    const view = vx.createWorkView({ sessionKey, onChange: () => schedule(), log });

    const cardId = () => `${turnId}:${segment}`;
    const body = () => (finals.length ? finals.join("\n\n") : answer);
    const emit = (card, { id = cardId(), final = false, removed = false, live = !final && !removed } = {}) => {
      if (silent) return;
      seq += 1;
      publishCard(user.id, { sessionKey, turnId, cardId: id, seq, final, live, ...(removed ? { removed: true } : { card }) });
    };
    const paint = () => {
      clearTimeout(timer);
      timer = undefined;
      if (finished || silent) return;
      lastPush = Date.now();
      shown = true;
      const waiting = view.waitingForAnswer();
      emit(vx.workCard({ answer: body(), view: view.snapshot(), phase: waiting ? "waiting" : phase, background: vx.currentBackgroundLine(sessionKey) }));
    };
    const schedule = () => {
      if (finished || timer) return;
      timer = setTimeout(paint, Math.max(0, updateMs - (Date.now() - lastPush)));
      timer.unref?.();
    };

    const turn = {
      turnId,
      user,
      sessionKey,
      view,
      aborted: false,
      partial(value) {
        const next = text(value);
        if (!next || next === answer) return;
        answer = next;
        phase = "working";
        schedule();
      },
      delivered(value, kind) {
        const next = text(value).trim();
        if (!next) return;
        // The core may close a streamed block with an identical final.
        if (kind === "final" && finals.at(-1) === next) return;
        finals.push(next);
        phase = "working";
        schedule();
      },
      /** A question has its own card below; this one stops here and the rest of the reply starts a new card under it. */
      splitForQuestion() {
        view.questionElsewhere();
        paint();
        return { id: cardId(), text: body() };
      },
      /** The question was answered: its card above becomes plain text, work continues in a new card. */
      resumeAfter(frozen) {
        if (finished) return;
        if (frozen.text) emit(vx.workCard({ answer: frozen.text, phase: "done" }), { id: frozen.id, live: false });
        else emit(null, { id: frozen.id, removed: true });
        segment += 1;
        answer = "";
        finals.length = 0;
        shown = false;
        phase = "thinking";
        paint();
      },
      finish({ failed = false } = {}) {
        if (finished) return;
        clearTimeout(timer);
        const finalText = body().trim();
        finished = true;
        view.dispose();
        if (silent) return;
        for (const q of questions.values()) {
          if (q.turn !== turn || q.state !== "pending") continue;
          call("question.resolve", { id: q.record.id, cancel: true, resolvedBy: `vapp:${user.id}:turn-ended` }).catch(() => {});
          questionDone(q.record.id, undefined, "cancelled");
        }
        if (turn.aborted) {
          const card = vx.workCard({ answer: finalText, phase: finalText ? "done" : "aborted", footer: finalText ? "这一轮已停止。" : "" });
          emit(card, { final: true });
          return;
        }
        if (!finalText && !failed) {
          // Nothing to say (NO_REPLY, or the message steered a running turn).
          if (shown) emit(null, { removed: true, final: true });
          return;
        }
        const id = cardId();
        const card = (background = "") => vx.workCard({ answer: finalText, phase: failed && !finalText ? "failed" : "done", background, footer: footer() });
        emit(card(), { id, final: true });
        vx.watchBackground({
          channel: `${CHANNEL_ID}:${user.id}`,
          sessionKey,
          show: (line) => emit(card(line), { id, final: true }),
          retire: () => emit(card(), { id, final: true }),
          log,
        });
      },
    };
    turn.paintNow = paint;
    return turn;
  }

  // -------------------------------------------------------------- questions

  const questionCardFor = (q) => (q.secret ? vx.secretEntryCard(q.record, q.state) : vx.questionCard(q.record, { state: q.state, staged: q.staged, answers: q.answers }));
  const paintQuestion = (q) => publishCard(q.turn.user.id, { sessionKey: q.turn.sessionKey, turnId: q.turn.turnId, cardId: `q:${q.record.id}`, seq: Date.now(), final: q.state !== "pending", live: q.state === "pending", card: questionCardFor(q) });

  const questionDone = (id, answers, state = "answered") => {
    const q = questions.get(id);
    if (!q || q.state !== "pending") return;
    q.state = state;
    q.answers = answers;
    vx.untrackChatQuestion(id);
    paintQuestion(q);
    if (state === "answered" && !q.secret) q.turn.view.questionAnswered(answers);
    q.turn.resumeAfter(q.frozen);
  };

  async function deliverQuestion(turn, record) {
    if (!record?.id) return false;
    const secret = record.questions?.some((x) => x.isSecret || x.secretStore);
    if (!secret && !vx.isRenderableAsk(record)) return false;
    if (!vx.claimQuestionDelivery(record.id)) return true;
    if (secret) {
      // A masked form in the card, as in a Feishu DM. Typing in the chat never answers it.
      const q = { turn, record, secret: true, staged: {}, state: "pending", answers: undefined, frozen: turn.splitForQuestion() };
      questions.set(record.id, q);
      paintQuestion(q);
      log(`vapp: credential question ${record.id} delivered to ${turn.user.id}`);
      return true;
    }
    records.set(record.id, record);
    const q = { turn, record, staged: {}, state: "pending", answers: undefined, frozen: turn.splitForQuestion() };
    questions.set(record.id, q);
    paintQuestion(q);
    vx.trackChatQuestion({
      channel: CHANNEL_ID, chatKey: turn.user.id, senderId: turn.user.id, record, inline: true,
      onStaged: (staged) => { q.staged = staged; paintQuestion(q); },
      onAnswered: (answers) => questionDone(record.id, answers),
    });
    log(`vapp: question ${record.id} delivered to ${turn.user.id}`);
    return true;
  }

  /** A tool payload that carries ask_user (runtimes that send the question as a reply payload). */
  async function deliverToolPayload(turn, payload) {
    const questionId = payload?.channelData?.askUser?.questionId;
    if (!questionId) return false;
    try {
      const { question } = (await call("question.get", { id: questionId })) ?? {};
      if (question?.status && question.status !== "pending") return true;
      if (await deliverQuestion(turn, question)) return true;
    } catch (error) {
      log(`vapp: question.get ${questionId} failed: ${String(error?.message ?? error)}`);
    }
    if (!vx.claimQuestionDelivery(questionId)) return true;
    if (text(payload.text).trim()) sendMessage(turn.user.id, { sessionKey: turn.sessionKey, text: payload.text });
    return true;
  }

  // ---------------------------------------------------------------- messages

  function sendMessage(userId, { sessionKey, text: body, media = [], card }) {
    const id = randomId("m");
    const message = { id, sessionKey, at: Date.now(), ...(body ? { text: body } : {}), ...(media.length ? { media } : {}), ...(card ? { card } : {}) };
    const delivered = push(userId, "message", message);
    // Also the only copy when the user is offline; the app reads it from vapp.history.
    chatLog.record(userId, { ...message, kind: "message" });
    return { id, delivered };
  }

  const mediaRefs = (payload) => [...new Set([payload?.mediaUrl, ...(payload?.mediaUrls ?? [])].filter((m) => typeof m === "string" && m.trim()))].map((source) => ({ source }));

  async function inboundMedia(list) {
    const saved = [];
    for (const item of Array.isArray(list) ? list.slice(0, 9) : []) {
      const bytes = Buffer.from(text(item?.contentBase64), "base64");
      if (!bytes.length || bytes.length > MAX_MEDIA_BYTES || !text(item?.mimeType)) throw Object.assign(new Error("附件无效或太大"), { code: "INVALID_REQUEST" });
      const file = await inbound.saveMedia(bytes, item.mimeType, "inbound", MAX_MEDIA_BYTES, text(item.fileName) || undefined);
      saved.push({ path: file.path, contentType: file.contentType });
    }
    return { facts: saved.length ? await inbound.toMediaFacts(saved) : [], refs: saved.map((file) => ({ source: file.path, mimeType: file.contentType })) };
  }

  /** One message from the app → one V turn, shown as cards. */
  async function runTurn(user, { body, media, messageId, cfg, silent = false, quote = "" }) {
    const { route: resolved, buildEnvelope } = route(cfg, user);
    const sessionKey = resolved.sessionKey;
    const pipeline = inbound.createPipeline?.({ cfg, agentId: resolved.agentId, channel: CHANNEL_ID, accountId: ACCOUNT_ID }) ?? {};
    const footer = () => {
      const ctx = pipeline.responsePrefixContextProvider?.() ?? {};
      return REPLY_FOOTER_PARTS.filter(([, key]) => ctx[key]).map(([label, key]) => `${label}: ${ctx[key]}`).join(" | ");
    };
    const turn = createTurn({ user, sessionKey, silent, footer });
    const active = running.get(user.id) ?? new Set();
    running.set(user.id, active);
    if (!silent) active.add(turn);
    const unroute = vx.onQuestionRequested(sessionKey, (record) => deliverQuestion(turn, record));
    const envelope = buildEnvelope({ channel: "V App", from: user.name, timestamp: Date.now(), body });
    const ctxPayload = inbound.buildContext({
      channel: CHANNEL_ID,
      accountId: ACCOUNT_ID,
      messageId,
      messageIdFull: messageId,
      timestamp: Date.now(),
      from: user.id,
      sender: { id: user.id, name: user.name },
      conversation: { kind: "direct", id: user.id, label: user.name, nativeChannelId: user.id },
      route: { agentId: resolved.agentId, dmScope: resolved.dmScope, accountId: ACCOUNT_ID, routeSessionKey: sessionKey, dispatchSessionKey: sessionKey },
      reply: { to: user.id, originatingTo: user.id },
      message: { body: envelope, bodyForAgent: quote ? `[Replying to: "${quote}"]\n\n${body}` : body, rawBody: body, commandBody: body },
      media,
      access: { commands: { authorized: user.owner }, mentions: { canDetectMention: false, wasMentioned: false } },
    });
    turn.paintNow();
    let failed = false;
    try {
      await inbound.dispatch({
        cfg,
        channel: CHANNEL_ID,
        accountId: ACCOUNT_ID,
        route: { agentId: resolved.agentId, dmScope: resolved.dmScope, sessionKey },
        ctxPayload,
        delivery: {
          deliver: async (payload, info) => {
            const kind = info?.kind ?? "final";
            if (kind === "tool" || payload?.channelData?.askUser) {
              if ((await deliverToolPayload(turn, payload)) || kind === "tool") return;
            }
            const media = mediaRefs(payload);
            if (media.length) sendMessage(user.id, { sessionKey, media });
            turn.delivered(payload?.text, kind);
          },
          onError: (error) => {
            failed = true;
            log(`vapp: reply to ${user.id} failed: ${String(error?.message ?? error)}`);
          },
        },
        replyOptions: {
          allowToolLifecycleWhenProgressHidden: true,
          commentaryProgressEnabled: true,
          suppressDefaultToolProgressMessages: true,
          onPartialReply: (payload) => turn.partial(payload?.text),
          onToolStart: (payload) => { turn.view.toolStart(payload); },
          onItemEvent: (payload) => { turn.view.itemEvent(payload); },
          onPlanUpdate: (payload) => { turn.view.planUpdate(payload); },
          onCompactionStart: () => turn.view.compaction(true),
          onCompactionEnd: () => turn.view.compaction(false),
        },
        replyPipeline: pipeline,
        record: { onRecordError: (error) => log(`vapp: session record failed: ${String(error?.message ?? error)}`) },
      });
    } catch (error) {
      failed = true;
      log(`vapp: dispatch for ${user.id} failed: ${String(error?.message ?? error)}`);
    } finally {
      unroute();
      active.delete(turn);
      turn.finish({ failed });
    }
    return turn;
  }

  // ---------------------------------------------------------- gateway methods

  async function hello({ client, context }) {
    const user = requireUser(client);
    attach(user, client, context);
    const { route: resolved } = route(getConfig(), user);
    return { userId: user.id, name: user.name, owner: user.owner, agentId: resolved.agentId, sessionKey: resolved.sessionKey, cardVersion: vx.V_CARD_VERSION };
  }

  async function send({ params, client, context }) {
    const user = requireUser(client);
    attach(user, client, context);
    const cfg = getConfig();
    const body = text(params?.text).trim();
    const messageId = text(params?.clientMessageId).trim() || randomId("vm");
    const quote = text(params?.quote).trim().slice(0, 500);
    const { route: resolved } = route(cfg, user);
    const media = await inboundMedia(params?.media);
    if (!body && !media.facts.length) throw Object.assign(new Error("消息是空的"), { code: "INVALID_REQUEST" });
    // Every device of this user shows it, and it is there when the chat reopens.
    const shown = { id: messageId, sessionKey: resolved.sessionKey, at: Date.now(), ...(body ? { text: body } : {}), ...(quote ? { quote } : {}), ...(media.refs.length ? { media: media.refs } : {}) };
    push(user.id, "user", shown);
    chatLog.record(user.id, { ...shown, kind: "user" });
    // A reply to a waiting question answers it at once instead of starting a
    // turn that would queue behind the one that asked.
    if (body && vx.hasTrackedQuestion({ channel: CHANNEL_ID, chatKey: user.id, senderId: user.id })) {
      const answered = await vx.answerTrackedQuestion({
        channel: CHANNEL_ID, chatKey: user.id, senderId: user.id, text: body,
        resolvedBy: `vapp:chat:${user.id}:${messageId}`,
        resolve: (id, answers, resolvedBy) => call("question.resolve", { id, answers, resolvedBy }),
        log,
      });
      if (answered.handled) return { messageId, answeredQuestion: true, ...(vx.shouldSendAnswerNotice(answered) ? { notice: answered.notice } : {}) };
    }
    // The turn runs on (started by the channel account, see index.js); the app
    // follows it through plugin.vapp.card events.
    startTurn(() => runTurn(user, { body, media: media.facts, messageId, cfg, quote }).catch((error) => log(`vapp: turn failed: ${String(error?.message ?? error)}`)));
    return { messageId, sessionKey: resolved.sessionKey };
  }

  /** Stops the user's running turns with the channel's own /stop. */
  async function stop({ client, context }) {
    const user = requireUser(client);
    attach(user, client, context);
    const active = [...(running.get(user.id) ?? [])];
    if (!active.length) return { ok: true, stopped: false };
    for (const turn of active) turn.aborted = true;
    const cfg = getConfig();
    startTurn(() => runTurn(user, { body: "/stop", media: [], messageId: randomId("vs"), cfg, silent: true }).catch((error) => log(`vapp: stop failed: ${String(error?.message ?? error)}`)));
    return { ok: true, stopped: true };
  }

  /** The chat as V showed it, plus the cards still changing right now. */
  async function history({ params, client, context }) {
    const user = requireUser(client);
    attach(user, client, context);
    const page = await chatLog.page(user.id, { before: text(params?.before) || undefined, limit: params?.limit });
    return { ...page, live: params?.before ? [] : [...(liveCards.get(user.id)?.values() ?? [])] };
  }

  /** A reaction from either side: shown on every device, kept with the message. */
  function react(userId, { messageId, emoji, remove = false, from }) {
    const id = text(messageId).trim();
    const symbol = text(emoji).trim();
    if (!id || !symbol) throw Object.assign(new Error("messageId and emoji are required"), { code: "INVALID_REQUEST" });
    const { route: resolved } = route(getConfig(), { id: userId });
    const payload = { messageId: id, sessionKey: resolved.sessionKey, emoji: symbol, remove, from, at: Date.now() };
    push(userId, "reaction", payload);
    chatLog.record(userId, { id: `reaction:${id}:${from}:${symbol}`, kind: "reaction", ...payload });
    return { ok: true };
  }

  /** The user reacted to one of V's messages: V hears about it at its next turn. */
  async function userReact({ params, client, context }) {
    const user = requireUser(client);
    attach(user, client, context);
    const result = react(user.id, { ...params, from: "user" });
    const { route: resolved } = route(getConfig(), user);
    inbound.systemEvent?.(`${user.name} ${params?.remove ? "取消了" : "加了"}表情回应 ${text(params?.emoji)}（消息 ${text(params?.messageId)}）`, { sessionKey: resolved.sessionKey });
    return result;
  }

  async function action({ params, client, context }) {
    const user = requireUser(client);
    attach(user, client, context);
    const value = params?.value ?? {};
    if (value.kind === "secret") {
      const q = questions.get(value.id);
      if (!q?.secret || q.turn.user.id !== user.id || q.state !== "pending") return { ok: false, toast: "这个请求已经结束了" };
      const secret = text(params?.form?.[vx.SECRET_FIELD]);
      if (!secret.trim()) return { ok: false, toast: "请先填写" };
      if (secret.length > 1000) return { ok: false, toast: "内容太长了" };
      try {
        await call("question.resolve", { id: q.record.id, answers: { answers: { [vx.SECRET_FIELD]: [secret] } }, resolvedBy: `vapp:${user.id}` });
      } catch (error) {
        // Never log the value; the error text comes from the Gateway.
        log(`vapp: credential ${q.record.id} not saved: ${String(error?.code ?? error?.message ?? "error")}`);
        return { ok: false, toast: "没有保存成功，请重试" };
      }
      questionDone(q.record.id, undefined, "saved");
      return { ok: true };
    }
    if (value.kind === "command") {
      const command = text(value.command).trim();
      if (!/^\/[a-z][\w-]{0,31}(?: [\w-]{1,48})?$/u.test(command)) return { ok: false, toast: "这个按钮已失效" };
      return { ok: true, ...(await send({ params: { text: command }, client, context })) };
    }
    if (value.kind !== "question") return { ok: false, toast: "不支持的按钮" };
    const q = questions.get(value.id);
    if (!q || q.turn.user.id !== user.id) return { ok: false, toast: "这个问题已经结束了" };
    if (q.state !== "pending") return { ok: false, toast: "这个问题已经结束了" };
    if (!value.submit) {
      const qi = Number(value.question);
      const oi = q.record.questions[qi]?.options.findIndex((o) => o.label === value.option) ?? -1;
      const staged = await asks.choose(q.record.id, user.id, qi, oi);
      if (staged.kind === "invalid") return { ok: false, toast: "这个选项已失效" };
      if (staged.kind === "closed") { questionDone(q.record.id, staged.entry.answers, staged.entry.state); return { ok: false, toast: "这个问题已经结束了" }; }
      const immediate = q.record.questions.length === 1 && !q.record.questions[0].multiSelect;
      if (!immediate) {
        q.staged = Object.fromEntries(Object.entries(staged.choices).map(([i, list]) => [i, list.map((j) => q.record.questions[i].options[j].label)]));
        paintQuestion(q);
        return { ok: true, staged: true };
      }
    }
    const result = await asks.confirm(q.record.id, user.id, `vapp:${user.id}`);
    if (result.kind === "incomplete") return { ok: false, toast: result.message };
    if (result.kind === "busy") return { ok: false, toast: "正在提交，请稍候" };
    if (result.kind === "answered") { questionDone(q.record.id, result.answers); return { ok: true, answered: true }; }
    questionDone(q.record.id, result.entry?.answers, result.entry?.state ?? "expired");
    return { ok: false, toast: "这个问题已经结束了" };
  }

  /** Outbound (message tool, cron, sessions_send results) to a vapp user. */
  function deliver({ to, text: body, media = [], card, reaction }) {
    const user = text(to).replace(/^vapp:/u, "").trim();
    if (!user) throw new Error("vapp target required");
    if (reaction) return react(user, { ...reaction, from: "v" });
    const { route: resolved } = route(getConfig(), { id: user });
    return sendMessage(user, { sessionKey: resolved.sessionKey, text: body, media, card });
  }

  return { hello, send, action, deliver, stop, history, userReact, runTurn, push, connections, questions };
}
