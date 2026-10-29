// V's DingTalk and WeCom plugin bytes are rebuilt from the published npm
// packages by this repository's patches, byte for byte.
//
// Third-party plugins carry no source in the OpenClaw fork: this test is the
// source of record that release/source-map.json's dingtalk/wecom layers point
// at. Expected digests are V's bytes as of release-batch-20261028 (DingTalk:
// dingtalk-outbound-case-20261025; WeCom: fullread-doctor-dingtalk-20261025).
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { patchDingtalkConnector } from "../apps/v-experience/dingtalk/patch.mjs";
import { patchWeComPlugin } from "../apps/v-experience/wecom/patch.mjs";
import { patchWecomVlab2 } from "../lab/release-files/wecom-vlab2/patch.mjs";
import { SenderNameResolver, parseSenderNameLookup } from "../lab/release-files/wecom-vlab2/release/sender-name.js";

const repo = new URL("../", import.meta.url);
const at = (rel) => new URL(rel, repo).pathname;
const sha = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const bases = (layer) => JSON.parse(fs.readFileSync(at(`release/source-map/bases/${layer}.json`), "utf8")).files;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "third-party-v-bytes-"));
const put = (dir, rel, from) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true });
  fs.copyFileSync(at(from), path.join(dir, rel));
};

const DINGTALK_V = {
  "dist/connection-DCvu-l09.mjs": "397c42c3f66d0cd7898168de21be1607303723cd797d9174ad4b1d6694d44520",
  "dist/message-handler-BUoLSylZ.mjs": "5cd4d5d761641f8dd2809163ab5a00e55817f47e7b8c125f5533147e1db0ee23",
  "dist/runtime-C81EKBS1.mjs": "6c9d9e2d3604cc0a97824f498d047feecb7ce885bcda040c0e602a3fa3979835",
  "dist/v-experience.mjs": "6555ba08e72b4c46d58f8756a4e43bd4991371fbaab56fb904c507357cc784df",
};
const WECOM_V = {
  "README.md": "6df6dcf6fce0dfdc046295f48adb05ea3b1d8410c1eddc4914df44bf6b61aab3",
  "package.json": "fb2bbf0e3abd3c4e28e6c9e6b8a1efec3f50ceb0a0d80fe3bcb5a7db0bfcc28d",
  "dist/index.js": "3f3d4222b4874c86af19cef1da4c1d8e76e7500c1822279cd375c2544dba81d7",
  "dist/src/channel.js": "4b21464a5d55d728d1e6a51594d636b4153a8b88b7da0b88821567ac3edb1941",
  "dist/src/cli/tool.js": "c7b703958019ead892f06ad94f29aa1a6f3b2ff3bc6bc2a6fcfa9c728817d651",
  "dist/src/monitor.js": "f015717ebe8bd9371d37a252341c4e8a8089a32285997182d82e9886e6bd075c",
  "dist/src/sender-name.d.ts": "9911b9707df4a285d9abca6f4f5aff9c82db819df58a3aa1368d5b56f21cb84a",
  "dist/src/sender-name.js": "95a90ab47b6219ca059e22f4e7542f887bf93445c881ec0e376758bf1f8bcc85",
  "dist/src/v-experience.mjs": "a85c1d37db7a88d3556349c3a9a7bceb35b56f3fa431f36f76d1accd331a3850",
};

test("DingTalk connector 0.8.26 + apps/v-experience/dingtalk/patch.mjs = V", () => {
  const dir = tmp();
  const npm = bases("dingtalk");
  for (const name of ["connection-DCvu-l09.mjs", "message-handler-BUoLSylZ.mjs", "runtime-C81EKBS1.mjs", "token-xUW84QQ8.mjs"]) {
    put(dir, name, `apps/v-experience/dingtalk/baseline/${name}`);
    assert.equal(sha(path.join(dir, name)), npm[`dist/${name}`], `baseline ${name} is the npm file`);
  }
  // V runs the shared experience module as of 5978d5d5 (stored with the release).
  const experienceSource = at("lab/release-files/v-experience-dingtalk-peer-case-outbound/dist/v-experience.mjs");
  assert.equal(patchDingtalkConnector(dir, { experienceSource }).changed, true);
  for (const [rel, digest] of Object.entries(DINGTALK_V)) assert.equal(sha(path.join(dir, path.basename(rel))), digest, rel);
  assert.equal(patchDingtalkConnector(dir, { experienceSource }).changed, false, "second run changes nothing");
});

