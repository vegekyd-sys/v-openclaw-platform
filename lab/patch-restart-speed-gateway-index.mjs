// Gateway side of the restart-speed release: dist/index.js (V's Gateway entry, ExecStart) enables
// Node's compile cache the way OpenClaw's CLI entry (dist/entry.js, src/entry.compile-cache.ts)
// already does, in the same directory, before its first dynamic import. Only when it is the main
// module; NODE_DISABLE_COMPILE_CACHE or OPENCLAW_GATEWAY_COMPILE_CACHE=0 turn it off.
const IMPORT_ANCHOR = 'import { fileURLToPath } from "node:url";\n';
const BODY_ANCHOR = "//#region src/index.ts\n";
export const MARKER = "/* OPENCLAW_GATEWAY_COMPILE_CACHE_V1 */";

const BODY = `${MARKER}
try {
	const ocEntryFile = fileURLToPath(import.meta.url);
	const ocInstallRoot = ocPath.dirname(ocPath.dirname(ocEntryFile));
	const ocIsMain = typeof process.argv[1] === "string" && ocRealpathSync(process.argv[1]) === ocRealpathSync(ocEntryFile);
	if (ocIsMain && process.env.NODE_DISABLE_COMPILE_CACHE === void 0 && process.env.OPENCLAW_GATEWAY_COMPILE_CACHE !== "0" && typeof ocEnableCompileCache === "function" && !existsSync(ocPath.join(ocInstallRoot, ".git")) && !existsSync(ocPath.join(ocInstallRoot, "src", "entry.ts"))) {
		const ocSegment = (value) => { const normalized = String(value).replace(/[^A-Za-z0-9._-]+/g, "_").replace(/^_+|_+$/g, ""); return normalized.length > 0 ? normalized : "unknown"; };
		const ocPackageJson = ocPath.join(ocInstallRoot, "package.json");
		let ocVersion = "unknown";
		try { const parsed = JSON.parse(ocReadFileSync(ocPackageJson, "utf8")); if (typeof parsed?.version === "string" && parsed.version.trim().length > 0) ocVersion = parsed.version; } catch {}
		let ocMarker = "no-package-json";
		try { const stat = ocStatSync(ocPackageJson); ocMarker = \`\${Math.trunc(stat.mtimeMs)}-\${stat.size}\`; } catch {}
		const ocBase = process.env.NODE_COMPILE_CACHE ? process.env.NODE_COMPILE_CACHE : ocPath.join(ocOs.tmpdir(), "node-compile-cache");
		ocEnableCompileCache(ocPath.join(ocBase, "openclaw", ocSegment(ocVersion), ocSegment(ocMarker)));
		// The Gateway runs for hours; keep the entries even if it is later killed instead of exiting.
		setTimeout(() => { try { ocFlushCompileCache?.(); } catch {} }, 180000).unref?.();
	}
} catch {}
`;

export function patchGatewayIndex(source) {
  if (source.includes(MARKER)) throw new Error("index.js already enables the compile cache");
  for (const anchor of [IMPORT_ANCHOR, BODY_ANCHOR]) {
    if (source.split(anchor).length !== 2) throw new Error(`anchor not found exactly once: ${JSON.stringify(anchor)}`);
  }
  return source
    .replace(IMPORT_ANCHOR, `${IMPORT_ANCHOR}import { readFileSync as ocReadFileSync, realpathSync as ocRealpathSync, statSync as ocStatSync } from "node:fs";\nimport { enableCompileCache as ocEnableCompileCache, flushCompileCache as ocFlushCompileCache } from "node:module";\nimport ocOs from "node:os";\nimport ocPath from "node:path";\n`)
    .replace(BODY_ANCHOR, `${BODY_ANCHOR}${BODY}`);
}
