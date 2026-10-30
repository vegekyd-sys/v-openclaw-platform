// Native approvals for the vapp channel, the shape of Feishu's owner-DM approvals
// (lab/release-files/feishu-dm-approvals): every approval that reaches the
// account shows as a card in the owner's app chat. A card resolved anywhere
// (Feishu, Control UI) is rewritten here too.
import { createApproverRestrictedNativeApprovalCapability } from "openclaw/plugin-sdk/approval-delivery-runtime";
import { CHANNEL_APPROVAL_NATIVE_RUNTIME_CONTEXT_CAPABILITY, createLazyChannelApprovalNativeRuntimeAdapter } from "openclaw/plugin-sdk/approval-handler-adapter-runtime";
import { createChannelApprovalNativeRuntimeAdapter } from "openclaw/plugin-sdk/approval-handler-runtime";
import { buildChannelApprovalNativeTargetKey, createChannelApproverDmTargetResolver, createChannelNativeOriginTargetResolver } from "openclaw/plugin-sdk/approval-native-runtime";
import { createChannelExecApprovalProfile } from "openclaw/plugin-sdk/approval-client-runtime";
import { resolveApprovalOverGateway } from "openclaw/plugin-sdk/approval-gateway-runtime";
import { registerChannelRuntimeContext } from "openclaw/plugin-sdk/channel-runtime-context";

import { ACCOUNT_ID, CHANNEL_ID, vappConfig } from "./core/vapp.js";

const EVENT_KINDS = ["exec", "plugin", "system-agent"];

const owners = (cfg) => {
  const config = vappConfig(cfg);
  return config.enabled ? Object.keys(config.users).filter((id) => config.users[id]?.owner === true || id === config.defaultUser) : [];
};
const normalizeSender = (value) => String(value ?? "").replace(/^vapp:/u, "").trim() || undefined;

export function createVappApprovals({ vx, showCard, log }) {
  const profile = createChannelExecApprovalProfile({
    resolveConfig: ({ cfg }) => ({ enabled: owners(cfg).length ? "auto" : false, target: "dm" }),
    resolveApprovers: ({ cfg }) => owners(cfg),
    normalizeSenderId: normalizeSender,
    matchesRequestAccount: ({ cfg }) => owners(cfg).length > 0,
    fallbackAgentIdFromSessionKey: true,
  });
  const shouldHandle = ({ cfg, accountId, request }) => profile.shouldHandleRequest({ cfg, accountId, request });

  const runtime = createChannelApprovalNativeRuntimeAdapter({
    eventKinds: EVENT_KINDS,
    availability: {
      isConfigured: ({ cfg, accountId, context }) => Boolean(context) && profile.isClientEnabled({ cfg, accountId }),
      shouldHandle,
    },
    presentation: {
      buildPendingPayload: ({ request, nowMs, view }) => ({ card: vx.approvalCard({ request, view, nowMs }) }),
      buildResolvedResult: ({ request, view }) => ({ kind: "update", payload: { card: vx.approvalCard({ request, view }) } }),
      buildExpiredResult: ({ request, view }) => ({ kind: "update", payload: { card: vx.approvalCard({ request, view }) } }),
    },
    transport: {
      prepareTarget: ({ plannedTarget }) => ({
        dedupeKey: buildChannelApprovalNativeTargetKey(plannedTarget.target),
        target: { to: plannedTarget.target.to },
      }),
      deliverPending: async ({ preparedTarget, pendingPayload, request }) => {
        const userId = normalizeSender(preparedTarget.to.replace(/^user:/u, ""));
        const cardId = `a:${request.id}`;
        showCard(userId, { cardId, card: pendingPayload.card, live: true, note: "V 需要你审批" });
        return { messageId: cardId, userId };
      },
      updateEntry: async ({ entry, payload }) => {
        showCard(entry.userId, { cardId: entry.messageId, card: payload.card, live: false });
      },
    },
    observe: {
      onDeliveryError: ({ error, request }) => log(`vapp: approval ${request?.id} not delivered: ${String(error?.message ?? error)}`),
    },
  });

  const capability = createApproverRestrictedNativeApprovalCapability({
    channel: CHANNEL_ID,
    channelLabel: "V App",
    describeExecApprovalSetup: () => "Set `channels.vapp.defaultUser` or a user with `owner: true`; approvals then appear in that user's app chat.",
    describePluginApprovalSetup: () => "Set `channels.vapp.defaultUser` or a user with `owner: true`; approvals then appear in that user's app chat.",
    listAccountIds: () => [ACCOUNT_ID],
    hasApprovers: ({ cfg }) => owners(cfg).length > 0,
    isExecAuthorizedSender: ({ cfg, accountId, senderId }) => profile.isAuthorizedSender({ cfg, accountId, senderId }),
    isPluginAuthorizedSender: ({ cfg, accountId, senderId }) => profile.isApprover({ cfg, accountId, senderId }),
    isNativeDeliveryEnabled: ({ cfg, accountId }) => profile.isClientEnabled({ cfg, accountId }),
    resolveNativeDeliveryMode: () => "dm",
    requireMatchingTurnSourceChannel: false,
    resolveOriginTarget: createChannelNativeOriginTargetResolver({
      channel: CHANNEL_ID,
      shouldHandleRequest: shouldHandle,
      resolveTurnSourceTarget: () => null,
      resolveSessionTarget: () => null,
    }),
    resolveApproverDmTargets: createChannelApproverDmTargetResolver({
      shouldHandleRequest: shouldHandle,
      resolveApprovers: ({ cfg }) => owners(cfg),
      mapApprover: (approver) => ({ to: `user:${approver}` }),
    }),
    // Other channels keep their own cards; no extra notice in the chat that asked.
    notifyOriginWhenDmOnly: false,
    nativeRuntime: createLazyChannelApprovalNativeRuntimeAdapter({
      eventKinds: EVENT_KINDS,
      isConfigured: ({ cfg, accountId }) => profile.isClientEnabled({ cfg, accountId }),
      shouldHandle,
      load: async () => runtime,
    }),
  });

  return {
    capability,
    /** Starts the native handler for the account's lifetime. */
    registerContext: ({ channelRuntime, accountId, abortSignal }) => {
      if (!channelRuntime) return;
      registerChannelRuntimeContext({ channelRuntime, channelId: CHANNEL_ID, accountId, capability: CHANNEL_APPROVAL_NATIVE_RUNTIME_CONTEXT_CAPABILITY, context: { accountId }, abortSignal });
    },
    resolve: resolveApprovalOverGateway,
  };
}
