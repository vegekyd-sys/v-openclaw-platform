#!/usr/bin/env node
// /vds images on OpenClaw 2026.9.1 (V): keep big view_image PNGs out of DeepSeek
// Codex threads, and never leave a thread stuck behind a 413.
//
//   node patch-vds-view-image.mjs --codex <.../node_modules/@openclaw/codex> --core-dist <.../openclaw/dist> [--check]
//
// Why (experiments/vds-image-context/README.md): Codex's native view_image keeps
// PNGs of up to 2048 px verbatim (2.4–13.4 MB each on V) in the Codex history,
// and DeepSeek's stateless /v1/responses gets the whole history on every request,
// so nine video frames hit its 48 MiB body limit and every later message got a
// 413. OpenClaw's own view_image already re-encodes to JPEG within 1 MB, and at
// a 2048 px edge DeepSeek sees the same pixels and image tokens as from the PNG.
//
//   A. DeepSeek Codex threads run without Codex's native view_image ...
//   B. ... and keep OpenClaw's view_image dynamic tool instead (turn and /btw).
//   C. OpenClaw's view_image keeps up to 2048 px (was the 1200 px default) within
//      its 1 MB cap, so small text on wide sheets stays readable.
//   D. A 413 / request body too large clears the thread binding, like an invalid
//      image payload already does, so the next message starts a fresh thread.
//
// Idempotent: every anchor must match exactly once, or its replacement must
// already be present. Written against the bytes V runs on 2026-10-10:
// thread-lifecycle c0a9ce77, dynamic-tools 2de5868b, run-attempt d25e0d91,
// openclaw-tools 637c86f3.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const codexRoot = option("--codex");
const coreDist = option("--core-dist");
const checkOnly = args.includes("--check");
assert(codexRoot && coreDist, "usage: patch-vds-view-image.mjs --codex <@openclaw/codex dir> --core-dist <openclaw dist> [--check]");
const MARK = "v-vds-view-image-v1";

const pkg = JSON.parse(fs.readFileSync(path.join(codexRoot, "package.json"), "utf8"));
assert.equal(pkg.name, "@openclaw/codex");
assert.equal(pkg.version, "2026.9.1", `written against 2026.9.1, found ${pkg.version}`);
const codexDist = path.join(codexRoot, "dist");

function moduleIn(dir, re, marker) {
  const hits = fs.readdirSync(dir).filter((f) => re.test(f)).map((f) => path.join(dir, f))
    .filter((f) => fs.readFileSync(f, "utf8").includes(marker));
  assert.equal(hits.length, 1, `expected one ${re} containing ${JSON.stringify(marker.slice(0, 60))} in ${dir}, found ${hits.length}`);
  return hits[0];
}

