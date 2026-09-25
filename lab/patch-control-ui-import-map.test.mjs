import assert from "node:assert/strict";
import test from "node:test";
import {
  RTC_MODULE_AFTER,
  RTC_MODULE_BEFORE,
  patchControlUiServerImportMap,
} from "./patch-control-ui-import-map.mjs";

test("injects an import map into every served Control UI document", () => {
  const before = [
    'const CONTROL_UI_NAMESPACE_PREFIX = "/__openclaw__/";',
    "async function serveResolvedIndexHtml(req, res, body, basePath, allowWasm, environment) {",
    "\tconst normalizedBasePath = normalizeControlUiBasePath(basePath);",
    "\tconst withBasePath = rewriteControlUiIndexHtmlAssetHrefs(body, normalizedBasePath);",
    "\tconst basePathAttribute = ` ${CONTROL_UI_BASE_PATH_ATTRIBUTE}=\"${escapeHtmlAttribute(normalizedBasePath)}\"`;",
    "\tconst environmentAttributes = environment ? ` ${CONTROL_UI_ENVIRONMENT_ATTRIBUTE}=\"${escapeHtmlAttribute(JSON.stringify(environment))}\"` : \"\";",
    "\tconst prepared = withBasePath.replace(/<html\\b/i, `<html${basePathAttribute} ${CONTROL_UI_TERMINAL_ENABLED_ATTRIBUTE}=\"${allowWasm === true}\"${environmentAttributes}`);",
    "}",
  ].join("\n");
  const after = patchControlUiServerImportMap(before);
  assert.match(after, /injectControlUiRtcImportMap/);
  assert.match(after, new RegExp(RTC_MODULE_BEFORE));
  assert.match(after, new RegExp(RTC_MODULE_AFTER));
  assert.match(after, /const withRtcImportMap/);
  const helperStart = after.indexOf("function injectControlUiRtcImportMap");
  const helperEnd = after.indexOf("async function serveResolvedIndexHtml", helperStart);
  const makeHelper = new Function(
    `${after.slice(helperStart, helperEnd)}; return injectControlUiRtcImportMap;`,
  );
  const rendered = makeHelper()(
    '<html><head><script type="module" crossorigin src="/assets/index.js"></script></head></html>',
    "",
  );
  assert.match(rendered, /<script type="importmap">/);
  assert.match(rendered, new RegExp(`/assets/${RTC_MODULE_AFTER}`));
  assert.ok(rendered.indexOf('type="importmap"') < rendered.indexOf('type="module"'));
  assert.equal(patchControlUiServerImportMap(after), after);
});
