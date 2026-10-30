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
const MAX_MEDIA_BYTES = 30 * 1024 * 1024;

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

/**
 * @param {object} deps
 * @param {object} deps.vx          the v-experience module
 * @param {() => object} deps.getConfig
 * @param {(method: string, params: object) => Promise<any>} deps.call   in-process Gateway call (question.get/resolve)
 * @param {object} deps.inbound     {resolveRoute, buildContext, dispatch, saveMedia, toMediaFacts}
 * @param {(msg: string) => void} [deps.log]
 */
export function createVapp({ vx, getConfig, call, inbound, log = () => {}, updateMs = UPDATE_MS }) {
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

  const requireUser = (client) => {
    const user = resolveUser(getConfig(), client);
    if (!user) throw Object.assign(new Error("这台设备还没有绑定 V 用户"), { code: "UNAVAILABLE" });
    return user;
  };

  // ------------------------------------------------------------------ turns

  function createTurn({ user, sessionKey }) {
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
    const emit = (card, { id = cardId(), final = false, removed = false } = {}) => {
      seq += 1;
      push(user.id, "card", { sessionKey, turnId, cardId: id, seq, final, ...(removed ? { removed: true } : { card }) });
    };
    const paint = () => {
      clearTimeout(timer);
      timer = undefined;
      if (finished) return;
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
        if (frozen.text) emit(vx.workCard({ answer: frozen.text, phase: "done" }), { id: frozen.id });
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
        if (!finalText && !failed) {
          // Nothing to say (NO_REPLY, or the message steered a running turn).
          if (shown) emit(null, { removed: true, final: true });
          return;
        }
        const id = cardId();
        const card = (background = "") => vx.workCard({ answer: finalText, phase: failed && !finalText ? "failed" : "done", background });
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

  const questionCardFor = (q) => vx.questionCard(q.record, { state: q.state, staged: q.staged, answers: q.answers });
  const paintQuestion = (q) => push(q.turn.user.id, "card", { sessionKey: q.turn.sessionKey, turnId: q.turn.turnId, cardId: `q:${q.record.id}`, seq: Date.now(), final: q.state !== "pending", card: questionCardFor(q) });

  const questionDone = (id, answers, state = "answered") => {
    const q = questions.get(id);
    if (!q || q.state !== "pending") return;
    q.state = state;
    q.answers = answers;
    vx.untrackChatQuestion(id);
    paintQuestion(q);
    if (state === "answered") q.turn.view.questionAnswered(answers);
    q.turn.resumeAfter(q.frozen);
  };

  async function deliverQuestion(turn, record) {
    if (!record?.id) return false;
    const secret = record.questions?.some((x) => x.isSecret || x.secretStore);
    if (!secret && !vx.isRenderableAsk(record)) return false;
    if (!vx.claimQuestionDelivery(record.id)) return true;
    if (secret) {
      // A one-time entry link in the asker's own chat, as in a Feishu DM.
      const how = await vx.deliverSecretQuestion({
        record, channel: CHANNEL_ID, askerId: turn.user.id, direct: true, markdown: true,
        sendHere: async (message, card) => {
          sendMessage(turn.user.id, { sessionKey: turn.sessionKey, ...(card ? { card: vx.linkVCard(card) } : { text: message }) });
        },
        cancel: () => call("question.resolve", { id: record.id, cancel: true, resolvedBy: "vapp:credential-unsupported" }),
        log,
      });
      log(`vapp: credential question ${record.id} ${how}`);
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
    const delivered = push(userId, "message", { id, sessionKey, at: Date.now(), ...(body ? { text: body } : {}), ...(media.length ? { media } : {}), ...(card ? { card } : {}) });
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
    return saved.length ? inbound.toMediaFacts(saved) : [];
  }

  /** One message from the app → one V turn, shown as cards. */
  async function runTurn(user, { body, media, messageId, cfg }) {
    const { route: resolved, buildEnvelope } = route(cfg, user);
    const sessionKey = resolved.sessionKey;
    const turn = createTurn({ user, sessionKey });
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
      message: { body: envelope, bodyForAgent: body, rawBody: body, commandBody: body },
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
        replyPipeline: {},
        record: { onRecordError: (error) => log(`vapp: session record failed: ${String(error?.message ?? error)}`) },
      });
    } catch (error) {
      failed = true;
      log(`vapp: dispatch for ${user.id} failed: ${String(error?.message ?? error)}`);
    } finally {
      unroute();
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
    const media = await inboundMedia(params?.media);
    if (!body && !media.length) throw Object.assign(new Error("消息是空的"), { code: "INVALID_REQUEST" });
    // The turn runs on; the app follows it through plugin.vapp.card events.
    void runTurn(user, { body, media, messageId, cfg }).catch((error) => log(`vapp: turn failed: ${String(error?.message ?? error)}`));
    const { route: resolved } = route(cfg, user);
    return { messageId, sessionKey: resolved.sessionKey };
  }

  async function action({ params, client, context }) {
    const user = requireUser(client);
    attach(user, client, context);
    const value = params?.value ?? {};
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
  function deliver({ to, text: body, media = [], card }) {
    const user = text(to).replace(/^vapp:/u, "").trim();
    if (!user) throw new Error("vapp target required");
    const { route: resolved } = route(getConfig(), { id: user });
    return sendMessage(user, { sessionKey: resolved.sessionKey, text: body, media, card });
  }

  return { hello, send, action, deliver, runTurn, push, connections, questions };
}
