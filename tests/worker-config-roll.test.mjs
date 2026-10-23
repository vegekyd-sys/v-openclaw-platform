// worker-config-roll.1: a hot Gateway config change always rolls the Worker
// generation, whichever plugin registration derived worker-openclaw.json.
// Runs against V's captured plugin bytes (2026-10-19) with the release files of
// lab/release-files/worker-config-roll laid over them, using the real
// derivation and real files.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cpSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test, { after } from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { patchWorkerIndex, INDEX_BEFORE, WATCH_BEFORE } from "../lab/build-worker-config-roll.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = path.join(root, "release/captured/v2026.9.1-db91.6-codex-ds-window-20261019.worker/dist");
const overlay = path.join(root, "lab/release-files/worker-config-roll");
const tmp = mkdtempSync(path.join(tmpdir(), "worker-config-roll-"));
const fixed = path.join(tmp, "fixed");
const shipped = path.join(tmp, "shipped");
cpSync(base, fixed, { recursive: true });
cpSync(base, shipped, { recursive: true });
cpSync(path.join(overlay, "worker-config-watch.mjs"), path.join(fixed, "worker-config-watch.mjs"));
after(() => rmSync(tmp, { recursive: true, force: true }));

const sha256 = (value) => createHash("sha256").update(value).digest("hex");
const fixedWatch = await import(pathToFileURL(path.join(fixed, "worker-config-watch.mjs")).href);
const shippedWatch = await import(pathToFileURL(path.join(shipped, "worker-config-watch.mjs")).href);
const { deriveWorkerConfigFile } = await import(pathToFileURL(path.join(fixed, "worker-config-derive.mjs")).href);

const MODEL = "deepseek/deepseek-flash";
const gatewayConfig = (maxTokens, extra = {}) => ({
  agents: { defaults: { model: { primary: MODEL }, models: { [MODEL]: { alias: "deepseek", agentRuntime: { id: "vlab-worker" } } } } },
  models: { providers: { deepseek: { models: [{ id: "deepseek-flash", contextWindow: 980000, maxTokens }] } } },
  ...extra,
});

let fixtureId = 0;
function fixture(watchModule) {
  fixtureId += 1;
  const gatewayConfigPath = path.join(tmp, `gateway-${fixtureId}.json`);
  const workerConfigPath = path.join(tmp, `worker-${fixtureId}.json`);
  let clock = Date.now();
  const writeGateway = (config) => {
    writeFileSync(gatewayConfigPath, `${JSON.stringify(config, null, 2)}\n`);
    clock += 1_000; // distinct mtimes even on coarse file systems
    utimesSync(gatewayConfigPath, new Date(clock), new Date(clock));
  };
  const derive = () => deriveWorkerConfigFile({ gatewayConfigPath, workerConfigPath });
  writeGateway(gatewayConfig(384000));
  derive();
  // The live generation, as acquireSharedPool records it.
  const generation = { n: 1, live: true, snapshot: fixedWatch.readWorkerConfigSnapshot(workerConfigPath) };
  const rolls = [];
  let derives = 0;
  const watch = watchModule.createWorkerConfigWatch({
    gatewayConfigPath,
    workerConfigPath,
    intervalMs: 1_000_000, // driven by tick() below
    derive: () => { derives += 1; return derive(); },
    runningWorkerConfig: () => (generation.live ? generation.snapshot : undefined),
    async onWorkerConfigChanged(result) {
      rolls.push(result.changedPaths);
      generation.n += 1;
      generation.snapshot = fixedWatch.readWorkerConfigSnapshot(workerConfigPath);
    },
  });
  watch.start();
  const workerMaxTokens = () =>
    JSON.parse(readFileSync(workerConfigPath, "utf8")).models.providers.deepseek.models[0].maxTokens;
  return { gatewayConfigPath, workerConfigPath, writeGateway, derive, generation, rolls, watch, workerMaxTokens, derives: () => derives };
}
const settle = async (watch, ticks = 3) => { for (let i = 0; i < ticks; i++) await watch.tick(); };

