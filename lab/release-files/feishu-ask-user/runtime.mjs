// Dependency injection keeps the exact inlined lifecycle testable without a live bot.
export function createFeishuAskRuntime(deps) {
  const deliveries = new Map();
  const streams = new Map();
  const streamKey = (sessionKey, accountId) => `${accountId ?? "default"}:${sessionKey}`;
  function bindStream(sessionKey, accountId, send) {
    if (!sessionKey) return () => {};
    const k = streamKey(sessionKey, accountId);
    const entries = streams.get(k) ?? new Set(); entries.add(send); streams.set(k, entries);
    return () => { entries.delete(send); if (!entries.size) streams.delete(k); };
  }
  const cardFor = (entry, state = entry.state, selections = {}) => buildFeishuAskCard(entry.record, state, selections, entry.answers);
  const update = (entry, card) => entry.updateCard ? entry.updateCard(card) : deps.patch({ ...entry.params, messageId: entry.messageId, card });
  async function respond(entry, type, content, card) {
    if (entry.updateCard && card) {
      // Feishu requires a callback acknowledgement within 3s. The answer RPC is
      // bounded; a separate CardKit write must not extend that deadline.
      Promise.resolve().then(() => update(entry, card)).catch(() => entry.params.log?.("feishu: inline question refresh failed"));
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
    const entry = { record, params, state: "pending", selections: new Map() };
    deliveries.set(k, entry);
    entry.promise = Promise.resolve().then(async () => {
      const card = buildFeishuAskCard(record);
      const candidates = streams.get(streamKey(record.sessionKey, params.accountId));
      const inlineSend = candidates?.size === 1 ? [...candidates][0] : undefined;
      const result = await inlineSend?.(card) ?? await deps.send({ ...params, card });
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
      if (entry.record.questions.length > 1 || question.multiSelect) {
        return respond(entry, "info", "已选择，选好后继续。", cardFor(entry, "pending", draft));
      }
    }
    let answers;
    try { answers = readFeishuAskAnswers(entry.record, { ...draft, ...submission.form }); }
    catch (error) { return reply("warning", error.message); }
    entry.submitting = true;
    entry.answers = answers;
    try {
      await deps.call("question.resolve", params.cfg, { id: submission.id, answers, resolvedBy: `feishu:${submission.operator}` });
      entry.state = "answered";
    } catch (error) {
      const reason = error?.details?.reason;
      if (reason === "QUESTION_ALREADY_TERMINAL" || reason === "QUESTION_NOT_FOUND") {
        // A different client may have answered; read the authoritative state.
        let state = "expired";
        try { const r = await deps.call("question.get", params.cfg, { id: submission.id }); if (["answered", "expired", "cancelled"].includes(r.question?.status)) state = r.question.status; } catch {}
        entry.state = state;
        return respond(entry, "info", "这个问题已经结束了。", cardFor(entry, state));
      }
      return reply("error", "提交失败，请稍后重试。");
    } finally { entry.submitting = false; }
    const card = cardFor(entry, "answered");
    try { return await respond(entry, "success", "已收到回答，V 会继续处理。", card); }
    catch { return reply("success", "回答已收到，卡片更新稍有延迟。"); }
  }
  return { requested, payload, submit, deliver, bindStream };
}
