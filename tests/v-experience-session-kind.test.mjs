import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";

import { MARKERS, SYMBOL_KEYS, TASK_REGISTRY_BRIDGE } from "../apps/v-session-relay/plugin/core/contracts.js";
import {
  COPIES,
  KIND_ANCHOR,
  KIND_LABEL,
  KIND_PATCHED,
  MARKER,
  ORDER_ANCHOR,
  ORDER_PATCHED,
  TASK_KIND,
  buildManifest,
  patchExperienceSessionKind,
  sha256,
} from "../lab/release-files/v-experience-session-kind/patch.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");
const count = (haystack, needle) => haystack.split(needle).length - 1;
const APP_SOURCE = "apps/v-experience/v-experience.mjs";
const MANIFEST = "lab/release-files/v-experience-session-kind/manifest.json";
const V_BYTES = JSON.parse(read("tests/fixtures/inter-session-v-bytes.json"));

/** A row as the v-session-relay plugin adds it to the task registry bridge (design §3.5). */
const relayRow = (n, extra = {}) => ({
  taskId: `v-a2a:s_mgk3x1a2f9c1d2e3f4a${n}`,
  runtime: "session",
  taskKind: "sessions_send",
  label: `「任务群 ${n}」#7F3${n}`,
  status: "running",
  childSessionKey: `agent:main:feishu:group:oc_room${n}`,
  createdAt: 1,
  ...extra,
});

test("each copy V runs is the capture V runs, and the committed copy is its patch", () => {
  assert.deepEqual(COPIES.map((c) => c.component), ["core", "dingtalk", "wecom"]);
  for (const copy of COPIES) {
    const entry = V_BYTES.files.find((f) => f.captured === copy.capture);
    assert.ok(entry, `${copy.capture} is listed in inter-session-v-bytes.json`);
    assert.equal(entry.hostPath, copy.hostPath, `${copy.component}: the host path V loads`);
    const before = read(copy.capture);
    assert.equal(sha256(before), entry.sha256, `${copy.component}: the capture is the file V runs`);
    assert.equal(patchExperienceSessionKind(before), read(copy.source), `${copy.component}: generated from V's bytes`);
    execFileSync(process.execPath, ["--check", path.join(ROOT, copy.source)]);
  }
  const outputs = new Set(COPIES.map((c) => sha256(read(c.source))));
  assert.equal(outputs.size, 1, "the three copies stay byte-identical, as on V");
});

test("manifest records target paths and V's sha256 before and after", () => {
  const manifest = JSON.parse(read(MANIFEST));
  assert.deepEqual(manifest, buildManifest(ROOT));
  for (const [i, entry] of manifest.entries()) {
    assert.equal(entry.target, COPIES[i].target);
    assert.equal(entry.before, "5d939fa7109a68a52ed88d080f491636cce58d4095b2420a96e05cd090284f2b", "V's v-experience on 2026-10-20");
    assert.equal(entry.after, sha256(read(entry.source)));
  }
  // The same targets the v-experience-channels release wrote these files to.
  const channels = JSON.parse(read("lab/release-files/v-experience-channels/manifest.json"));
  for (const copy of COPIES) {
    const shipped = channels.find((e) => e.component === copy.component && e.path === copy.path);
    assert.ok(shipped, `${copy.component} ${copy.path} is the file v-experience-channels shipped`);
    assert.equal(shipped.after, manifest.find((e) => e.component === copy.component).before);
  }
});

test("marker and bridge literal agree with the frozen contracts", () => {
  assert.equal(MARKER, MARKERS.experienceSessionKind);
  for (const copy of COPIES) {
    const out = read(copy.source);
    assert.equal(count(out, MARKER), 1);
    assert.equal(count(out, `const TASK_BRIDGE = Symbol.for("${SYMBOL_KEYS.taskRegistryBridge}");`), 1, "v-experience reads the contract's bridge");
  }
});

test("only the kind order and the sessions_send kind change", () => {
  const before = read(COPIES[0].capture);
  assert.equal(count(before, ORDER_ANCHOR), 1);
  assert.equal(count(before, KIND_ANCHOR), 1);
  const after = read(COPIES[0].source);
  assert.equal(after.replace(ORDER_PATCHED, ORDER_ANCHOR).replace(KIND_PATCHED, KIND_ANCHOR), before);
  assert.throws(() => patchExperienceSessionKind(after), /already patched/u);
  assert.throws(() => patchExperienceSessionKind(before.replace(ORDER_ANCHOR, "")), /KIND_ORDER: expected exactly one anchor, found 0/u);
  assert.throws(() => patchExperienceSessionKind(before.replace(KIND_ANCHOR, "")), /backgroundKind taskKind: expected exactly one anchor, found 0/u);
});

