// scripts/captured-store.mjs: release/captured/*/dist lives on the
// captured-store branch and is linked into worktrees (docs/release-captured-store.md).
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { check, link, publish, seed } from "../scripts/captured-store.mjs";
import { capturedBytes } from "../scripts/lib/captured-store.mjs";

delete process.env.V_CAPTURED_CACHE;
Object.assign(process.env, {
  GIT_AUTHOR_NAME: "t", GIT_AUTHOR_EMAIL: "t@example.invalid", GIT_COMMITTER_NAME: "t", GIT_COMMITTER_EMAIL: "t@example.invalid",
  GIT_CONFIG_NOSYSTEM: "1",
});
const sh = (cwd, ...args) => execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
const sha256 = (s) => createHash("sha256").update(s).digest("hex");
const quiet = (fn) => { const log = console.log; console.log = () => {}; try { return fn(); } finally { console.log = log; } };

function writeCapture(root, name, files) {
  const dir = path.join(root, "release/captured", name);
  for (const [rel, body] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, "dist", rel)), { recursive: true });
    fs.writeFileSync(path.join(dir, "dist", rel), body);
  }
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify({
    release: name, files: Object.entries(files).map(([rel, body]) => ({ path: `./${rel}`, sha256: sha256(body) })),
  }));
}

function fixture() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "captured-store-test-"));
  const remote = path.join(tmp, "remote.git");
  const root = path.join(tmp, "clone");
  sh(tmp, "init", "-q", "--bare", "-b", "dev", remote);
  sh(tmp, "clone", "-q", remote, root);
  sh(root, "config", "core.hooksPath", "/dev/null");
  fs.writeFileSync(path.join(root, ".gitignore"), "release/captured/*/dist\nrelease/captured/*/.dist-tree\n");
  // Two captures sharing a file, as the real ones do.
  writeCapture(root, "rel-a", { "index.js": "shared\n", "only-a.js": "a\n" });
  writeCapture(root, "rel-a.worker", { "index.js": "shared\n", "sub/w.mjs": "w\n" });
  sh(root, "add", "-f", ".");
  sh(root, "commit", "-q", "-m", "before the move: dist tracked");
  sh(root, "push", "-q", "origin", "HEAD:dev");
  return { tmp, remote, root };
}

