// Candidate test for lab/release-files/view-image-bytes-cap: view_image's native
// result must cap each image at 1 MB, because the result is stored verbatim in
// the session transcript. On V, single view_image events were 5-19 MB (1200px
// PNGs kept at 3-4 MB each under the 5 MB default), which made every full
// session read slower and held the Agent DB writer lock for seconds.
//
// Reproduced on shared VLab 2026-09-29 18:13 CST: a 1200x1200 4.3 MB PNG through
// view_image (openai/gpt-6-luna, native route) was stored as one 5.6 MB event.
import assert from "node:assert/strict";
import { test } from "node:test";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "candidate runtime environment is required");
const dist = path.join(runtime, "openclaw", "dist");
const toolsSource = fs.readFileSync(path.join(dist, "openclaw-tools-BODVdJQD.js"), "utf8");
const patched = toolsSource.includes("view-image-bytes-cap-v1");
const toolImages = await import(path.join(dist, fs.readdirSync(dist).find((f) => /^tool-images-[\w-]+\.js$/u.test(f))));
const sanitizeToolResultImages = toolImages.r;
assert.equal(typeof sanitizeToolResultImages, "function", "tool-images export r must be sanitizeToolResultImages");

// A 1200x1200 RGB noise PNG: incompressible, ~4.3 MB, within the 1200px limit.
function noisePng(side) {
  const row = side * 3 + 1;
  const raw = Buffer.alloc(row * side);
  for (let y = 0; y < side; y++) { raw[y * row] = 0; crypto.randomFillSync(raw, y * row + 1, side * 3); }
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0);
    return Buffer.concat([len, td, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(side, 0); ihdr.writeUInt32BE(side, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const bigPng = noisePng(1200);
const smallPng = noisePng(300); // ~270 KB, already under 1 MB
const result = (buf) => ({ content: [{ type: "text", text: "Loaded" }, { type: "image", data: buf.toString("base64"), mimeType: "image/png" }] });
const decodedBytes = (block) => Buffer.from(block.data, "base64").byteLength;

test(`patched marker present: ${patched}`, () => {
  assert.equal(patched, process.env.VIEW_IMAGE_CAP_EXPECT !== "absent", "patch state does not match the expectation");
});

test("the fixture is the failing shape: 1200px, over 1 MB, under the 5 MB default", () => {
  assert.ok(bigPng.byteLength > 1024 * 1024 && bigPng.byteLength < 5 * 1024 * 1024, `fixture is ${bigPng.byteLength} bytes`);
});

test("view_image passes a 1 MB per-image cap into the sanitizer", () => {
  const fn = toolsSource.slice(toolsSource.indexOf("async function buildNativeImageToolResult("), toolsSource.indexOf("//#region src/agents/tools/image-tool.ts"));
  if (patched) {
    assert.match(fn, /maxBytes: VIEW_IMAGE_NATIVE_MAX_BYTES/u);
    assert.match(toolsSource, /const VIEW_IMAGE_NATIVE_MAX_BYTES = 1024 \* 1024;/u);
  } else {
    assert.doesNotMatch(fn, /maxBytes/u, "unpatched: only the configured dimension limit is passed");
  }
});

test("under the default limits a 4 MB PNG is stored unchanged (the bug)", async () => {
  const out = await sanitizeToolResultImages(result(bigPng), "image:native", {});
  const image = out.content.find((b) => b.type === "image");
  assert.equal(image.mimeType, "image/png");
  assert.equal(decodedBytes(image), bigPng.byteLength);
});

test("with the 1 MB cap the same PNG becomes a JPEG under 1 MB", async () => {
  const out = await sanitizeToolResultImages(result(bigPng), "image:native", { maxBytes: 1024 * 1024 });
  const image = out.content.find((b) => b.type === "image");
  assert.equal(image.mimeType, "image/jpeg");
  assert.ok(decodedBytes(image) <= 1024 * 1024, `got ${decodedBytes(image)} bytes`);
  assert.equal(out.content[0].text, "Loaded", "text blocks are untouched");
});

test("images already under 1 MB are left alone", async () => {
  const out = await sanitizeToolResultImages(result(smallPng), "image:native", { maxBytes: 1024 * 1024 });
  const image = out.content.find((b) => b.type === "image");
  assert.equal(image.mimeType, "image/png");
  assert.equal(decodedBytes(image), smallPng.byteLength);
});
