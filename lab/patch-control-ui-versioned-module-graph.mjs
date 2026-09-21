import assert from "node:assert/strict";

export const CONTROL_UI_BUILD_QUERY_KEY = "openclaw-ui-build";
export const CONTROL_UI_BUILD_QUERY_VALUE = "xiaohe-rtc-v4";

const NAMESPACE_ANCHOR = 'const CONTROL_UI_NAMESPACE_PREFIX = "/__openclaw__/";';
const NAMESPACE_PATCH = `${NAMESPACE_ANCHOR}
const CONTROL_UI_BUILD_QUERY_KEY = "${CONTROL_UI_BUILD_QUERY_KEY}";
const CONTROL_UI_BUILD_QUERY_VALUE = "${CONTROL_UI_BUILD_QUERY_VALUE}";
function isVersionedControlUiModuleRequest(req, fileRel) {
	if (path.extname(fileRel).toLowerCase() !== ".js") return false;
	const url = new URL(req.url ?? "/", "http://localhost");
	return url.searchParams.get(CONTROL_UI_BUILD_QUERY_KEY) === CONTROL_UI_BUILD_QUERY_VALUE;
}
function versionControlUiIndexAssets(html) {
	return html.replace(/((?:src|href)="[^"]*\\/assets\\/[^"?#]+\\.(?:js|css))"/g, \`$1?${CONTROL_UI_BUILD_QUERY_KEY}=${CONTROL_UI_BUILD_QUERY_VALUE}"\`);
}
function versionControlUiModuleImports(source) {
	return source.replace(/(["'\\\`])((?:\\.{1,2}\\/|\\/assets\\/)[^"'\\\`\\s?#]+?\\.(?:m?js|css))\\1/g, (_match, quote, assetPath) => \`\${quote}\${assetPath}?${CONTROL_UI_BUILD_QUERY_KEY}=${CONTROL_UI_BUILD_QUERY_VALUE}\${quote}\`);
}`;

const INDEX_ANCHOR =
  "const withBasePath = rewriteControlUiIndexHtmlAssetHrefs(body, normalizedBasePath);";
const INDEX_PATCH = `${INDEX_ANCHOR}
	const withVersionedAssets = versionControlUiIndexAssets(withBasePath);`;

const PREPARED_ANCHOR =
  "const prepared = withBasePath.replace(/<html\\b/i, `<html${basePathAttribute} ${CONTROL_UI_TERMINAL_ENABLED_ATTRIBUTE}=\"${allowWasm === true}\"${environmentAttributes}`);";
const PREPARED_PATCH =
  "const prepared = withVersionedAssets.replace(/<html\\b/i, `<html${basePathAttribute} ${CONTROL_UI_TERMINAL_ENABLED_ATTRIBUTE}=\"${allowWasm === true}\"${environmentAttributes}`);";

const IMMUTABLE_ANCHOR =
  'const immutableAsset = isBundledRoot && fileRel.startsWith("assets/");';
const IMMUTABLE_PATCH = `${IMMUTABLE_ANCHOR}
	const versionedModuleRequest = isVersionedControlUiModuleRequest(req, fileRel);`;

const PRECOMPRESSED_ANCHOR = "precompressed: immutableAsset,";
const PRECOMPRESSED_PATCH = "precompressed: immutableAsset && !versionedModuleRequest,";

const BODY_ANCHOR = `const body = await readAndCloseControlUiFile(representation.bodyFile);
		await serveControlUiAsset(res, fileRel, body, {
			immutable: immutableAsset,
			encoding: representation.encoding,`;
const BODY_PATCH = `let body = await readAndCloseControlUiFile(representation.bodyFile);
		if (versionedModuleRequest) body = Buffer.from(versionControlUiModuleImports(body.toString("utf8")));
		await serveControlUiAsset(res, fileRel, body, {
			immutable: immutableAsset,
			encoding: versionedModuleRequest ? "identity" : representation.encoding,`;

const count = (source, needle) => source.split(needle).length - 1;

function replaceOnce(source, before, after, label) {
  if (source.includes(after)) {
    assert.equal(count(source, after), 1, `${label} patch is ambiguous`);
    return source;
  }
  assert.equal(count(source, before), 1, `${label} anchor drifted`);
  return source.replace(before, after);
}

export function patchControlUiVersionedModuleGraph(source) {
  assert.equal(typeof source, "string", "Control UI static module must be text");
  let next = source;
  next = replaceOnce(next, NAMESPACE_ANCHOR, NAMESPACE_PATCH, "version helpers");
  next = replaceOnce(next, INDEX_ANCHOR, INDEX_PATCH, "index assets");
  next = replaceOnce(next, PREPARED_ANCHOR, PREPARED_PATCH, "versioned index body");
  next = replaceOnce(next, IMMUTABLE_ANCHOR, IMMUTABLE_PATCH, "module request");
  next = replaceOnce(next, PRECOMPRESSED_ANCHOR, PRECOMPRESSED_PATCH, "precompressed module");
  next = replaceOnce(next, BODY_ANCHOR, BODY_PATCH, "module import rewrite");
  return next;
}
