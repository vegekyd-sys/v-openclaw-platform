// Uploads the finished videos a delivery page cannot link to yet: edited after
// the provider rendered them, never given a public URL, or on a temporary
// host. The validated file goes to the same storage the zip packages used
// (bucket "images" behind cdn.makaron.app), so every project fixes its misses
// with the same code instead of a script its Agent writes on the spot.
//
// Runs where the delivery stage runs: it reads the finished file from disk and
// the storage key from the Agent's environment (MAKARON_SUPABASE_URL,
// MAKARON_SUPABASE_SERVICE_ROLE_KEY), which Night Shift's own service lacks.

import { createHash } from "node:crypto";
import { readFile as readFileDefault } from "node:fs/promises";

const BUCKET = "images";

export function deliveryObjectKey(instanceId, contentItemId, sha256) {
  const safe = (value) => String(value).replace(/[^A-Za-z0-9._-]/gu, "-");
  return `nightshift/${safe(instanceId)}/videos/${safe(contentItemId)}-${sha256.slice(0, 12)}.mp4`;
}

export async function uploadMissingVideos({
  missing,
  instanceId,
  env = process.env,
  fetchImpl = fetch,
  readFile = readFileDefault,
  log = () => {},
}) {
  const storage = String(env.MAKARON_SUPABASE_URL ?? "").replace(/\/+$/u, "");
  const key = env.MAKARON_SUPABASE_SERVICE_ROLE_KEY;
  const cdn = String(env.MAKARON_CDN_URL ?? "https://cdn.makaron.app").replace(/\/+$/u, "");
  const uploadable = missing.filter((entry) => typeof entry.file === "string" && entry.file);
  const sources = {};
  const failed = missing.filter((entry) => !entry.file).map((entry) => ({ id: entry.id, reason: entry.reason }));
  if (uploadable.length && (!storage || !key)) {
    throw new Error("--upload-missing needs MAKARON_SUPABASE_URL and MAKARON_SUPABASE_SERVICE_ROLE_KEY: run it where the delivery stage runs");
  }
  for (const entry of uploadable) {
    const data = await readFile(entry.file);
    const sha256 = createHash("sha256").update(data).digest("hex");
    const objectKey = deliveryObjectKey(instanceId, entry.id, sha256);
    const publicUrl = `${cdn}/storage/v1/object/public/${BUCKET}/${objectKey.split("/").map(encodeURIComponent).join("/")}`;
    // Uploading again is harmless (upsert) but slow: a copy of these exact
    // bytes is already there when the CDN serves the same size under this
    // content-addressed key.
    const present = await headBytes(fetchImpl, publicUrl);
    if (present !== data.length) {
      const answer = await fetchImpl(`${storage}/storage/v1/object/${BUCKET}/${objectKey.split("/").map(encodeURIComponent).join("/")}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          apikey: key,
          "Content-Type": "video/mp4",
          "x-upsert": "true",
          "cache-control": "max-age=31536000",
        },
        body: data,
      });
      if (!answer.ok) {
        const body = await answer.text().catch(() => "");
        failed.push({ id: entry.id, reason: `upload failed: HTTP ${answer.status} ${body.slice(0, 200)}` });
        continue;
      }
      const served = await headBytes(fetchImpl, publicUrl);
      if (served !== data.length) {
        failed.push({ id: entry.id, reason: `uploaded, but the CDN serves ${served ?? "nothing"} bytes instead of ${data.length}` });
        continue;
      }
      log(`uploaded ${entry.id} (${data.length} bytes) -> ${publicUrl}`);
    } else {
      log(`already on the CDN ${entry.id} -> ${publicUrl}`);
    }
    sources[entry.id] = publicUrl;
  }
  return { sources, failed };
}

async function headBytes(fetchImpl, url) {
  try {
    const answer = await fetchImpl(url, { method: "HEAD", signal: AbortSignal.timeout(20_000) });
    return answer.ok ? Number(answer.headers.get("content-length")) : null;
  } catch {
    return null;
  }
}
