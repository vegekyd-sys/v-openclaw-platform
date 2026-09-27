import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

// 9.5 emitted core chunks as `openclaw-tools-<hash>.js`; 9.6 emits `.mjs` and
// also ships a two-line re-export stub next to the chunk that defines the
// factory. Select by the definition, never by a file-name extension or by which
// chunk happens to hold a tool's description.
const TOOLS_CHUNK = /^openclaw-tools-[\w-]+\.m?js$/;
const FACTORY_DEFINITION = /\bfunction createOpenClawTools\s*\(/;

/**
 * Resolve the core chunk that defines createOpenClawTools. With `marker`, the
 * chunk must also contain that text (a tool description), so a core whose tool
 * moved elsewhere fails loudly instead of loading the wrong chunk.
 */
export async function resolveOpenClawToolsModule(distDir, options = {}) {
  const readDirectory = options.readDirectory ?? readdir;
  const readText = options.readFile ?? ((path) => readFile(path, "utf8"));
  const names = (await readDirectory(distDir)).filter((name) => TOOLS_CHUNK.test(name)).sort();
  const matches = [];
  for (const name of names) {
    const path = join(distDir, name);
    const source = await readText(path);
    if (!FACTORY_DEFINITION.test(source)) continue;
    if (options.marker && !source.includes(options.marker)) continue;
    matches.push(path);
  }
  if (matches.length !== 1) {
    throw new Error(
      `expected one OpenClaw tools module${options.label ? ` with ${options.label}` : ""}, found ${matches.length}`,
    );
  }
  return matches[0];
}
