// Crash injection (design §10.1): a real process exits (VSR_CRASH_AT) right at each phase's
// ledger write; a second process recovers with the same fake channel world. For every phase:
// at most one wake per batch, no result lost (every send handed back), and on Feishu (uuid
// dedupe) no request or hand-back anchor appears twice.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";

import { CRASH_EXIT_CODE } from "../core/ledger.js";
import { tmpDir } from "./fixtures/harness.mjs";

const CHILD = fileURLToPath(new URL("./fixtures/crash-child.mjs", import.meta.url));
const PHASES = [
  "accepted", "posting", "before:posted", "posted", "starting", "before:running", "running",
  "before:target_done", "target_done", "result_ready", "waking", "before:woken", "woken",
];

function life(dir, worldFile, mode, crashAt) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.VSR_CRASH_AT;
    delete env.VSR_TEST_START_DELAY_MS;
    if (crashAt) env.VSR_CRASH_AT = crashAt;
    execFile(process.execPath, [CHILD, dir, worldFile, mode], { env, timeout: 20_000 }, (err, stdout, stderr) => {
      resolve({ code: err ? err.code : 0, stdout, stderr });
    });
  });
}

async function scenario(crashAt) {
  const root = tmpDir("vsr-crash-");
  const dir = path.join(root, "ledger");
  const worldFile = path.join(root, "world.json");
  try {
    const first = await life(dir, worldFile, "first", crashAt);
    assert.equal(first.code, CRASH_EXIT_CODE, `${crashAt}: the first life should crash (stderr: ${first.stderr.slice(0, 400)})`);
    const second = await life(dir, worldFile, "recover", null);
    assert.equal(second.code, 0, `${crashAt}: recovery did not settle: ${second.stdout} ${second.stderr.slice(0, 800)}`);
    const state = JSON.parse(second.stdout);
    const world = JSON.parse(fs.readFileSync(worldFile, "utf8"));

    // No lost result: every accepted send was handed back (with its result or its failure).
    assert(state.sends.length >= 1, crashAt);
    for (const s of state.sends) assert.equal(s.phase, "handed_back", `${crashAt}: ${s.sendId} ended ${s.phase}`);
    // At most one wake per batch was admitted, across both lives.
    for (const b of state.batches) {
      const admitted = world.starts.filter((x) => x.kind === "wake" && x.id === b.batchId && x.status === "started");
      assert(admitted.length <= 1, `${crashAt}: batch ${b.batchId} woken ${admitted.length} times`);
      assert.equal(admitted.length, 1, `${crashAt}: batch ${b.batchId} never woken`);
    }
    // Every attempt id is used once across both lives (the core drops a repeated MessageSid; a
    // Worker refuses a runId it already ran).
    const sids = world.starts.map((x) => x.messageSid);
    assert.equal(new Set(sids).size, sids.length, `${crashAt}: a MessageSid was reused: ${sids.join(" ")}`);
    // A target turn is never run twice once it may have started.
    for (const s of state.sends) {
      const started = world.starts.filter((x) => x.kind === "request" && x.id === s.sendId && x.status === "started");
      assert.equal(started.length, 1, `${crashAt}: ${s.sendId} started ${started.length} times`);
    }
    // Feishu (idempotent posts): one request anchor per send, one hand-back per batch.
    for (const s of state.sends) {
      const anchors = world.visible.filter((v) => v.text.startsWith("📨") && v.text.includes(`#${s.code}`));
      assert.equal(anchors.length, 1, `${crashAt}: ${anchors.length} anchors for #${s.code}`);
    }
    const handbacks = world.visible.filter((v) => /^(↩️|⚠️「|⏹「)/u.test(v.text));
    assert.equal(handbacks.length, state.batches.length, `${crashAt}: hand-backs ${handbacks.map((h) => h.text).join(" | ")}`);
    return { state, world };
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("crash injection: every phase, two lives, one wake, nothing lost, nothing posted twice", async () => {
  const results = new Map();
  const queue = [...PHASES];
  const workers = Array.from({ length: 4 }, async () => {
    while (queue.length) {
      const phase = queue.shift();
      results.set(phase, await scenario(phase));
    }
  });
  await Promise.all(workers);
  // Spot checks of what recovery chose.
  const running = results.get("running").state;
  assert(running.sends.some((s) => s.failure === "interrupted"), "a running target turn is reported interrupted, not re-run");
  const posted = results.get("posted").world;
  assert(posted.starts.some((x) => x.kind === "request" && x.attempt === 1), "posted → queued again with attempt+1");
  const beforeWoken = results.get("before:woken").world;
  assert(beforeWoken.visible.some((v) => v.text.startsWith("⚠️ V 重启打断了")), "an admitted wake that died is reported, not repeated");
  const waking = results.get("waking").world;
  assert(waking.starts.some((x) => x.kind === "wake" && x.attempt === 1 && x.life === 2), "an unadmitted wake is woken again");
});
