import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("./", import.meta.url);

test("standalone H5 exposes the four observable RTC stages", async () => {
  const html = await readFile(new URL("index.html", root), "utf8");
  for (const step of ["gateway", "sdk", "room", "audio"]) {
    assert.match(html, new RegExp(`data-step="${step}"`, "u"));
  }
  assert.match(html, /开始语音/u);
  assert.match(html, /实时文字/u);
});

test("browser app uses the managed-room adapter and bridge without a browser token", async () => {
  const source = await readFile(new URL("app.js", root), "utf8");
  assert.match(source, /VolcengineRtcManagedRoomClient/u);
  assert.match(source, /\/api\/session/u);
  assert.match(source, /\/api\/tool-call/u);
  assert.doesNotMatch(source, /gatewayToken|apiKey|password/u);
});

test("bridge stays loopback-only and limits its mutation surface", async () => {
  const source = await readFile(new URL("server.mjs", root), "utf8");
  assert.match(source, /RTC_H5_HOST \?\? "127\.0\.0\.1"/u);
  assert.match(source, /talk\.client\.create/u);
  assert.match(source, /talk\.client\.toolCall/u);
  assert.doesNotMatch(source, /0\.0\.0\.0/u);
  assert.match(source, /max-age=31536000, immutable/u);
});

test("local proxy keeps the large SDK off the SSH tunnel", async () => {
  const source = await readFile(new URL("local-proxy.mjs", root), "utf8");
  assert.match(source, /volcengine-rtc-4\.68\.1\.esm\.js/u);
  assert.match(source, /RTC_H5_UPSTREAM/u);
  assert.match(source, /RTC_H5_HOST \?\? "127\.0\.0\.1"/u);
  assert.doesNotMatch(source, /OPENCLAW_CONFIG_PATH|gateway\.auth/u);
});
