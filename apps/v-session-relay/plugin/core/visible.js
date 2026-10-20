// What people see of a request (design §7.7, §7.8): the visible body of an anchor, after
// MEDIA lines are folded, secrets are hidden, the audience rule and the channel limits apply.
// The model always gets the full text; only the visible copy is trimmed here.

import { CHANNEL_CAPS } from "./contracts.js";

export const REDACTED = "‹已隐去›";

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/gu,
  /\bsk-[A-Za-z0-9_-]{16,}/gu,
  /\bghp_[A-Za-z0-9]{20,}/gu,
  /\bxox[bpa]-[A-Za-z0-9-]{10,}/gu,
  /\bAKIA[0-9A-Z]{16}\b/gu,
];
// A run of ≥ 40 base64 / hex characters. Hex is hidden as is; base64 only when it mixes upper,
// lower and digits, so a long lowercase path or slug stays readable.
const TOKEN_RUN = /[A-Za-z0-9+/=_-]{40,}/gu;
const looksLikeToken = (s) => /^[0-9a-fA-F]{40,}$/u.test(s) || (/[A-Z]/u.test(s) && /[a-z]/u.test(s) && /[0-9]/u.test(s));

/** Hide secret-looking content. Returns `{ text, redactions }`. */
export function redactSecrets(input) {
  let text = String(input ?? "");
  let redactions = 0;
  for (const re of SECRET_PATTERNS) {
    text = text.replace(re, () => { redactions += 1; return REDACTED; });
  }
  text = text.replace(TOKEN_RUN, (m) => {
    if (!looksLikeToken(m)) return m;
    redactions += 1;
    return REDACTED;
  });
  return { text, redactions };
}

/** Drop `MEDIA:` lines and say how many files came with the message instead (§7.8). */
export function foldMediaLines(input) {
  const lines = String(input ?? "").split(/\r?\n/u);
  const kept = lines.filter((l) => !/^\s*MEDIA:/u.test(l));
  const files = lines.length - kept.length;
  const body = kept.join("\n").trim();
  if (files === 0) return { text: body, files };
  return { text: body ? `${body}\n附 ${files} 个文件` : `附 ${files} 个文件`, files };
}

const chars = (s) => [...String(s ?? "")];
export const charLength = (s) => chars(s).length;
export const byteLength = (s) => Buffer.byteLength(String(s ?? ""), "utf8");

/** First `n` characters (code points), never splitting a surrogate pair. */
export function firstChars(s, n) {
  const c = chars(s);
  return c.length <= n ? c.join("") : c.slice(0, Math.max(0, n)).join("");
}

/** Clip to `max` characters with a trailing `…` (labels, reasons). */
export function clip(s, max) {
  const c = chars(String(s ?? "").trim());
  return c.length <= max ? c.join("") : `${c.slice(0, Math.max(0, max - 1)).join("")}…`;
}

/** Cut to at most `maxBytes` UTF-8 bytes on a character boundary. */
export function firstBytes(s, maxBytes) {
  let out = "";
  let used = 0;
  for (const ch of chars(s)) {
    const b = Buffer.byteLength(ch, "utf8");
    if (used + b > maxBytes) break;
    out += ch;
    used += b;
  }
  return out;
}

/**
 * Who may read the whole request (§7.8): a chat only the owner and the bot are in, or a direct
 * chat whose other person is the chain's root person. Everyone else sees the first
 * `sharedVisibleChars` characters.
 */
export function audienceFor(route, principal) {
  if (!route) return "full"; // no chat: nothing is visible anyway
  if (route.humans === "owner_only") return "full";
  if (route.humans === "single_peer" && principal?.id && route.peerId
    && principal.channel === route.channel && principal.id === route.peerId) return "full";
  return "shared";
}

/**
 * The visible body of a request: folded, redacted, cut by audience and channel cap.
 * Returns `{ visibleText, trimmed, redactions, chars }` (chars = full message length).
 */
export function visibleRequestBody(message, { audience = "shared", sharedChars = 200, channel, caps } = {}) {
  const full = String(message ?? "");
  const folded = foldMediaLines(full);
  const { text: redacted, redactions } = redactSecrets(folded.text);
  const cap = caps ?? CHANNEL_CAPS[channel] ?? CHANNEL_CAPS.feishu;
  const limit = audience === "full" ? cap.maxVisibleChars : Math.min(sharedChars, cap.maxVisibleChars);
  let body = redacted.trim();
  let trimmed = false;
  if (charLength(body) > limit) {
    body = firstChars(body, limit).trimEnd();
    trimmed = true;
  }
  if (cap.maxVisibleBytes && byteLength(body) > cap.maxVisibleBytes) {
    body = firstBytes(body, cap.maxVisibleBytes).trimEnd();
    trimmed = true;
  }
  return { visibleText: body, trimmed, redactions, chars: charLength(full) };
}

/** Markdown escaping for DingTalk / WeCom bodies (same set as v-experience). */
export function escapeMarkdown(text) {
  return String(text ?? "").replace(/([\\`*_[\]<>#|~])/gu, "\\$1");
}

/**
 * Lines → the text a channel gets: Feishu and Telegram plain text; DingTalk and WeCom markdown
 * with the first line bold and everything escaped. WeCom is also held under its byte budget by
 * shortening the longest line (the body) first.
 */
export function formatForChannel(channel, lines, { caps } = {}) {
  const clean = lines.filter((l) => l !== undefined && l !== null && l !== "");
  if (channel !== "dingtalk" && channel !== "wecom") return clean.join("\n");
  // The first line is ours (labels may still carry markup) and is bolded; "#" mid-line is not a
  // heading, so it stays readable there. Every other line, the body above all, is fully escaped.
  const head = (l) => String(l).replace(/([\\`*_[\]<>|~])/gu, "\\$1");
  const render = (ls) => ls.map((l, i) => (i === 0 ? `**${head(l)}**` : escapeMarkdown(l))).join("\n\n");
  let out = render(clean);
  const maxBytes = (caps ?? CHANNEL_CAPS[channel])?.maxVisibleBytes;
  if (maxBytes && byteLength(out) > maxBytes) {
    const longest = clean.reduce((best, l, i) => (charLength(l) > charLength(clean[best]) ? i : best), 0);
    const over = byteLength(out) - maxBytes;
    const shorter = [...clean];
    shorter[longest] = `${firstBytes(clean[longest], Math.max(0, byteLength(clean[longest]) - over - 16)).trimEnd()}…`;
    out = render(shorter);
    if (byteLength(out) > maxBytes) out = firstBytes(out, maxBytes);
  }
  return out;
}
