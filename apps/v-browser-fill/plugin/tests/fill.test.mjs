import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { fillSecret, hostOf, scrub } from "../core/fill.js";
import { exportBindings, loadNative, resolveOpenClawDist } from "../core/native.js";

const VALUE = "hunter2-Ünicode-密码";

function fakeDeps({ entry = { kind: "secret", allowedHosts: ["login.example.com"] }, tabs = [{ targetId: "T1", url: "https://login.example.com/signin" }], act } = {}) {
  const calls = [];
  return {
    calls,
    entry: (name) => { calls.push(["entry", name]); return entry; },
    readValue: (name) => { calls.push(["read", name]); return VALUE; },
    remove: (name) => { calls.push(["remove", name]); },
    dispatch: async (req) => {
      calls.push(["dispatch", req.method, req.path, req.query, req.body && { ...req.body, text: req.body.text === VALUE ? "<value>" : req.body.text }]);
      if (req.path === "/tabs") return { status: 200, body: { running: true, tabs } };
      return act ? act(req) : { status: 200, body: { ok: true, targetId: req.body.targetId } };
    },
  };
}

test("types the stored value into the ref on the entry's host and deletes it", async () => {
  const deps = fakeDeps();
  const result = await fillSecret({ name: "LOGIN_EXAMPLE_PASSWORD", ref: "e12", profile: "vbrowser-01" }, deps);
  assert.deepEqual(result, { filled: true, name: "LOGIN_EXAMPLE_PASSWORD", host: "login.example.com", targetId: "T1", submitted: false, removed: true });
  assert.deepEqual(deps.calls, [
    ["entry", "LOGIN_EXAMPLE_PASSWORD"],
    ["dispatch", "GET", "/tabs", { profile: "vbrowser-01" }, undefined],
    ["read", "LOGIN_EXAMPLE_PASSWORD"],
    ["dispatch", "POST", "/act", { profile: "vbrowser-01" }, { kind: "type", ref: "e12", text: "<value>", targetId: "T1" }],
    ["remove", "LOGIN_EXAMPLE_PASSWORD"],
  ]);
  assert.equal(JSON.stringify(result).includes(VALUE), false);
});

test("refuses a page on another host before reading the value", async () => {
  const deps = fakeDeps({ tabs: [{ targetId: "T1", url: "https://login.example.com.evil.test/" }] });
  await assert.rejects(fillSecret({ name: "LOGIN_EXAMPLE_PASSWORD", ref: "e1" }, deps), { code: "HOST_MISMATCH" });
  assert.equal(deps.calls.some((c) => c[0] === "read" || c[0] === "remove"), false);
});

test("refuses entries without a site, env entries, missing entries and bad names", async () => {
  await assert.rejects(fillSecret({ name: "LOGIN_X_TOKEN", ref: "e1" }, fakeDeps({ entry: { kind: "secret", allowedHosts: [] } })), { code: "NO_SITE" });
  await assert.rejects(fillSecret({ name: "LOGIN_X_TOKEN", ref: "e1" }, fakeDeps({ entry: { kind: "env", allowedHosts: [] } })), { code: "NOT_A_SECRET" });
  await assert.rejects(fillSecret({ name: "LOGIN_X_TOKEN", ref: "e1" }, fakeDeps({ entry: null })), { code: "NOT_FOUND" });
  await assert.rejects(fillSecret({ name: "lower", ref: "e1" }, fakeDeps()), { code: "INVALID_NAME" });
  // Store entries the Gateway and Workers use are never read, typed or deleted.
  for (const name of ["MAKARON_API_KEY", "AGENTMAIL_API_KEY", "LOGIN_", "XLOGIN_A"]) {
    const deps = fakeDeps();
    await assert.rejects(fillSecret({ name, ref: "e1" }, deps), { code: "INVALID_NAME" });
    assert.deepEqual(deps.calls, [], `${name} must not touch the store`);
  }
  await assert.rejects(fillSecret({ name: "LOGIN_X_TOKEN", ref: " " }, fakeDeps()), { code: "REF_REQUIRED" });
});

