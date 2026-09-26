import { Type } from "typebox";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";

import { HandoffAdminClient } from "./core/admin-client.js";
import { describeContext, isTrustedDirectSession, resolveTrustedActor } from "./core/identity.js";
import { decideToolCall } from "./core/policy.js";

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
    const bySession = new Map(); // sessionKey -> last handoff id

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
          "Use when V's own desktop browser (the `browser` tool) hits a login page, captcha, 2FA or a payment/consent step that only the user can complete. Issues a one-time link to V's desktop. kind=control (default) lets the requesting user watch and take over the mouse and keyboard; it only works in a direct/private conversation. kind=watch gives a view-only link that is safe for a group. Put the returned url in your reply, tell the user what to do there and that the link expires, then end your turn and wait for the user to say they are done. Never type or guess credentials yourself.",
        parameters: Type.Object({
          reason: Type.String({ description: "Short, user-facing reason, e.g. 'need you to log in to Xiaohongshu'" }),
          kind: Type.Optional(Type.Union([Type.Literal("control"), Type.Literal("watch")], { description: "control (default) or watch" })),
        }),
        async execute(_toolCallId, params, signal) {
          const { actorUserId, sessionKey } = trusted(context);
          const kind = params.kind === "watch" ? "watch" : "control";
          if (kind === "control" && !isTrustedDirectSession(context, config)) {
            throw new Error("A control handoff is only issued in a direct/private conversation. Ask the user to message V privately, or issue kind=watch here.");
          }
          const issued = await client.issue(
            { kind, ownerId: actorUserId, sessionKey, reason: params.reason, claimTtlMs: config.claimTtlMs, sessionTtlMs: config.sessionTtlMs },
            { signal },
          );
          if (sessionKey) {
            bySession.set(sessionKey, issued.id);
          }
          return textResult({
            handoffId: issued.id,
            kind,
            url: issued.url,
            openWithinMinutes: Math.round((issued.claimExpiresAt - Date.now()) / 60_000),
            sessionMinutes: Math.round(issued.sessionTtlMs / 60_000),
            instruction:
              kind === "control"
                ? "Send this url to the user in this private conversation. They open it, press 接管控制, do the login on V's own browser, press 交还给 V, then tell you they are done. While they are in control, your browser tool is limited to read-only actions. Do not store the url in memory or logs."
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
          const id = params.handoffId ?? (context.sessionKey ? bySession.get(context.sessionKey) : null);
          if (!id) {
            throw new Error("No handoff has been issued in this session");
          }
          const status = await client.status(id, { signal });
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
        description: "Revoke a handoff link and disconnect its viewers. Use after the user confirms they are done, or if the link was sent by mistake.",
        parameters: Type.Object({
          handoffId: Type.Optional(Type.String()),
        }),
        async execute(_toolCallId, params, signal) {
          const id = params.handoffId ?? (context.sessionKey ? bySession.get(context.sessionKey) : null);
          if (!id) {
            throw new Error("No handoff has been issued in this session");
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
