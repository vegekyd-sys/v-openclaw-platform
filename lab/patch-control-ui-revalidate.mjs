import assert from "node:assert/strict";

// Control UI assets are served with a one-year immutable cache because the
// platform assumes a hashed filename never changes content. The lab release
// channel breaks that assumption: it rewrites those files in place under the
// same name. Chrome will not revalidate an immutable response even on a hard
// reload, so a deployed Control UI fix can sit on disk, match its manifest, and
// still never reach the user - measured on 2026-09-17, where the browser ran a
// 437177-byte bundle while the server served 437201.
//
// must-revalidate with max-age=0 keeps the response cacheable but forces a
// conditional request, so an unchanged asset still costs only a 304.
export const CACHE_CONTROL_BEFORE =
  'const CONTROL_UI_IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";';
export const CACHE_CONTROL_AFTER =
  'const CONTROL_UI_IMMUTABLE_CACHE_CONTROL = "public, max-age=0, must-revalidate";';

const count = (source, needle) => source.split(needle).length - 1;

export function patchControlUiRevalidate(source) {
  assert.equal(typeof source, "string", "Control UI static module must be text");
  if (source.includes(CACHE_CONTROL_AFTER)) {
    assert.equal(count(source, CACHE_CONTROL_AFTER), 1, "revalidate patch is ambiguous");
    return source;
  }
  assert.equal(count(source, CACHE_CONTROL_BEFORE), 1, "cache-control anchor drifted");
  return source.replace(CACHE_CONTROL_BEFORE, CACHE_CONTROL_AFTER);
}