test("needs a targetId when several tabs are open and finds it when given", async () => {
  const tabs = [{ targetId: "A", url: "https://other.test/" }, { targetId: "B", suggestedTargetId: "b1", url: "https://login.example.com/" }];
  await assert.rejects(fillSecret({ name: "LOGIN_X_CODE", ref: "e1" }, fakeDeps({ tabs })), { code: "TAB_AMBIGUOUS" });
  await assert.rejects(fillSecret({ name: "LOGIN_X_CODE", ref: "e1", targetId: "Z" }, fakeDeps({ tabs })), { code: "TAB_NOT_FOUND" });
  const result = await fillSecret({ name: "LOGIN_X_CODE", ref: "e1", targetId: "b1", submit: true, keep: true }, fakeDeps({ tabs }));
  assert.deepEqual(result, { filled: true, name: "LOGIN_X_CODE", host: "login.example.com", targetId: "B", submitted: true, removed: false });
});

test("a failed type keeps the entry and never echoes the value", async () => {
  const deps = fakeDeps({ act: () => ({ status: 400, body: { error: `no element matches; tried to type ${VALUE}` } }) });
  await assert.rejects(fillSecret({ name: "LOGIN_EXAMPLE_PASSWORD", ref: "e9" }, deps), (error) => {
    assert.equal(error.code, "TYPE_FAILED");
    assert.equal(error.message.includes(VALUE), false);
    assert.match(error.message, /\[redacted\]/u);
    return true;
  });
  assert.equal(deps.calls.some((c) => c[0] === "remove"), false);
  const thrown = fakeDeps({ act: () => { throw new Error(`timeout typing ${VALUE}`); } });
  await assert.rejects(fillSecret({ name: "LOGIN_EXAMPLE_PASSWORD", ref: "e9" }, thrown), (e) => !e.message.includes(VALUE));
});

test("hostOf only accepts web pages", () => {
  assert.equal(hostOf("https://Login.Example.com./x"), "login.example.com");
  assert.equal(hostOf("about:blank"), null);
  assert.equal(hostOf("file:///etc/passwd"), null);
  assert.equal(scrub("a x b x", "x"), "a [redacted] b [redacted]");
});

test("finds the dist of a Worker and of the Gateway", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "fill-dist-"));
  const dist = path.join(dir, "core", "dist");
  fs.mkdirSync(path.join(dist, "plugin-sdk"), { recursive: true });
  fs.writeFileSync(path.join(dist, "local-dispatch.runtime.js"), "");
  try {
    assert.equal(resolveOpenClawDist({ env: { VLAB_OPENCLAW_AGENT_RUNTIME: path.join(dist, "plugin-sdk", "agent-runtime.js") }, argv: ["node", "/opt/w/worker.mjs"] }), dist);
    assert.equal(resolveOpenClawDist({ env: {}, argv: ["node", path.join(dist, "index.js"), "gateway"] }), dist);
    assert.equal(resolveOpenClawDist({ configured: dist, env: {}, argv: [] }), dist);
    assert.throws(() => resolveOpenClawDist({ env: {}, argv: ["node", "/x/y.js"] }), /dist not found/u);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("binds native exports by name, not by minified letter", async () => {
  assert.deepEqual(exportBindings("export { a as b, readSecretStoreValue as c, x };", ["readSecretStoreValue", "x"]), { readSecretStoreValue: "c", x: "x" });
  assert.throws(() => exportBindings("export { y as z };", ["readSecretStoreValue"]), /exactly once/u);
  const files = {
    "secret-store-A.js": "function listSecretStoreEntries(p) {}\nfunction readSecretStoreValue(p) {}\nexport { listSecretStoreEntries as i, readSecretStoreValue as c };",
    // a re-export facade lists the same names but defines nothing (9.1 ships one)
    "secret-store-B.js": "import { i as listSecretStoreEntries, c as readSecretStoreValue } from './secret-store-A.js';\nexport { listSecretStoreEntries, readSecretStoreValue };",
    "other.js": "",
  };
  const loaded = await loadNative("/d", /^secret-store-[\w-]+\.js$/u, ["listSecretStoreEntries", "readSecretStoreValue"], {
    readDir: () => Object.keys(files),
    readFile: (f) => files[path.basename(f)],
    importer: async (f) => { assert.equal(path.basename(f), "secret-store-A.js"); return { i: () => [], c: () => ({ ok: true, value: "v" }) }; },
  });
  assert.deepEqual(Object.keys(loaded), ["listSecretStoreEntries", "readSecretStoreValue"]);
});
