import assert from "node:assert/strict";
import test from "node:test";
import {
  RTC_MODULE_AFTER,
  RTC_MODULE_BEFORE,
  patchControlUiIndexImportMap,
} from "./patch-control-ui-import-map.mjs";

test("redirects the cached RTC module to a fresh URL", () => {
  const before = [
    "<head>",
    '    <script type="module" crossorigin src="./assets/index-CjmhJEYB.js"></script>',
    "</head>",
  ].join("\n");
  const after = patchControlUiIndexImportMap(before);
  assert.match(after, /<script type="importmap">/);
  assert.match(after, new RegExp(`/assets/${RTC_MODULE_BEFORE}`));
  assert.match(after, new RegExp(`/assets/${RTC_MODULE_AFTER}`));
  assert.equal(patchControlUiIndexImportMap(after), after);
});
