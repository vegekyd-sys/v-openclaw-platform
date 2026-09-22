#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  patchVolcengineRtcManagedRoomHarness,
  patchVolcengineRtcManagedRoomTalk,
} from "./patch-volcengine-rtc-managed-room-core.mjs";
import { patchProductionWorkerForVolcengineRtcAgent } from "./patch-volcengine-rtc-agent-provider.mjs";
import {
  FILES as SECRET_ENTRY_CORE_FILES,
  patchSecretEntrySource,
} from "./release-files/feishu-secret-entry/patch-openclaw91-secret-entry.mjs";
import {
  inlineCardModule,
  patchFeishuSecretEntryBundle,
} from "./release-files/feishu-secret-entry/patch-feishu-secret-entry.mjs";

const args = process.argv.slice(2);
const readArg = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
};
const core = resolve(readArg("--core") ?? "");
const worker = resolve(readArg("--worker") ?? "");
const feishu = resolve(readArg("--feishu") ?? "");
const outDir = readArg("--out-dir") ? resolve(readArg("--out-dir")) : undefined;
assert(readArg("--core") && readArg("--worker") && readArg("--feishu"), "--core, --worker and --feishu are required");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const report = [];
const productionCoreTargets = {
  builtin: "builtin-openclaw-zQV8Wwjr.js",
  dispatch: "dispatch-from-config-DOJq_7CI.js",
  question: "question-BdQvLMDb.js",
  tools: "openclaw-tools-BODVdJQD.js",
};

function emit(scope, path, source, patched) {
  const entry = {
    scope,
    file: basename(path),
    before: sha256(source),
    after: sha256(patched),
    changed: source !== patched,
  };
  report.push(entry);
  if (outDir) {
    const destination = join(outDir, scope, basename(path));
    mkdirSync(join(outDir, scope), { recursive: true });
    writeFileSync(destination, patched, { mode: 0o600 });
  }
}

const talkPath = join(core, "dist/talk-DkFuKRod.js");
const talkSource = readFileSync(talkPath, "utf8");
emit("core", talkPath, talkSource, patchVolcengineRtcManagedRoomTalk(talkSource));

const harnessPath = join(core, "dist/realtime-session-harness-CEO5kVAJ.js");
const harnessSource = readFileSync(harnessPath, "utf8");
emit("core", harnessPath, harnessSource, patchVolcengineRtcManagedRoomHarness(harnessSource));

const workerIndexPath = join(worker, "index.mjs");
const workerIndexSource = readFileSync(workerIndexPath, "utf8");
emit("worker", workerIndexPath, workerIndexSource, patchProductionWorkerForVolcengineRtcAgent(workerIndexSource));

const providerPath = fileURLToPath(new URL("./release-files/volcengine-rtc-agent/volcengine-rtc-agent-provider.mjs", import.meta.url));
const providerSource = readFileSync(providerPath, "utf8");
emit("worker", join(worker, "volcengine-rtc-agent-provider.mjs"), "", providerSource);

for (const spec of SECRET_ENTRY_CORE_FILES) {
  const targetName = productionCoreTargets[spec.id];
  assert(targetName && spec.pattern.test(targetName), `${spec.id}: production target is invalid`);
  const path = join(core, "dist", targetName);
  const source = readFileSync(path, "utf8");
  if (spec.contains) assert(source.includes(spec.contains), `${spec.id}: production target has the wrong module shape`);
  emit("core", path, source, patchSecretEntrySource(spec.id, source).source);
}

const monitorNames = readdirSync(join(feishu, "dist")).filter((name) => /^monitor\.account-[A-Za-z0-9_-]+\.js$/u.test(name));
assert.equal(monitorNames.length, 1, `expected one Feishu monitor bundle, found ${monitorNames.length}`);
const monitorPath = join(feishu, "dist", monitorNames[0]);
const monitorSource = readFileSync(monitorPath, "utf8");
emit("feishu", monitorPath, monitorSource, patchFeishuSecretEntryBundle(monitorSource, inlineCardModule()).source);

console.log(JSON.stringify({ ok: true, outDir: outDir ?? null, files: report }, null, 2));
