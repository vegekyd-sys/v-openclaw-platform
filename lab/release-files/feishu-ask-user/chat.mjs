// Chat answers enter the same Gateway question as card callbacks. No model routing.
export function readFeishuAskChatAnswers(record, text, staged = {}) {
  const answer = text.trim();
  if (!answer || answer.length > 3000) throw new Error("回答为空或太长，请重新回复。");
  const valuesFor = (q, value) => {
    const option = (s) => {
      const exact = q.options.find(o => o.label === s);
      if (exact) return exact.label;
      const index = /^[1-4]$/.test(s) ? Number(s) - 1 : /^[A-Da-d]$/.test(s) ? s.toUpperCase().charCodeAt(0) - 65 : -1;
      return q.options[index]?.label;
    };
    const exact = option(value);
    if (exact) return [exact];
    if (q.multiSelect) {
      const parts = value.split(/[、，,；;\n]+/).map(s => s.trim()).filter(Boolean);
      const selected = parts.map(option);
      if (selected.length && selected.every(Boolean)) return [...new Set(selected)];
    }
    // A human can change their mind in chat even when the card has closed choices.
    // Preserve the complete text for the model rather than guessing an option.
    return [value];
  };
  const answers = Object.assign(Object.create(null), staged);
  const updated = [];
  if (record.questions.length === 1) {
    answers[record.questions[0].questionId] = valuesFor(record.questions[0], answer);
    updated.push(record.questions[0].questionId);
  } else {
    const numbered = [...answer.matchAll(/(?:^|\n)\s*([1-3])[.、．:)）]\s*([^\n]+)/g)];
    if (numbered.length) {
      if (numbered.length !== answer.split(/\n/).filter(s => s.trim()).length || new Set(numbered.map(m => m[1])).size !== numbered.length) throw new Error("请按问题编号逐行回复，或先回复当前未回答的问题。");
      for (const [, number, value] of numbered) {
        const q = record.questions[Number(number) - 1];
        if (!q || !value.trim()) throw new Error("问题编号或回答无效，请重新回复。");
        answers[q.questionId] = valuesFor(q, value.trim());
        updated.push(q.questionId);
      }
    } else if (!/^(确认|继续|就这些)$/.test(answer) || record.questions.some(q => !answers[q.questionId]?.length)) {
      const q = record.questions.find(q => !answers[q.questionId]?.length) ?? record.questions[0];
      answers[q.questionId] = valuesFor(q, answer);
      updated.push(q.questionId);
    }
  }
  return { answers, updated, remaining: record.questions.filter(q => !answers[q.questionId]?.length) };
}

export function createFeishuAskChatIngress({ questionRuntime, parse, handleMessage }) {
  return async (params) => {
    const { event, channelRuntime, cfg } = params;
    if (event.message.message_type !== "text" || params.turnAdoptionLifecycle?.abortSignal.aborted) return false;
    const ctx = parse(event, params.botOpenId, params.botName);
    const text = ctx.content?.trim();
    if (!text || ctx.senderType === "bot" || channelRuntime.commands.isControlCommandMessage(text, cfg)) return false;
    const questionId = questionRuntime.chatCandidate({
      accountId: params.accountId, chatId: ctx.chatId, senderOpenId: ctx.senderOpenId,
      messageId: ctx.messageId, parentId: ctx.parentId, timestamp: Number(event.message.create_time),
    });
    if (!questionId) return false;
    // Reuse the actual handler's sender/group/DM authorization and session routing.
    // Answer-only mode returns before model dispatch and cannot start another turn.
    return await handleMessage({ ...params, askUserAnswerOnly: true, askUserQuestionId: questionId }) === true;
  };
}
