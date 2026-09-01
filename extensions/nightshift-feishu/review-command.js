const ACTIONS = new Set(["approve", "changes", "reject"]);

export function parseReviewArgs(args = "") {
  const [action, token, ...extra] = String(args).trim().split(/\s+/);
  if (!ACTIONS.has(action) || !/^[A-Za-z0-9_-]{24,128}$/.test(token ?? "") || extra.length > 0) {
    throw new Error("审核指令格式无效，请使用最新的 Night Shift 通知卡片");
  }
  return { action, token };
}

export function buildReviewOutcomeCard({ action, cardTitle, instanceId, instanceName }) {
  const approved = action === "approve";
  const rejected = action === "reject";
  const changes = action === "changes";
  if (!approved && !rejected && !changes) throw new Error("Unknown final review decision");
  const color = approved ? "green" : rejected ? "red" : "yellow";
  const status = approved ? "已通过" : rejected ? "已拒绝" : "已要求修改";
  const detail = approved
    ? "任务已通过审核，Workboard 状态已经同步。"
    : rejected
      ? "任务已被拒绝，Workboard 状态已经同步。"
      : "任务已退回修改，Workboard 状态已经同步。";
  return {
    schema: "2.0",
    config: {
      update_multi: true,
      width_mode: "default",
      summary: { content: `${status} · ${cardTitle}` },
    },
    header: {
      title: { tag: "plain_text", content: `${status} · ${instanceName}` },
      subtitle: { tag: "plain_text", content: cardTitle },
      template: color,
      icon: { tag: "standard_icon", token: "approval_colorful" },
      text_tag_list: [
        { tag: "text_tag", text: { tag: "plain_text", content: status }, color },
      ],
    },
    body: {
      direction: "vertical",
      padding: "12px 12px 20px 12px",
      vertical_spacing: "12px",
      elements: [
        {
          tag: "column_set",
          flex_mode: "none",
          columns: [
            {
              tag: "column",
              width: "weighted",
              weight: 1,
              background_style: `${color}-50`,
              padding: "12px",
              vertical_spacing: "4px",
              elements: [
                { tag: "markdown", content: `**<font color='${color}'>${status}</font>**` },
                { tag: "markdown", content: detail },
              ],
            },
          ],
        },
        {
          tag: "markdown",
          content: `<font color='grey'>Night Shift · ${escapeLarkMarkdown(instanceId)}</font>`,
          text_size: "notation",
        },
      ],
    },
  };
}

function escapeLarkMarkdown(value) {
  return String(value ?? "").replace(/[&<>*~_\[\]()#:]/g, (character) => `&#${character.codePointAt(0)};`);
}

export async function replaceReviewCard({ accountId, card, config, fetchImpl = fetch, messageId }) {
  if (!messageId) throw new Error("The original Feishu review message id is unavailable");
  const { appId, appSecret, baseUrl } = resolveFeishuCredentials(config, accountId);
  const tokenResponse = await fetchImpl(new URL("/open-apis/auth/v3/tenant_access_token/internal", baseUrl), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  });
  const tokenBody = await readFeishuResponse(tokenResponse, "Feishu authentication");
  if (!tokenBody.tenant_access_token) throw new Error("Feishu authentication returned no tenant access token");
  const updateResponse = await fetchImpl(new URL(`/open-apis/im/v1/messages/${encodeURIComponent(messageId)}`, baseUrl), {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${tokenBody.tenant_access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ content: JSON.stringify(card) }),
  });
  await readFeishuResponse(updateResponse, "Feishu review-card update");
  return { messageId };
}

function resolveFeishuCredentials(config, accountId) {
  const channel = config?.channels?.feishu;
  if (!channel || typeof channel !== "object") throw new Error("Feishu is not configured on this Gateway");
  const account = accountId && channel.accounts?.[accountId] && typeof channel.accounts[accountId] === "object"
    ? channel.accounts[accountId]
    : {};
  const appId = plainSecret(account.appId ?? channel.appId, "appId");
  const appSecret = plainSecret(account.appSecret ?? channel.appSecret, "appSecret");
  const domain = String(account.domain ?? channel.domain ?? "feishu").toLowerCase();
  return {
    appId,
    appSecret,
    baseUrl: domain === "lark" ? "https://open.larksuite.com" : "https://open.feishu.cn",
  };
}

function plainSecret(value, field) {
  if (typeof value === "string" && value.trim()) return value.trim();
  throw new Error(`Feishu ${field} must be available as a runtime string for review-card updates`);
}

async function readFeishuResponse(response, label) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok || (body.code != null && body.code !== 0)) {
    throw new Error(`${label} failed: ${body.msg ?? body.message ?? `HTTP ${response.status}`}`);
  }
  return body;
}
