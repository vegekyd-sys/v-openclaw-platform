import assert from "node:assert/strict";

export const RTC_MODULE_BEFORE = "control-ui-boot-chat-DWTSrxxk.js";
export const RTC_MODULE_AFTER = "control-ui-boot-chat-DWTSrxxk-rtc-v4.js";

const NAMESPACE_ANCHOR = 'const CONTROL_UI_NAMESPACE_PREFIX = "/__openclaw__/";';
const NAMESPACE_PATCH = `${NAMESPACE_ANCHOR}
function injectControlUiRtcImportMap(html, basePath) {
	const before = \`\${basePath}/assets/${RTC_MODULE_BEFORE}\`;
	const after = \`\${basePath}/assets/${RTC_MODULE_AFTER}\`;
	const importMap = \`<script type="importmap">\${JSON.stringify({ imports: { [before]: after } })}</script>\`;
	return html.replace(/(<script type="module")/, \`\${importMap}\\n    \$1\`);
}`;

const INDEX_ANCHOR =
  "const withBasePath = rewriteControlUiIndexHtmlAssetHrefs(body, normalizedBasePath);";
const INDEX_PATCH = `${INDEX_ANCHOR}
	const withRtcImportMap = injectControlUiRtcImportMap(withBasePath, normalizedBasePath);`;

const PREPARED_ANCHOR =
  "const prepared = withBasePath.replace(/<html\\b/i, `<html${basePathAttribute} ${CONTROL_UI_TERMINAL_ENABLED_ATTRIBUTE}=\"${allowWasm === true}\"${environmentAttributes}`);";
const PREPARED_PATCH =
  "const prepared = withRtcImportMap.replace(/<html\\b/i, `<html${basePathAttribute} ${CONTROL_UI_TERMINAL_ENABLED_ATTRIBUTE}=\"${allowWasm === true}\"${environmentAttributes}`);";

const count = (source, needle) => source.split(needle).length - 1;

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) {
    assert.equal(count(source, after), 1, `${label} patch is ambiguous`);
    return source;
  }
  assert.equal(count(source, before), 1, `${label} anchor drifted`);
  return source.replace(before, after);
}

export function patchControlUiServerImportMap(source) {
  assert.equal(typeof source, "string", "Control UI server module must be text");
  let next = source;
  next = replaceOnce(next, NAMESPACE_ANCHOR, NAMESPACE_PATCH, "import map helper");
  next = replaceOnce(next, INDEX_ANCHOR, INDEX_PATCH, "import map injection");
  next = replaceOnce(next, PREPARED_ANCHOR, PREPARED_PATCH, "import map response");
  return next;
}
