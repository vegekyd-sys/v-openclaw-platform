import { Type } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { HandoffAdminClient } from "./core/admin-client.js";
import { describeContext, isControlAnywhereActor, isTrustedDirectSession, resolveTrustedActor } from "./core/identity.js";
import { deliverPrivately } from "./core/deliver.js";
import { handoffCard, inPlaceTarget } from "./core/card.js";
import { decideToolCall, refuseEnd } from "./core/policy.js";

function textResult(value) {
  return { content: [{ type: "text", text: JSON.stringify(value, null, 2) }] };
}

export default definePluginEntry({
  id: "v-desktop-handoff",
  name: "V Desktop Handoff",
  description: "Hands V's own desktop browser to a human through a one-time link.",
  register(api) {
    const config = api.pluginConfig ?? {};
    const client = new HandoffAdminClient({
      baseUrl: config.adminUrl ?? "http://127.0.0.1:23951",
      adminTokenFile: config.adminTokenFile,
    });
    const blockWhileControlled = config.blockBrowserWhileControlled ?? true;
    const bySession = new Map(); // sessionKey -> last handoff id (this process); the service is the source of truth
    const resolveHandoff = async (handoffId, sessionKey, signal) => {
      const id = handoffId ?? (sessionKey ? bySession.get(sessionKey) : null);
      if (id) {
        return client.status(id, { signal });
      }
      if (sessionKey) {
        try {
          return await client.latestForSession(sessionKey, { signal });
        } catch {
          /* none for this session */
        }
      }
      throw new Error("No handoff has been issued in this session");
    };

    const trusted = (context) => {
      const actorUserId = resolveTrustedActor(context, config);
      if (!actorUserId) {
        api.logger?.warn?.(`desktop handoff denied: no trusted sender identity (context: ${describeContext(context)})`);
        throw new Error("Desktop handoff denied: no trusted channel sender identity is available");
      }
      return { actorUserId, sessionKey: typeof context.sessionKey === "string" ? context.sessionKey : null };
    };

    api.registerTool(
      (context) => ({
        name: "desktop_handoff_request",
        label: "Desktop Handoff Request",
        description:
          "Use when V's own desktop browser (the `browser` tool) hits a login page, captcha, 2FA or a payment/consent step that only the user can complete. Issues a one-time link to V's desktop. kind=control (default) lets the requesting user watch and take over the mouse and keyboard. kind=watch gives a view-only link. Depending on configuration a control link is issued in any conversation, or only in private chats (owners may then ask from a group and receive it privately). In chat channels the link is posted as a card with a button; follow the returned instruction about whether to repeat the url. Then end your turn and wait for the user to say they are done. Use purpose=payment when a checkout needs the user's payment details or final confirmation: first fill the cart and go to the payment page yourself, then call this with payment.item/amount/currency/merchant exactly as shown on the page. Never type, guess or read back card numbers, passwords or verification codes yourself.",
        parameters: Type.Object({
          reason: Type.String({ description: "Short, user-facing reason, e.g. 'need you to log in to Xiaohongshu'" }),
          kind: Type.Optional(Type.Union([Type.Literal("control"), Type.Literal("watch")], { description: "control (default) or watch" })),
          purpose: Type.Optional(Type.Union([Type.Literal("login"), Type.Literal("payment")], { description: "login (default: login, captcha, 2FA, consent) or payment (the user enters payment details and confirms the purchase)" })),
          payment: Type.Optional(
            Type.Object({
              item: Type.Optional(Type.String({ description: "What is being bought, as shown at checkout" })),
              amount: Type.Optional(Type.String({ description: "Total to pay, exactly as shown at checkout, e.g. '129.00'" })),
              currency: Type.Optional(Type.String({ description: "e.g. CNY, USD" })),
              merchant: Type.Optional(Type.String({ description: "Shop or site name" })),
            }),
          ),
        }),
        async execute(_toolCallId, params, signal) {
          const { actorUserId, sessionKey } = trusted(context);
          const kind = params.kind === "watch" ? "watch" : "control";
          const purpose = params.purpose === "payment" ? "payment" : "login";
          // controlAnywhere: control links may be issued in any conversation and are posted in place.
          const direct = config.controlAnywhere === true || isTrustedDirectSession(context, config);
          const anywhere = isControlAnywhereActor(actorUserId, config);
          if (kind === "control" && !direct && !anywhere) {
            throw new Error("A control handoff is only issued in a direct/private conversation. Ask the user to message V privately, or issue kind=watch here.");
          }
          const issued = await client.issue(
            { kind, ownerId: actorUserId, sessionKey, reason: params.reason, claimTtlMs: config.claimTtlMs, sessionTtlMs: config.sessionTtlMs },
            { signal },
          );
          if (sessionKey) {
            bySession.set(sessionKey, issued.id);
          }
          const openWithinMinutes = Math.round((issued.claimExpiresAt - Date.now()) / 60_000);
          const sessionMinutes = Math.round(issued.sessionTtlMs / 60_000);
          if (kind === "control" && !direct) {
            // The owner asked from a group: the link is a bearer token, so it goes to their DM, never into the group.
            const senderId = typeof context.requesterSenderId === "string" ? context.requesterSenderId.trim() : "";
            const channel = typeof context.messageChannel === "string" ? context.messageChannel.trim() : "";
            try {
              const card = handoffCard({ purpose, kind, reason: params.reason, url: issued.url, openWithinMinutes, sessionMinutes, payment: params.payment });
              await deliverPrivately({
                channel,
                target: senderId,
                ...((config.cardChannels ?? ["feishu"]).includes(channel)
                  ? { text: card.text, presentation: card.presentation }
                  : { text: card.fallback }),
                command: config.openclawCommand,
                entry: config.openclawEntry,
                accountId: config.messageAccountId,
              });
            } catch (error) {
              await client.revoke(issued.id).catch(() => {});
              throw new Error(`Could not deliver the control link privately (${error.message}). Ask the user to message V privately instead.`);
            }
            return textResult({
              handoffId: issued.id,
              kind,
              requestedBy: actorUserId,
              deliveredPrivatelyTo: `${channel}:${senderId}`,
              openWithinMinutes,
              sessionMinutes,
              instruction: "The control link was sent to the user in a private message, not here. Tell them in this conversation to check their private chat with V, then end your turn and wait until they say they are done. Do not repeat or guess the url here.",
            });
          }
          // In a chat channel, post the link as a card with a button in this conversation.
          const place = config.cards === false ? null : inPlaceTarget(context, config);
          if (place) {
            const card = handoffCard({ purpose, kind, reason: params.reason, url: issued.url, openWithinMinutes, sessionMinutes, payment: params.payment });
            try {
              await deliverPrivately({
                ...place,
                accountId: place.accountId ?? config.messageAccountId,
                text: card.text,
                presentation: card.presentation,
                command: config.openclawCommand,
                entry: config.openclawEntry,
              });
              return textResult({
                handoffId: issued.id,
                kind,
                purpose,
                requestedBy: actorUserId,
                postedAsCard: true,
                openWithinMinutes,
                sessionMinutes,
                instruction:
                  "A card with the link button has been posted in this conversation. Do NOT repeat or paraphrase the url, and do not say where the card is (above/below): reply with one short sentence such as 接管卡片已发出，登录完成后告诉我一声, then end your turn and wait until the user says they are done; then call desktop_handoff_status." +
                  (purpose === "payment" ? " Do not click any pay/confirm button yourself; after the user is done, check the order result on the page and report it." : ""),
              });
            } catch (error) {
              api.logger?.warn?.(`desktop handoff card not delivered, falling back to the url in the reply: ${error.message}`);
            }
          }
          return textResult({
            handoffId: issued.id,
            kind,
            purpose,
            requestedBy: actorUserId,
            url: issued.url,
            openWithinMinutes,
            sessionMinutes,
            instruction:
              kind === "control"
                ? "Send exactly this url to the user in this conversation, and no other address or 'equivalent' link (other hostnames may not resolve for them). They open it, press 接管控制, do the login on V's own browser, press 交还给 V, then tell you they are done. While they are in control, your browser tool is limited to read-only actions. Do not store the url in memory or logs."
                : "Send this view-only url. Viewers can watch V's desktop but cannot type or click.",
          });
        },
      }),
      { name: "desktop_handoff_request" },
    );

    api.registerTool(
      (context) => ({
        name: "desktop_handoff_status",
        label: "Desktop Handoff Status",
        description: "Check whether the user has opened the handoff link, is currently controlling the desktop, or has finished. Call this when the user says they are done, before continuing with the browser.",
        parameters: Type.Object({
          handoffId: Type.Optional(Type.String({ description: "Handoff id returned by desktop_handoff_request; defaults to the latest one in this session" })),
        }),
        async execute(_toolCallId, params, signal) {
          const status = await resolveHandoff(params.handoffId, context.sessionKey, signal);
          return textResult({
            handoffId: status.id,
            kind: status.kind,
            opened: status.claims > 0,
            openedTimes: status.claims,
            connectedViewers: status.connectedViewers,
            controlActive: status.controlActive,
            lastInputAt: status.lastInputAt ? new Date(status.lastInputAt).toISOString() : null,
            ended: status.ended,
            endReason: status.endReason,
            hint: status.controlActive
              ? "The user is still controlling the desktop. Wait for them to hand it back."
              : status.claims === 0
                ? "The user has not opened the link yet."
                : "Nobody is controlling the desktop now; you may continue using the browser.",
          });
        },
      }),
      { name: "desktop_handoff_status" },
    );

    api.registerTool(
      (context) => ({
        name: "desktop_handoff_end",
        label: "Desktop Handoff End",
        description: "Revoke a handoff link that nobody is using (sent by mistake, or the user said they are done and handed back). It is refused while a person is connected or in control: never use it to get the desktop back from the user.",
        parameters: Type.Object({
          handoffId: Type.Optional(Type.String()),
        }),
        async execute(_toolCallId, params, signal) {
          const current = await resolveHandoff(params.handoffId, context.sessionKey, signal);
          const id = current.id;
          const refusal = refuseEnd(current);
          if (refusal) {
            throw new Error(refusal);
          }
          await client.revoke(id, { signal });
          if (context.sessionKey && bySession.get(context.sessionKey) === id) {
            bySession.delete(context.sessionKey);
          }
          return textResult({ handoffId: id, ended: true });
        },
      }),
      { name: "desktop_handoff_end" },
    );

    api.on(
      "before_tool_call",
      async (event) => {
        if (!blockWhileControlled || (event.toolName !== "browser" && event.toolName !== "computer")) {
          return undefined;
        }
        let state;
        try {
          state = await client.state();
        } catch (error) {
          // The handoff service being down must not take the browser tool down with it.
          api.logger?.warn?.(`desktop handoff state unavailable, allowing ${event.toolName}: ${error.message}`);
          return undefined;
        }
        return decideToolCall({ toolName: event.toolName, params: event.params, controlActive: state.controlActive === true });
      },
      { priority: 90, timeoutMs: 5_000 },
    );
  },
});
