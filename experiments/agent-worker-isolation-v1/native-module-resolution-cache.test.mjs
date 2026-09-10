import assert from "node:assert/strict";
import test from "node:test";
import {mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {pathToFileURL} from "node:url";
import {createNativeModuleResolveHook, installNativeModuleResolutionCache} from "./native-module-resolution-cache.mjs";

const distURL = "file:///runtime/openclaw/dist/";
const ctx = (file = "a.js", extra = {}) => ({parentURL: distURL + file,
  conditions: ["node", "import"], importAttributes: {}, ...extra});
const native = (specifier, context) => ({url: new URL(specifier, context.parentURL).href, format: "module"});

test("deduplicates relative edges by directory, preserving native first resolution", () => {
  const hook = createNativeModuleResolveHook({distURL});
  let calls = 0;
  const next = (specifier, context) => {calls++; return native(specifier, context);};
  assert.deepEqual(hook.resolve("./shared.js", ctx(), next), native("./shared.js", ctx()));
  assert.deepEqual(hook.resolve("./shared.js", ctx("b.js"), next), {...native("./shared.js", ctx()), shortCircuit: true});
  assert.equal(calls, 1);
  assert.deepEqual(hook.status(), {hits: 1, misses: 1, entries: 1});
});

test("directories, conditions and attributes are isolated", () => {
  const hook = createNativeModuleResolveHook({distURL});
  let calls = 0;
  const next = (s, c) => {calls++; return native(s, c);};
  for (const c of [ctx(), ctx("nested/a.js"), ctx("b.js", {conditions: ["node", "require"]}),
    ctx("c.js", {importAttributes: {type: "json"}})]) hook.resolve("./shared.js", c, next);
  assert.equal(calls, 4);
});

test("out-of-scope, bare, private, query and unknown contexts always call next", () => {
  const hook = createNativeModuleResolveHook({distURL});
  let calls = 0;
  const next = () => {calls++; return {format: "module", url: distURL + "shared.js"};};
  const cases = [
    ["./shared.js", ctx("a.js", {parentURL: "file:///plugin/a.js"})],
    ["./shared.js", ctx("a.js", {parentURL: "file:///runtime/openclaw/dist-evil/a.js"})],
    ["./shared.js", ctx("a.js", {futureFlag: true})],
    ["./shared.js", ctx("a.js?custom")],
    ["./shared.js", ctx("a.cjs")],
    ["../outside.js", ctx()], ["../../secret.js", ctx()],
    ["./shared.js?x", ctx()], ["./shared.js#x", ctx()],
    ["./data.json", ctx()], ["openclaw/forbidden", ctx()], ["#private", ctx()],
    ["node:fs", ctx()], ["file:///runtime/openclaw/dist/shared.js", ctx()],
  ];
  for (const [s, c] of cases) {hook.resolve(s, c, next); hook.resolve(s, c, next);}
  assert.equal(calls, cases.length * 2);
  assert.equal(hook.status().entries, 0);
});

test("failed, redirected and non-ESM resolutions are never cached", () => {
  const hook = createNativeModuleResolveHook({distURL});
  let calls = 0;
  const failure = Object.assign(new Error("fixture denial"), {code: "ERR_PACKAGE_PATH_NOT_EXPORTED"});
  for (let i = 0; i < 2; i++) {
    assert.throws(() => hook.resolve("./denied.js", ctx(), () => {calls++; throw failure;}), e => e === failure);
    hook.resolve("./redirect.js", ctx(), () => {calls++; return {format: "module", url: distURL + "different.js"};});
    hook.resolve("./common.js", ctx(), () => {calls++; return {format: "commonjs", url: distURL + "common.js"};});
  }
  assert.equal(calls, 6);
  assert.equal(hook.status().entries, 0);
});

test("cached result cannot be corrupted through caller mutation; cap is strict", () => {
  const hook = createNativeModuleResolveHook({distURL, maxEntries: 1});
  const first = hook.resolve("./one.js", ctx(), native);
  first.url = "file:///mutated.js";
  const second = hook.resolve("./one.js", ctx("b.js"), native);
  assert.equal(second.url, distURL + "one.js");
  second.url = "file:///mutated-again.js";
  assert.equal(hook.resolve("./one.js", ctx("c.js"), native).url, distURL + "one.js");
  hook.resolve("./two.js", ctx(), native);
  assert.equal(hook.status().entries, 1);
  hook.clear();
  assert.equal(hook.status().entries, 0);
});

test("unsupported or explicit opt-out runtime falls through; no disk writes", () => {
  for (const options of [
    {agentRuntimePath: "/missing/dist/plugin-sdk/agent-runtime.js"},
    {env: {OPENCLAW_WORKER_RESOLVE_CACHE: "0"}},
    {env: {NODE_OPTIONS: "--import=./custom.mjs"}},
    {env: {NODE_OPTIONS: "-r ./custom.cjs"}},
    {env: {}, execArgv: ["--loader", "custom.mjs"]},
    {env: {}, execArgv: ["-r", "custom.cjs"]},
    {env: {}, execArgv: ["-r./custom.cjs"]},
  ]) assert.deepEqual(installNativeModuleResolutionCache(options).status(), {enabled: false});
});

test("invalid limits fail early and oversized keys are never retained", () => {
  for (const maxEntries of [0, -1, 4097, 1.5]) {
    assert.throws(() => createNativeModuleResolveHook({distURL, maxEntries}));
  }
  const hook = createNativeModuleResolveHook({distURL});
  const specifier = "./" + "a".repeat(5000) + ".js";
  let calls = 0;
  const next = (s, c) => {calls++; return native(s, c);};
  hook.resolve(specifier, ctx(), next); hook.resolve(specifier, ctx(), next);
  assert.equal(calls, 2); assert.equal(hook.status().entries, 0);
});

test("actual Node hook preserves module singleton, package denials and retry after missing file", () => {
  const scratch = mkdtempSync(join(tmpdir(), "native-resolve-test-"));
  try {
    const dist = join(scratch, "dist");
    mkdirSync(join(dist, "plugin-sdk"), {recursive: true});
    writeFileSync(join(scratch, "package.json"), JSON.stringify({name: "openclaw", type: "module", exports: {".": "./dist/a.js"}}));
    writeFileSync(join(dist, "plugin-sdk/agent-runtime.js"), "export const fixture = true;\n");
    writeFileSync(join(dist, "shared.js"), "globalThis.fixtureLoads = (globalThis.fixtureLoads ?? 0) + 1; export const value = 42;\n");
    for (const name of ["a.js", "b.js"]) writeFileSync(join(dist, name), "export {value} from './shared.js'; export const denied = () => import('openclaw/forbidden'); export const missing = () => import('./later.js');\n");
    const helper = new URL("./native-module-resolution-cache.mjs", import.meta.url).href;
    const script = `import {installNativeModuleResolutionCache} from ${JSON.stringify(helper)};
      import {writeFileSync} from 'node:fs';
      const registration = installNativeModuleResolutionCache({agentRuntimePath:${JSON.stringify(join(dist, "plugin-sdk/agent-runtime.js"))}, env:{}, execArgv:[]});
      const a = await import(${JSON.stringify(pathToFileURL(join(dist, "a.js")).href)});
      const b = await import(${JSON.stringify(pathToFileURL(join(dist, "b.js")).href)});
      const denied = await a.denied().then(() => 'unexpected', e => e.code);
      const missing = await a.missing().then(() => 'unexpected', e => e.code);
      writeFileSync(${JSON.stringify(join(dist, "later.js"))}, 'export const value = 99;');
      const retry = await b.missing();
      const stats = registration.status(); registration.close();
      console.log(JSON.stringify({a:a.value,b:b.value,loads:globalThis.fixtureLoads,denied,missing,retry:retry.value,stats}));`;
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", script], {encoding: "utf8", timeout: 10_000});
    assert.equal(result.status, 0, result.stderr);
    const output = JSON.parse(result.stdout);
    assert.equal(output.a, 42); assert.equal(output.b, 42); assert.equal(output.loads, 1);
    assert.equal(output.denied, "ERR_PACKAGE_PATH_NOT_EXPORTED");
    assert.equal(output.missing, "ERR_MODULE_NOT_FOUND"); assert.equal(output.retry, 99);
    assert.equal(output.stats.enabled, true); assert.ok(output.stats.hits >= 1);
  } finally {rmSync(scratch, {recursive: true, force: true});}
});

test("release Worker changes only optional pre-import acceleration, not run semantics", () => {
  const source = readFileSync(new URL("../../lab/release-files/production-worker-worker.mjs", import.meta.url), "utf8");
  const baseline = readFileSync(new URL("../../lab/fixtures/concurrency-native-baseline/production-worker-worker.mjs", import.meta.url), "utf8");
  const prefix = 'import {Console as FirsttextMetricConsole} from "node:console";\nconst ocFirsttextMetricConsole = new FirsttextMetricConsole({stdout: process.stdout, stderr: process.stderr, ignoreErrors: true});\n';
  const stripped = source.replace('import { installNativeModuleResolutionCache } from "./native-module-resolution-cache.mjs";\n', '')
    .replace('    installNativeModuleResolutionCache({agentRuntimePath: configuredAgentRuntimePath()});\n', '');
  assert.equal(stripped, prefix + baseline.replace("    console.error('[firsttext-worker-phases] ' + JSON.stringify(row));", "    // row contains only validated timing/identity fields; no prompt, tool args or credentials.\n    ocFirsttextMetricConsole.error('[firsttext-worker-phases] ' + JSON.stringify(row));"));
});
