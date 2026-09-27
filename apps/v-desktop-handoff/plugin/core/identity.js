// Who is asking. The sender identity comes from the channel context the
// Gateway hands to the tool, never from model-supplied parameters.
export function resolveTrustedActor(context = {}, config = {}) {
  const senderId =
    typeof context.requesterSenderId === "string" && context.requesterSenderId.trim()
      ? context.requesterSenderId.trim()
      : null;
  if (senderId) {
    const channel =
      typeof context.messageChannel === "string" && context.messageChannel.trim()
        ? context.messageChannel.trim()
        : "channel";
    const canonical = `${channel}:${senderId}`;
    const aliases = config.principalAliases && typeof config.principalAliases === "object" ? config.principalAliases : {};
    return aliases[canonical] ?? aliases[senderId] ?? canonical;
  }
  if (context.oneShotCliRun === true && typeof config.cliActorUserId === "string" && config.cliActorUserId.trim()) {
    return config.cliActorUserId.trim();
  }
  // Test-only: `openclaw agent --session-key agent:<a>:<channel>:direct:<sender>` runs carry no
  // sender identity into the worker's tool context; derive it from the key when enabled.
  if (config.sessionKeyActorFallback === true && typeof context.sessionKey === "string") {
    const m = context.sessionKey.match(/^agent:[^:]+:([^:]+):(?:direct|dm):([^:]+)$/iu);
    if (m) {
      return `${m[1]}:${m[2]}`;
    }
  }
  return null;
}

/** Non-sensitive shape of the tool context, for diagnostics when identity is missing. */
export function describeContext(context = {}) {
  return Object.keys(context)
    .filter((k) => !/token|secret|auth|key$/iu.test(k))
    .map((k) => `${k}=${typeof context[k] === "string" ? context[k].slice(0, 40) : typeof context[k]}`)
    .join(", ");
}

export function isTrustedDirectSession(context = {}, config = {}) {
  if (context.oneShotCliRun === true) {
    return config.trustCliAsDirect === true;
  }
  const sessionKey = typeof context.sessionKey === "string" ? context.sessionKey.trim().toLowerCase() : "";
  return sessionKey.includes(":direct:") || sessionKey.includes(":dm:");
}

import fs from "node:fs";

/**
 * Actors allowed to request a control link from any conversation (the owner).
 * `controlAnywhereActors` is read from the plugin config at startup;
 * `controlAnywhereActorsFile` (one canonical id per line, # comments) is read
 * on every call so an owner can be added without restarting the Gateway.
 */
export function isControlAnywhereActor(actorUserId, config = {}) {
  if (typeof actorUserId !== "string") {
    return false;
  }
  const list = Array.isArray(config.controlAnywhereActors) ? [...config.controlAnywhereActors] : [];
  if (typeof config.controlAnywhereActorsFile === "string" && config.controlAnywhereActorsFile) {
    try {
      for (const line of fs.readFileSync(config.controlAnywhereActorsFile, "utf8").split(/\r?\n/u)) {
        const id = line.replace(/#.*$/u, "").trim();
        if (id) {
          list.push(id);
        }
      }
    } catch {
      /* missing file = nobody extra */
    }
  }
  return list.includes(actorUserId);
}
