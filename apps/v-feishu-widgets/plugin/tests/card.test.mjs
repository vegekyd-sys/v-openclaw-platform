import assert from "node:assert/strict";
import test from "node:test";
import { openLinks, widgetCard } from "../core/card.js";
import { feishuCredentials, feishuTarget } from "../core/feishu.js";

test("desktop opens in the sidebar, phones in the in-app web view", () => {
  const url = "https://w.example/v-widgets/w/abc?x=1";
  const links = openLinks(url);
  const pc = new URL(links.pc_url);
  assert.equal(pc.origin + pc.pathname, "https://applink.feishu.cn/client/web_url/open");
  assert.equal(pc.searchParams.get("mode"), "sidebar-semi");
  assert.equal(pc.searchParams.get("url"), url);
  assert.equal(links.ios_url, url);
  assert.equal(links.android_url, url);
});

test("card is schema 2.0, updatable, and shows the picture only when there is one", () => {
  const plain = widgetCard({ title: "选方案", url: "https://w.example/w/a" });
  assert.equal(plain.schema, "2.0");
  assert.equal(plain.config.update_multi, true);
  assert.equal(plain.body.elements.length, 1);
  assert.equal(plain.body.elements[0].tag, "button");
  const behavior = plain.body.elements[0].behaviors[0];
  assert.equal(behavior.type, "open_url");
  assert.equal(behavior.ios_url, "https://w.example/w/a");
  assert.match(behavior.pc_url, /sidebar-semi/u);
  const pictured = widgetCard({ title: "选方案", url: "https://w.example/w/a", imageKey: "img_x", version: 3 });
  assert.equal(pictured.body.elements[0].tag, "img");
  assert.equal(pictured.body.elements[0].img_key, "img_x");
  assert.match(pictured.body.elements.at(-1).content, /第 3 版/u);
});

test("targets", () => {
  assert.deepEqual(feishuTarget("chat:oc_1"), { receiveIdType: "chat_id", receiveId: "oc_1", chatType: "group" });
  assert.deepEqual(feishuTarget("user:ou_1"), { receiveIdType: "open_id", receiveId: "ou_1", chatType: "p2p" });
  assert.deepEqual(feishuTarget("oc_1").receiveId, "oc_1");
  assert.equal(feishuTarget("telegram:123"), null);
});

test("credentials: disabled channel is unavailable, account overrides top level", () => {
  assert.equal(feishuCredentials({ channels: { feishu: { enabled: false, appId: "a", appSecret: "s" } } }), null);
  const creds = feishuCredentials({ channels: { feishu: { appId: "a", appSecret: "s", accounts: { two: { appId: "b", appSecret: "t" } } } } }, "two");
  assert.equal(creds.appId, "b");
  assert.equal(creds.host, "https://open.feishu.cn");
});
