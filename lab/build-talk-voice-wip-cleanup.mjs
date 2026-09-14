import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const outputDir = join(here, "release-files", "talk-voice-wip-cleanup");

const files = [
  {
    archive: "/srv/vlab-production-mirror/labs/shared-workflow/releases/talk-audio-wan-backpressure-v1/before/0",
    source: "control-ui-boot-chat-DWTSrxxk.js",
    target: "openclaw/dist/control-ui/assets/control-ui-boot-chat-DWTSrxxk.js",
    before: "6be0500a5677a2f17a6529a4aeb3fa4f9065def1172deed71b53d94d6722a9aa",
    after: "ef2fb5a520b04cdc214fb055652c3c307f683b5f245216644b74859253391bb1",
  },
  {
    archive: "/srv/vlab-production-mirror/labs/shared-workflow/releases/talk-audio-wan-backpressure-v2/before/0",
    source: "asset-manifest.json",
    target: "openclaw/dist/control-ui/asset-manifest.json",
    before: "b218cbc3706a13b50f67d7be8d3b62146339ab6bb3c860993683cd9393c4206f",
    after: "a967daf8fe509bc38378f53ee9a1b8d7de8181e6adb7e3dc9c21c3ae3fe39dbc",
  },
  {
    archive: "/srv/vlab-production-mirror/labs/shared-workflow/releases/talk-audio-wan-backpressure-v3/before/0",
    source: "control-ui-DhD7PO_6.js",
    target: "openclaw/dist/control-ui-DhD7PO_6.js",
    before: "6803a28ff37719fe28afd4865cb4c308a0cae9dcefd06ac14a00670b1581b598",
    after: "638fd21e36e1ed8b6b2d6d02608fd59485f1c3a7bb65d28276d7c860c264f205",
  },
];

const sha256 = (value) => createHash("sha256").update(value).digest("hex");

mkdirSync(outputDir, { recursive: true });
for (const file of files) {
  const encoded = execFileSync(
    "ssh",
    [
      "-o",
      "ControlMaster=no",
      "-o",
      "ControlPath=none",
      "vlab91",
      `sudo gzip -c '${file.archive}' | base64 | tr -d '\\n'`,
    ],
    { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
  );
  const contents = gunzipSync(Buffer.from(encoded.trim(), "base64"));
  const actual = sha256(contents);
  if (actual !== file.after) {
    throw new Error(`${file.source}: expected ${file.after}, got ${actual}`);
  }
  writeFileSync(join(outputDir, file.source), contents);
}

const plan = {
  baseRelease: "db91-writer-transaction-scope-v2",
  files: files.map(({ source, target, before }) => ({
    source: `lab/release-files/talk-voice-wip-cleanup/${source}`,
    target,
    before,
  })),
};

writeFileSync(
  join(here, "talk-voice-wip-cleanup-plan.json"),
  `${JSON.stringify(plan, null, 2)}\n`,
);

for (const file of files) {
  process.stdout.write(`${file.after}  ${file.source}\n`);
}
