// While a human controls the desktop, the agent must not fight over the same
// browser. Read-only browser actions stay allowed so the agent can still look.
export const BROWSER_READ_ONLY_ACTIONS = new Set([
  "status",
  "doctor",
  "profiles",
  "tabs",
  "snapshot",
  "screenshot",
  "text",
  "requests",
  "errors",
  "console",
]);

export const COMPUTER_READ_ONLY_ACTIONS = new Set(["screenshot", "get_browser_state", "get_recording_state", "list_apps", "list_windows", "get_window_state", "get_accessibility_tree", "wait"]);

export function decideToolCall({ toolName, params, controlActive }) {
  if (!controlActive) {
    return undefined;
  }
  const action = params && typeof params === "object" && typeof params.action === "string" ? params.action : null;
  if (toolName === "browser") {
    if (action && BROWSER_READ_ONLY_ACTIONS.has(action)) {
      return undefined;
    }
    return {
      block: true,
      blockReason:
        "A person is currently controlling V's desktop browser through the handoff link. Only read-only browser actions (status, tabs, snapshot, screenshot) are allowed until they hand it back. Ask them to finish and tell you, or call desktop_handoff_status. Never end their handoff to get the browser back.",
    };
  }
  if (toolName === "computer") {
    if (action && COMPUTER_READ_ONLY_ACTIONS.has(action)) {
      return undefined;
    }
    return {
      block: true,
      blockReason: "A person is currently controlling V's desktop through the handoff link. Wait until they hand it back before using the computer tool; never end their handoff to get the desktop back.",
    };
  }
  return undefined;
}

/** Why the agent may not revoke this handoff now, or null when it may. */
export function refuseEnd(status) {
  if (!status || status.ended || !(status.controlActive || status.connectedViewers > 0)) {
    return null;
  }
  return (
    "Refused: a person is connected to this handoff" +
    (status.controlActive ? " and controlling the desktop" : "") +
    ". Do not end it and do not work around it. Tell the user you are waiting, end your turn, and continue only after they hand back and tell you they are done."
  );
}

/**
 * What the 「交还给 V」 card button (/v-handback) should do for this handoff.
 * Mutually exclusive with 「接管电脑」: it only acts when the person actually
 * had the desktop, and wakes V once per takeover.
 *   release  - someone controls it now: take control back and let V continue
 *   resume   - the page was opened and already closed/released: let V continue
 *   noop     - nothing to hand back (never opened, or already handed back)
 */
export function decideHandBack(status, { alreadyHandedBack = false } = {}) {
  if (!status) {
    return { action: "noop", text: "没有找到这次接管，电脑在 V 手里。" };
  }
  if (status.controlActive) {
    return { action: "release", text: "✅ 已交还给 V，V 接着做。" };
  }
  if (status.claims > 0 && !alreadyHandedBack) {
    return { action: "resume", text: "✅ 电脑已在 V 手里，V 接着做。" };
  }
  if (status.claims === 0) {
    return { action: "noop", text: "你还没有接管电脑，点「接管电脑」才能操作。" };
  }
  return { action: "noop", text: "电脑已经交还给 V 了。" };
}
