// The viewer is served as one bundle with content-hashed URLs. These checks fail
// when app.js / app.css / the vendored noVNC changed without `node build-viewer.mjs`.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { test } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sourceHash } from "../build-viewer.mjs";
import { createService } from "../server.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(HERE, "..", "public");
const sha12 = (file) => createHash("sha256").update(fs.readFileSync(file)).digest("hex").slice(0, 12);

test("index.html points at the current bundle and stylesheet", () => {
  const html = fs.readFileSync(path.join(PUBLIC, "index.html"), "utf8");
  assert.ok(html.includes(`viewer.js?v=${sha12(path.join(PUBLIC, "viewer.js"))}`), "viewer.js hash in index.html is stale: run node build-viewer.mjs");
  assert.ok(html.includes(`app.css?v=${sha12(path.join(PUBLIC, "app.css"))}`), "app.css hash in index.html is stale: run node build-viewer.mjs");
  assert.ok(!/src="app\.js"|novnc\//u.test(html), "the page must not load the unbundled modules");
});

test("the bundle was built from the current sources", () => {
  const head = fs.readFileSync(path.join(PUBLIC, "viewer.js"), "utf8").slice(0, 300);
  assert.match(head, new RegExp(`source ${sourceHash()}`, "u"), "public/viewer.js is older than app.js or vendor/novnc: run node build-viewer.mjs");
});

test("versioned assets are cached for good, the page is revalidated", async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "v-desktop-viewer-"));
  fs.writeFileSync(path.join(tmp, "admin-token"), "test-admin-token-0123456789abcdef\n");
  const svc = createService(
    {
      bind: "127.0.0.1",
      publicPort: 0,
      adminPort: 0,
      publicBaseUrl: "https://example.test",
      pathPrefix: "/desktop-handoff",
      novncDir: tmp,
      stateDir: path.join(tmp, "state"),
      adminTokenFile: path.join(tmp, "admin-token"),
      vnc: { host: "127.0.0.1", port: 1, password: "x" },
    },
    { log: { error() {} } },
  );
  const { publicPort } = await svc.listen();
  try {
    const get = (p) => fetch(`http://127.0.0.1:${publicPort}/desktop-handoff${p}`);
    const page = await get("/");
    assert.equal(page.headers.get("cache-control"), "no-cache");
    const bundle = await get("/viewer.js?v=abc");
    assert.equal(bundle.status, 200);
    assert.match(bundle.headers.get("cache-control"), /immutable/u);
    assert.match(bundle.headers.get("content-type"), /javascript/u);
    assert.equal((await get("/app.css")).headers.get("cache-control"), "no-cache", "unversioned requests stay revalidated");
  } finally {
    await svc.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
