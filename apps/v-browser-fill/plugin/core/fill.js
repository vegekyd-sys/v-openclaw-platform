// Types a credential from the secret store into a field of the page V is driving,
// without the value passing through the agent.
//
// The value arrives the way every credential does: the agent asks with the native
// `secrets` tool (Feishu card in the chat, one-time link on Telegram/DingTalk/WeCom),
// anyone in the conversation answers, and the Gateway stores it. This module then
// reads it in-process, types it with the same in-process browser control the agent's
// `browser` tool uses (so the snapshot ref the agent saw resolves), and deletes it.
// The agent only learns that the field was filled.
//
// The entry's allowed hosts say which site the credential belongs to: the tab must be
// on one of them, so a password asked for one site cannot be typed into another.
//
// Pure logic; every effect is injected (see index.js for the native bindings).

// Only entries asked for a login (LOGIN_<SITE>_PASSWORD / _CODE ...). Anything else in the
// store -- API keys the Gateway and Workers use, like MAKARON_API_KEY -- is never read,
// typed or deleted by this tool, whatever its allowed hosts are.
export const NAME_RE = /^LOGIN_[A-Z0-9_]{1,122}$/u;

export class FillError extends Error {
  constructor(code, message) {
    super(message);
    this.name = "FillError";
    this.code = code;
  }
}

export function hostOf(url) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    return parsed.hostname.toLowerCase().replace(/\.$/u, "") || null;
  } catch {
    return null;
  }
}

/** Removes every occurrence of the value from text that may reach the agent. */
export function scrub(text, value) {
  const s = String(text ?? "");
  return value ? s.split(value).join("[redacted]") : s;
}

function browserError(response) {
  const body = response?.body;
  if (body && typeof body === "object" && typeof body.error === "string") return body.error;
  return `browser request failed (${response?.status ?? "no status"})`;
}

async function resolveTab({ targetId, profile, signal }, dispatch) {
  const response = await dispatch({ method: "GET", path: "/tabs", query: profile ? { profile } : {}, signal });
  if (!response || response.status >= 400) throw new FillError("BROWSER_UNAVAILABLE", browserError(response));
  const tabs = Array.isArray(response.body?.tabs) ? response.body.tabs : [];
  if (targetId) {
    const tab = tabs.find((t) => t?.targetId === targetId || t?.suggestedTargetId === targetId);
    if (!tab) throw new FillError("TAB_NOT_FOUND", `No tab ${targetId} in browser profile ${profile ?? "default"}. Take a fresh snapshot and pass its targetId.`);
    return tab;
  }
  if (tabs.length === 1) return tabs[0];
  throw new FillError("TAB_AMBIGUOUS", `${tabs.length} tabs are open; pass the targetId of the login page from your latest snapshot.`);
}

/**
 * deps: {
 *   entry(name) -> { kind, allowedHosts: string[] } | null   (metadata, never the value)
 *   readValue(name) -> string                                  (registers it for redaction)
 *   remove(name) -> void                                       (store row and any mirror)
 *   dispatch({ method, path, query, body, signal }) -> { status, body }
 * }
 */
export async function fillSecret(params, deps, signal) {
  const name = typeof params?.name === "string" ? params.name.trim() : "";
  const ref = typeof params?.ref === "string" ? params.ref.trim() : "";
  if (!NAME_RE.test(name)) throw new FillError("INVALID_NAME", "Only entries named LOGIN_<SITE>_<FIELD> can be filled (e.g. LOGIN_EXAMPLE_PASSWORD); ask for the login value with that name.");
  if (!ref) throw new FillError("REF_REQUIRED", "ref is required: the field's ref from your latest browser snapshot.");
  const profile = typeof params.profile === "string" && params.profile.trim() ? params.profile.trim() : undefined;
  const targetId = typeof params.targetId === "string" && params.targetId.trim() ? params.targetId.trim() : undefined;

  const entry = await deps.entry(name);
  if (!entry) throw new FillError("NOT_FOUND", `No credential named ${name}. Ask for it first with the secrets tool (action=request, name=${name}, allowedHosts=[the login page's host]).`);
  if (entry.kind !== "secret") throw new FillError("NOT_A_SECRET", `${name} is not a protected secret entry.`);
  const allowed = (entry.allowedHosts ?? []).map((h) => String(h).toLowerCase());
  if (allowed.length === 0) throw new FillError("NO_SITE", `${name} has no allowed host, so the site it belongs to is unknown. Ask again with allowedHosts set to the login page's host.`);

  const tab = await resolveTab({ targetId, profile, signal }, deps.dispatch);
  const host = hostOf(tab.url);
  if (!host || !allowed.includes(host)) {
    throw new FillError("HOST_MISMATCH", `The tab is on ${host ?? "a non-web page"}, but ${name} belongs to ${allowed.join(", ")}. It is only typed into a page on one of those hosts.`);
  }

  const value = await deps.readValue(name);
  let response;
  try {
    response = await deps.dispatch({
      method: "POST",
      path: "/act",
      query: profile ? { profile } : {},
      body: { kind: "type", ref, text: value, targetId: tab.targetId, ...(params.submit === true ? { submit: true } : {}) },
      signal,
    });
  } catch (error) {
    throw new FillError("TYPE_FAILED", scrub(error?.message ?? error, value));
  }
  if (!response || response.status >= 400) throw new FillError("TYPE_FAILED", scrub(browserError(response), value));

  let removed = false;
  if (params.keep !== true) {
    await deps.remove(name);
    removed = true;
  }
  return { filled: true, name, host, targetId: tab.targetId, submitted: params.submit === true, removed };
}
