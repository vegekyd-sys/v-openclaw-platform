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
        "A person is currently controlling V's desktop browser through the handoff link. Only read-only browser actions (status, tabs, snapshot, screenshot) are allowed until they hand it back. Ask them to finish and tell you, or call desktop_handoff_status.",
    };
  }
  if (toolName === "computer") {
    if (action && COMPUTER_READ_ONLY_ACTIONS.has(action)) {
      return undefined;
    }
    return {
      block: true,
      blockReason: "A person is currently controlling V's desktop through the handoff link. Wait until they hand it back before using the computer tool.",
    };
  }
  return undefined;
}
