import { Type } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { HandoffAdminClient } from "./core/admin-client.js";
import { describeContext, isControlAnywhereActor, isTrustedDirectSession, resolveTrustedActor } from "./core/identity.js";
import { deliverPrivately } from "./core/deliver.js";
import { CALLBACK_CARD_CHANNELS, DEFAULT_CARD_CHANNELS, GATEWAY_ACTION_CHANNELS, handoffCard, inPlaceTarget, normalizePayment } from "./core/card.js";
import { FeishuApi, captureDesktop, feishuCredentials, feishuReceiver, loadCover } from "./core/feishu-api.js";
import { nativeHandoffCard } from "./core/native-card.js";

// V's picture for the card (generated media stays out of git; fetched once per app and uploaded to Feishu).
const DEFAULT_COVER = "https://cdn.makaron.app/storage/v1/object/public/images/5955d413-cad2-4814-b094-7fdf62d20400/0bc9ae1f-59b7-45a7-9e73-bf7c9951afdd/snapshot-d2ec2e6c-240d-4400-b0ad-4fce335e2e8c.jpg";

const NATIVE_CARD_INSTRUCTION =
  "A card titled 电脑 with three buttons has been posted in this conversation: 接管 (the user takes over V's desktop), 我完成了 (hands it back) and 跳过 (the user will not do this step). Do NOT repeat or paraphrase the url and do not say where the card is. Reply with one short sentence such as 卡片已发出，接管后完成登录，做完点「我完成了」, then end your turn. When `/v-handback <id>` arrives, the desktop is already back with you: continue the task right away without asking. When `/v-skip <id>` arrives, the user skipped this step: do not issue another handoff for it; say briefly what you can do instead or where the task is blocked.";
