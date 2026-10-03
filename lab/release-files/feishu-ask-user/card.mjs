// Inlined into the Feishu monitor. Keep this module dependency-free.
export const V_ASK_ACTION = "v.ask_user.submit";
export const V_ASK_CONFIRM_ACTION = "v.ask_user.confirm";
const vAskRecord = (v) => v && typeof v === "object" && !Array.isArray(v);
const vAskPlain = (content) => ({ tag: "plain_text", content });
const vAskEscape = (text) => String(text).replace(/[\\`*_~[\]()<>#|]/g, (c) => `\\${c}`);

export function isFeishuAskQuestion(record) {
  return /^ask_[a-f0-9]{32}$/.test(record?.id ?? "") &&
    Array.isArray(record.questions) && record.questions.length >= 1 && record.questions.length <= 3 &&
    record.questions.every((q) => !q.isSecret && !q.secretStore && typeof q.questionId === "string" &&
      typeof q.question === "string" && Array.isArray(q.options) && q.options.length <= 4 &&
      q.options.every((o) => typeof o.label === "string"));
}

export function buildFeishuAskCard(record, state = "pending", selections = {}, answers, chatAnswers = {}) {
  const elements = [];
  const fields = [];
  const immediate = record.questions.length === 1 && !record.questions[0].multiSelect;
  if (state !== "pending") {
    const summary = record.questions.map(q => (answers?.answers?.[q.questionId] ?? []).join("、")).filter(Boolean).join("；");
    const text = state === "answered" ? summary ? `✓ 已选择：${summary}` : "✓ 已收到回答" : state === "expired" ? "问题已过期" : "问题已取消";
    return { schema: "2.0", config: { update_multi: true, width_mode: "default" }, body: { elements: [{ tag: "markdown", content: `<font color='grey'>${vAskEscape(text)}</font>` }] } };
  }
  record.questions.forEach((q, i) => {
    elements.push({ tag: "markdown", content: `**${vAskEscape(q.question)}**${q.multiSelect ? "\n<font color='grey'>可多选，选好后确认</font>" : ""}` });
    if (chatAnswers[q.questionId]?.length) elements.push({ tag: "markdown", content: `<font color='grey'>已回答：${vAskEscape(chatAnswers[q.questionId].join("、"))}</font>` });
    q.options.forEach((o, j) => {
      const selected = (selections[`choice_${i}`] ?? []).includes(String(j));
      elements.push({ tag: "interactive_container", width: "fill", has_border: true,
        border_color: selected ? "blue-500" : "grey-200", background_style: selected ? "blue-50" : "default",
        corner_radius: "8px", padding: "12px 12px 12px 12px",
        behaviors: [{ type: "callback", value: { a: V_ASK_ACTION, q: record.id, qi: i, oi: j } }],
        elements: [{ tag: "markdown", content: `**${selected ? "✓ " : ""}${vAskEscape(o.label)}**` },
          ...(o.description ? [{ tag: "markdown", text_size: "notation", content: `<font color='grey'>${vAskEscape(o.description)}</font>` }] : [])] });
    });
    if (q.isOther || !q.options.length) fields.push({
      tag: "input", name: `other_${i}`, width: "fill", max_length: 1000,
      required: immediate || !q.options.length, placeholder: vAskPlain(`${record.questions.length > 1 ? `${q.header ?? `问题 ${i + 1}`}：` : ""}说说你的想法`),
    });
  });
  const submit = { tag: "button", name: `v_ask_submit_${record.id}`, text: vAskPlain(immediate ? "按这个想法继续" : "按这些选择继续"), type: "primary", form_action_type: "submit",
    behaviors: [{ type: "callback", value: { a: V_ASK_CONFIRM_ACTION, q: record.id } }] };
  if (fields.length || !immediate) {
    const custom = fields.length ? [{ tag: "collapsible_panel", expanded: record.questions.some(q => !q.options.length), header: { title: vAskPlain("我有其他想法"), width: "auto_when_fold" }, elements: [...fields, ...(immediate ? [submit] : [])] }] : [];
    elements.push({ tag: "form", name: "v_ask_form", elements: [...custom, ...(!immediate ? [submit] : [])] });
  }
  elements.push({ tag: "markdown", text_size: "notation", content: "<font color='grey'>也可以直接在聊天中回复答案</font>" });
  return { schema: "2.0", config: { update_multi: true, width_mode: "default" }, body: { padding: "12px 12px 12px 12px", vertical_spacing: "12px", elements } };
}

export function parseFeishuAskSubmission(data) {
  const event = vAskRecord(data?.event) ? data.event : data;
  const name = event?.action?.name;
  const value = event?.action?.value;
  const choice = value?.a === V_ASK_ACTION;
  const confirm = value?.a === V_ASK_CONFIRM_ACTION;
  if (!choice && !confirm && (typeof name !== "string" || !name.startsWith("v_ask_submit_"))) return;
  const id = choice || confirm ? value.q : name.slice("v_ask_submit_".length);
  const operator = event.operator?.open_id;
  const messageId = event.context?.open_message_id ?? event.open_message_id;
  if (!/^ask_[a-f0-9]{32}$/.test(id ?? "") || !/^ou_[A-Za-z0-9]+$/.test(operator ?? "") || typeof messageId !== "string" || !messageId) return { invalid: true };
  if (choice && (!Number.isInteger(value.qi) || !Number.isInteger(value.oi))) return { invalid: true };
  return { id, operator, messageId, ...(choice ? { choice: { questionIndex: value.qi, optionIndex: value.oi } } : {}), form: vAskRecord(event.action.form_value) ? event.action.form_value : {} };
}

export function readFeishuAskAnswers(record, form, chatAnswers = {}) {
  const answers = Object.create(null);
  for (const [i, q] of record.questions.entries()) {
    const raw = form[`choice_${i}`];
    const choices = raw == null || raw === "" ? [] : Array.isArray(raw) ? raw : [raw];
    if ((!q.multiSelect && choices.length > 1) || choices.some((v) => typeof v !== "string" || !/^[0-3]$/.test(v) || !q.options[Number(v)])) throw new Error("选项无效，请重新选择。");
    const custom = form[`other_${i}`];
    if (custom != null && (typeof custom !== "string" || custom.length > 1000)) throw new Error("自定义回答无效或太长。");
    const other = custom?.trim();
    if (other && !q.isOther && q.options.length) throw new Error("这个问题不支持自定义回答。");
    const selected = [...new Set(choices)].map((v) => q.options[Number(v)].label);
    const values = other ? q.multiSelect ? [...selected, other] : [other] : selected;
    if (!values.length && !chatAnswers[q.questionId]?.length) throw new Error(`请回答「${q.header ?? `问题 ${i + 1}`}」。`);
    answers[q.questionId] = values.length ? values : chatAnswers[q.questionId];
  }
  return { answers };
}
