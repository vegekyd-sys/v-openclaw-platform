import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { HandoffAdminClient } from "../core/admin-client.js";
import { targetCaptureFromService } from "../core/target-capture.js";

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(2048, 7)]);

function tokenFile() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "v-handoff-plugin-"));
  const file = path.join(dir, "admin-token");
  fs.writeFileSync(file, "b".repeat(24), { mode: 0o600 });
  return file;
}

test("the client fetches a machine frame from its handoff service", async () => {
  const file = tokenFile();
  const calls = [];
  const client = new HandoffAdminClient({
    baseUrl: "http://127.0.0.1:23953/",
    adminTokenFile: file,
    fetchImpl: async (url, options) => {
      calls.push({ url, authorization: options.headers.authorization });
      return new Response(PNG, { status: 200, headers: { "content-type": "image/png" } });
    },
  });
  const frame = await client.captureFrame();
  assert.equal(frame.equals(PNG), true);
  assert.equal(calls[0].url, "http://127.0.0.1:23953/v1/capture");
  assert.equal(calls[0].authorization, `Bearer ${"b".repeat(24)}`);
});

test("a too-small or refused frame reads as unavailable, never as a broken picture", async () => {
  const file = tokenFile();
  const tiny = new HandoffAdminClient({
    adminTokenFile: file,
    fetchImpl: async () => new Response(Buffer.from([1, 2, 3]), { status: 200 }),
  });
  assert.equal(await tiny.captureFrame(), null);
  const refused = new HandoffAdminClient({
    adminTokenFile: file,
    fetchImpl: async () => new Response(JSON.stringify({ error: "capture failed" }), { status: 502 }),
  });
  await assert.rejects(refused.captureFrame(), /502: capture failed/u);
});

test("a machine without a local display is captured through its own handoff service", () => {
  // Tianyi's Mac: no desktopDisplay in the target, so the service takes the frame.
  assert.equal(targetCaptureFromService({}), true);
  assert.equal(targetCaptureFromService({ computerNode: "MacBook Pro" }), true);
  // V's own desktop keeps the host ffmpeg grab.
  assert.equal(targetCaptureFromService({ desktopDisplay: ":99" }), false);
  // Explicit switches win over the default.
  assert.equal(targetCaptureFromService({ capture: "service", desktopDisplay: ":99" }), true);
  assert.equal(targetCaptureFromService({ capture: "cover" }), false);
  assert.equal(targetCaptureFromService({ capture: "local" }), false);
});