test("WeCom plugin 2026.8.17 + wecom-vlab2 + apps/v-experience/wecom/patch.mjs = V", () => {
  const dir = tmp();
  const npm = bases("wecom");
  const baseline = {
    "README.md": "lab/release-files/wecom-vlab2/baseline/README.md",
    "package.json": "lab/release-files/wecom-vlab2/baseline/package.json",
    "dist/index.js": "lab/release-files/wecom-vlab2/baseline/index.js",
    "dist/src/cli/tool.js": "lab/release-files/wecom-vlab2/baseline/cli-tool.js",
    "dist/src/monitor.js": "lab/release-files/wecom-vlab2/baseline/monitor.js",
    "dist/src/channel.js": "apps/v-experience/wecom/baseline/channel.js",
  };
  for (const [rel, from] of Object.entries(baseline)) {
    put(dir, rel, from);
    assert.equal(sha(path.join(dir, rel)), npm[rel], `baseline ${rel} is the npm file`);
  }
  assert.equal(patchWecomVlab2(dir).changed, true);
  // vlab.2 is the baseline the v-experience patch was written against.
  assert.equal(sha(path.join(dir, "dist/src/monitor.js")), sha(at("apps/v-experience/wecom/baseline/monitor.js")));
  const experienceSource = at("lab/release-files/v-experience-wecom-empty-reply/dist/src/v-experience.mjs");
  patchWeComPlugin(path.join(dir, "dist/src"), { experienceSource });
  for (const [rel, digest] of Object.entries(WECOM_V)) assert.equal(sha(path.join(dir, rel)), digest, rel);
  assert.equal(patchWecomVlab2(dir).changed, false, "second run changes nothing");
  assert.equal(patchWeComPlugin(path.join(dir, "dist/src"), { experienceSource }).changed, false);
});

test("WeCom sender name: exact userid only, no guessing", () => {
  const users = [{ userid: "other", name: "错误的人" }, { userid: "target", name: "正确的人" }];
  assert.equal(parseSenderNameLookup({ users }, "target"), "正确的人");
  assert.equal(parseSenderNameLookup(JSON.stringify({ users }), "target"), "正确的人");
  assert.equal(parseSenderNameLookup({ users: [{ userid: "TARGET", name: "大小写" }] }, "target"), "大小写");
  assert.equal(parseSenderNameLookup({ users: [{ userid: "other", name: "其他人" }] }, "target"), undefined);
  assert.equal(parseSenderNameLookup("not json", "target"), undefined);
});

test("WeCom sender name: cached, and a slow lookup falls back but warms the cache", async () => {
  let calls = 0;
  const cached = new SenderNameResolver({ lookup: async () => (calls++, { users: [{ userid: "target", name: "同事" }] }), timeoutMs: 50 });
  assert.equal(await cached.resolve("default", "target"), "同事");
  assert.equal(await cached.resolve("default", "target"), "同事");
  assert.equal(calls, 1);

  let finish;
  let slowCalls = 0;
  const slow = new SenderNameResolver({ lookup: () => (slowCalls++, new Promise((resolve) => (finish = resolve))), timeoutMs: 5 });
  assert.equal(await slow.resolve("default", "target"), undefined);
  finish({ users: [{ userid: "target", name: "慢查询同事" }] });
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.equal(await slow.resolve("default", "target"), "慢查询同事");
  assert.equal(slowCalls, 1);
});
