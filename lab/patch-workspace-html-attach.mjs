import assert from 'node:assert/strict';

// HTML the agent wrote into its own workspace can be sent as a reply attachment (V 2026-11-28).
//
// loadWebMedia (web-media-BGCgwB8q.js) gates host-read HTML separately from other text: it is trusted only
// under the OpenClaw temp root (/tmp/openclaw) or as outbound staging carrying a provenance marker. Agents
// write decks and reports into their workspace, so every `MEDIA: .../makaron-deck.html` in a reply was
// refused with LocalMediaAccessError("path-not-allowed"), which reply-media-paths maps to the catch-all
// "delivery-failed" receipt: "⚠️ makaron-deck.html: Delivery failed. Try sending this file again."
// Every harness (/vcc, /deepseek, vlab-worker, Codex) normalizes reply media through this one function.
//
// workspace-html-attach-v1 (source: vegekyd-sys/openclaw-versa versa/port-workspace-html-attach-20261128
// @3e59df1d46e): the workspace loadWebMedia already receives (mediaAccess.workspaceDir, the agent's
// workspace) becomes a third trusted HTML source, with the same document-shape and sniff checks as
// temp-root. It is never a trust root when it is the filesystem root or contains the OpenClaw config dir
// (credentials, state databases, media); symlinks, hardlinks and paths outside it stay refused, and the
// local-root containment and read capability still decide which files load at all.

export const MARKER = 'workspace-html-attach-v1';

function replaceExactlyOnce(source, before, after, label) {
  assert.equal(source.split(before).length, 2, `Expected exactly one ${label}`);
  return source.replace(before, after);
}

export function patchWebMedia(source) {
  if (source.includes(MARKER)) throw new Error(`${MARKER} already applied to web-media-BGCgwB8q.js`);
  let out = replaceExactlyOnce(source,
    `async function resolveTrustedGeneratedHostReadHtml(filePath) {
	if (!filePath) return;
	const info = await lstat(filePath).catch(() => void 0);
	if (!info?.isFile() || info.isSymbolicLink() || info.nlink !== 1) return;
	const [resolvedFilePath, tmpRoot, outboundRoot] = await Promise.all([
		realpath(filePath).catch(() => void 0),
		realpath(resolvePreferredOpenClawTmpDir()).catch(() => void 0),
		realpath(path.join(getMediaDir(), "outbound")).catch(() => void 0)
	]);
`,
    `/** ${MARKER}: the agent workspace as a trusted HTML root, unless it is the filesystem root or contains the OpenClaw config dir. */
async function resolveTrustedHtmlWorkspaceRoot(workspaceDir) {
	if (!workspaceDir || !path.isAbsolute(workspaceDir)) return;
	const [workspaceRoot, configDir] = await Promise.all([realpath(workspaceDir).catch(() => void 0), realpath(path.dirname(getMediaDir())).catch(() => path.resolve(path.dirname(getMediaDir())))]);
	if (!workspaceRoot || workspaceRoot === path.parse(workspaceRoot).root) return;
	if (isPathInside(workspaceRoot, configDir)) return;
	return workspaceRoot;
}
async function resolveTrustedGeneratedHostReadHtml(filePath, workspaceDir) {
	if (!filePath) return;
	const info = await lstat(filePath).catch(() => void 0);
	if (!info?.isFile() || info.isSymbolicLink() || info.nlink !== 1) return;
	const [resolvedFilePath, tmpRoot, outboundRoot, workspaceRoot] = await Promise.all([
		realpath(filePath).catch(() => void 0),
		realpath(resolvePreferredOpenClawTmpDir()).catch(() => void 0),
		realpath(path.join(getMediaDir(), "outbound")).catch(() => void 0),
		resolveTrustedHtmlWorkspaceRoot(workspaceDir)
	]);
`,
    'resolveTrustedGeneratedHostReadHtml head');
  out = replaceExactlyOnce(out,
    `	return tmpRoot && isPathInside(tmpRoot, resolvedFilePath) ? { source: "temp-root" } : void 0;
}
`,
    `	if (tmpRoot && isPathInside(tmpRoot, resolvedFilePath)) return { source: "temp-root" };
	// ${MARKER}: HTML the agent wrote into its own workspace (decks, reports) is as trusted as temp-root output.
	return workspaceRoot && isPathInside(workspaceRoot, resolvedFilePath) ? { source: "workspace" } : void 0;
}
`,
    'resolveTrustedGeneratedHostReadHtml tail');
  out = replaceExactlyOnce(out,
    '	if (params.trustedGeneratedHtmlPath.source === "temp-root") return true;\n',
    '	if (params.trustedGeneratedHtmlPath.source === "temp-root" || params.trustedGeneratedHtmlPath.source === "workspace") return true;\n',
    'temp-root trust check');
  out = replaceExactlyOnce(out,
    'await resolveTrustedGeneratedHostReadHtml(mediaUrl) : void 0;',
    'await resolveTrustedGeneratedHostReadHtml(mediaUrl, workspaceDir) : void 0;',
    'loadWebMediaInternal call site');
  return out;
}

export const FILES = [
  { name: 'web-media-BGCgwB8q.js', base: 'lab/release-files/workspace-html-attach/base', target: 'openclaw/dist', before: '432442da9fae4748dd0efa32ef2f8a8cee26fbe7189017a9b3c0c8a50d8febeb', patch: patchWebMedia },
];
