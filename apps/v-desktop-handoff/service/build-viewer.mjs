#!/usr/bin/env node
// Bundles the viewer page (public/app.js + the vendored noVNC 1.3.0) into one
// file, public/viewer.js, and stamps content hashes into public/index.html so
// the browser can cache it for good. A phone on a poor network used to fetch
// 43 separate module files, each revalidated on every visit; one stuck request
// left the page on "连接中…".
//
//   cd apps/v-desktop-handoff/service && node build-viewer.mjs
//
// Needs esbuild (fetched by npx). The output is committed; tests/viewer-build
// fails when app.js, app.css or the vendored noVNC changed without a rebuild.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, "public");
const NOVNC = path.join(HERE, "vendor", "novnc-1.3.0");
const sha = (buf) => createHash("sha256").update(buf).digest("hex");

/** Hash of everything the bundle is made from, recorded in its banner. */
export function sourceHash() {
  const files = [path.join(PUBLIC, "app.js")];
  const walk = (dir) => {
    for (const name of fs.readdirSync(dir).sort()) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) {
        walk(p);
      } else if (p.endsWith(".js")) {
        files.push(p);
      }
    }
  };
  walk(NOVNC);
  const h = createHash("sha256");
  for (const f of files) {
    h.update(path.relative(HERE, f));
    h.update(fs.readFileSync(f));
  }
  return h.digest("hex").slice(0, 16);
}

export function stampIndex(html, viewerHash, cssHash) {
  return html
    .replace(/<script type="module" src="[^"]*"><\/script>/u, `<script type="module" src="viewer.js?v=${viewerHash}"></script>`)
    .replace(/<link rel="stylesheet" href="[^"]*">/u, `<link rel="stylesheet" href="app.css?v=${cssHash}">`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = path.join(PUBLIC, "viewer.js");
  const plugin = path.join(HERE, ".novnc-alias.mjs");
  // app.js imports "./novnc/..." (served from the host in the unbundled page); point it at the vendored copy.
  fs.writeFileSync(
    plugin,
    `export default { name: "novnc", setup(b) { b.onResolve({ filter: /^\\.\\/novnc\\// }, (a) => ({ path: ${JSON.stringify(NOVNC)} + a.path.slice("./novnc".length) })); } };\n`,
  );
  const script = `
    import { build } from "esbuild";
    import novnc from ${JSON.stringify(plugin)};
    await build({
      entryPoints: [${JSON.stringify(path.join(PUBLIC, "app.js"))}],
      bundle: true, format: "esm", minify: true, target: ["safari14", "chrome90"],
      legalComments: "eof", outfile: ${JSON.stringify(out)}, plugins: [novnc],
      banner: { js: "/* v-desktop-handoff viewer, source ${sourceHash()}; noVNC 1.3.0 (MPL-2.0), pako (MIT/Zlib), see vendor/novnc-1.3.0/COPYRIGHT.debian */" },
    });`;
  try {
    execFileSync("npx", ["--yes", "-p", "esbuild@0.24.0", "node", "--input-type=module", "-e", script], { stdio: "inherit", cwd: HERE });
  } finally {
    fs.rmSync(plugin, { force: true });
  }
  const viewerHash = sha(fs.readFileSync(out)).slice(0, 12);
  const cssHash = sha(fs.readFileSync(path.join(PUBLIC, "app.css"))).slice(0, 12);
  const indexFile = path.join(PUBLIC, "index.html");
  fs.writeFileSync(indexFile, stampIndex(fs.readFileSync(indexFile, "utf8"), viewerHash, cssHash));
  console.log(JSON.stringify({ out: path.relative(HERE, out), bytes: fs.statSync(out).size, viewerHash, cssHash }));
}