test("seed, untrack, link: same paths, real files cloned from the shared cache", () => {
  const { tmp, root } = fixture();
  try {
    quiet(() => seed(root, "HEAD"));
    assert.throws(() => seed(root, "HEAD"), /already exists/);
    const before = sh(root, "rev-parse", "HEAD");
    // A tracked dist/ fails the check, with the commands to fix it.
    assert.match(check(root).problems.join("\n"), /tracked on this branch[\s\S]*publish rel-a/);
    sh(root, "rm", "-r", "-q", "--cached", "--", ":(glob)release/captured/*/dist/**");
    sh(root, "commit", "-q", "-m", "move dist to captured-store");
    for (const n of ["rel-a", "rel-a.worker"]) fs.rmSync(path.join(root, "release/captured", n, "dist"), { recursive: true });

    const r = quiet(() => link(root));
    assert.equal(r.linked, 2);
    assert.deepEqual(r.missing, []);
    const dist = path.join(root, "release/captured/rel-a/dist");
    assert(fs.lstatSync(dist).isDirectory(), "a real directory, so cpSync(dist, ...) copies files");
    const tree = sh(root, "rev-parse", "origin/captured-store:release/captured/rel-a/dist").trim();
    assert.equal(fs.readFileSync(path.join(root, "release/captured/rel-a/.dist-tree"), "utf8"), `${tree}\n`);
    assert.equal(fs.readFileSync(path.join(dist, "only-a.js"), "utf8"), "a\n");
    assert.equal(fs.readFileSync(path.join(root, "release/captured/rel-a.worker/dist/sub/w.mjs"), "utf8"), "w\n");
    // The cache holds the file both captures have once.
    const cache = path.join(root, ".git/v-captured/trees");
    const workerTree = sh(root, "rev-parse", "origin/captured-store:release/captured/rel-a.worker/dist").trim();
    assert.equal(fs.statSync(path.join(cache, tree, "index.js")).ino, fs.statSync(path.join(cache, workerTree, "index.js")).ino);
    // Writing to a worktree copy never reaches the cache.
    fs.writeFileSync(path.join(dist, "index.js"), "patched in place\n");
    assert.equal(fs.readFileSync(path.join(cache, workerTree, "index.js"), "utf8"), "shared\n");
    fs.writeFileSync(path.join(dist, "index.js"), "shared\n");
    assert.equal(sh(root, "status", "--porcelain"), "", "dist/ and .dist-tree are ignored");
    assert.equal(quiet(() => link(root)).linked, 0, "idempotent");
    assert.deepEqual(check(root).problems, []);
    // Old commits still carry the bytes.
    assert.equal(sh(root, "show", `${before.trim()}:release/captured/rel-a/dist/only-a.js`), "a\n");

    // A second worktree reuses the cache: nothing to build, only symlinks.
    const wt = path.join(tmp, "wt");
    sh(root, "worktree", "add", "-q", "--detach", wt, "HEAD");
    const r2 = quiet(() => link(wt));
    assert.equal(r2.linked, 2);
    assert.equal(fs.readFileSync(path.join(wt, "release/captured/rel-a/dist/only-a.js"), "utf8"), "a\n");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("publish: new capture goes to captured-store, the branch keeps only the manifest", () => {
  const { tmp, root } = fixture();
  try {
    quiet(() => seed(root, "HEAD"));
    sh(root, "rm", "-r", "-q", "--cached", "--", ":(glob)release/captured/*/dist/**");
    sh(root, "commit", "-q", "-m", "move");
    writeCapture(root, "rel-b", { "index.js": "shared\n", "new.js": "b\n" });
    // Bytes that do not match the manifest are refused.
    fs.writeFileSync(path.join(root, "release/captured/rel-b/dist/new.js"), "tampered\n");
    assert.throws(() => publish(root, ["rel-b"]), /does not match its manifest/);
    fs.writeFileSync(path.join(root, "release/captured/rel-b/dist/new.js"), "b\n");
    // Not published yet: check names it.
    sh(root, "add", "release/captured/rel-b");
    assert.equal(sh(root, "diff", "--cached", "--name-only"), "release/captured/rel-b/manifest.json\n");
    sh(root, "commit", "-q", "-m", "capture rel-b");
    assert.match(check(root).problems.join("\n"), /rel-b: not on captured-store/);

    // Someone else publishes in between: publish rebuilds on top of it.
    const other = path.join(tmp, "other");
    sh(tmp, "clone", "-q", "-b", "dev", path.join(tmp, "remote.git"), other);
    sh(other, "config", "core.hooksPath", "/dev/null");
    writeCapture(other, "rel-c", { "c.js": "c\n" });
    quiet(() => publish(other, ["rel-c"]));

    quiet(() => publish(root, ["rel-b"]));
    assert.equal(fs.readFileSync(path.join(root, "release/captured/rel-b/.dist-tree"), "utf8").trim(),
      sh(root, "rev-parse", "origin/captured-store:release/captured/rel-b/dist").trim(), "marked as published");
    assert.equal(fs.readFileSync(path.join(root, "release/captured/rel-b/dist/new.js"), "utf8"), "b\n");
    assert.deepEqual(check(root).problems, []);
    const store = sh(root, "ls-tree", "-r", "--name-only", "origin/captured-store");
    for (const p of ["release/captured/rel-b/dist/new.js", "release/captured/rel-c/dist/c.js", "release/captured/rel-a/dist/only-a.js"]) {
      assert(store.includes(p), p);
    }
    assert.throws(() => publish(root, ["rel-b"]), /already published/);
    // sync-vlab-from-v reads through capturedBytes: worktree, then the store.
    fs.rmSync(path.join(root, "release/captured/rel-b/dist"), { recursive: true });
    assert.equal(capturedBytes(root, "release/captured/rel-b/dist/new.js").toString(), "b\n");
    assert.equal(capturedBytes(root, "release/captured/rel-b/dist/nope.js"), null);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test("link --verify repairs the cache and modified copies; a dist/ of its own is left alone", () => {
  const { tmp, root } = fixture();
  try {
    quiet(() => seed(root, "HEAD"));
    sh(root, "rm", "-r", "-q", "--cached", "--", ":(glob)release/captured/*/dist/**");
    sh(root, "commit", "-q", "-m", "move");
    for (const n of ["rel-a", "rel-a.worker"]) fs.rmSync(path.join(root, "release/captured", n, "dist"), { recursive: true });
    quiet(() => link(root));
    const file = path.join(root, "release/captured/rel-a/dist/index.js");
    fs.writeFileSync(file, "oops\n");
    fs.writeFileSync(path.join(root, "release/captured/rel-a.worker/dist/extra.js"), "x\n");
    const tree = sh(root, "rev-parse", "origin/captured-store:release/captured/rel-a/dist").trim();
    const object = path.join(root, ".git/v-captured/trees", tree, "only-a.js");
    fs.writeFileSync(object, "cache damaged\n");
    // Replaced rather than written: the tree file no longer is the object's inode.
    const workerTree = sh(root, "rev-parse", "origin/captured-store:release/captured/rel-a.worker/dist").trim();
    const replaced = path.join(root, ".git/v-captured/trees", workerTree, "sub/w.mjs");
    fs.rmSync(replaced);
    fs.writeFileSync(replaced, "replaced\n");
    // Not marked: somebody's own dist/ (unpublished capture, or an old branch).
    writeCapture(root, "rel-own", { "o.js": "o\n" });
    fs.writeFileSync(path.join(root, "release/captured/rel-own/dist/o.js"), "work in progress\n");
    const err = console.error;
    console.error = () => {};
    try { quiet(() => link(root, { verify: true, fetch: false })); } finally { console.error = err; }
    assert.equal(fs.readFileSync(file, "utf8"), "shared\n");
    assert(!fs.existsSync(path.join(root, "release/captured/rel-a.worker/dist/extra.js")));
    assert.equal(fs.readFileSync(object, "utf8"), "a\n");
    assert.equal(fs.readFileSync(replaced, "utf8"), "w\n");
    assert.equal(fs.readFileSync(path.join(root, "release/captured/rel-own/dist/o.js"), "utf8"), "work in progress\n");
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
