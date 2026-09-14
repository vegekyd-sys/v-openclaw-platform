import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const runtimeRoot = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtimeRoot, "VLAB_CANDIDATE_RUNTIME is required");

const bundlePath = join(
  runtimeRoot,
  "openclaw/dist/control-ui/assets/control-ui-boot-chat-DWTSrxxk.js",
);
const manifestPath = join(runtimeRoot, "openclaw/dist/control-ui/asset-manifest.json");
const serverPath = join(runtimeRoot, "openclaw/dist/control-ui-DhD7PO_6.js");
const bundle = readFileSync(bundlePath, "utf8");
const manifestText = readFileSync(manifestPath, "utf8");
const server = readFileSync(serverPath, "utf8");

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

test("candidate runtime contains the exact reviewed Talk artifacts", () => {
  assert.equal(
    sha256(bundle),
    "6be0500a5677a2f17a6529a4aeb3fa4f9065def1172deed71b53d94d6722a9aa",
  );
  assert.equal(
    sha256(manifestText),
    "b218cbc3706a13b50f67d7be8d3b62146339ab6bb3c860993683cd9393c4206f",
  );
  assert.equal(
    sha256(server),
    "6803a28ff37719fe28afd4865cb4c308a0cae9dcefd06ac14a00670b1581b598",
  );
});

test("saturated microphone input sheds a frame without closing Talk", () => {
  assert.match(bundle, /vN=32,yN=8e3/);
  assert.match(bundle, /if\(this\.pendingAudioAppends\.size>=vN\)return;/);
  assert.equal(bundle.includes("Realtime Talk audio input fell behind"), false);
  assert.equal(
    bundle.includes(
      "if(this.pendingAudioAppends.size>=vN){this.failAudioAppend(`Realtime Talk audio input fell behind`);return}",
    ),
    false,
  );
});

test("blank live final recovers persisted text for the exact agent run", async () => {
  assert.equal(bundle.includes("OpenClaw finished with no text."), false);
  assert.match(bundle, /chat\.history/);
  assert.match(bundle, /__openclaw\?\.runId===e\.runId/);

  const start = bundle.indexOf("function rN(");
  const end = bundle.indexOf("function oN(", start);
  assert(start >= 0 && end > start, "consult waiter was not found in candidate runtime");
  const buildWaiter = new Function(
    `var fN=1; var window=globalThis; function oN(){} ${bundle.slice(start, end)}; return aN;`,
  );
  const waitForAgent = buildWaiter();
  let listener;
  const requests = [];
  const client = {
    addEventListener(callback) {
      listener = callback;
      return () => {};
    },
    async request(method, params) {
      requests.push([method, params]);
      if (method === "agent.wait") return { status: "done" };
      if (method === "chat.history") {
        return {
          messages: [
            {
              role: "assistant",
              content: [{ type: "text", text: "今天完成了两件事。" }],
              __openclaw: { runId: "run-voice-1" },
            },
          ],
        };
      }
      throw new Error(`unexpected request: ${method}`);
    },
  };

  const result = waitForAgent({
    client,
    runId: "run-voice-1",
    sessionKey: "agent:makaron:main",
    agentId: "makaron",
    timeoutMs: 1_000,
  });
  listener({
    event: "chat",
    payload: { runId: "run-voice-1", state: "final", message: { content: [] } },
  });

  assert.equal(await result, "今天完成了两件事。");
  assert.deepEqual(
    requests.map(([method]) => method),
    ["agent.wait", "chat.history"],
  );
});

test("manifest publishes the candidate bundle and has a valid generation", () => {
  const manifest = JSON.parse(manifestText);
  const entry = manifest.assets.find(
    (asset) => asset.path === "assets/control-ui-boot-chat-DWTSrxxk.js",
  );
  assert.deepEqual(entry, {
    path: "assets/control-ui-boot-chat-DWTSrxxk.js",
    sha256: "6be0500a5677a2f17a6529a4aeb3fa4f9065def1172deed71b53d94d6722a9aa",
    size: 785955,
  });
  const generation = createHash("sha256");
  for (const asset of manifest.assets) {
    generation.update(`${asset.path}\0${asset.size}\0${asset.sha256}\n`);
  }
  assert.equal(manifest.generation, generation.digest("hex"));
});

test("candidate server bypasses stale compression only for the Talk bundle", () => {
  assert.match(
    server,
    /const usePrecompressed = precompressed && CONTROL_UI_COMPRESSIBLE_EXTENSIONS\.has\(extension\) && !params\.contentPath\.endsWith\("assets\/control-ui-boot-chat-DWTSrxxk\.js"\);/,
  );
  assert.match(server, /resolveControlUiContentEncodings\(req, usePrecompressed\)/);
});