test("the app source carries the same change, so the next full copy keeps it", () => {
  const app = read(APP_SOURCE);
  assert.equal(count(app, ORDER_PATCHED), 1);
  assert.equal(count(app, KIND_PATCHED), 1);
  assert.equal(count(app, MARKER), 1);
  const unpatched = app.replace(ORDER_PATCHED, ORDER_ANCHOR).replace(KIND_PATCHED, KIND_ANCHOR);
  assert.equal(patchExperienceSessionKind(unpatched), app);
});

test("Telegram, DingTalk and WeCom name a sessions_send request 「会话请求」", async () => {
  const modules = [
    ...COPIES.map((c) => c.source),
    APP_SOURCE,
  ];
  for (const rel of modules) {
    const vx = await import(pathToFileURL(path.join(ROOT, rel)).href);
    assert.equal(vx.backgroundKind(relayRow(1)), KIND_LABEL, rel);
    assert.equal(vx.backgroundKind({ runtime: "subagent", taskKind: TASK_KIND }), KIND_LABEL, `${rel}: the kind wins over the runtime`);
    assert.deepEqual(vx.backgroundTasks([relayRow(1)], "agent:main:feishu:direct:ou_abc").length, 1, `${rel}: a request is background work`);
    // design §7.9
    assert.equal(
      vx.backgroundLine([relayRow(1), { taskId: "e", runtime: "cli", taskKind: "exec" }, relayRow(2)]),
      "⏳ 后台 3 项进行中 · 会话请求 2 · 后台命令 1",
      rel,
    );
    assert.equal(vx.backgroundLine([relayRow(1)]), "⏳ 后台 1 项进行中 · 会话请求", rel);
    assert.equal(
      vx.backgroundLine([{ taskId: "s", runtime: "subagent" }, relayRow(1), { taskId: "c", runtime: "cron" }]),
      "⏳ 后台 3 项进行中 · 会话请求 1 · 子 agent 1 · 自动化 1",
      `${rel}: 「会话请求」 comes first`,
    );
    assert.equal(vx.backgroundLine([], { shownActive: true }), "☑️ 后台任务已结束");
  }
});

test("every other task keeps the kind V shows today", async () => {
  const original = await import(pathToFileURL(path.join(ROOT, COPIES[1].capture)).href);
  const patched = await import(pathToFileURL(path.join(ROOT, COPIES[1].source)).href);
  const tasks = [
    { runtime: "subagent" }, { runtime: "acp", taskKind: "x" }, { runtime: "cron" }, { runtime: "cli", taskKind: "exec" },
    { taskKind: "image_generation" }, { taskKind: "video_generation" }, { taskKind: "music_generation" },
    { runtime: "cli" }, { runtime: "session" }, { taskKind: "sessions_spawn" }, {}, null, undefined,
  ];
  for (const task of tasks) assert.equal(patched.backgroundKind(task), original.backgroundKind(task), JSON.stringify(task));
  const mixed = [{ runtime: "subagent" }, { runtime: "cli", taskKind: "exec" }, { runtime: "cli", taskKind: "exec" }, { taskKind: "image_generation" }, { runtime: "cron" }, { runtime: "cli" }];
  assert.equal(patched.backgroundLine(mixed), original.backgroundLine(mixed));
  assert.equal(original.backgroundKind(relayRow(1)), "后台任务", "unpatched V calls it a background task");
  assert.deepEqual(Object.keys(patched).sort(), Object.keys(original).sort(), "same exports");
});

test("the background line reads the plugin's rows through the task registry bridge", async () => {
  const vx = await import(pathToFileURL(path.join(ROOT, COPIES[0].source)).href);
  const key = "agent:main:telegram:direct:42";
  const saved = Object.getOwnPropertyDescriptor(globalThis, TASK_REGISTRY_BRIDGE);
  globalThis[TASK_REGISTRY_BRIDGE] = { listeners: new Set(), listActive: (k) => (k === key ? [relayRow(1), relayRow(2)] : []) };
  try {
    assert.equal(vx.currentBackgroundLine(key), "⏳ 后台 2 项进行中 · 会话请求");
    assert.equal(vx.currentBackgroundLine("agent:main:telegram:direct:7"), "");
  } finally {
    if (saved) Object.defineProperty(globalThis, TASK_REGISTRY_BRIDGE, saved);
    else delete globalThis[TASK_REGISTRY_BRIDGE];
  }
});
