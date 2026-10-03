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
/*@@CHUNK_IMPORTS@@*/

/*@@CORE@@*/

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
