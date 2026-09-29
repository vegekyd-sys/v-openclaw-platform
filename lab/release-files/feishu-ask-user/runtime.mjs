// Dependency injection keeps the exact inlined lifecycle testable without a live bot.
export function createFeishuAskRuntime(deps) {
  const deliveries = new Map();
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
      const result = await deps.send({ ...params, card: buildFeishuAskCard(record) });
      if (!result?.messageId) throw new Error("ask_user card delivery returned no message id");
      entry.messageId = result.messageId;
      deps.register({ questionId: record.id, deliveryId: `feishu:${k}:${result.messageId}`, finalize: async (status) => {
        entry.state = terminal(status);
        await deps.patch({ ...params, messageId: entry.messageId, card: buildFeishuAskCard(record, entry.state) });
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
    if (entry.state !== "pending") return reply("info", "这个问题已经结束了。", buildFeishuAskCard(entry.record, entry.state));
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
        return reply("info", "已选择，完成后点击确认选择。", buildFeishuAskCard(entry.record, "pending", draft));
      }
    }
    let answers;
    try { answers = readFeishuAskAnswers(entry.record, { ...draft, ...submission.form }); }
    catch (error) { return reply("warning", error.message); }
    entry.submitting = true;
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
        return reply("info", "这个问题已经结束了。", buildFeishuAskCard(entry.record, state));
      }
      return reply("error", "提交失败，请稍后重试。");
    } finally { entry.submitting = false; }
    const card = buildFeishuAskCard(entry.record, "answered");
    return reply("success", "已收到回答，V 会继续处理。", card);
  }
  return { requested, payload, submit, deliver };
}
