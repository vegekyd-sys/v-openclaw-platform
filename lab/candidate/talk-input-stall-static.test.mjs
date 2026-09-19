import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "VLAB_CANDIDATE_RUNTIME is required");

const bundle = readFileSync(
  join(runtime, "openclaw/dist/control-ui/assets/control-ui-boot-chat-DWTSrxxk.js"),
  "utf8",
);
const manifestText = readFileSync(
  join(runtime, "openclaw/dist/control-ui/asset-manifest.json"),
  "utf8",
);
const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("candidate has the exact input-stall artifacts", () => {
  assert.equal(
    sha256(bundle),
    "b1480f0fae6aa434532c02456bbd291d5c54edcdae61f386f13c62931a10b7e4",
  );
  assert.equal(
    sha256(manifestText),
    "a781e2fcba0d749a533a08a378f372cfe85ebe08003383adcc0c03b5c8392659",
  );
});

test("candidate preserves more than 30 seconds of microphone backlog", () => {
  assert.match(bundle, /vN=192,yN=3e4,bN=8e3,xN=32/u);
  assert.doesNotMatch(bundle, /vN=32,yN=3e4,bN=8e3,xN=32/u);
  assert.match(bundle, /if\(!t\|\|t\.signal\.aborted\)return;if\(this\.pendingAudioAppends\.size>=vN\)return/u);
  assert.doesNotMatch(
    bundle,
    /if\(!t\|\|t\.signal\.aborted\|\|this\.pendingOutputCancellations\)return/u,
  );
  assert.match(bundle, /talk\.session\.appendAudio[\s\S]{0,260}timeoutMs:yN/u);
});

test("candidate manifest publishes the exact patched bundle", () => {
  const manifest = JSON.parse(manifestText);
  const entry = manifest.assets.find(
    (asset) => asset.path === "assets/control-ui-boot-chat-DWTSrxxk.js",
  );
  assert.deepEqual(entry, {
    path: "assets/control-ui-boot-chat-DWTSrxxk.js",
    sha256: "b1480f0fae6aa434532c02456bbd291d5c54edcdae61f386f13c62931a10b7e4",
    size: 786091,
  });
});
