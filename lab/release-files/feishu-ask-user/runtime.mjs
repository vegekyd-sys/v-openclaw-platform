// Dependency injection keeps the exact inlined lifecycle testable without a live bot.
export function createFeishuAskRuntime(deps) {
  const deliveries = new Map();
  const streams = new Map();
  const streamKey = (sessionKey, accountId) => `${accountId ?? "default"}:${sessionKey}`;
  function bindStream(sessionKey, accountId, send, isActive = () => true, origin) {
    if (!sessionKey) return () => {};
    const k = streamKey(sessionKey, accountId);
    const entry = { send, isActive, origin };
    const entries = streams.get(k) ?? new Set(); entries.add(entry); streams.set(k, entries);
    return () => { entries.delete(entry); if (!entries.size) streams.delete(k); };
  }
  const cardFor = (entry, state = entry.state, selections = {}, chatAnswers = {}) => buildFeishuAskCard(entry.record, state, selections, entry.answers, chatAnswers);
  const update = (entry, card) => {
    const task = (entry.paintQueue ?? Promise.resolve()).then(() => entry.updateCard ? entry.updateCard(card) : deps.patch({ ...entry.params, messageId: entry.messageId, card }));
    entry.paintQueue = task.catch(() => {});
    return task;
  };
  async function respond(entry, type, content, card) {
    if (card) {
      // Feishu requires a callback acknowledgement within 3s. The answer RPC is
      // bounded; a separate CardKit write must not extend that deadline.
      update(entry, card).catch(() => entry.params.log?.("feishu: question refresh failed"));
      return reply(type, content);
    }
    return reply(type, content, card);
  }
  const reply = (type, content, card) => ({ toast: { type, content }, ...(card ? { card: { type: "raw", data: card } } : {}) });
  const terminal = (s) => s.startsWith("Answered") ? "answered" : s.startsWith("Expired") ? "expired" : "cancelled";
  const key = (id, accountId) => `${accountId ?? "default"}:${id}`;
  async function deliver(record, params) {
    if (!isFeishuAskQuestion(record) || record.status !== "pending") return;
    const k = key(record.id, params.accountId);
    if (deliveries.has(k)) return deliveries.get(k).promise;
    const entry = { record, params, state: "pending", selections: new Map(), chatAnswers: new Map(), chatResponses: new Map(), createdAtMs: record.createdAtMs ?? Date.now() };
    deliveries.set(k, entry);
    entry.promise = Promise.resolve().then(async () => {
      const card = buildFeishuAskCard(record);
      const registered = streams.get(streamKey(record.sessionKey, params.accountId));
      const candidates = [...(registered ?? [])].filter(entry => entry.isActive());
      const owners = [...(registered ?? [])].filter(entry => entry.origin?.isActive?.() ?? entry.isActive());
      if (owners.length === 1 && owners[0].origin) entry.origin = { ...owners[0].origin };
      const inlineSend = candidates.length === 1 ? candidates[0].send : undefined;
      const result = await inlineSend?.(card) ?? await deps.send({ ...params, card });
      params.log?.(`feishu: ask_user delivery id=${record.id} registered=${registered?.size ?? 0} active=${candidates.length} inline=${Boolean(result?.updateCard)}`);
      entry.updateCard = result?.updateCard;
      if (!result?.messageId) throw new Error("ask_user card delivery returned no message id");
      entry.messageId = result.messageId;
      deps.register({ questionId: record.id, deliveryId: `feishu:${k}:${result.messageId}`, finalize: async (status) => {
        entry.state = terminal(status);
        await update(entry, cardFor(entry));
      } });
      const timer = setTimeout(() => deliveries.delete(k), Math.max(0, (record.expiresAtMs ?? Date.now()) - Date.now()) + 3600000);
      timer.unref?.();
      return result;
    }).catch((error) => { deliveries.delete(k); throw error; });
    return entry.promise;
  }
  async function requested(record, params) {
    if (!isFeishuAskQuestion(record) || record.status !== "pending") return;
    const route = deps.route(record, params.cfg, params.accountId);
    if (!route) return;
    try { await deliver(record, { ...params, ...route, allowTopLevelReplyFallback: true }); }
    catch (error) {
      // Never leave an invisible question blocking a worker for 15 minutes.
      params.log?.(`feishu[${params.accountId}]: ask_user delivery failed id=${record.id}`);
      await deps.call("question.resolve", params.cfg, { id: record.id, cancel: true, resolvedBy: "feishu:prompt-delivery-failed" });
    }
  }
  async function payload(input, params) {
    const id = input?.channelData?.askUser?.questionId;
    if (!id || input?.channelData?.vSecretEntry) return;
    const { question } = await deps.call("question.get", params.cfg, { id });
    if (!isFeishuAskQuestion(question)) return;
    const entry = deliveries.get(key(id, params.accountId));
    if (entry) return await entry.promise;
    if (question.status !== "pending") return { messageId: undefined }; // already closed; don't re-send stale controls
    return await deliver(question, params);
  }
  function matchingChatEntries(input) {
    return [...deliveries.values()].filter(entry => {
      if (!entry.chatResponses.has(input.messageId) && (entry.state !== "pending" || (entry.record.expiresAtMs ?? Infinity) <= Date.now())) return false;
      if ((entry.params.accountId ?? "default") !== (input.accountId ?? "default")) return false;
      const chat = entry.origin?.chatId ?? entry.params.to?.replace(/^(?:feishu:|lark:)?(?:chat:|user:)?/, "");
      if (chat !== input.chatId || !input.senderOpenId || !input.messageId) return false;
      if (!Number.isFinite(input.timestamp) || input.timestamp < entry.createdAtMs) return false;
      // Without an originating sender, require an explicit reply to this card.
      if (entry.origin?.senderOpenId ? entry.origin.senderOpenId !== input.senderOpenId : input.parentId !== entry.messageId) return false;
      return !input.sessionKey || input.sessionKey === entry.record.sessionKey || input.parentId === entry.messageId;
    });
  }
  function chatCandidate(input) {
    const entries = matchingChatEntries(input);
    const quoted = entries.filter(entry => entry.messageId === input.parentId);
    const matches = quoted.length ? quoted : entries;
    return matches.length === 1 ? matches[0].record.id : undefined;
  }
  async function resolveAnswer(entry, answers, resolvedBy, cfg = entry.params.cfg) {
    entry.submitting = true;
    entry.answers = answers;
    try {
      await deps.call("question.resolve", cfg, { id: entry.record.id, answers, resolvedBy });
      entry.state = "answered";
      return "answered";
    } catch (error) {
      const reason = error?.details?.reason;
      if (reason !== "QUESTION_ALREADY_TERMINAL" && reason !== "QUESTION_NOT_FOUND") throw error;
      let state = "expired";
      try {
        const r = await deps.call("question.get", cfg, { id: entry.record.id });
        if (["answered", "expired", "cancelled"].includes(r.question?.status)) state = r.question.status;
        if (r.question?.answers) entry.answers = r.question.answers;
      } catch {}
      entry.state = state;
      return "terminal";
    } finally { entry.submitting = false; }
  }
  async function answerFromChat(input, params) {
    const entry = matchingChatEntries({ ...input, accountId: params.accountId }).find(entry => entry.record.id === input.id);
    if (!entry) return { handled: false };
    const respond = (outcome) => { entry.chatResponses.set(input.messageId, outcome); return outcome; };
    if (entry.chatResponses.has(input.messageId)) return entry.chatResponses.get(input.messageId);
    if (entry.submitting) return respond({ handled: true, notice: "正在提交当前问题的回答，请稍候。" });
    const staged = { ...entry.chatAnswers.get(input.senderOpenId) };
    const choices = entry.selections.get(input.senderOpenId) ?? {};
    for (const q of entry.record.questions) {
      try { Object.assign(staged, readFeishuAskAnswers({ questions: [q] }, { choice_0: choices[`choice_${entry.record.questions.indexOf(q)}`] }).answers); } catch {}
    }
    let result;
    try { result = readFeishuAskChatAnswers(entry.record, input.text, staged); }
    catch (error) { return respond({ handled: true, notice: error.message }); }
    for (const id of result.updated) delete choices[`choice_${entry.record.questions.findIndex(q => q.questionId === id)}`];
    if (result.remaining.length) {
      entry.chatAnswers.set(input.senderOpenId, result.answers);
      update(entry, cardFor(entry, "pending", choices, result.answers)).catch(() => entry.params.log?.("feishu: question refresh failed"));
      return respond({ handled: true, notice: `已记下回答。请继续回复「${result.remaining[0].question}」，也可以在卡片里选择。` });
    }
    try {
      const state = await resolveAnswer(entry, { answers: result.answers }, `feishu:chat:${input.senderOpenId}:${input.messageId}`, params.cfg);
      update(entry, cardFor(entry)).catch(() => entry.params.log?.("feishu: question refresh failed"));
      params.log?.(`feishu: ask_user chat answer id=${entry.record.id} message=${input.messageId} state=${state}`);
      return respond({ handled: true, ...(state === "terminal" ? { notice: "这个问题已经结束了。" } : {}) });
    } catch {
      return respond({ handled: true, notice: "回答提交失败，请再回复一次，或使用卡片重试。" });
    }
  }
  async function submit(data, params) {
    const submission = parseFeishuAskSubmission(data);
    if (!submission) return;
    if (submission.invalid) return reply("error", "这张卡片无效，请让 V 重新提问。");
    const entry = deliveries.get(key(submission.id, params.accountId));
    if (!entry || submission.messageId !== entry.messageId) return reply("error", "这张卡片已失效，请让 V 重新提问。");
    if (entry.state !== "pending") return respond(entry, "info", "这个问题已经结束了。", cardFor(entry));
    if (entry.submitting) return reply("info", "正在提交，请稍候。");
    const draft = { ...entry.selections.get(submission.operator) };
    if (submission.choice) {
      const { questionIndex: i, optionIndex: j } = submission.choice;
      const question = entry.record.questions[i];
      if (i < 0 || j < 0 || !question?.options[j]) return reply("error", "选项无效，请重新选择。");
      const field = `choice_${i}`;
      const existing = draft[field] ?? [];
      draft[field] = question.multiSelect ? existing.includes(String(j)) ? existing.filter(v => v !== String(j)) : [...existing, String(j)] : [String(j)];
      entry.selections.set(submission.operator, draft);
      const chatAnswers = { ...entry.chatAnswers.get(submission.operator) };
      delete chatAnswers[question.questionId];
      entry.chatAnswers.set(submission.operator, chatAnswers);
      if (entry.record.questions.length > 1 || question.multiSelect) {
        return respond(entry, "info", "已选择，选好后继续。", cardFor(entry, "pending", draft, chatAnswers));
      }
    }
    let answers;
    try { answers = readFeishuAskAnswers(entry.record, { ...draft, ...submission.form }, entry.chatAnswers.get(submission.operator)); }
    catch (error) { return reply("warning", error.message); }
    try {
      const state = await resolveAnswer(entry, answers, `feishu:${submission.operator}`, params.cfg);
      if (state === "terminal") return respond(entry, "info", "这个问题已经结束了。", cardFor(entry));
    } catch (error) {
      return reply("error", "提交失败，请稍后重试。");
    }
    const card = cardFor(entry, "answered");
    try { return await respond(entry, "success", "已收到回答，V 会继续处理。", card); }
    catch { return reply("success", "回答已收到，卡片更新稍有延迟。"); }
  }
  return { requested, payload, submit, deliver, bindStream, chatCandidate, answerFromChat };
}
