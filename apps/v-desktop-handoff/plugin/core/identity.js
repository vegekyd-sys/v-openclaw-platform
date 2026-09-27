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

/** Actors allowed to request a control link from any conversation (the owner). */
export function isControlAnywhereActor(actorUserId, config = {}) {
  const list = Array.isArray(config.controlAnywhereActors) ? config.controlAnywhereActors : [];
  return typeof actorUserId === "string" && list.includes(actorUserId);
}
