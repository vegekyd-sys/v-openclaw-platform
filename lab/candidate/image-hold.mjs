// Candidate A/B for lab/release-files/image-hold: the image capability decision that every
// inbound image message waits on in the Gateway (get-reply -> applyMediaUnderstanding ->
// runCapability("image")). Fresh process, the candidate's config, primary model as the
// active model (deepseek-flash, which declares image input), one image attachment. Three
// decisions in a row; the first is what a message pays after the catalog generation turns
// over. Both runtimes must hand the image to the model natively (outcome "skipped",
// nativeVisionActive true); patched, the first decision must stay off the full catalog
// (under 5 s; unpatched VLab measured 16.9 s for the full catalog read).
// 2026-10-06 VLab: unpatched 19562 / 6 / 7 ms, patched 3720 / 198 / 205 ms (no Gateway in this
// process, so no published generation: every patched decision takes the scoped read; in the
// Gateway the generation's completed catalog answers first).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime && process.env.OPENCLAW_CONFIG_PATH, "candidate runtime environment is required");
const dist = path.join(runtime, "openclaw", "dist");
const PATCH = fs.readFileSync(path.join(dist, "runner-BIhCXp3h.js"), "utf8").includes("image-hold: a turn-path capability read") ? "on" : "off";
assert.equal(PATCH, process.env.IMAGE_HOLD ?? "off", "runtime does not match IMAGE_HOLD");
const io = await import(`${dist}/io.runtime-CKu7Rw0j.js`);
const getRuntimeConfig = io.n ?? io.getRuntimeConfig;
const runner = await import(`${dist}/runner-BIhCXp3h.js`);
const runCapability = runner.i; const buildProviderRegistry = runner.t;
const cfg = getRuntimeConfig();
const primary = String(cfg.agents?.defaults?.model?.primary ?? "deepseek/deepseek-flash");
const [provider, ...rest] = primary.split("/");
const image = path.join(process.env.OPENCLAW_STATE_DIR ?? "/tmp", "image-hold-probe.jpg");
fs.writeFileSync(image, Buffer.from("/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=", "base64"));
const decisions = [];
for (let i = 0; i < 3; i += 1) {
  const t0 = performance.now();
  const result = await runCapability({
    capability: "image", cfg, ctx: {}, attachments: undefined,
    media: [{ index: 0, path: image, mime: "image/jpeg" }],
    agentId: "makaron", providerRegistry: buildProviderRegistry(undefined, cfg),
    config: cfg.tools?.media?.image, activeModel: { provider, model: rest.join("/") },
  });
  decisions.push({ ms: Math.round(performance.now() - t0), outcome: result.decision.outcome, nativeVisionActive: result.decision.nativeVisionActive, outputs: result.outputs.length });
}
console.log(JSON.stringify({ imageHold: PATCH, primary, decisions }, null, 1));
assert(decisions.every((d) => d.outcome === "skipped" && d.nativeVisionActive === true && d.outputs === 0), "the image was not handed to the model natively");
if (PATCH === "on") assert(decisions[0].ms < 5000, `first decision ${decisions[0].ms} ms`);
console.log(`PASS image-hold=${PATCH} decisions ${decisions.map((d) => d.ms).join("/")} ms`);
process.exit(0);
