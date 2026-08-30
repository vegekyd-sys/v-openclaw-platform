#!/usr/bin/env node

import crypto from "node:crypto";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`missing required environment variable: ${name}`);
  }
  return value;
}

function readFlag(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const appId = requiredEnv("VLAB_VCODEX_FEISHU_APP_ID");
const appSecret = requiredEnv("VLAB_VCODEX_FEISHU_APP_SECRET");
const chatId = requiredEnv("VLAB_VCODEX_ACCEPTANCE_CHAT_ID");
const marker = readFlag("--marker", "");
const seconds = Number(readFlag("--seconds", "120"));
const intervalMs = Number(readFlag("--interval-ms", "2000"));
const debugRaw = process.argv.includes("--debug-raw");

function parseCardContent(content) {
  try {
    const first = JSON.parse(content);
    if (typeof first === "string") return JSON.parse(first);
    if (typeof first?.json_card === "string") return JSON.parse(first.json_card);
    return first;
  } catch {
    return null;
  }
}

function collectUserVisibleText(value, output = []) {
  if (!value || typeof value !== "object") return output;
  if (Array.isArray(value)) {
    for (const entry of value) collectUserVisibleText(entry, output);
    return output;
  }
  for (const [key, entry] of Object.entries(value)) {
    if ((key === "content" || key === "text") && typeof entry === "string") {
      output.push(entry);
      continue;
    }
    collectUserVisibleText(entry, output);
  }
  return output;
}

function summarizeMeaningfulText(content) {
  const card = parseCardContent(content);
  if (!card) return { meaningfulText: "", meaningfulTextLength: 0 };
  const bodyElements = card?.body?.property?.elements;
  const contentElement = Array.isArray(bodyElements)
    ? bodyElements.find((element) => element?.id === "content")
    : null;
  const meaningfulText = collectUserVisibleText(contentElement ?? {})
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .filter((text) => !/^Agent:/u.test(text))
    .filter((text) => !/^(?:🧪\s*)?VCodex Streaming Lab$/u.test(text))
    .join(" ")
    .trim();
  return {
    meaningfulText,
    meaningfulTextLength: meaningfulText.length,
  };
}

if (!Number.isFinite(seconds) || seconds <= 0 || seconds > 1800) {
  throw new Error("--seconds must be between 1 and 1800");
}
if (!Number.isFinite(intervalMs) || intervalMs < 500 || intervalMs > 30000) {
  throw new Error("--interval-ms must be between 500 and 30000");
}

const tokenResponse = await fetch(
  "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal",
  {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ app_id: appId, app_secret: appSecret }),
  },
);
if (!tokenResponse.ok) {
  throw new Error(`Feishu token request failed: HTTP ${tokenResponse.status}`);
}
const tokenPayload = await tokenResponse.json();
if (tokenPayload.code !== 0 || !tokenPayload.tenant_access_token) {
  throw new Error(`Feishu token request failed: code ${tokenPayload.code}`);
}
const token = tokenPayload.tenant_access_token;

const startMs = Date.now();
const deadlineMs = startMs + seconds * 1000;
const seen = new Set();
let pollErrors = 0;

console.log(JSON.stringify({ type: "start", at: startMs, seconds, intervalMs }));

while (Date.now() < deadlineMs) {
  try {
    const url = new URL("https://open.feishu.cn/open-apis/im/v1/messages");
    url.searchParams.set("container_id_type", "chat");
    url.searchParams.set("container_id", chatId);
    url.searchParams.set("sort_type", "ByCreateTimeDesc");
    url.searchParams.set("page_size", "20");
    url.searchParams.set("card_msg_content_type", "raw_card_content");
    const response = await fetch(url, {
      headers: { authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const payload = await response.json();
    if (payload.code !== 0) {
      throw new Error(`code ${payload.code}`);
    }
    for (const item of payload.data?.items ?? []) {
      const createTime = Number(item.create_time ?? 0);
      const updateTime = Number(item.update_time ?? createTime);
      if (Math.max(createTime, updateTime) < startMs - 5000) {
        continue;
      }
      const content = String(item.body?.content ?? "");
      const { meaningfulText, meaningfulTextLength } = summarizeMeaningfulText(content);
      const contentHash = crypto.createHash("sha256").update(content).digest("hex").slice(0, 16);
      const messageHash = crypto
        .createHash("sha256")
        .update(String(item.message_id ?? ""))
        .digest("hex")
        .slice(0, 12);
      const eventKey = `${messageHash}:${updateTime}:${contentHash}`;
      if (seen.has(eventKey)) {
        continue;
      }
      seen.add(eventKey);
      console.log(
        JSON.stringify({
          type: "message",
          observedAt: Date.now(),
          elapsedMs: Date.now() - startMs,
          messageHash,
          msgType: item.msg_type,
          createTime,
          updateTime,
          contentLength: content.length,
          contentHash,
          meaningfulTextLength,
          hasMeaningfulText: meaningfulTextLength > 0,
          meaningfulPreview: meaningfulText.slice(0, 160),
          ...(debugRaw ? { rawPreview: content.slice(0, 1200) } : {}),
          markerVisible: Boolean(marker && content.includes(marker)),
          updated: Boolean(item.updated),
        }),
      );
    }
  } catch (error) {
    pollErrors += 1;
    console.log(
      JSON.stringify({
        type: "poll-error",
        at: Date.now(),
        error: error instanceof Error ? error.message : String(error),
      }),
    );
  }
  await new Promise((resolve) => setTimeout(resolve, intervalMs));
}

console.log(
  JSON.stringify({
    type: "end",
    at: Date.now(),
    elapsedMs: Date.now() - startMs,
    uniqueSnapshots: seen.size,
    pollErrors,
  }),
);