test("the registration derives first, then the watch still rolls (the PR #434 candidate order)", async () => {
  const f = fixture(fixedWatch);
  f.writeGateway(gatewayConfig(64000));
  // 9.1 registers the plugin again on a models.* reload; that registration
  // rewrites the Worker file before the watch's own derivation runs.
  assert.equal(f.derive().changed, true);
  await settle(f.watch);
  assert.equal(f.workerMaxTokens(), 64000);
  assert.equal(f.rolls.length, 1, "running Workers were spawned with 384000: roll");
  assert.ok(f.rolls[0].some((p) => p.startsWith("models.providers.deepseek")), f.rolls[0].join(","));
  assert.equal(f.generation.n, 2);
  await settle(f.watch);
  assert.equal(f.rolls.length, 1, "the new generation already has the new file: no second roll");
  f.watch.stop();
});

test("control: V's shipped watch misses the same order and never rolls", async () => {
  assert.equal(sha256(readFileSync(path.join(shipped, "worker-config-watch.mjs"))), WATCH_BEFORE);
  const f = fixture(shippedWatch);
  f.writeGateway(gatewayConfig(64000));
  assert.equal(f.derive().changed, true);
  await settle(f.watch);
  assert.equal(f.workerMaxTokens(), 64000);
  assert.equal(f.rolls.length, 0, "the bug: the watch finds the file current");
  f.watch.stop();
});

test("the watch derives first (V 2026-10-19 17:44 order): one roll, the late registration adds none", async () => {
  const f = fixture(fixedWatch);
  f.writeGateway(gatewayConfig(64000));
  await settle(f.watch);
  assert.equal(f.rolls.length, 1);
  assert.equal(f.derive().changed, false, "the registration finds the file current");
  await settle(f.watch);
  assert.equal(f.rolls.length, 1);
});

test("a Worker file change alone triggers one derivation, and our own rewrite none", async () => {
  const f = fixture(fixedWatch);
  // A hand edit (or a registration's derivation) moves only the Worker file.
  const before = f.derives();
  writeFileSync(f.workerConfigPath, `${JSON.stringify({ ...JSON.parse(readFileSync(f.workerConfigPath, "utf8")), tools: { profile: "full" } }, null, 2)}\n`);
  await settle(f.watch);
  assert.equal(f.derives() - before, 1, "the Worker file change triggers one derivation");
  // The derivation restores the Gateway-derived file, which equals what the
  // generation runs with: nothing to roll.
  assert.equal(f.rolls.length, 0);
  assert.equal(f.generation.snapshot.sha256, fixedWatch.readWorkerConfigSnapshot(f.workerConfigPath).sha256);
  await settle(f.watch);
  assert.equal(f.derives() - before, 1, "the watch's own rewrite is not a new change");
});

test("meta bookkeeping alone never rolls; a later real change rolls with all differences", async () => {
  const f = fixture(fixedWatch);
  f.writeGateway(gatewayConfig(384000, { meta: { lastTouchedVersion: "2026.9.1-x" } }));
  f.derive();
  await settle(f.watch);
  assert.equal(f.rolls.length, 0, "meta only");
  f.writeGateway(gatewayConfig(64000, { meta: { lastTouchedVersion: "2026.9.1-y" } }));
  f.derive();
  await settle(f.watch);
  assert.equal(f.rolls.length, 1);
  assert.ok(f.rolls[0].some((p) => p.startsWith("meta")), "the unrolled meta difference is reported too");
  assert.ok(f.rolls[0].some((p) => p.startsWith("models.")));
});

test("no live generation: nothing to roll", async () => {
  const f = fixture(fixedWatch);
  f.generation.live = false;
  f.writeGateway(gatewayConfig(64000));
  f.derive();
  await settle(f.watch);
  assert.equal(f.rolls.length, 0);
});

