// Feishu in-chat masked credential entry: card rendering and callback parsing.
//
// The OpenClaw `secrets` tool asks a human for a credential through a masked
// prompt. Upstream only renders that prompt as a Control UI link, which Feishu
// users cannot open without Gateway admin access, and which never reaches
// Feishu at all when the agent runs inside a V worker. This module renders the
// prompt as a Feishu card with a password input instead; the submitted value
// goes from the card callback straight to `question.resolve`, never through
// chat, the transcript, or the model.
//
// Pure functions only (no imports): `patch-feishu-secret-entry.mjs` inlines
// this file into the Feishu monitor bundle, so it must stay self-contained.

export const V_SECRET_ENTRY_CHANNEL_DATA_KEY = "vSecretEntry";
export const V_SECRET_ENTRY_ACTION = "v.secret_entry.submit";
export const V_SECRET_ENTRY_FIELD = "secret_value";
export const V_SECRET_ENTRY_MAX_VALUE_LENGTH = 16384;

const V_SECRET_ENTRY_QUESTION_ID_RE = /^ask_[a-f0-9]{32}$/;
const V_SECRET_ENTRY_NAME_RE = /^[A-Z][A-Z0-9_]{0,127}$/;
const V_SECRET_ENTRY_OPEN_ID_RE = /^ou_[A-Za-z0-9]{1,64}$/;

function vSecretEntryIsRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

