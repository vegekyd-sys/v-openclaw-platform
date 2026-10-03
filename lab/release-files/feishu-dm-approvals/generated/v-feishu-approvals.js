// v-feishu-dm-approvals-v1
// Feishu owner-DM native approvals. Generated into the Feishu plugin dist as
// v-feishu-approvals.js; patch.mjs fills the chunk imports for the live baseline.
import { createApproverRestrictedNativeApprovalCapability } from "openclaw/plugin-sdk/approval-delivery-runtime";
import { CHANNEL_APPROVAL_NATIVE_RUNTIME_CONTEXT_CAPABILITY, createLazyChannelApprovalNativeRuntimeAdapter } from "openclaw/plugin-sdk/approval-handler-adapter-runtime";
import { createChannelApprovalNativeRuntimeAdapter } from "openclaw/plugin-sdk/approval-handler-runtime";
import { buildChannelApprovalNativeTargetKey, createChannelApproverDmTargetResolver, createChannelNativeOriginTargetResolver, doesApprovalRequestSelectChannelAccount } from "openclaw/plugin-sdk/approval-native-runtime";
import { createChannelExecApprovalProfile } from "openclaw/plugin-sdk/approval-client-runtime";
import { resolveApprovalOverGateway } from "openclaw/plugin-sdk/approval-gateway-runtime";
import { isApprovalNotFoundError } from "openclaw/plugin-sdk/error-runtime";
import { registerChannelRuntimeContext } from "openclaw/plugin-sdk/channel-runtime-context";
import { resolveGatewayPublicOrigin } from "openclaw/plugin-sdk/config-contracts";
import { getRuntimeConfig } from "openclaw/plugin-sdk/runtime-config-snapshot";
import { a as vFaResolveDefaultFeishuAccountId, i as vFaListFeishuAccountIds, o as vFaResolveFeishuAccount } from "./accounts-RwSyseKr.js";
import { E as vFaSendCardFeishu, C as vFaEditMessageFeishu } from "./reply-delivery-result-CEFTDA3f.js";

// Feishu owner-DM approvals: cards, callback parsing and the click handler.
// Inlined into the generated v-feishu-approvals module. Keep it dependency-free.

const V_FEISHU_APPROVAL_ACTION = "v_feishu_approval";
const V_FEISHU_APPROVAL_CALLBACK_WAIT_MS = 2200;
const V_FEISHU_APPROVAL_OPEN_ID_RE = /^ou_[0-9a-z]+$/;
const V_FEISHU_APPROVAL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/;
const V_FEISHU_APPROVAL_KINDS = new Set(["exec", "plugin", "system-agent"]);
const V_FEISHU_APPROVAL_DECISIONS = new Set(["allow-once", "allow-always", "deny"]);

const V_FEISHU_APPROVAL_KIND_LABEL = {
  exec: "执行命令",
  plugin: "插件操作",
  "system-agent": "OpenClaw 改动",
};
const V_FEISHU_APPROVAL_DECISION_LABEL = {
  "allow-once": "批准",
  "allow-always": "总是允许",
  deny: "拒绝",
};

function vFaIsRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
function vFaText(value) {
  return typeof value === "string" ? value.trim() : "";
}
function vFaClip(text, max) {
  const value = String(text ?? "");
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}
/** Escape characters that Feishu card markdown would otherwise interpret. */
function vFaEscape(text) {
  return String(text ?? "").replace(/[\\`*_~<>\[\]()#|]/g, (c) => `\\${c}`);
}
function vFaCodeBlock(text) {
  return "```\n" + vFaClip(String(text ?? "").replace(/```/g, "ʼʼʼ"), 1200) + "\n```";
}

/**
 * Feishu approvers are the Feishu entries of `commands.ownerAllowFrom`
 * ("feishu:ou_..."). open_ids are app-scoped, so each instance lists its own.
 */
function resolveFeishuOwnerApprovers(cfg) {
  const owners = Array.isArray(cfg?.commands?.ownerAllowFrom) ? cfg.commands.ownerAllowFrom : [];
  const approvers = [];
  for (const entry of owners) {
    const match = /^(?:feishu|lark):(?:user:|open_id:)?(ou_[0-9a-z]+)$/i.exec(String(entry ?? "").trim());
    const id = match?.[1]?.toLowerCase();
    if (id && !approvers.includes(id)) approvers.push(id);
  }
  return approvers;
}
function normalizeFeishuApprovalSender(value) {
  const id = vFaText(value).replace(/^(?:feishu|lark):/i, "").replace(/^(?:user|open_id):/i, "").toLowerCase();
  return V_FEISHU_APPROVAL_OPEN_ID_RE.test(id) ? id : undefined;
}

function buildFeishuApprovalCallbackValue({ approvalId, approvalKind, decision }) {
  return { a: V_FEISHU_APPROVAL_ACTION, id: approvalId, k: approvalKind, d: decision };
}

/**
 * Recognises an approval button click in a raw `card.action.trigger` payload.
 * Returns undefined for every other card action so existing handlers keep them.
 */
function parseFeishuApprovalCallback(data) {
  if (!vFaIsRecord(data)) return undefined;
  const event = vFaIsRecord(data.event) ? data.event : data;
  const action = vFaIsRecord(event.action) ? event.action : undefined;
  let value = action?.value;
  if (typeof value === "string") {
    try { value = JSON.parse(value); } catch { return undefined; }
  }
  if (!vFaIsRecord(value) || value.a !== V_FEISHU_APPROVAL_ACTION) return undefined;
  const operator = vFaIsRecord(event.operator) ? event.operator : {};
  const context = vFaIsRecord(event.context) ? event.context : {};
  const messageId = vFaText(context.open_message_id) || vFaText(event.open_message_id) || undefined;
  const senderId = normalizeFeishuApprovalSender(operator.open_id);
  const valid =
    typeof value.id === "string" && V_FEISHU_APPROVAL_ID_RE.test(value.id) &&
    V_FEISHU_APPROVAL_KINDS.has(value.k) && V_FEISHU_APPROVAL_DECISIONS.has(value.d);
  if (!valid) return { kind: "invalid", senderId, messageId };
  return { kind: "decision", approvalId: value.id, approvalKind: value.k, decision: value.d, senderId, messageId };
}

function vFaSourceLabel(request) {
  const req = vFaIsRecord(request?.request) ? request.request : {};
  const channel = vFaText(req.turnSourceChannel).toLowerCase();
  const sessionKey = vFaText(req.sessionKey);
  const where = sessionKey.includes(":group:") ? "群聊" : sessionKey.includes(":direct:") ? "私聊" : "";
  const channelLabel = channel === "feishu" ? "飞书" : channel === "telegram" ? "Telegram" : channel || "";
  return [channelLabel, where].filter(Boolean).join("") || undefined;
}

function vFaExpiresText(expiresAtMs, nowMs) {
  if (!Number.isFinite(expiresAtMs)) return undefined;
  const minutes = Math.max(0, Math.round((expiresAtMs - nowMs) / 60000));
  return minutes <= 1 ? "1 分钟内有效" : `${minutes} 分钟内有效`;
}

function vFaSubjectMarkdown(view) {
  if (view.approvalKind === "exec") {
    const lines = [vFaCodeBlock(view.commandPreview || view.commandText)];
    if (vFaText(view.cwd)) lines.push(`目录：${vFaEscape(view.cwd)}`);
    if (vFaText(view.warningText)) lines.push(`⚠️ ${vFaEscape(vFaClip(view.warningText, 400))}`);
    return lines.join("\n");
  }
  if (view.approvalKind === "system-agent") {
    return vFaEscape(vFaClip(view.operationSummary || view.commandText || view.title, 1200));
  }
  const parts = [`**${vFaEscape(vFaClip(view.title, 200))}**`];
  if (vFaText(view.description)) parts.push(vFaEscape(vFaClip(view.description, 1000)));
  if (vFaText(view.toolName)) parts.push(`工具：${vFaEscape(view.toolName)}`);
  return parts.join("\n");
}

function vFaNote(content) {
  return { tag: "markdown", content: `<font color='grey'>${content}</font>`, text_size: "notation" };
}

function vFaMetaLine(view, request, nowMs) {
  const parts = [];
  if (vFaText(view.agentId)) parts.push(`agent：${vFaEscape(view.agentId)}`);
  const source = vFaSourceLabel(request);
  if (source) parts.push(`来自${source}`);
  if (nowMs !== undefined) {
    const expires = vFaExpiresText(view.expiresAtMs ?? request?.expiresAtMs, nowMs);
    if (expires) parts.push(expires);
  }
  return parts.join(" · ");
}

function vFaCard({ title, template, elements }) {
  return {
    schema: "2.0",
    config: { update_multi: true, width_mode: "fill" },
    header: { title: { tag: "plain_text", content: title }, template },
    body: { elements },
  };
}

function vFaButton(action) {
  const decision = action.decision;
  const label = V_FEISHU_APPROVAL_DECISION_LABEL[decision] || vFaText(action.label) || decision;
  const type = decision === "deny" ? "danger" : decision === "allow-once" ? "primary_filled" : "default";
  return {
    tag: "button",
    text: { tag: "plain_text", content: label },
    type,
    size: "medium",
    behaviors: [{ type: "callback", value: buildFeishuApprovalCallbackValue(action.action) }],
  };
}

/** Pending card: what is being approved, who asked, and decision buttons. */
function buildFeishuApprovalPendingCard({ request, view, nowMs, reviewUrl }) {
  const kindLabel = V_FEISHU_APPROVAL_KIND_LABEL[view.approvalKind] ?? "操作";
  const elements = [{ tag: "markdown", content: vFaSubjectMarkdown(view) }];
  const meta = vFaMetaLine(view, request, nowMs);
  if (meta) elements.push(vFaNote(meta));
  const buttons = (Array.isArray(view.actions) ? view.actions : [])
    .filter((action) => action?.action?.type === "approval" && action.action.approvalId &&
      V_FEISHU_APPROVAL_KINDS.has(action.action.approvalKind) && V_FEISHU_APPROVAL_DECISIONS.has(action.action.decision))
    .map(vFaButton);
  if (buttons.length > 0) {
    elements.push({
      tag: "column_set",
      flex_mode: "flow",
      horizontal_spacing: "8px",
      columns: buttons.map((button) => ({ tag: "column", width: "auto", elements: [button] })),
    });
  }
  if (reviewUrl) elements.push(vFaNote(`也可以在 [Control UI](${reviewUrl}) 里审批。`));
  return vFaCard({ title: `需要你审批：${kindLabel}`, template: "blue", elements });
}

function vFaResolvedBy(resolvedBy) {
  const by = vFaText(resolvedBy);
  if (!by) return "";
  const openId = normalizeFeishuApprovalSender(by) ?? /(ou_[0-9a-z]+)/.exec(by)?.[1];
  return openId ? `<at id=${openId}></at> ` : `${vFaEscape(vFaClip(by, 80))} `;
}

/** Terminal card for resolved, expired or cancelled approvals: no buttons left. */
function buildFeishuApprovalTerminalCard({ request, view }) {
  const kindLabel = V_FEISHU_APPROVAL_KIND_LABEL[view.approvalKind] ?? "操作";
  const elements = [{ tag: "markdown", content: vFaSubjectMarkdown(view) }];
  let title;
  let template = "grey";
  let status;
  // Exec/plugin timeouts arrive as a resolved deny with no reviewer; a human deny always has one.
  const timedOut = view.phase === "resolved" && view.decision === "deny" && !vFaText(view.resolvedBy) && view.terminalStatus !== "cancelled";
  if (view.phase === "expired" || view.terminalStatus === "expired" || timedOut) {
    title = `已过期：${kindLabel}`;
    status = "没有在时限内审批，什么也没有执行。";
  } else if (view.terminalStatus === "cancelled") {
    title = `已取消：${kindLabel}`;
    status = "这条审批已取消，什么也没有执行。";
  } else if (view.decision === "deny") {
    title = `已拒绝：${kindLabel}`;
    status = `${vFaResolvedBy(view.resolvedBy)}已拒绝，什么也没有执行。`.trim();
  } else {
    title = `已批准：${kindLabel}`;
    template = "blue";
    const verb = view.decision === "allow-always" ? "设为总是允许" : "批准";
    status = `${vFaResolvedBy(view.resolvedBy)}已${verb}。`;
    if (view.approvalKind === "system-agent") {
      if (view.applicationStatus === "applied") status += "改动已经写入。";
      else if (view.applicationStatus === "not-applied") status += "但改动没有写入，请回原对话查看原因。";
    }
  }
  elements.push({ tag: "markdown", content: status });
  const meta = vFaMetaLine(view, request, undefined);
  if (meta) elements.push(vFaNote(meta));
  return vFaCard({ title, template, elements });
}

/** Same subject and metadata as the pending card, buttons removed. */
function buildFeishuApprovalClosedCard({ request, view }) {
  const kindLabel = V_FEISHU_APPROVAL_KIND_LABEL[view.approvalKind] ?? "操作";
  const elements = [{ tag: "markdown", content: vFaSubjectMarkdown(view) }];
  elements.push({ tag: "markdown", content: "这条审批已经结束。" });
  const meta = vFaMetaLine(view, request, undefined);
  if (meta) elements.push(vFaNote(meta));
  return vFaCard({ title: `审批已结束：${kindLabel}`, template: "grey", elements });
}

function feishuApprovalCallbackResponse(type, content) {
  return { toast: { type, content } };
}

function vFaErrorReason(error) {
  const record = vFaIsRecord(error) ? error : {};
  return record.gatewayCode ?? record.details?.reason ?? "";
}
function isFeishuApprovalGoneError(error, isNotFound) {
  if (isNotFound?.(error)) return true;
  const reason = vFaErrorReason(error);
  return reason === "APPROVAL_ALREADY_RESOLVED" || reason === "APPROVAL_NOT_FOUND" ||
    /approval (already resolved|not found)|unknown or expired approval/i.test(String(error?.message ?? ""));
}

/**
 * Click handler. Only configured owners may decide; the decision goes through
 * the Gateway's canonical `approval.resolve` with the clicker as reviewer, so the
 * Gateway re-checks authorization. The native runtime repaints the card when the
 * resolved event arrives; the click itself only returns a toast (3 s deadline).
 */
function createFeishuApprovalCallbackHandler(deps) {
  const inflight = new Map();
  const waitMs = deps.waitMs ?? V_FEISHU_APPROVAL_CALLBACK_WAIT_MS;
  const log = deps.log ?? (() => {});
  return async function handleFeishuApprovalCallback(data, { cfg, accountId }) {
    const parsed = parseFeishuApprovalCallback(data);
    if (!parsed) return undefined;
    if (parsed.kind === "invalid") return feishuApprovalCallbackResponse("error", "这张审批卡已失效。");
    if (!parsed.senderId || !resolveFeishuOwnerApprovers(cfg).includes(parsed.senderId)) {
      log(`feishu approvals: blocked click from non-approver on ${parsed.approvalId}`);
      return feishuApprovalCallbackResponse("error", "只有 owner 可以审批。");
    }
    if (inflight.has(parsed.approvalId)) return feishuApprovalCallbackResponse("info", "正在处理，请稍候。");
    const work = Promise.resolve().then(() => deps.resolve({
      cfg,
      approvalId: parsed.approvalId,
      approvalKind: parsed.approvalKind,
      decision: parsed.decision,
      channel: "feishu",
      accountId,
      senderId: parsed.senderId,
    }));
    inflight.set(parsed.approvalId, work);
    const settled = work.then((result) => ({ result }), (error) => ({ error }));
    void settled.then(({ error }) => {
      inflight.delete(parsed.approvalId);
      if (error && !isFeishuApprovalGoneError(error, deps.isNotFound)) {
        log(`feishu approvals: resolve ${parsed.approvalId} failed: ${String(error?.message ?? error)}`);
      }
    });
    let timer;
    const outcome = await Promise.race([
      settled,
      new Promise((resolve) => { timer = setTimeout(() => resolve({ pending: true }), waitMs); timer.unref?.(); }),
    ]);
    clearTimeout(timer);
    if (outcome.pending) return feishuApprovalCallbackResponse("info", "已提交，正在处理。");
    if (outcome.error) {
      if (isFeishuApprovalGoneError(outcome.error, deps.isNotFound)) {
        return feishuApprovalCallbackResponse("warning", "这条审批已经处理过或已过期。");
      }
      return feishuApprovalCallbackResponse("error", "提交失败，请稍后再点一次。");
    }
    if (outcome.result && outcome.result.applied === false) {
      return feishuApprovalCallbackResponse("warning", "这条审批已经处理过了。");
    }
    return feishuApprovalCallbackResponse("success", parsed.decision === "deny" ? "已拒绝。" : "已批准。");
  };
}


const V_FEISHU_APPROVAL_EVENT_KINDS = ["exec", "plugin", "system-agent"];

function vFaAccountUsable({ cfg, accountId }) {
  try {
    const account = vFaResolveFeishuAccount({ cfg, accountId: accountId ?? void 0 });
    return Boolean(account?.enabled && account?.configured);
  } catch {
    return false;
  }
}

/**
 * Owner DMs receive every approval that reaches this Feishu account, including
 * ones started from other channels or from the Control UI. An approval bound to
 * a specific Feishu account still goes only to that account.
 */
function vFaMatchesRequestAccount({ cfg, accountId, request }) {
  const defaultAccountId = vFaResolveDefaultFeishuAccountId(cfg);
  const effectiveAccountId = accountId ?? defaultAccountId;
  if (doesApprovalRequestSelectChannelAccount({
    cfg, accountId: effectiveAccountId, request, channel: "feishu", defaultAccountId,
    eligibleAccountIds: vFaAccountUsable({ cfg, accountId: effectiveAccountId }) ? [effectiveAccountId] : [],
  })) return true;
  const turnSource = String(request?.request?.turnSourceChannel ?? "").trim().toLowerCase();
  return Boolean(turnSource) && turnSource !== "feishu" && effectiveAccountId === defaultAccountId &&
    vFaAccountUsable({ cfg, accountId: effectiveAccountId });
}

const vFaProfile = createChannelExecApprovalProfile({
  resolveConfig: ({ cfg, accountId }) => ({ enabled: vFaAccountUsable({ cfg, accountId }) ? "auto" : false, target: "dm" }),
  resolveApprovers: ({ cfg }) => resolveFeishuOwnerApprovers(cfg),
  normalizeSenderId: normalizeFeishuApprovalSender,
  matchesRequestAccount: vFaMatchesRequestAccount,
  fallbackAgentIdFromSessionKey: true,
});

const vFaResolveOriginTarget = createChannelNativeOriginTargetResolver({
  channel: "feishu",
  shouldHandleRequest: ({ cfg, accountId, request }) => vFaProfile.shouldHandleRequest({ cfg, accountId, request }),
  resolveTurnSourceTarget: (request) => {
    if (String(request.request.turnSourceChannel ?? "").trim().toLowerCase() !== "feishu") return null;
    const to = String(request.request.turnSourceTo ?? "").trim();
    return to ? { to } : null;
  },
  resolveSessionTarget: (sessionTarget) => ({ to: sessionTarget.to }),
});

const vFaResolveApproverDmTargets = createChannelApproverDmTargetResolver({
  shouldHandleRequest: ({ cfg, accountId, request }) => vFaProfile.shouldHandleRequest({ cfg, accountId, request }),
  resolveApprovers: ({ cfg }) => resolveFeishuOwnerApprovers(cfg),
  mapApprover: (approver) => ({ to: `user:${approver}` }),
});

function vFaReviewUrl(cfg, approvalId) {
  const origin = resolveGatewayPublicOrigin(cfg);
  if (!origin || cfg.gateway?.controlUi?.enabled === false) return void 0;
  let base = String(cfg.gateway?.controlUi?.basePath ?? "").trim();
  if (base === "/") base = "";
  if (base && !base.startsWith("/")) base = `/${base}`;
  if (base.endsWith("/")) base = base.slice(0, -1);
  return `${origin}${base}/approve/${encodeURIComponent(approvalId)}`;
}

const vFeishuApprovalNativeRuntime = createChannelApprovalNativeRuntimeAdapter({
  eventKinds: V_FEISHU_APPROVAL_EVENT_KINDS,
  availability: {
    isConfigured: ({ cfg, accountId, context }) => Boolean(context) && vFaProfile.isClientEnabled({ cfg, accountId }),
    shouldHandle: ({ cfg, accountId, request }) => vFaProfile.shouldHandleRequest({ cfg, accountId, request }),
  },
  presentation: {
    buildPendingPayload: ({ cfg, request, nowMs, view }) => ({
      card: buildFeishuApprovalPendingCard({ request, view, nowMs, reviewUrl: vFaReviewUrl(cfg, request.id) }),
      closedCard: buildFeishuApprovalClosedCard({ request, view }),
    }),
    buildResolvedResult: ({ request, view }) => ({ kind: "update", payload: { card: buildFeishuApprovalTerminalCard({ request, view }) } }),
    buildExpiredResult: ({ request, view }) => ({ kind: "update", payload: { card: buildFeishuApprovalTerminalCard({ request, view }) } }),
  },
  transport: {
    prepareTarget: ({ plannedTarget }) => ({
      dedupeKey: buildChannelApprovalNativeTargetKey(plannedTarget.target),
      target: { to: plannedTarget.target.to },
    }),
    deliverPending: async ({ cfg, accountId, preparedTarget, pendingPayload, request, approvalKind }) => {
      const result = await vFaSendCardFeishu({ cfg, to: preparedTarget.to, card: pendingPayload.card, accountId: accountId ?? void 0 });
      if (!result?.messageId) return null;
      console.log(`feishu approvals: delivered ${request.id} (${approvalKind}) as message ${result.messageId}`);
      return { messageId: result.messageId, chatId: result.chatId, closedCard: pendingPayload.closedCard };
    },
    updateEntry: async ({ cfg, accountId, entry, payload, request, phase }) => {
      await vFaEditMessageFeishu({ cfg, messageId: entry.messageId, card: payload.card, accountId: accountId ?? void 0 });
      console.log(`feishu approvals: ${phase} ${request.id} repainted message ${entry.messageId}`);
    },
  },
  interactions: {
    clearPendingActions: async ({ cfg, accountId, entry }) => {
      if (!entry?.closedCard) return;
      await vFaEditMessageFeishu({ cfg, messageId: entry.messageId, card: entry.closedCard, accountId: accountId ?? void 0 });
    },
  },
  observe: {
    onDeliveryError: ({ error, request }) => {
      console.error(`feishu approvals: failed to deliver ${request?.id}: ${String(error?.message ?? error)}`);
    },
  },
});

const vFeishuApprovalCapabilityNative = createApproverRestrictedNativeApprovalCapability({
  channel: "feishu",
  channelLabel: "Feishu",
  describeExecApprovalSetup: () => "Add the owner's Feishu open_id to `commands.ownerAllowFrom` as `feishu:ou_...`; approvals are then sent to that DM.",
  describePluginApprovalSetup: () => "Add the owner's Feishu open_id to `commands.ownerAllowFrom` as `feishu:ou_...`; approvals are then sent to that DM.",
  listAccountIds: (cfg) => vFaListFeishuAccountIds(cfg),
  hasApprovers: ({ cfg }) => resolveFeishuOwnerApprovers(cfg).length > 0,
  isExecAuthorizedSender: ({ cfg, accountId, senderId }) => vFaProfile.isAuthorizedSender({ cfg, accountId, senderId }),
  isPluginAuthorizedSender: ({ cfg, accountId, senderId }) => vFaProfile.isApprover({ cfg, accountId, senderId }),
  isNativeDeliveryEnabled: ({ cfg, accountId }) => vFaProfile.isClientEnabled({ cfg, accountId }),
  resolveNativeDeliveryMode: () => "dm",
  requireMatchingTurnSourceChannel: false,
  resolveSuppressionAccountId: ({ target, request }) =>
    String(target?.accountId ?? "").trim() || String(request?.request?.turnSourceAccountId ?? "").trim() || void 0,
  resolveOriginTarget: vFaResolveOriginTarget,
  resolveApproverDmTargets: vFaResolveApproverDmTargets,
  notifyOriginWhenDmOnly: true,
  nativeRuntime: createLazyChannelApprovalNativeRuntimeAdapter({
    eventKinds: V_FEISHU_APPROVAL_EVENT_KINDS,
    isConfigured: ({ cfg, accountId }) => vFaProfile.isClientEnabled({ cfg, accountId }),
    shouldHandle: ({ cfg, accountId, request }) => vFaProfile.shouldHandleRequest({ cfg, accountId, request }),
    load: async () => vFeishuApprovalNativeRuntime,
  }),
});

/** Owner-restricted capability; falls back to the stock auth when no owner is configured. */
function createVFeishuApprovalCapability(stockAuth) {
  const native = vFeishuApprovalCapabilityNative;
  return {
    ...stockAuth,
    ...native,
    authorizeActorAction: (params) =>
      resolveFeishuOwnerApprovers(params.cfg).length > 0
        ? native.authorizeActorAction(params)
        : stockAuth?.authorizeActorAction?.(params),
    getActionAvailabilityState: (params) =>
      resolveFeishuOwnerApprovers(params.cfg).length > 0
        ? native.getActionAvailabilityState(params)
        : stockAuth?.getActionAvailabilityState?.(params) ?? native.getActionAvailabilityState(params),
  };
}

/** Called once per monitored account so the Gateway starts the native handler. */
function vFeishuApprovalRegisterContext({ channelRuntime, accountId, abortSignal }) {
  if (!channelRuntime) return;
  try {
    registerChannelRuntimeContext({
      channelRuntime,
      channelId: "feishu",
      accountId,
      capability: CHANNEL_APPROVAL_NATIVE_RUNTIME_CONTEXT_CAPABILITY,
      context: { accountId },
      abortSignal,
    });
  } catch (error) {
    console.error(`feishu approvals: context registration failed for ${accountId}: ${String(error?.message ?? error)}`);
  }
}

const vFaHandleClick = createFeishuApprovalCallbackHandler({
  resolve: (params) => resolveApprovalOverGateway(params),
  isNotFound: isApprovalNotFoundError,
  log: (line) => console.log(line),
});
/** Approver checks use the live config, so an owner change applies without a channel restart. */
function vFeishuApprovalCardAction(data, { cfg, accountId }) {
  let liveCfg = cfg;
  try { liveCfg = getRuntimeConfig() ?? cfg; } catch {}
  return vFaHandleClick(data, { cfg: liveCfg, accountId });
}

export { createVFeishuApprovalCapability, vFeishuApprovalCardAction, vFeishuApprovalNativeRuntime, vFeishuApprovalRegisterContext };
