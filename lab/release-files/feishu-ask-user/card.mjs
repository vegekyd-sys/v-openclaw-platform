// Inlined into the Feishu monitor. Keep this module dependency-free.
export const V_ASK_ACTION = "v.ask_user.submit";
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

export function buildFeishuAskCard(record, state = "pending", selections = {}) {
  const titles = { pending: "V 需要你的选择", answered: "已收到回答", expired: "问题已过期", cancelled: "问题已取消" };
  const elements = [];
  const fields = [];
  const immediate = record.questions.length === 1 && !record.questions[0].multiSelect;
  record.questions.forEach((q, i) => {
    elements.push({ tag: "markdown", content: `${record.questions.length > 1 ? `**${vAskEscape(q.header ?? `问题 ${i + 1}`)}**\n` : ""}${vAskEscape(q.question)}${q.multiSelect ? "（可多选）" : ""}` });
    if (state !== "pending") return;
    q.options.forEach((o, j) => {
      const selected = (selections[`choice_${i}`] ?? []).includes(String(j));
      elements.push({ tag: "button", name: `v_ask_choice_${i}_${j}`, text: vAskPlain(`${selected ? "✓ " : ""}${o.label}`),
        type: selected ? "primary" : "default", width: "fill",
        behaviors: [{ type: "callback", value: { a: V_ASK_ACTION, q: record.id, qi: i, oi: j } }] });
      if (o.description) elements.push({ tag: "markdown", text_size: "notation", content: `<font color='grey'>${vAskEscape(o.description)}</font>` });
    });
    if (q.isOther || !q.options.length) fields.push({
      tag: "input", name: `other_${i}`, width: "fill", max_length: 1000,
      required: immediate || !q.options.length, placeholder: vAskPlain(`${record.questions.length > 1 ? `${q.header}：` : ""}或输入其他回答`),
    });
  });
  if (state === "pending" && (fields.length || !immediate)) {
    fields.push({ tag: "button", name: `v_ask_submit_${record.id}`, text: vAskPlain(immediate ? "提交其他回答" : "确认选择"), type: immediate ? "default" : "primary", width: "fill",
      form_action_type: "submit" });
    elements.push({ tag: "form", name: "v_ask_form", elements: fields });
  }
  if (state !== "pending") elements.push({ tag: "markdown", content: state === "answered" ? "✅ 已提交，V 会继续当前任务。" : "这个问题已结束，需要时请让 V 重新提问。" });
  return { schema: "2.0", config: { update_multi: true, width_mode: "default" },
    header: { title: vAskPlain(titles[state]), template: state === "pending" ? "blue" : state === "answered" ? "green" : "grey" }, body: { elements } };
}

export function parseFeishuAskSubmission(data) {
  const event = vAskRecord(data?.event) ? data.event : data;
  const name = event?.action?.name;
  const value = event?.action?.value;
  const choice = value?.a === V_ASK_ACTION;
  if (!choice && (typeof name !== "string" || !name.startsWith("v_ask_submit_"))) return;
  const id = choice ? value.q : name.slice("v_ask_submit_".length);
  const operator = event.operator?.open_id;
  const messageId = event.context?.open_message_id ?? event.open_message_id;
  if (!/^ask_[a-f0-9]{32}$/.test(id ?? "") || !/^ou_[A-Za-z0-9]+$/.test(operator ?? "") || typeof messageId !== "string" || !messageId) return { invalid: true };
  if (choice && (!Number.isInteger(value.qi) || !Number.isInteger(value.oi))) return { invalid: true };
  return { id, operator, messageId, ...(choice ? { choice: { questionIndex: value.qi, optionIndex: value.oi } } : {}), form: vAskRecord(event.action.form_value) ? event.action.form_value : {} };
}

export function readFeishuAskAnswers(record, form) {
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
    if (!values.length) throw new Error(`请回答「${q.header ?? `问题 ${i + 1}`}」。`);
    answers[q.questionId] = values;
  }
  return { answers };
}
