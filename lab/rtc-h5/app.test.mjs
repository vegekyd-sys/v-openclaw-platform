import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("./", import.meta.url);

test("standalone H5 presents V first and keeps the four RTC stages available as details", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  for (const step of ["gateway", "sdk", "room", "audio"]) {
    assert.match(html, new RegExp(`data-step="${step}"`, "u"));
  }
  assert.match(html, /和 V 说说话/u);
  assert.match(html, /开始通话/u);
  assert.match(html, /我们的对话/u);
  assert.match(html, /<details class="connection-details">/u);
  for (const asset of ["v-idle-nohat", "v-tool-busy", "v-tool-very-busy"]) {
    assert.match(html, new RegExp(`assets/${asset}-20260922\\.png`, "u"));
  }
  assert.doesNotMatch(html, /小何语音验收|Codex 内置 Browser/u);
});

test("browser app uses the managed-room adapter and bridge without a browser token", async () => {
  const source = await readFile(new URL("app.js", root), "utf8");
  assert.match(source, /VolcengineRtcManagedRoomClient/u);
  assert.match(source, /api\/session/u);
  assert.match(source, /api\/tool-call/u);
  assert.match(source, /window\.location\.hash/u);
  assert.match(source, /api\/access/u);
  assert.match(source, /history\.replaceState/u);
  assert.match(source, /setAvatarState\("busy"\)/u);
  assert.match(source, /setAvatarState\("very-busy"\)/u);
  assert.match(source, /5_000/u);
  assert.doesNotMatch(source, /gatewayToken|apiKey|password/u);
});

test("bridge stays loopback-only and isolates authenticated public visitors", async () => {
  const source = await readFile(new URL("server.mjs", root), "utf8");
  assert.match(source, /RTC_H5_HOST \?\? "127\.0\.0\.1"/u);
  assert.match(source, /RTC_H5_ACCESS_TOKEN/u);
  assert.match(source, /RTC_H5_BASE_PATH/u);
  assert.match(source, /RTC_H5_MAX_ACTIVE_SESSIONS/u);
  assert.match(source, /agent:makaron:voice-h5-/u);
  assert.match(source, /HttpOnly; SameSite=Strict/u);
  assert.match(source, /publicPath === basePath/u);
  assert.match(source, /talk\.client\.create/u);
  assert.match(source, /talk\.client\.toolCall/u);
  assert.doesNotMatch(source, /0\.0\.0\.0/u);
  assert.match(source, /max-age=31536000, immutable/u);
  assert.doesNotMatch(source, /connected: true, sessionKey/u);
});

test("page assets and APIs are relative so the H5 can live under /voice/", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  const source = await readFile(new URL("app.js", root), "utf8");
  assert.match(html, /href="\.\/styles\.css"/u);
  assert.match(html, /src="\.\/app\.js"/u);
  assert.doesNotMatch(html, /(?:href|src)="\/(?:assets|styles|app)/u);
  assert.match(source, /api\("api\/status"\)/u);
  assert.doesNotMatch(source, /api\("\/api\//u);
});

test("local proxy keeps the large SDK off the SSH tunnel", async () => {
  const source = await readFile(new URL("local-proxy.mjs", root), "utf8");
  assert.match(source, /volcengine-rtc-4\.68\.1\.esm\.js/u);
  assert.match(source, /RTC_H5_UPSTREAM/u);
  assert.match(source, /RTC_H5_HOST \?\? "127\.0\.0\.1"/u);
  assert.doesNotMatch(source, /OPENCLAW_CONFIG_PATH|gateway\.auth/u);
  assert.match(source, /assets\/v-tool-very-busy-20260922\.png/u);
});