// Card markdown renders `<at>`, links and emphasis; model-authored text must
// not be able to forge any of it.
function vSecretEntryEscapeMarkdown(text) {
  return String(text).replace(/[\\`*_~[\]()<>#|]/g, (char) => `\\${char}`);
}

/** Reads the secret-entry request an agent attached to a reply payload. */
export function readSecretEntryRequest(payload) {
  const raw = payload?.channelData?.[V_SECRET_ENTRY_CHANNEL_DATA_KEY];
  if (!vSecretEntryIsRecord(raw)) return undefined;
  if (typeof raw.questionId !== "string" || !V_SECRET_ENTRY_QUESTION_ID_RE.test(raw.questionId)) return undefined;
  if (typeof raw.name !== "string" || !V_SECRET_ENTRY_NAME_RE.test(raw.name)) return undefined;
  const reason = typeof raw.reason === "string" && raw.reason.trim() ? raw.reason.trim().slice(0, 200) : undefined;
  const allowedHosts = Array.isArray(raw.allowedHosts)
    ? raw.allowedHosts.filter((host) => typeof host === "string" && host && host.length <= 253).slice(0, 128)
    : [];
  const controlUiUrl = typeof raw.controlUiUrl === "string" && /^https:\/\//.test(raw.controlUiUrl) ? raw.controlUiUrl : undefined;
  return {
    questionId: raw.questionId,
    name: raw.name,
    ...(reason ? { reason } : {}),
    allowedHosts,
    ...(controlUiUrl ? { controlUiUrl } : {}),
  };
}

function vSecretEntryDetailsMarkdown(request) {
  const lines = [`**${vSecretEntryEscapeMarkdown(request.name)}**`];
  if (request.reason) lines.push(`用途：${vSecretEntryEscapeMarkdown(request.reason)}`);
  lines.push(
    request.allowedHosts.length > 0
      ? `只会发往：${request.allowedHosts.map((host) => vSecretEntryEscapeMarkdown(host)).join("、")}`
      : "只会发往：未限定域名",
  );
  return lines.join("\n");
}

function vSecretEntryNote(text) {
  return { tag: "markdown", content: `<font color='grey'>${text}</font>`, text_size: "notation" };
}

const V_SECRET_ENTRY_TERMINAL = {
  saved: { title: "凭据已保存", template: "green" },
  expired: { title: "凭据请求已过期", template: "grey" },
  cancelled: { title: "凭据请求已取消", template: "grey" },
};

/**
 * Builds the card for one state: "pending" (masked form), "saved", "expired"
 * or "cancelled". Terminal states drop the form so nothing stays submittable.
 */
export function buildSecretEntryCard(request, state = "pending", details = {}) {
  const pending = state === "pending";
  const terminal = V_SECRET_ENTRY_TERMINAL[state];
  if (!pending && !terminal) throw new Error(`unknown secret entry card state: ${state}`);
  const elements = [{ tag: "markdown", content: vSecretEntryDetailsMarkdown(request) }];

  if (pending) {
    elements.push({
      tag: "form",
      name: "v_secret_entry_form",
      elements: [
        {
          tag: "input",
          name: V_SECRET_ENTRY_FIELD,
          input_type: "password",
          required: true,
          max_length: 1000,
          width: "fill",
          placeholder: { tag: "plain_text", content: "粘贴密钥，提交后不会出现在聊天里" },
        },
        {
          tag: "button",
          name: "v_secret_entry_submit",
          text: { tag: "plain_text", content: "安全保存" },
          type: "primary",
          width: "fill",
          form_action_type: "submit",
          behaviors: [
            {
              type: "callback",
              value: { a: V_SECRET_ENTRY_ACTION, q: request.questionId, n: request.name },
            },
          ],
        },
      ],
    });
    elements.push(
      vSecretEntryNote("🔒 值直接存进 V 的凭据库，不进聊天记录，也不经过模型。请不要在聊天里直接发送密钥。"),
    );
    if (request.controlUiUrl) {
      elements.push(vSecretEntryNote(`也可以在 [Control UI](${request.controlUiUrl}) 里录入。`));
    }
  } else if (state === "saved") {
    const by =
      typeof details.operatorOpenId === "string" && V_SECRET_ENTRY_OPEN_ID_RE.test(details.operatorOpenId)
        ? `<at id=${details.operatorOpenId}></at> `
        : "";
    elements.push({ tag: "markdown", content: `✅ 已由 ${by}安全保存，V 会继续刚才的任务。` });
  } else if (state === "expired") {
    elements.push({ tag: "markdown", content: "没有在时限内录入，V 已跳过这一步。还需要的话，让 V 重新发起。" });
  } else {
    elements.push({ tag: "markdown", content: "这次请求已取消，没有保存任何值。" });
  }

  return {
    schema: "2.0",
    config: { update_multi: true, width_mode: "fill" },
    header: {
      title: { tag: "plain_text", content: pending ? "V 需要一个凭据" : terminal.title },
      template: pending ? "blue" : terminal.template,
    },
    body: { elements },
  };
}

/** Maps the Gateway's terminal status line ("Answered", "Expired", ...) to a card state. */
export function secretEntryStateFromStatusLine(statusLine) {
  const text = String(statusLine ?? "").toLowerCase();
  if (text.startsWith("expired")) return "expired";
  if (text.startsWith("cancelled")) return "cancelled";
  if (text.startsWith("answered")) return "saved";
  return undefined;
}

/**
 * Recognises a secret-entry form submission in a raw `card.action.trigger`
 * payload. Returns undefined for every other card action so the stock handler
 * keeps them. The secret value is returned but never logged by callers.
 */
export function parseSecretEntrySubmission(data) {
  if (!vSecretEntryIsRecord(data)) return undefined;
  const event = vSecretEntryIsRecord(data.event) ? data.event : data;
  const action = vSecretEntryIsRecord(event.action) ? event.action : undefined;
  const value = vSecretEntryIsRecord(action?.value) ? action.value : undefined;
  if (value?.a !== V_SECRET_ENTRY_ACTION) return undefined;
  const invalid = (reason) => ({ kind: "invalid", reason });
  if (typeof value.q !== "string" || !V_SECRET_ENTRY_QUESTION_ID_RE.test(value.q)) return invalid("malformed");
  if (typeof value.n !== "string" || !V_SECRET_ENTRY_NAME_RE.test(value.n)) return invalid("malformed");
  const operator = vSecretEntryIsRecord(event.operator) ? event.operator : {};
  const operatorOpenId = typeof operator.open_id === "string" ? operator.open_id : undefined;
  const context = vSecretEntryIsRecord(event.context) ? event.context : {};
  const messageId =
    typeof context.open_message_id === "string"
      ? context.open_message_id
      : typeof event.open_message_id === "string"
        ? event.open_message_id
        : undefined;
  const token = typeof event.token === "string" ? event.token : undefined;
  const formValue = vSecretEntryIsRecord(action.form_value) ? action.form_value : {};
  const secret = typeof formValue[V_SECRET_ENTRY_FIELD] === "string" ? formValue[V_SECRET_ENTRY_FIELD] : "";
  const base = { questionId: value.q, name: value.n, operatorOpenId, messageId, token };
  if (!secret.trim()) return { kind: "empty", ...base };
  if (secret.length > V_SECRET_ENTRY_MAX_VALUE_LENGTH) return { kind: "too-long", ...base };
  return { kind: "submit", ...base, secret };
}

/** Callback response: a toast plus, when given, the replacement card. */
export function secretEntryCallbackResponse(type, content, card) {
  return {
    toast: { type, content },
    ...(card ? { card: { type: "raw", data: card } } : {}),
  };
}