test("a failed roll is retried by the next change", async () => {
  const f = fixture(fixedWatch);
  let fail = true;
  const rolls = [];
  const watch = fixedWatch.createWorkerConfigWatch({
    gatewayConfigPath: f.gatewayConfigPath,
    workerConfigPath: f.workerConfigPath,
    intervalMs: 1_000_000,
    derive: f.derive,
    runningWorkerConfig: () => f.generation.snapshot,
    async onWorkerConfigChanged(result) {
      if (fail) throw new Error("roll failed");
      rolls.push(result.changedPaths);
    },
    logger: { warn() {} },
  });
  f.watch.stop();
  watch.start();
  f.writeGateway(gatewayConfig(64000));
  await settle(watch);
  fail = false;
  f.writeGateway(gatewayConfig(64000, { tools: { profile: "full" } }));
  await settle(watch);
  assert.equal(rolls.length, 1);
  assert.ok(rolls[0].some((p) => p.startsWith("models.")), "the earlier, unrolled change is included");
  watch.stop();
});

test("roll decision compares content, not bytes", () => {
  const { workerConfigRollDecision } = fixedWatch;
  const a = { sha256: "a", config: { meta: { v: 1 }, models: { x: 1 } } };
  assert.deepEqual(workerConfigRollDecision(a, { ...a }), { roll: false, changedPaths: [] });
  assert.deepEqual(workerConfigRollDecision(a, { sha256: "b", config: structuredClone(a.config) }), { roll: false, changedPaths: [] });
  assert.equal(workerConfigRollDecision(a, { sha256: "b", config: { meta: { v: 2 }, models: { x: 1 } } }).roll, false);
  assert.deepEqual(workerConfigRollDecision(a, { sha256: "b", config: { meta: { v: 1 }, models: { x: 2 } } }), { roll: true, changedPaths: ["models.x"] });
  assert.deepEqual(workerConfigRollDecision(a, { sha256: "missing", config: undefined }), { roll: true, changedPaths: ["(root)"] });
});

test("the old watch API (no workerConfigPath) keeps its behavior", async () => {
  const gatewayConfigPath = path.join(tmp, "legacy-gateway.json");
  writeFileSync(gatewayConfigPath, "{}");
  const rolls = [];
  let changed = true;
  const watch = fixedWatch.createWorkerConfigWatch({
    gatewayConfigPath,
    intervalMs: 1_000_000,
    derive: () => ({ ok: true, changed, changedPaths: ["agents.defaults.models"] }),
    onWorkerConfigChanged: async (result) => { rolls.push(result.changedPaths); },
  });
  watch.start();
  writeFileSync(gatewayConfigPath, '{"a":1}');
  utimesSync(gatewayConfigPath, new Date(), new Date(Date.now() + 5_000));
  await settle(watch);
  changed = false;
  writeFileSync(gatewayConfigPath, '{"a":22}');
  await settle(watch);
  assert.deepEqual(rolls, [["agents.defaults.models"]]);
  watch.stop();
});

test("release index is V's captured index plus only the roll bookkeeping", () => {
  const captured = readFileSync(path.join(base, "index.mjs"), "utf8");
  assert.equal(sha256(captured), INDEX_BEFORE);
  const plan = JSON.parse(readFileSync(path.join(root, "lab/worker-config-roll.plan.json"), "utf8"));
  const entry = plan.files.find((file) => file.target === "production-worker/index.mjs");
  assert.equal(entry.before, INDEX_BEFORE);
  const built = readFileSync(path.join(root, entry.source), "utf8");
  assert.equal(built, patchWorkerIndex(captured));
  assert.equal(built.split("acquireSharedPool(poolOptions, workerConfigPath)").length, 4);
  assert.match(built, /runtime\.workerConfigSnapshot = workerConfigPath\s*\? readWorkerConfigSnapshot\(workerConfigPath\)/);
  assert.match(built, /runningWorkerConfig\(\) \{[\s\S]{0,300}return live\.workerConfigSnapshot;/);
  assert.throws(() => patchWorkerIndex(built), /already patched/);
  const watchEntry = plan.files.find((file) => file.target === "production-worker/worker-config-watch.mjs");
  assert.equal(watchEntry.before, WATCH_BEFORE);
  assert.equal(sha256(readFileSync(path.join(base, "worker-config-watch.mjs"))), WATCH_BEFORE);
});
