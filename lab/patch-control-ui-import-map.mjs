import assert from "node:assert/strict";

export const RTC_MODULE_BEFORE = "control-ui-boot-chat-DWTSrxxk.js";
export const RTC_MODULE_AFTER = "control-ui-boot-chat-DWTSrxxk-rtc-v4.js";

const ENTRY_ANCHOR =
  '    <script type="module" crossorigin src="./assets/index-CjmhJEYB.js"></script>';

const importMap = `    <script type="importmap">
      {"imports":{"/assets/${RTC_MODULE_BEFORE}":"/assets/${RTC_MODULE_AFTER}"}}
    </script>`;

const count = (source, needle) => source.split(needle).length - 1;

export function patchControlUiIndexImportMap(source) {
  assert.equal(typeof source, "string", "Control UI index must be text");
  let next = source;
  if (!next.includes(importMap)) {
    assert.equal(count(next, ENTRY_ANCHOR), 1, "Control UI entry anchor drifted");
    next = next.replace(ENTRY_ANCHOR, `${importMap}\n${ENTRY_ANCHOR}`);
  } else {
    assert.equal(count(next, importMap), 1, "Control UI import map is ambiguous");
  }
  return next;
}