const TARGETS = [
  {
    file: moduleIn(codexDist, /^thread-lifecycle-.*\.js$/u, "function buildCodexRuntimeThreadConfigForRun("),
    patches: [
      // A. Native view_image off for DeepSeek threads. Codex keeps its PNG bytes
      //    verbatim and counts each image as ~1.8k tokens, so neither its resize nor
      //    its token-based compaction bounds the request body DeepSeek receives.
      ["\t\t...params.bootstrapContextMode === \"lightweight\" ? CODEX_NO_PROJECT_DOCS_CONFIG : {}\n\t}, options.shellEnvironment, options.disableLoginShell);\n}\nfunction buildCodexRingZeroThreadConfigPatch(",
        "\t\t...params.bootstrapContextMode === \"lightweight\" ? CODEX_NO_PROJECT_DOCS_CONFIG : {},\n"
        + `\t\t// ${MARK}: DeepSeek threads look at images through OpenClaw's view_image (JPEG, <= 1 MB).\n`
        + "\t\t...isCodexDeepSeekProvider(params.provider) ? { \"features.view_image\": false } : {}\n"
        + "\t}, options.shellEnvironment, options.disableLoginShell);\n}\nfunction buildCodexRingZeroThreadConfigPatch("],
    ],
  },
  {
    file: moduleIn(codexDist, /^dynamic-tools-.*\.js$/u, "function filterCodexVisionTools("),
    patches: [
      // B. Keep OpenClaw's view_image when the thread has no native one (A).
      ["\t\tnativeImageInspectionEnabled: input.nativeToolSurfaceEnabled === true\n",
        `\t\t// ${MARK}: DeepSeek threads have no native view_image, keep OpenClaw's.\n`
        + "\t\tnativeImageInspectionEnabled: input.nativeToolSurfaceEnabled === true && String(params.provider ?? \"\").trim().toLowerCase() !== \"deepseek\"\n"],
    ],
  },
  {
    file: moduleIn(codexDist, /^side-question-.*\.js$/u, "tools = filterCodexVisionTools("),
    patches: [
      // B (/btw). Same rule for side questions.
      ["\t\t\tnativeImageInspectionEnabled: input.nativeToolSurfaceEnabled\n",
        `\t\t\t// ${MARK}: DeepSeek threads have no native view_image, keep OpenClaw's.\n`
        + "\t\t\tnativeImageInspectionEnabled: input.nativeToolSurfaceEnabled && String(runtimeModel.provider ?? \"\").trim().toLowerCase() !== \"deepseek\"\n"],
    ],
  },
  {
    file: moduleIn(codexDist, /^run-attempt-.*\.js$/u, "function isInvalidCodexImagePayloadError("),
    patches: [
      // D. DeepSeek answers an oversized body with "unexpected status 413 Payload Too
      //    Large: Failed to buffer the request body: length limit exceeded"; its
      //    openresty front says "413 Request Entity Too Large". Resending the same
      //    thread can only fail again, so drop the binding like an invalid image.
      ["\tconst normalizedMessage = message.replace(/[_-]+/gu, \" \");\n\treturn /\\b(?:invalid|malformed)\\b",
        "\tconst normalizedMessage = message.replace(/[_-]+/gu, \" \");\n"
        + `\t// ${MARK}: a request body over the provider limit cannot recover on the same thread.\n`
        + "\tif (/\\b413\\b[\\s\\S]{0,40}\\b(?:payload|request entity) too large\\b|failed to buffer the request body/iu.test(normalizedMessage)) return true;\n"
        + "\treturn /\\b(?:invalid|malformed)\\b"],
    ],
  },
  {
    file: moduleIn(coreDist, /^openclaw-tools-.*\.js$/u, "const VIEW_IMAGE_NATIVE_MAX_BYTES = 1024 * 1024;"),
    patches: [
      // C. 1200 px cut wide contact sheets to 0.4–0.6 MP and DeepSeek misread their
      //    small text (10/26 vs 19/26 from the PNG); at 2048 px it read 22/26 with the
      //    same image tokens. A configured imageMaxDimensionPx still wins.
      ["\treturn await sanitizeToolResultImages(result, \"image:native\", {\n\t\t...resolveImageSanitizationLimits(config),\n\t\tmaxBytes: VIEW_IMAGE_NATIVE_MAX_BYTES\n\t});\n}\nconst VIEW_IMAGE_NATIVE_MAX_BYTES = 1024 * 1024;\n",
        "\tconst viewImageLimits = resolveImageSanitizationLimits(config);\n"
        + "\treturn await sanitizeToolResultImages(result, \"image:native\", {\n\t\t...viewImageLimits,\n"
        + `\t\t// ${MARK}: keep up to 2048 px (Codex's own high-detail edge) inside the 1 MB cap.\n`
        + "\t\tmaxDimensionPx: viewImageLimits.maxDimensionPx ?? VIEW_IMAGE_NATIVE_MAX_DIMENSION_PX,\n"
        + "\t\tmaxBytes: VIEW_IMAGE_NATIVE_MAX_BYTES\n\t});\n}\nconst VIEW_IMAGE_NATIVE_MAX_BYTES = 1024 * 1024;\n"
        + "const VIEW_IMAGE_NATIVE_MAX_DIMENSION_PX = 2048;\n"],
    ],
  },
];

let changed = 0;
for (const target of TARGETS) {
  let text = fs.readFileSync(target.file, "utf8");
  for (const [from, to] of target.patches) {
    const fromHits = text.split(from).length - 1;
    const toHits = text.split(to).length - 1;
    if (toHits === 1 && fromHits === 0) continue;
    assert.equal(fromHits, 1, `${path.basename(target.file)}: anchor must match once, matched ${fromHits}: ${JSON.stringify(from.slice(0, 80))}`);
    text = text.replace(from, () => to);
    changed++;
  }
  if (!checkOnly) fs.writeFileSync(target.file, text);
  console.log(`${checkOnly ? "check" : "patched"} ${target.file}`);
}
console.log(JSON.stringify({ marker: MARK, changed, checkOnly }));
