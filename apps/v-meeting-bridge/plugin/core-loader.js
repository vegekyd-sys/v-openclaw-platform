// Hot reload of the meeting core (core/*.js) without a Gateway restart.
// ESM caches modules by URL, so each version of core/ is copied once into
// <stateRoot>/core-versions/<sha256 prefix>/ and imported from there: a new version gets new URLs
// for every file, including the relative imports between them. index.js (tools, Gateway methods,
// the service) stays loaded; changing it still needs a restart.
import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const PLUGIN_DIR = path.dirname(fileURLToPath(import.meta.url));
const KEEP_VERSIONS = 5;

/** Content hash of a core directory: same files → same version. */
export async function coreVersion(srcDir) {
  const files = (await fs.readdir(srcDir)).filter((f) => f.endsWith(".js")).sort();
  const h = crypto.createHash("sha256");
  for (const f of files) h.update(f).update("\0").update(await fs.readFile(path.join(srcDir, f))).update("\0");
  return { version: h.digest("hex").slice(0, 12), files };
}

/** Copies srcDir into the version store (atomically, once) and imports it. */
export async function loadCore(stateRoot, { srcDir = path.join(PLUGIN_DIR, "core") } = {}) {
  const { version, files } = await coreVersion(srcDir);
  const root = path.join(stateRoot, "core-versions");
  const dest = path.join(root, version);
  try {
    await fs.access(path.join(dest, "manager.js"));
  } catch {
    const tmp = `${dest}.tmp-${process.pid}-${Date.now()}`;
    await fs.mkdir(tmp, { recursive: true });
    for (const f of files) await fs.copyFile(path.join(srcDir, f), path.join(tmp, f));
    // The copies live outside the plugin package: tell Node they are ES modules.
    await fs.writeFile(path.join(tmp, "package.json"), '{"type":"module","private":true}\n');
    await fs.rm(dest, { recursive: true, force: true });
    await fs.rename(tmp, dest);
  }
  const load = (f) => import(pathToFileURL(path.join(dest, f)).href);
  const [bridge, lark, manager, store] = await Promise.all(["bridge.js", "lark.js", "manager.js", "store.js"].map(load));
  await pruneVersions(root, version).catch(() => {});
  return { version, dir: dest, bridge, lark, manager, store };
}

async function pruneVersions(root, keep) {
  const entries = await fs.readdir(root, { withFileTypes: true });
  const dirs = [];
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    const full = path.join(root, e.name);
    if (e.name.includes(".tmp-")) { await fs.rm(full, { recursive: true, force: true }); continue; }
    dirs.push({ name: e.name, full, mtime: (await fs.stat(full)).mtimeMs });
  }
  dirs.sort((a, b) => b.mtime - a.mtime);
  for (const d of dirs.slice(KEEP_VERSIONS)) if (d.name !== keep) await fs.rm(d.full, { recursive: true, force: true });
}
