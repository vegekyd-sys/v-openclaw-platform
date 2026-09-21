import assert from "node:assert/strict";

export const CACHE_RESET_QUERY_KEY = "control-ui-cache-reset";
export const CACHE_RESET_QUERY_VALUE = "volcengine-rtc-v4";

const BEFORE =
  'res.setHeader("Cache-Control", "no-cache");\n\tawait sendControlUiHtmlBody(req, res, prepared);';

const AFTER =
  'res.setHeader("Cache-Control", "no-cache");\n' +
  '\tconst cacheResetUrl = new URL(req.url ?? "/", "http://localhost");\n' +
  `\tif (cacheResetUrl.searchParams.get("${CACHE_RESET_QUERY_KEY}") === "${CACHE_RESET_QUERY_VALUE}") ` +
  'res.setHeader("Clear-Site-Data", "\\"cache\\"");\n' +
  '\tawait sendControlUiHtmlBody(req, res, prepared);';

const count = (source, needle) => source.split(needle).length - 1;

export function patchControlUiCacheReset(source) {
  assert.equal(typeof source, "string", "Control UI static module must be text");
  if (source.includes(AFTER)) {
    assert.equal(count(source, AFTER), 1, "cache reset patch is ambiguous");
    return source;
  }
  assert.equal(count(source, BEFORE), 1, "Control UI HTML response anchor drifted");
  return source.replace(BEFORE, AFTER);
}