import { decideHandBack, decideToolCall, refuseEnd } from "./core/policy.js";

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
    const cards = new Map(); // handoff id -> { feishu, messageId, view, state } for native Feishu cards
    const feishuApis = new Map(); // appId -> FeishuApi
    const coverKeys = new Map(); // appId -> uploaded image_key of the cover

    const postNativeCard = async ({ cfg, accountId, target, issued, kind, purpose, params, actorUserId }) => {
      if (config.nativeCard === false) {
        return null;
      }
      const creds = feishuCredentials(cfg, accountId);
      const receiver = feishuReceiver(target);
      if (!creds || !receiver) {
        return null;
      }
      let feishu = feishuApis.get(creds.appId);
      if (!feishu) {
        feishu = new FeishuApi(creds);
        feishuApis.set(creds.appId, feishu);
      }
      let imageKey = null;
      try {
        if (config.cardImage !== "cover") {
          const shot = await captureDesktop({ display: config.desktopDisplay ?? ":99" });
          imageKey = shot ? await feishu.uploadImage(shot, "desktop.jpg") : null;
        }
        if (!imageKey) {
          imageKey = coverKeys.get(creds.appId) ?? null;
          if (!imageKey) {
            const bytes = await loadCover(config.coverImage ?? DEFAULT_COVER);
            if (bytes) {
              imageKey = await feishu.uploadImage(bytes, "v-cover.jpg");
              coverKeys.set(creds.appId, imageKey);
            }
          }
        }
      } catch (error) {
        api.logger?.warn?.(`desktop handoff card image unavailable: ${error.message}`);
      }
      const ownerOpenId = typeof actorUserId === "string" && actorUserId.startsWith("feishu:ou_") ? actorUserId.slice("feishu:".length) : undefined;
      const view = {
        kind,
        purpose,
        reason: params.reason,
        url: issued.url,
        imageKey,
        handoffId: issued.id,
        payment: normalizePayment(params.payment),
        owner: { userOpenId: ownerOpenId, expiresAt: issued.claimExpiresAt + issued.sessionTtlMs },
      };
      const messageId = await feishu.sendCard(receiver, nativeHandoffCard({ ...view, state: "pending" }));
      const record = { messageId, appId: creds.appId, accountId: accountId ?? null, view, state: "pending" };
      cards.set(issued.id, { ...record, feishu });
      // The button commands run in the Gateway, the tool may run in a worker: keep the card with the handoff.
      await client.setCard(issued.id, record).catch((error) => api.logger?.warn?.(`desktop handoff card not recorded: ${error.message}`));
      watchCard(issued.id, issued.claimExpiresAt + issued.sessionTtlMs, cfg);
      return messageId;
    };

    // Feishu runs only the link of a button that has both a link and a callback,
    // so the card follows the desktop itself: someone in control -> 操作中, the
    // handoff over -> 已结束. 我完成了 / 跳过 still arrive as callbacks.
    const watchCard = (id, until, cfg) => {
      const timer = setInterval(async () => {
        const card = cards.get(id);
        if (!card || ["done", "skipped", "ended"].includes(card.state) || Date.now() > until + 60_000) {
          clearInterval(timer);
          return;
        }
        let status;
        try {
          status = await client.status(id);
        } catch {
          return;
        }
        // The button commands run in another process and record their final state with the
        // handoff: 已完成 / 已跳过 must never be overwritten by this watcher's 已结束.
        const recorded = status.card?.state;
        if (recorded && recorded !== card.state) {
          card.state = recorded;
        }
        if (["done", "skipped", "ended"].includes(card.state)) {
          clearInterval(timer);
          return;
        }
        if (status.ended) {
          await setCardState(id, "ended", cfg);
        } else if (status.controlActive && card.state === "pending") {
          await setCardState(id, "active", cfg);
        }
      }, config.cardPollMs ?? 3_000);
      timer.unref?.();
    };

    const setCardState = async (id, state, cfg) => {
      let card = cards.get(id);
      if (!card) {
        const record = (await client.status(id).catch(() => null))?.card;
        if (!record?.messageId) {
          return;
        }
        const creds = feishuCredentials(cfg, record.accountId);
        if (!creds || creds.appId !== record.appId) {
          api.logger?.warn?.(`desktop handoff card ${id}: no Feishu credentials for app ${record.appId}`);
          return;
        }
        let feishu = feishuApis.get(creds.appId);
        if (!feishu) {
          feishu = new FeishuApi(creds);
          feishuApis.set(creds.appId, feishu);
        }
        card = { ...record, feishu };
        cards.set(id, card);
      }
      if (card.state === state) {
        return;
      }
      card.state = state;
      try {
        // Show what the desktop looks like now (the person's result after 已完成), not the picture from when the card was sent.
        if (config.cardImage !== "cover" && (state === "active" || state === "done")) {
          const shot = await captureDesktop({ display: config.desktopDisplay ?? ":99" });
          if (shot) {
            card.view = { ...card.view, imageKey: await card.feishu.uploadImage(shot, "desktop.jpg") };
          }
        }
        await card.feishu.patchCard(card.messageId, nativeHandoffCard({ ...card.view, state }));
        const { feishu: _feishu, ...record } = card;
        await client.setCard(id, record).catch(() => {});
      } catch (error) {
        api.logger?.warn?.(`desktop handoff card ${id} not updated to ${state}: ${error.message}`);
      }
    };
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
              const sentNative = channel === "feishu"
                ? await postNativeCard({ cfg: context.config ?? context.runtimeConfig, accountId: context.deliveryContext?.accountId, target: senderId, issued, kind, purpose, params, actorUserId }).catch((error) => {
                    api.logger?.warn?.(`desktop handoff native card failed, using the plain card: ${error.message}`);
                    return null;
                  })
                : null;
              const card = handoffCard({ purpose, kind, reason: params.reason, url: issued.url, openWithinMinutes, sessionMinutes, payment: params.payment, handoffId: issued.id, callbacks: CALLBACK_CARD_CHANNELS.includes(channel) });
              if (!sentNative) await deliverPrivately({
                channel,
                target: senderId,
                ...((config.cardChannels ?? DEFAULT_CARD_CHANNELS).includes(channel)
                  ? { text: card.text, presentation: card.presentation, gatewayAction: GATEWAY_ACTION_CHANNELS.includes(channel) }
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
          if (place && place.channel === "feishu") {
            try {
              if (await postNativeCard({ cfg: context.config ?? context.runtimeConfig, accountId: place.accountId, target: place.target, issued, kind, purpose, params, actorUserId })) {
                return textResult({
                  handoffId: issued.id,
                  kind,
                  purpose,
                  requestedBy: actorUserId,
                  postedAsCard: true,
                  openWithinMinutes,
                  sessionMinutes,
                  instruction:
                    NATIVE_CARD_INSTRUCTION +
                    (purpose === "payment" ? " Do not click any pay/confirm button yourself; after the user is done, check the order result on the page and report it." : ""),
                });
              }
            } catch (error) {
              api.logger?.warn?.(`desktop handoff native card failed, using the plain card: ${error.message}`);
            }
          }
          if (place) {
            // DingTalk and WeCom cards cannot post 交还给 V back: the card asks for 好了 in the chat.
            const callbacks = CALLBACK_CARD_CHANNELS.includes(place.channel);
            const card = handoffCard({ purpose, kind, reason: params.reason, url: issued.url, openWithinMinutes, sessionMinutes, payment: params.payment, handoffId: issued.id, callbacks });
            try {
              await deliverPrivately({
                ...place,
                accountId: place.accountId ?? config.messageAccountId,
                text: card.text,
                presentation: card.presentation,
                gatewayAction: GATEWAY_ACTION_CHANNELS.includes(place.channel),
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
                  (callbacks
                    ? "A card with two buttons has been posted in this conversation: 接管电脑 (the user takes over V's desktop) and 交还给 V (hands it back; it arrives here as a `/v-handback <id>` message, and by then the plugin has already returned the desktop to you, so just continue the task without asking). Do NOT repeat or paraphrase the url, and do not say where the card is (above/below): reply with one short sentence such as 接管卡片已发出，登录完成后告诉我一声, then end your turn and wait until the user says they are done; then call desktop_handoff_status."
                    : "A card with a 接管电脑 button has been posted in this conversation (the user takes over V's desktop there); the card asks them to reply 好了 here when they are done. Do NOT repeat or paraphrase the url, and do not say where the card is (above/below): reply with one short sentence such as 接管卡片已发出，完成后回复「好了」, then end your turn and wait until the user says they are done; then call desktop_handoff_status (if it still shows them in control, ask them to press 交还给 V on the takeover page).") +
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
                ? "Send exactly this url to the user in this conversation as a markdown link on its own line, `[接管电脑](<url>)`, and no other address or 'equivalent' link (other hostnames may not resolve for them). They open it, press 接管控制, do the login on V's own browser, press 交还给 V, then tell you they are done. While they are in control, your browser tool is limited to read-only actions. Do not store the url in memory or logs."
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

    // Card buttons are Feishu callbacks that post a command as the clicking user:
    // 接管 -> /v-takeover, 我完成了 -> /v-handback, 跳过 -> /v-skip.
    const handedBack = new Set(); // handoff ids already handed back since the last takeover
    const resolveFromCommand = async (ctx) => {
      const actor = resolveTrustedActor({ requesterSenderId: ctx.senderId, messageChannel: ctx.channel }, config);
      const requested = String(ctx.args ?? "").trim().split(/\s+/u)[0];
      let status = null;
      try {
        status = requested && /^h_[\w-]+$/u.test(requested) ? await client.status(requested) : ctx.sessionKey ? await client.latestForSession(ctx.sessionKey) : null;
      } catch {
        status = null;
      }
      const allowed = !status || actor === status.ownerId || isControlAnywhereActor(actor, config) || ctx.senderIsOwner === true;
      return { actor, status, allowed };
    };

    api.registerCommand?.({
      name: "v-takeover",
      // The handler checks the person is the one the card was for.
      requireAuth: false,
      description: "Mark V's desktop as taken over (the 接管 card button; the button also opens the desktop).",
      acceptsArgs: true,
      handler: async (ctx) => {
        const { status, allowed } = await resolveFromCommand(ctx);
        if (!allowed) {
          return { text: "只有收到这张卡片的人能接管。" };
        }
        if (!status || status.ended) {
          if (status) await setCardState(status.id, "ended", ctx.config);
          return { text: "这次接管已经结束，让 V 重新发一张卡片。" };
        }
        handedBack.delete(status.id);
        await setCardState(status.id, "active", ctx.config);
        // Older cards still post this; an empty result shows up as "No reply was generated".
        return { text: "如果电脑没有自动打开，点卡片上的截图进入。" };
      },
    });

    api.registerCommand?.({
      name: "v-handback",
      // The handler checks the person is the one the card was for.
      requireAuth: false,
      description: "Hand V's desktop back to V after a takeover (the 我完成了 card button).",
      acceptsArgs: true,
      handler: async (ctx) => {
        const { actor, status, allowed } = await resolveFromCommand(ctx);
        if (!allowed) {
          return { text: "只有接管电脑的人能交还。" };
        }
        if (status?.controlActive) {
          handedBack.delete(status.id);
        }
        const decision = decideHandBack(status, { alreadyHandedBack: status ? handedBack.has(status.id) : false });
        if (decision.action === "release") {
          try {
            await client.handBack(status.id);
          } catch (error) {
            return { text: `交还失败：${error.message}。可以在接管页面里点「交还给 V」。` };
          }
        }
        if (decision.action === "noop") {
          return { text: decision.text };
        }
        handedBack.add(status.id);
        await setCardState(status.id, "done", ctx.config);
        api.logger?.info?.(`desktop handoff ${status.id} handed back from chat by ${actor} (${decision.action})`);
        return status.card || cards.has(status.id) ? { continueAgent: true } : { text: decision.text, continueAgent: true };
      },
    });

    api.registerCommand?.({
      name: "v-skip",
      // The handler checks the person is the one the card was for.
      requireAuth: false,
      description: "Skip the step V asked the user to do on its desktop (the 跳过 card button).",
      acceptsArgs: true,
      handler: async (ctx) => {
        const { actor, status, allowed } = await resolveFromCommand(ctx);
        if (!allowed) {
          return { text: "只有收到这张卡片的人能跳过。" };
        }
        if (!status || status.ended || handedBack.has(status.id)) {
          return { text: "这一步已经结束了。" };
        }
        handedBack.add(status.id);
        await setCardState(status.id, "skipped", ctx.config);
        try {
          if (status.controlActive) await client.handBack(status.id);
          await client.revoke(status.id);
        } catch (error) {
          return { text: `跳过失败：${error.message}` };
        }
        api.logger?.info?.(`desktop handoff ${status.id} skipped by ${actor}`);
        return { continueAgent: true };
      },
    });

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
