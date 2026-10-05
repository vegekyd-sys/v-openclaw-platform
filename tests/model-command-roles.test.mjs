// C1 on every channel: non-owners admitted by commands.allowFrom get /model
// only. The core patch is checked against V's bytes (V2, Feishu only), a
// stock 9.1 file reconstructed from them, and its own output.
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { patchCommandAuth } from "../lab/release-files/feishu-model-switch-roles/patch-runtime.mjs";

const dir = new URL("../lab/release-files/feishu-model-switch-roles/", import.meta.url);
const v3 = fs.readFileSync(new URL("command-auth-DmNN2m2f.js", dir), "utf8");
const v2 = fs.readFileSync(new URL("../release/captured/hotreload-feishu-approvals-20261003/dist/command-auth-DmNN2m2f.js", import.meta.url), "utf8");
// V2 applied to stock 9.1, undone.
const stock = v2
  .replace(/\t\tproviderId,\n\t\tsenderIsOwner,\n\t\tcommandText: ctx\.commandText \?\? ctx\.Body \?\? "",\n/u, "")
  .replace(/\t\tif \(params\.providerResolutionError \|\| [^\n]*\n[^\n]*FEISHU_MODEL_COMMAND_ONLY_V2[^\n]*\n[^\n]*\n\s*return "commands";/u,
    '\t\treturn !params.providerResolutionError && (commandsAllowAll || Boolean(matchedCommandsAllowFrom)) ? "commands" : "denied";');

test("V's V2 runtime and a stock runtime both become the committed V3 file", () => {
  // npm openclaw@2026.9.1 (baseSha256 in the capture manifest)
  assert.equal(crypto.createHash("sha256").update(stock).digest("hex"), "30fbbd2fc5418d17aa346e583e057fe610f4a9e69d1267c5213949df66b25857");
  assert.deepEqual(patchCommandAuth(v2), { state: "upgrade-v2", updated: v3 });
  assert.deepEqual(patchCommandAuth(stock), { state: "pending", updated: v3 });
  assert.deepEqual(patchCommandAuth(v3), { state: "already", updated: v3 });
  assert.throws(() => patchCommandAuth(stock.replace("function", "/* FEISHU_MODEL_SWITCH_ROLES_V1 */ function")), /older model-switch patch/u);
});

test("policy: Feishu unchanged, other V channels follow it, other channels stock", () => {
  const core = fs.mkdtempSync(path.join(os.tmpdir(), "model-roles-"));
  fs.mkdirSync(path.join(core, "dist"));
  fs.writeFileSync(path.join(core, "dist", "command-auth-DmNN2m2f.js"), v3);
  const run = spawnSync(process.execPath, [new URL("test-policy.mjs", dir).pathname, core], { encoding: "utf8" });
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /assertions passed/u);
});
