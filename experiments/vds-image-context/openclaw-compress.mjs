// Run OpenClaw's own view_image compression (sanitizeToolResultImages, label image:native,
// maxBytes 1 MB as in view-image-bytes-cap-v1, default 1200 px) over a directory of images.
import fs from "node:fs"; import path from "node:path";
const [dist, dir, maxDimArg, tag = "oc"] = process.argv.slice(2);
const maxDim = maxDimArg ? Number(maxDimArg) : undefined;
const { r: sanitizeToolResultImages } = await import(path.join(dist, "tool-images-Bt1JUt6A.js"));
const meta = JSON.parse(fs.readFileSync(path.join(dir, "meta.json"), "utf8"));
fs.mkdirSync(path.join(dir, tag), { recursive: true, mode: 0o700 });
for (const m of meta) {
  const raw = fs.readFileSync(path.join(dir, m.file));
  const mimeType = m.file.endsWith(".png") ? "image/png" : "image/jpeg";
  const t = Date.now();
  const out = await sanitizeToolResultImages({ content: [{ type: "text", text: "x" }, { type: "image", data: raw.toString("base64"), mimeType }] }, "image:native", { maxBytes: 1024 * 1024, ...(maxDim ? { maxDimensionPx: maxDim } : {}) });
  const img = out.content.find((b) => b.type === "image");
  const buf = Buffer.from(img.data, "base64");
  const ext = img.mimeType === "image/png" ? "png" : "jpg";
  m[tag] = { file: `${tag}/${m.h}.${ext}`, mime: img.mimeType, bytes: buf.length, ms: Date.now() - t };
  if (buf[0] === 0xff) { let i = 2; while (i < buf.length) { if (buf[i] !== 0xff) { i++; continue; } const mk = buf[i + 1]; if (mk >= 0xc0 && mk <= 0xc2) { m[tag].h_px = buf.readUInt16BE(i + 5); m[tag].w = buf.readUInt16BE(i + 7); break; } i += 2 + buf.readUInt16BE(i + 2); } }
  else if (ext === "png") { m[tag].w = buf.readUInt32BE(16); m[tag].h_px = buf.readUInt32BE(20); }
  fs.writeFileSync(path.join(dir, m[tag].file), buf);
  console.log(m.file, raw.length, `${m.w}x${m.h_px}`, "->", m[tag].file, buf.length, `${m[tag].w}x${m[tag].h_px}`, `${m[tag].ms}ms`, `ratio=${(raw.length / buf.length).toFixed(1)}x`);
}
fs.writeFileSync(path.join(dir, "meta.json"), JSON.stringify(meta, null, 1));
