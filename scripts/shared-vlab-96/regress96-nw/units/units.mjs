// regress96 units: below-E2E checks for OpenClaw fork patches (versa/PATCHES.md)
// that cannot be exercised end-to-end on the staging host.
//
//   OPENCLAW_PKG=<core dir> node --import ./hooks.mjs units.mjs [--config <openclaw.json>]
//
// Imports built dist chunks of <core>/dist (and <core>/node_modules/@openclaw/ai/dist)
// directly; loader.mjs exposes internal functions as __h_<name>. Everything runs
// in a fresh mkdtemp sandbox (HOME/TMPDIR/OPENCLAW_STATE_DIR/OPENCLAW_HOME), with
// OPENCLAW_CONFIG_PATH / OPENCLAW_GATEWAY_* removed and globalThis.fetch replaced
// by a recorder that throws. The --config file is only ever read.
//
// Prints one JSON {results:[{id,pass,evidence,expected}],passed,total}.
// Exit 0 when the harness ran (whatever the verdicts); exit 2 when it broke.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { isDeepStrictEqual } from "node:util";
import { pathToFileURL } from "node:url";
import { EXPORTS, hookExportsFor } from "./loader.mjs";

// ---------------------------------------------------------------------------
// Output discipline: core modules may log to stdout; only our JSON goes there.
const realStdoutWrite = process.stdout.write.bind(process.stdout);
process.stdout.write = (chunk, encoding, cb) => process.stderr.write(chunk, encoding, cb);

function harnessBroke(message, error) {
  process.stderr.write(`[regress96-units] HARNESS BROKEN: ${message}${error ? `: ${error?.stack ?? error}` : ""}\n`);
  realStdoutWrite(
    `${JSON.stringify({ results: [], passed: 0, total: 0, harnessError: `${message}${error ? `: ${String(error?.message ?? error)}` : ""}` })}\n`,
    () => process.exit(2),
  );
  setTimeout(() => process.exit(2), 2000).unref();
}

process.on("uncaughtException", (error) => {
  // Late async failures from core internals after a check settled are logged, not fatal.
  process.stderr.write(`[regress96-units] uncaughtException (ignored): ${error?.stack ?? error}\n`);
});
process.on("unhandledRejection", (error) => {
  process.stderr.write(`[regress96-units] unhandledRejection (ignored): ${error?.stack ?? error}\n`);
});

// ---------------------------------------------------------------------------
// Arguments
let configPath;
let CONFIG_ABS;
{
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--config") configPath = argv[++i];
    else if (argv[i].startsWith("--config=")) configPath = argv[i].slice("--config=".length);
    else {
      harnessBroke(`unknown argument ${argv[i]}`);
      await new Promise(() => {});
    }
  }
}

if (configPath) CONFIG_ABS = path.resolve(configPath);
const PKG = process.env.OPENCLAW_PKG ? path.resolve(process.env.OPENCLAW_PKG) : undefined;
if (!PKG || !fs.existsSync(path.join(PKG, "dist"))) {
  harnessBroke(`OPENCLAW_PKG must point at an OpenClaw core dir with dist/ (got ${PKG ?? "unset"})`);
  await new Promise(() => {});
}
if (globalThis.__regress96HooksRegistered !== true) {
  harnessBroke("hooks.mjs not loaded: run with `node --import ./hooks.mjs units.mjs`");
  await new Promise(() => {});
}

// ---------------------------------------------------------------------------
// Sandbox: fresh dirs, no config/gateway env, no network.
const SANDBOX = fs.mkdtempSync(path.join(os.tmpdir(), "regress96-units-"));
for (const sub of ["home", "tmp", "state"]) fs.mkdirSync(path.join(SANDBOX, sub), { recursive: true });
for (const key of Object.keys(process.env)) {
  if (key === "OPENCLAW_CONFIG_PATH" || key.startsWith("OPENCLAW_GATEWAY_")) delete process.env[key];
  // Any other ambient OpenClaw pointer could reach real state; keep only OPENCLAW_PKG.
  else if (key.startsWith("OPENCLAW_") && key !== "OPENCLAW_PKG") delete process.env[key];
}
process.env.HOME = path.join(SANDBOX, "home");
process.env.TMPDIR = path.join(SANDBOX, "tmp");
process.env.OPENCLAW_STATE_DIR = path.join(SANDBOX, "state");
process.env.OPENCLAW_HOME = path.join(SANDBOX, "home");
const STATE_DIR = process.env.OPENCLAW_STATE_DIR;
// Remove the sandbox at exit (background SQLite work can still touch it until then).
process.on("exit", () => {
  try {
    fs.rmSync(SANDBOX, { recursive: true, force: true });
  } catch {}
});

// Read the optional config (path resolved against the caller cwd); never written,
// never handed to OpenClaw as a path; only the parsed object is used.
let externalConfig;
if (configPath) {
  try {
    const raw = fs.readFileSync(CONFIG_ABS, "utf8");
    try {
      externalConfig = JSON.parse(raw);
    } catch {
      // openclaw.json may be JSON5; use the core's own json5 if present.
      const { createRequire } = await import("node:module");
      const json5 = createRequire(path.join(PKG, "package.json"))("json5");
      externalConfig = (json5.default ?? json5).parse(raw);
    }
  } catch (error) {
    harnessBroke(`could not read --config ${configPath}`, error);
    await new Promise(() => {});
  }
}

const fetchAttempts = [];
globalThis.fetch = async (input) => {
  const url = typeof input === "string" ? input : (input?.url ?? String(input));
  fetchAttempts.push(url);
  throw new Error(`regress96-units: network disabled (fetch ${url})`);
};

// ---------------------------------------------------------------------------
// Chunk discovery: region marker -> dist file.
const CORE_DIST = path.join(PKG, "dist");
const AI_DIST = (() => {
  for (const candidate of [
    path.join(PKG, "node_modules", "@openclaw", "ai", "dist"),
    path.join(PKG, "packages", "ai", "dist"),
  ]) {
    if (fs.existsSync(candidate)) return fs.realpathSync(candidate);
  }
  return undefined;
})();

const regionFiles = new Map(); // region -> [file]
const fileText = new Map();
function scanDir(dir) {
  if (!dir) return;
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith(".mjs")) continue;
    const file = path.join(dir, name);
    const src = fs.readFileSync(file, "utf8");
    if (!src.includes("//#region ")) continue;
    for (const region of Object.keys(EXPORTS)) {
      if (src.includes(`//#region ${region}\n`)) {
        if (!regionFiles.has(region)) regionFiles.set(region, []);
        regionFiles.get(region).push(file);
        fileText.set(file, src);
      }
    }
  }
}
try {
  scanDir(CORE_DIST);
  scanDir(AI_DIST);
} catch (error) {
  harnessBroke("could not scan dist", error);
  await new Promise(() => {});
}

class NotCallable extends Error {}

const moduleCache = new Map();
async function hooked(region, names) {
  const files = regionFiles.get(region);
  if (!files?.length) throw new NotCallable(`no dist chunk contains //#region ${region}`);
  if (files.length > 1) {
    throw new NotCallable(`region ${region} appears in ${files.length} chunks: ${files.map((f) => path.basename(f)).join(", ")}`);
  }
  const file = files[0];
  const declared = hookExportsFor(fileText.get(file));
  for (const name of names) {
    if (!declared.includes(name)) {
      throw new NotCallable(`${name} is not a top-level declaration in ${path.basename(file)} (renamed or inlined)`);
    }
  }
  if (!moduleCache.has(file)) moduleCache.set(file, import(pathToFileURL(file).href));
  const mod = await moduleCache.get(file);
  const out = { __file: path.relative(PKG, file) };
  for (const name of names) {
    if (!(`__h_${name}` in mod)) throw new NotCallable(`loader hook did not expose ${name} from ${path.basename(file)}`);
    out[name] = mod[`__h_${name}`];
  }
  return out;
}

function chunkText(region) {
  const files = regionFiles.get(region);
  if (!files?.length) throw new NotCallable(`no dist chunk contains //#region ${region}`);
  return { file: files[0], text: fileText.get(files[0]) };
}

function findRegionFile(region) {
  for (const name of fs.readdirSync(CORE_DIST)) {
    if (!name.endsWith(".mjs")) continue;
    const file = path.join(CORE_DIST, name);
    const text = fs.readFileSync(file, "utf8");
    if (text.includes(`//#region ${region}\n`)) return { file, text };
  }
  return undefined;
}

// Environment limits that make a check not callable here (not a patch verdict).
const SQLITE_UNAVAILABLE = /SQLite support is unavailable or unsafe in this Node runtime/;
// OpenClaw's own floor (src/infra/node-sqlite.ts): 3.51.3+, 3.50.7+ on 3.50.x, 3.44.6+ on 3.44.x.
const SQLITE_RUNTIME = await (async () => {
  try {
    const { DatabaseSync } = await import("node:sqlite");
    const db = new DatabaseSync(":memory:");
    const version = db.prepare("SELECT sqlite_version() AS v").get().v;
    db.close();
    const [a, b, c] = version.split(".").map(Number);
    const safe = a > 3 || (a === 3 && (b > 51 || (b === 51 && c >= 3) || (b === 50 && c >= 7) || (b === 44 && c >= 6)));
    return { version, safe };
  } catch (error) {
    return { version: "unavailable", safe: false };
  }
})();
// With REGRESS96_LOCAL_UNSAFE_SQLITE=1 (local dev Node only), worker threads
// OpenClaw spawns (SQLite store / lease workers, execArgv []) also get the
// loader hook, so the same gate bypass reaches them. Off by default.
if (process.env.REGRESS96_LOCAL_UNSAFE_SQLITE === "1") {
  const { createRequire, syncBuiltinESMExports } = await import("node:module");
  const wt = createRequire(import.meta.url)("node:worker_threads");
  const hooksUrl = new URL("./hooks.mjs", import.meta.url).href;
  const OriginalWorker = wt.Worker;
  wt.Worker = class extends OriginalWorker {
    constructor(filename, options = {}) {
      super(filename, { ...options, execArgv: [...(options.execArgv ?? []), "--import", hooksUrl] });
    }
  };
  syncBuiltinESMExports();
}
const SQLITE_BYPASS_NOTE =
  process.env.REGRESS96_LOCAL_UNSAFE_SQLITE === "1" ? " [REGRESS96_LOCAL_UNSAFE_SQLITE=1: SQLite version gate bypassed for the sandbox DB]" : "";

// ---------------------------------------------------------------------------
// Check runner
const results = [];
const CHECK_TIMEOUT_MS = 60_000;

async function check(id, expected, fn) {
  const fetchBefore = fetchAttempts.length;
  let timer;
  try {
    const outcome = await Promise.race([
      Promise.resolve().then(fn),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timed out after ${CHECK_TIMEOUT_MS} ms`)), CHECK_TIMEOUT_MS);
      }),
    ]);
    let { pass, evidence } = outcome;
    if (fetchAttempts.length > fetchBefore) {
      evidence = `${evidence}; NOTE blocked fetch attempts: ${fetchAttempts.slice(fetchBefore).join(", ")}`;
    }
    results.push({ id, pass: Boolean(pass), evidence, expected });
  } catch (error) {
    if (error instanceof NotCallable) {
      results.push({ id, pass: null, evidence: `not callable: ${error.message}`, expected });
    } else if (SQLITE_UNAVAILABLE.test(String(error?.message))) {
      results.push({
        id,
        pass: null,
        evidence: `not callable: this Node (${process.version}) is refused by OpenClaw's SQLite WAL-safety gate, so the session store cannot open (${clip(String(error.message), 140)}); run on Node >= 24.16 (host 24.17) or locally with REGRESS96_LOCAL_UNSAFE_SQLITE=1`,
        expected,
      });
    } else {
      results.push({
        id,
        pass: false,
        evidence: `threw: ${error?.stack?.split("\n").slice(0, 3).join(" | ") ?? String(error)}`,
        expected,
      });
    }
  } finally {
    clearTimeout(timer);
  }
}

const j = (v) => JSON.stringify(v);
const clip = (s, n = 160) => (typeof s === "string" && s.length > n ? `${s.slice(0, n)}…` : s);
const redact = (s) => (typeof s === "string" ? s.replace(/(ou_|on_|oc_)[A-Za-z0-9]{4,}/g, "$1<redacted>") : s);

async function withEnv(overrides, fn) {
  const saved = {};
  for (const [k, v] of Object.entries(overrides)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// ===========================================================================
// 1. B5 (cd7615c70f6)
await check(
  "B5-reply-prefix-agent-runtime",
  'onModelSelected({provider:"deepseek",model:"deepseek-v4-flash",agentRuntime:"vlab-worker"}) -> prefix context agentRuntime "vlab-worker"; a later selection without agentRuntime clears it',
  async () => {
    const { createReplyPrefixContext, __file } = await hooked("src/channels/reply-prefix.ts", ["createReplyPrefixContext"]);
    const bundle = createReplyPrefixContext({ cfg: {}, agentId: "main" });
    bundle.onModelSelected({ provider: "deepseek", model: "deepseek-v4-flash", agentRuntime: "vlab-worker", thinkLevel: "high" });
    const first = { ...bundle.responsePrefixContextProvider() };
    bundle.onModelSelected({ provider: "openai", model: "gpt-5.4", thinkLevel: undefined });
    const second = { ...bundle.responsePrefixContextProvider() };
    const pass =
      first.agentRuntime === "vlab-worker" &&
      first.provider === "deepseek" &&
      first.modelFull === "deepseek/deepseek-v4-flash" &&
      second.agentRuntime === undefined &&
      second.provider === "openai";
    return {
      pass,
      evidence: `${__file}: after vlab-worker selection ${j({ agentRuntime: first.agentRuntime, modelFull: first.modelFull })}; after runtime-less selection ${j({ agentRuntime: second.agentRuntime ?? null, modelFull: second.modelFull })}`,
    };
  },
);

// ===========================================================================
// 2. B6 (97a9a00afc1)
await check(
  "B6-system-agent-flash-native-harness",
  'default agent deepseek/deepseek-flash + provider agentRuntime vlab-worker -> route.agentHarnessRuntimeOverride "openclaw"; deepseek-v4-flash keeps "vlab-worker"',
  async () => {
    const { resolveSystemAgentConfiguredRouteFromConfig, __file } = await hooked("src/system-agent/inference-route.ts", [
      "resolveSystemAgentConfiguredRouteFromConfig",
    ]);
    const flashConfig = (modelId, runtime = "vlab-worker") => ({
      agents: { defaults: { model: `deepseek/${modelId}` }, entries: { main: { default: true } } },
      models: {
        providers: {
          deepseek: {
            api: "openai-completions",
            baseUrl: "https://api.deepseek.com/v1",
            agentRuntime: { id: runtime },
            models: [
              {
                id: modelId,
                name: modelId,
                reasoning: true,
                input: ["text"],
                cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
                contextWindow: 128_000,
                maxTokens: 8_192,
              },
            ],
          },
        },
      },
    });
    const flash = await resolveSystemAgentConfiguredRouteFromConfig(flashConfig("deepseek-flash"));
    const v4 = await resolveSystemAgentConfiguredRouteFromConfig(flashConfig("deepseek-v4-flash"));
    const pick = (r) => ({ runner: r?.runner, agentId: r?.agentId, modelLabel: r?.modelLabel, agentHarnessRuntimeOverride: r?.agentHarnessRuntimeOverride });
    const pass =
      flash?.runner === "embedded" &&
      flash.agentHarnessRuntimeOverride === "openclaw" &&
      flash.modelLabel === "deepseek/deepseek-flash" &&
      v4?.runner === "embedded" &&
      v4.agentHarnessRuntimeOverride === "vlab-worker";
    return { pass, evidence: `${__file}: deepseek-flash -> ${j(pick(flash))}; deepseek-v4-flash -> ${j(pick(v4))}` };
  },
);

// ===========================================================================
// 3. E3 — DeepSeek output budget (090874a1126), both copies
const tokensOf = (n) => "x".repeat(n * 2);
const dsModel = (over = {}) => ({
  id: "deepseek-v4-flash",
  name: "DeepSeek V4 Flash",
  api: "openai-completions",
  provider: "deepseek",
  baseUrl: "https://api.deepseek.com/v1",
  reasoning: true,
  input: ["text"],
  cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  contextWindow: 1_000_000,
  maxTokens: 384_000,
  ...over,
});
// Vectors shared by the @openclaw/ai copy and the worker-bundle copy.
const budgetVectors = () => [
  { name: "big-prompt", params: { messages: [{ content: tokensOf(800_000) }], max_tokens: 384_000 }, model: dsModel(), context: undefined },
  { name: "no-room", params: { messages: [{ content: tokensOf(990_000) }], max_tokens: 384_000 }, model: dsModel(), context: undefined },
  { name: "gpt-untouched", params: { messages: [{ content: tokensOf(990_000) }], max_tokens: 384_000 }, model: dsModel({ id: "gpt-5.4", provider: "openai" }), context: undefined },
  { name: "max-completion-only", params: { messages: [{ content: tokensOf(800_000) }], max_completion_tokens: 384_000 }, model: dsModel(), context: undefined },
  {
    name: "usage-estimate",
    params: { messages: [{ content: "short" }], max_tokens: 384_000 },
    model: dsModel(),
    context: {
      messages: [
        { role: "assistant", model: "deepseek-v4-flash", usage: { input: 700_000, output: 1_000, cacheRead: 200_000, cacheWrite: 0 } },
        { role: "user", content: "next" },
      ],
    },
  },
  { name: "small-prompt", params: { messages: [{ content: "hi" }], max_tokens: 384_000 }, model: dsModel(), context: undefined },
];
function runBudget(fn, v) {
  const params = structuredClone(v.params);
  try {
    const out = fn(params, v.model, v.context);
    return { max_tokens: out.max_tokens, max_completion_tokens: out.max_completion_tokens, same: out === params };
  } catch (error) {
    return { threw: true, code: error?.code, message: String(error?.message) };
  }
}

let aiBudget;
await check(
  "E3-deepseek-budget-ai-dist",
  "@openclaw/ai dist: 800k-token prompt -> max_tokens capped into (150000,160000); 990k -> throws code V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED with 'Context overflow:' message; gpt-5.4 params untouched (384000, no throw)",
  async () => {
    if (!AI_DIST) throw new NotCallable(`@openclaw/ai dist not found under ${PKG}`);
    aiBudget = await hooked("packages/ai/src/transports/deepseek-output-budget.ts", [
      "applyDeepSeekOutputBudget",
      "DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED_CODE",
      "DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED_MESSAGE",
    ]);
    const vs = budgetVectors();
    const r = Object.fromEntries(vs.map((v) => [v.name, runBudget(aiBudget.applyDeepSeekOutputBudget, v)]));
    const pass =
      !r["big-prompt"].threw &&
      r["big-prompt"].max_tokens > 150_000 &&
      r["big-prompt"].max_tokens < 160_000 &&
      r["no-room"].threw === true &&
      r["no-room"].code === "V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED" &&
      r["no-room"].message.startsWith("Context overflow: [V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED]") &&
      !r["gpt-untouched"].threw &&
      r["gpt-untouched"].max_tokens === 384_000 &&
      r["max-completion-only"].max_tokens === undefined &&
      r["max-completion-only"].max_completion_tokens < 160_000 &&
      r["usage-estimate"].max_tokens > 50_000 &&
      r["usage-estimate"].max_tokens < 55_000 &&
      aiBudget.DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED_CODE === "V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED";
    return {
      pass,
      evidence: `${path.relative(PKG, path.join(PKG, aiBudget.__file))}: big-prompt max_tokens=${r["big-prompt"].max_tokens}; no-room ${j({ code: r["no-room"].code, message: clip(r["no-room"].message, 60) })}; gpt max_tokens=${r["gpt-untouched"].max_tokens}${r["gpt-untouched"].threw ? " THREW" : ""}; max_completion-only=${r["max-completion-only"].max_completion_tokens}; usage-estimate=${r["usage-estimate"].max_tokens}`,
    };
  },
);

// Worker bundle: minified, no region markers, not importable standalone (54 MB,
// boots a worker). Extract applyDeepSeekOutputBudget + its init block by name,
// evaluate them in isolation, and require identical results on the same vectors.
function matchBrace(src, openIdx) {
  let depth = 0;
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i];
    if (c === "'" || c === '"') {
      for (i++; i < src.length && src[i] !== c; i++) if (src[i] === "\\") i++;
      continue;
    }
    if (c === "`") {
      for (i++; i < src.length && src[i] !== "`"; i++) {
        if (src[i] === "\\") i++;
        else if (src[i] === "$" && src[i + 1] === "{") i = matchBrace(src, i + 1);
      }
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) return i;
  }
  throw new Error("unbalanced braces");
}
function extractWorkerBudget(bundleText) {
  const sig = "function applyDeepSeekOutputBudget(";
  const at = bundleText.indexOf(sig);
  if (at < 0) return undefined;
  if (bundleText.indexOf(sig, at + 1) >= 0) throw new NotCallable("applyDeepSeekOutputBudget defined more than once in the bundle");
  const bodyOpen = bundleText.indexOf("{", bundleText.indexOf(")", at));
  const fnEnd = matchBrace(bundleText, bodyOpen);
  const fnText = bundleText.slice(at, fnEnd + 1);
  const tail = bundleText.slice(fnEnd + 1, fnEnd + 600);
  const varMatch = /^var ([A-Za-z0-9_$,]+?),init_deepseek_output_budget=__esmMin\(\(\(\)=>\{/.exec(tail);
  if (!varMatch) throw new NotCallable("init_deepseek_output_budget block not found right after the function");
  const initOpen = fnEnd + 1 + varMatch[0].length - 1;
  const initEnd = matchBrace(bundleText, initOpen);
  const initBody = bundleText.slice(initOpen + 1, initEnd);
  const vars = varMatch[1].split(",");
  const factory = new Function(
    "Buffer",
    `"use strict";let ${vars.join(",")};(()=>{${initBody}})();${fnText}\nreturn {applyDeepSeekOutputBudget, values:{${vars.join(",")}}};`,
  );
  return { ...factory(Buffer), fnText, vars };
}
function callSiteCount(text) {
  return (text.match(/=applyDeepSeekOutputBudget\(/g) ?? []).length;
}

for (const bundle of ["worker.mjs", "sqlite-store.worker.mjs"]) {
  await check(
    `E3-deepseek-budget-${bundle.replace(/\.mjs$/, "")}-bundle`,
    `dist/worker/${bundle}: the inlined applyDeepSeekOutputBudget (evaluated standalone with its own init block) returns results identical to the @openclaw/ai copy on all budget vectors, and the bundle calls it at >=2 request sites (provider stream + completions transport)`,
    async () => {
      const file = path.join(CORE_DIST, "worker", bundle);
      if (!fs.existsSync(file)) throw new NotCallable(`${path.relative(PKG, file)} not present`);
      if (!aiBudget) throw new NotCallable("@openclaw/ai copy unavailable for comparison");
      const text = fs.readFileSync(file, "utf8");
      const extracted = extractWorkerBudget(text);
      if (!extracted) {
        return { pass: false, evidence: `${path.relative(PKG, file)} has no applyDeepSeekOutputBudget (E3 guard missing from this bundle)` };
      }
      const diffs = [];
      for (const v of budgetVectors()) {
        const a = runBudget(aiBudget.applyDeepSeekOutputBudget, v);
        const w = runBudget(extracted.applyDeepSeekOutputBudget, v);
        if (!isDeepStrictEqual(a, w)) diffs.push(`${v.name}: ai=${j(a)} worker=${j(w)}`);
      }
      const constOk =
        extracted.values.DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED_CODE === aiBudget.DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED_CODE &&
        extracted.values.DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED_MESSAGE === aiBudget.DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED_MESSAGE;
      const sites = callSiteCount(text);
      const pass = diffs.length === 0 && constOk && sites >= 2;
      return {
        pass,
        evidence: `${path.relative(PKG, file)}: extracted fn ${extracted.fnText.length} chars + init vars [${extracted.vars.join(",")}]; ${budgetVectors().length} vectors ${diffs.length ? `DIFFER: ${diffs.join("; ")}` : "identical to @openclaw/ai"}; constants ${constOk ? "identical" : "DIFFER"}; call sites=${sites}`,
      };
    },
  );
}

await check(
  "E3-length-stop-without-text",
  "reasoning-only Kimi turn with stopReason length -> resolveReasoningOnlyRetryInstruction null (no continue) and, with side effects, resolveIncompleteTurnPayloadText = OUTPUT_LIMIT_WITHOUT_TEXT_NOTICE_TEXT (Chinese, ahead of the side-effect warning); the identical turn with stopReason stop -> the reasoning continuation instruction and the English side-effect warning",
  async () => {
    const res = await hooked("src/agents/embedded-agent-runner/run/incomplete-turn-resolution.ts", [
      "resolveIncompleteTurnPayloadText",
      "OUTPUT_LIMIT_WITHOUT_TEXT_NOTICE_TEXT",
    ]);
    const rec = await hooked("src/agents/embedded-agent-runner/run/incomplete-turn-recovery.ts", ["resolveReasoningOnlyRetryInstruction"]);
    const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } };
    const mk = (stopReason, sideEffects) => {
      const assistant = {
        role: "assistant",
        api: "anthropic-messages",
        provider: "kimi",
        model: "kimi-for-coding",
        usage,
        stopReason,
        timestamp: Date.now(),
        content: [{ type: "thinking", thinking: "internal reasoning", thinkingSignature: "" }],
      };
      const attempt = {
        terminal: { kind: "ok" },
        sessionIdUsed: "session:test",
        systemPromptReport: undefined,
        messagesSnapshot: [],
        assistantTexts: [],
        toolMetas: [],
        lastAssistant: assistant,
        currentAttemptAssistant: assistant,
        replayMetadata: { hadPotentialSideEffects: sideEffects, replaySafe: !sideEffects },
        currentAttemptReplayMetadata: { hadPotentialSideEffects: sideEffects, replaySafe: !sideEffects },
        didSendViaMessagingTool: false,
        messagingToolSentTexts: [],
        messagingToolSentMediaUrls: [],
        messagingToolSentTargets: [],
        cloudCodeAssistFormatError: false,
        itemLifecycle: { startedCount: 0, completedCount: 0, activeCount: 0 },
      };
      const state = { aborted: false, timedOut: false, attempt };
      return {
        retry: rec.resolveReasoningOnlyRetryInstruction({ ...state, provider: "kimi", modelId: "kimi-for-coding", modelApi: "anthropic-messages" }),
        notice: res.resolveIncompleteTurnPayloadText({ ...state, payloadCount: 0, externalAbort: false }),
      };
    };
    // Retry decision on a side-effect-free attempt (a side effect would skip the
    // retry for an unrelated reason); notice text on an attempt with side effects.
    const length = { retry: mk("length", false).retry, notice: mk("length", true).notice };
    const stop = { retry: mk("stop", false).retry, notice: mk("stop", true).notice };
    const pass =
      length.retry === null &&
      length.notice === res.OUTPUT_LIMIT_WITHOUT_TEXT_NOTICE_TEXT &&
      /^⚠️ 模型提前结束，未生成正文。已停止自动续写/.test(length.notice ?? "") &&
      typeof stop.retry === "string" &&
      stop.retry.length > 0 &&
      typeof stop.notice === "string" &&
      stop.notice !== res.OUTPUT_LIMIT_WITHOUT_TEXT_NOTICE_TEXT &&
      /some tool actions may have already been executed/.test(stop.notice);
    return {
      pass,
      evidence: `${res.__file}: length -> retry=${j(length.retry)} notice=${j(clip(length.notice, 40))}; stop -> retry=${j(clip(stop.retry, 50))} notice=${j(clip(stop.notice, 50))}`,
    };
  },
);

await check(
  "E3-error-text-budget-prefix",
  'formatUserFacingAssistantErrorText on deepseek-v4-flash with errorMessage starting "上下文剩余空间不足，已停止本次生成。" -> the Chinese compaction instruction (062f3e6f181 production parity); a non-deepseek-v4 model does not get it',
  async () => {
    const { formatUserFacingAssistantErrorText, __file } = await hooked("src/agents/embedded-agent-helpers/error-text.ts", [
      "formatUserFacingAssistantErrorText",
    ]);
    const USER_TEXT = "上下文剩余空间不足，已停止本次生成。请先压缩上下文后再继续；历史和任务状态未清空，恢复前请核对已执行操作，避免重复执行。";
    const msg = (model, errorMessage) => ({ role: "assistant", content: [], api: "openai-completions", provider: "deepseek", model, stopReason: "error", errorMessage, timestamp: Date.now(), usage: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } } });
    const legacy = formatUserFacingAssistantErrorText(msg("deepseek-v4-flash", "上下文剩余空间不足，已停止本次生成。budget"));
    const other = formatUserFacingAssistantErrorText(msg("deepseek-chat", "上下文剩余空间不足，已停止本次生成。budget"));
    // Documented deliberate gap (062f3e6f181): the guard's real error is NOT mapped.
    const guardErr = formatUserFacingAssistantErrorText(
      msg("deepseek-v4-flash", aiBudget?.DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED_MESSAGE ?? "Context overflow: [V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED] x"),
    );
    const pass = legacy === USER_TEXT && other !== USER_TEXT;
    return {
      pass,
      evidence: `${__file}: v4 legacy-prefix -> ${j(clip(legacy, 40))}; deepseek-chat -> ${j(clip(other, 50))}; (info, deliberate per 062f3e6f181) guard's own "Context overflow: [V_…]" error -> ${j(clip(guardErr, 60))}`,
    };
  },
);

// ===========================================================================
// 4. E6 (b1165481041)
await check(
  "E6-truncation-notice-chinese",
  'TRUNCATED_REPLY_NOTICE_TEXT === "⚠️ 回答达到输出限制，以上正文尚未完成，可以要求继续。", the terminal path appends it, and the old English notice is absent from dist',
  async () => {
    const { TRUNCATED_REPLY_NOTICE_TEXT, __file } = await hooked("src/agents/embedded-agent-runner/run/incomplete-turn-resolution.ts", [
      "TRUNCATED_REPLY_NOTICE_TEXT",
    ]);
    const terminal = findRegionFile("src/agents/embedded-agent-runner/run/terminal-resolution.ts");
    if (!terminal) throw new NotCallable("no dist chunk contains //#region src/agents/embedded-agent-runner/run/terminal-resolution.ts");
    const appended = /isTruncatedPartialReply\s*\?\s*\[\.\.\.input\.payloadsForTerminalPath,\s*\{\s*text:\s*TRUNCATED_REPLY_NOTICE_TEXT\s*\}\s*\]/.test(terminal.text);
    const english = "Reply truncated at the model's output token limit";
    const englishIn = [];
    for (const name of fs.readdirSync(CORE_DIST)) {
      if (name.endsWith(".mjs") || name.endsWith(".js")) {
        if (fs.readFileSync(path.join(CORE_DIST, name), "utf8").includes(english)) englishIn.push(name);
      }
    }
    const pass = TRUNCATED_REPLY_NOTICE_TEXT === "⚠️ 回答达到输出限制，以上正文尚未完成，可以要求继续。" && appended && englishIn.length === 0;
    return {
      pass,
      evidence: `${__file}: TRUNCATED_REPLY_NOTICE_TEXT=${j(TRUNCATED_REPLY_NOTICE_TEXT)}; ${path.relative(PKG, terminal.file)} appends {text: TRUNCATED_REPLY_NOTICE_TEXT} after a truncated partial reply: ${appended}; old English notice in dist top-level: ${englishIn.length ? englishIn.join(",") : "none"}`,
    };
  },
);

// ===========================================================================
// 5. feishu-model-switch-roles (1e15ee0c36e)
await check(
  "model-switch-roles-command-auth",
  'Feishu non-owner admitted by commands.allowFrom: "/model x" authorized; "/status" and "/model a\\n/restart" not authorized (reset still allowed); owner keeps /status; non-Feishu channels (webchat/internal, telegram) unchanged: /status authorization independent of command text',
  async () => {
    const { resolveCommandAuthorization, isResetAuthorizedForContext, __file } = await hooked("src/auto-reply/command-auth.ts", [
      "resolveCommandAuthorization",
      "isResetAuthorizedForContext",
    ]);
    // Production has the Feishu channel plugin loaded, so "feishu" normalizes as a
    // channel id and "feishu:<id>" owner entries resolve. Install the minimum: a
    // registry with a stub feishu channel (config/allowFrom adapters only).
    const reg = await hooked("src/plugins/runtime.ts", ["setActivePluginRegistry", "getActivePluginRegistry"]);
    const { createEmptyPluginRegistry } = await hooked("src/plugins/registry-empty.ts", ["createEmptyPluginRegistry"]);
    const feishuStub = {
      id: "feishu",
      meta: { id: "feishu", label: "Feishu", selectionLabel: "Feishu", docsPath: "/channels/feishu", blurb: "regress96 stub." },
      capabilities: { chatTypes: ["direct", "group"] },
      config: {
        listAccountIds: () => ["default"],
        resolveAccount: () => ({}),
        resolveAllowFrom: ({ cfg: c } = {}) => {
          const list = c?.channels?.feishu?.allowFrom;
          return Array.isArray(list) ? list : ["*"];
        },
        formatAllowFrom: ({ allowFrom }) => allowFrom.map((e) => String(e).trim()).filter(Boolean),
      },
      outbound: { deliveryMode: "direct" },
    };
    const registry = createEmptyPluginRegistry();
    registry.channels = [{ pluginId: "feishu", plugin: feishuStub, source: "regress96" }];
    registry.channelSetups = [{ pluginId: "feishu", plugin: feishuStub, source: "regress96", enabled: true }];
    reg.setActivePluginRegistry(registry);
    try {
    const synthetic = {
      commands: { allowFrom: { feishu: ["*"], telegram: ["*"] }, ownerAllowFrom: ["feishu:ou_fake_owner"] },
      channels: { feishu: { allowFrom: ["*"] }, telegram: { allowFrom: ["*"] } },
    };
    const cfg = externalConfig ?? synthetic;
    const cfgSource = externalConfig ? "--config (read-only)" : "synthetic";
    const nonOwner = "ou_regress96_nonowner";
    const ownerEntry = (cfg.commands?.ownerAllowFrom ?? []).find((e) => typeof e === "string" && /^feishu:/i.test(e.trim()));
    const ownerId = ownerEntry ? ownerEntry.trim().replace(/^feishu:/i, "") : undefined;
    const feishu = (senderId, commandText, chatType = "group") => {
      const params = {
        ctx: { Provider: "feishu", Surface: "feishu", ChatType: chatType, From: `feishu:${senderId}`, SenderId: senderId, commandText },
        cfg,
        commandAuthorized: true,
      };
      const auth = resolveCommandAuthorization(params);
      return { owner: auth.senderIsOwner, ok: auth.isAuthorizedSender, reset: isResetAuthorizedForContext(params) };
    };
    const model = feishu(nonOwner, "/model x");
    const status = feishu(nonOwner, "/status");
    const multi = feishu(nonOwner, "/model a\n/restart");
    const owner = ownerId ? feishu(ownerId, "/status") : undefined;

    // Contrast: other channels are not role-split. Webchat is the internal channel
    // (no providerId); telegram is an external non-Feishu channel.
    const other = (provider, commandText, extra = {}) => {
      const auth = resolveCommandAuthorization({
        ctx: { Provider: provider, Surface: provider, From: `${provider}:member`, SenderId: "member", commandText, ...extra },
        cfg: synthetic,
        commandAuthorized: true,
      });
      return { owner: auth.senderIsOwner, ok: auth.isAuthorizedSender, providerId: auth.providerId ?? null };
    };
    const tgStatus = other("telegram", "/status");
    const tgModel = other("telegram", "/model x");
    const wcStatus = other("webchat", "/status");
    const wcModel = other("webchat", "/model x");
    const wcAdminStatus = other("webchat", "/status", { GatewayClientScopes: ["operator.admin"] });

    const feishuAdmits = model.ok === true;
    const pass =
      model.owner === false &&
      model.ok === true &&
      status.ok === false &&
      status.reset === true &&
      multi.ok === false &&
      (!owner || (owner.owner === true && owner.ok === true)) &&
      tgStatus.ok === true &&
      tgModel.ok === true &&
      wcStatus.ok === wcModel.ok &&
      wcAdminStatus.ok === true;
    return {
      pass,
      evidence: `${__file} cfg=${cfgSource} + stub feishu channel registry${feishuAdmits ? "" : " (commands.allowFrom does not admit the synthetic Feishu sender)"}: feishu non-owner /model x=${j(model)}, /status=${j(status)}, "/model a\\n/restart"=${j(multi)}; owner /status=${owner ? j(owner) : "n/a (no feishu ownerAllowFrom entry)"}; telegram /status=${j(tgStatus)} /model=${j(tgModel)}; webchat /status=${j(wcStatus)} /model=${j(wcModel)} admin /status=${j(wcAdminStatus)}`,
    };
    } finally {
      reg.setActivePluginRegistry(createEmptyPluginRegistry());
    }
  },
);

// ===========================================================================
// 6. secret-entry (67572d93f6e; 9.6: src/agents/tools/question-prompt-send.ts)
await check(
  "secret-entry-feishu-card",
  'secrets question on messageChannel feishu -> text "🔑 V 需要凭据 NAME，请在卡片里安全录入。" + channelData.vSecretEntry {questionId,name,reason,allowedHosts}, no throw without Control UI; webchat without Control UI -> blocker text, no vSecretEntry, throws',
  async () => {
    const { sendQuestionToolPrompt, __file } = await hooked("src/agents/tools/question-prompt-send.ts", ["sendQuestionToolPrompt"]);
    const questions = [
      {
        questionId: "q-regress96",
        header: "Credential",
        question: "Provide FAKE_REGRESS_TOKEN",
        secretStore: { name: "FAKE_REGRESS_TOKEN", kind: "api-key", reason: "regress96 unit", allowedHosts: ["api.example.test"] },
      },
    ];
    const sent = [];
    let feishuError;
    try {
      await sendQuestionToolPrompt({ toolName: "secrets", questionId: "q-regress96", questions, config: {}, messageChannel: "feishu", send: (p) => void sent.push(p) });
    } catch (e) {
      feishuError = e;
    }
    const sentWeb = [];
    let webError;
    try {
      await sendQuestionToolPrompt({ toolName: "secrets", questionId: "q-regress96-w", questions, config: {}, messageChannel: "webchat", send: (p) => void sentWeb.push(p) });
    } catch (e) {
      webError = e;
    }
    const p = sent[0];
    const entry = p?.channelData?.vSecretEntry;
    const pass =
      !feishuError &&
      sent.length === 1 &&
      p.text === "🔑 V 需要凭据 FAKE_REGRESS_TOKEN，请在卡片里安全录入。" &&
      entry?.name === "FAKE_REGRESS_TOKEN" &&
      entry?.questionId === "q-regress96" &&
      entry?.reason === "regress96 unit" &&
      isDeepStrictEqual(entry?.allowedHosts, ["api.example.test"]) &&
      p.channelData?.askUser?.questionId === "q-regress96" &&
      sentWeb.length === 1 &&
      sentWeb[0].channelData?.vSecretEntry === undefined &&
      /Credential request unavailable here/.test(sentWeb[0].text ?? "") &&
      webError instanceof Error;
    return {
      pass,
      evidence: `${__file}: feishu -> text=${j(p?.text)} vSecretEntry=${j(entry)} error=${feishuError ? j(String(feishuError.message)) : "none"}; webchat -> text=${j(clip(sentWeb[0]?.text, 50))} vSecretEntry=${j(sentWeb[0]?.channelData?.vSecretEntry ?? null)} threw=${Boolean(webError)}`,
    };
  },
);

await check(
  "secret-entry-host-script-mirror",
  "buildSecretEntryMirrorNote names <state>/secrets/store/NAME and forbids printing/argv/copying; mirrorSecretEntryToFile writes that file mode 0600 in dir 0700 (sandbox state dir); lower-case names are not mirrored",
  async () => {
    const m = await hooked("src/secrets/secret-entry-mirror.ts", ["buildSecretEntryMirrorNote", "mirrorSecretEntryToFile", "resolveSecretEntryMirrorPath"]);
    const env = { OPENCLAW_STATE_DIR: path.join(STATE_DIR, "mirror-check") };
    const note = m.buildSecretEntryMirrorNote("FAKE_REGRESS_TOKEN", env);
    const file = m.resolveSecretEntryMirrorPath("FAKE_REGRESS_TOKEN", env);
    m.mirrorSecretEntryToFile("FAKE_REGRESS_TOKEN", "fake-value-regress96", env);
    m.mirrorSecretEntryToFile("lower_case", "x", env);
    const st = fs.existsSync(file) ? fs.statSync(file) : undefined;
    const dirSt = fs.statSync(path.dirname(file), { throwIfNoEntry: false });
    const content = st ? fs.readFileSync(file, "utf8") : undefined;
    const lowerMirrored = fs.existsSync(path.join(path.dirname(file), "lower_case"));
    const expectedFile = path.join(env.OPENCLAW_STATE_DIR, "secrets", "store", "FAKE_REGRESS_TOKEN");
    const pass =
      file === expectedFile &&
      note.includes(expectedFile) &&
      /mode-600/.test(note) &&
      /never print it, pass it as a command-line argument, or copy it elsewhere/.test(note) &&
      content === "fake-value-regress96" &&
      (st.mode & 0o777) === 0o600 &&
      (dirSt.mode & 0o777) === 0o700 &&
      !lowerMirrored;
    return {
      pass,
      evidence: `${m.__file}: note=${j(clip(note.replace(STATE_DIR, "<sandbox-state>"), 200))}; file mode=${st ? (st.mode & 0o777).toString(8) : "missing"} dir mode=${dirSt ? (dirSt.mode & 0o777).toString(8) : "missing"}; lower-case mirrored=${lowerMirrored}`,
    };
  },
);

// ===========================================================================
// 7. C — shared Cron management (191a4caa0f1)
await check(
  "C-cron-shared-policy",
  'policy {"version":1,"agents":{"makaron":{"mode":"shared","enabled":true}}}: feishu turn -> principal, namespace decision true for makaron (undefined for an unnamed agent); webchat / cron-trigger / local turns -> no principal; invalid policy fails closed with "Invalid Shared Cron policy"; relative path -> "must use an absolute path"',
  async () => {
    const c = await hooked("src/cron/shared-management.ts", [
      "CRON_SHARED_POLICY_ENV",
      "cronManagementPrincipalFromTurn",
      "cronManagementNamespaceDecision",
      "readCronManagementPolicy",
    ]);
    const dir = fs.mkdtempSync(path.join(STATE_DIR, "cron-policy-"));
    const good = path.join(dir, "good.json");
    const bad = path.join(dir, "bad.json");
    fs.writeFileSync(good, JSON.stringify({ version: 1, agents: { makaron: { mode: "shared", enabled: true } } }));
    fs.writeFileSync(bad, JSON.stringify({ version: 2, agents: { makaron: { mode: "shared", enabled: true } } }));
    const sessionKey = "agent:makaron:feishu:group:oc_fake_group";
    const turn = { runSessionKey: sessionKey, messageChannel: "feishu", gatewayCallerAccountId: "default", requesterSenderId: "ou_fake_member" };
    const principal = c.cronManagementPrincipalFromTurn(turn);
    const scope = (agentId, p) => ({ agentId, sessionKey: sessionKey.replace("makaron", agentId), accountId: "default", cronManagementPrincipal: p, cronManagementChannel: "feishu" });
    const webchat = c.cronManagementPrincipalFromTurn({ ...turn, messageChannel: "webchat", runSessionKey: "agent:makaron:main" });
    const cronTrig = c.cronManagementPrincipalFromTurn({ ...turn, trigger: "cron" });
    const local = c.cronManagementPrincipalFromTurn({ ...turn, gatewayCallerLocal: true });
    const envName = c.CRON_SHARED_POLICY_ENV;
    const decided = await withEnv({ [envName]: good }, () => ({
      makaron: c.cronManagementNamespaceDecision(scope("makaron", principal)),
      makaronNoPrincipal: c.cronManagementNamespaceDecision(scope("makaron", webchat)),
      main: c.cronManagementNamespaceDecision(scope("main", principal)),
    }));
    const unset = await withEnv({ [envName]: undefined }, () => c.cronManagementNamespaceDecision(scope("makaron", principal)));
    const failClosed = await withEnv({ [envName]: bad }, () => {
      try {
        return { returned: c.cronManagementNamespaceDecision(scope("makaron", principal)) };
      } catch (e) {
        return { threw: `${e?.name}: ${e?.message}` };
      }
    });
    const relative = await withEnv({ [envName]: "relative/policy.json" }, () => {
      try {
        return { returned: c.readCronManagementPolicy() };
      } catch (e) {
        return { threw: String(e?.message) };
      }
    });
    const pass =
      envName === "OPENCLAW_CRON_SHARED_POLICY" &&
      principal?.channel === "feishu" &&
      principal?.senderId === "ou_fake_member" &&
      principal?.accountId === "default" &&
      webchat === undefined &&
      cronTrig === undefined &&
      local === undefined &&
      decided.makaron === true &&
      decided.makaronNoPrincipal === false &&
      decided.main === undefined &&
      unset === undefined &&
      failClosed.threw === "TypeError: Invalid Shared Cron policy" &&
      relative.threw === "Shared Cron policy must use an absolute path";
    return {
      pass,
      evidence: `${c.__file}: principal=${j(principal)}; webchat=${j(webchat ?? null)} cron-trigger=${j(cronTrig ?? null)} local=${j(local ?? null)}; decision makaron=${decided.makaron} makaron(no principal)=${decided.makaronNoPrincipal} main=${j(decided.main ?? null)} policy-unset=${j(unset ?? null)}; invalid policy -> ${j(failClosed)}; relative -> ${j(relative)}`,
    };
  },
);

// ===========================================================================
// 8. B8 (583e2ac7e63 + 9.6 await fix)
await check(
  "B8-delegated-owner-direct-message",
  'resolveDelegatedOwnerDirectMessage -> "feishu:<owner>" for agent:<id>:feishu:direct:<owner> listed in commands.ownerAllowFrom (case-insensitive); undefined for explicit/main/scoped keys, non-owner senders and other agents; installed chunk has `await manager.resolveAutoReview(` and no `!manager.resolveAutoReview(`',
  async () => {
    const { resolveDelegatedOwnerDirectMessage, __file } = await hooked("src/gateway/server-methods/system-agent-approval.ts", [
      "resolveDelegatedOwnerDirectMessage",
    ]);
    const cfg = { commands: { ownerAllowFrom: ["feishu:OU_FAKE_OWNER"] } };
    const r = (sessionKey, agentId = "main", callerAgentId = "main", c = cfg) =>
      resolveDelegatedOwnerDirectMessage({ cfg: c, delegation: { agentId, sessionKey }, callerIdentity: { agentId: callerAgentId } }) ?? null;
    const cases = {
      ownerDirect: r("agent:main:feishu:direct:ou_fake_owner"),
      explicitKey: r("agent:main:explicit:ou_fake_owner"),
      mainKey: r("agent:main:main"),
      scopedSender: r("agent:main:feishu:direct:ou_fake_owner:thread:1"),
      group: r("agent:main:feishu:group:ou_fake_owner"),
      nonOwner: r("agent:main:feishu:direct:ou_fake_member"),
      otherAgentSession: r("agent:dev:feishu:direct:ou_fake_owner", "dev", "main"),
      otherAgentKeyMismatch: r("agent:dev:feishu:direct:ou_fake_owner", "main", "main"),
      noCaller: resolveDelegatedOwnerDirectMessage({ cfg, delegation: { agentId: "main", sessionKey: "agent:main:feishu:direct:ou_fake_owner" }, callerIdentity: undefined }) ?? null,
    };
    let realCfg = "n/a";
    if (externalConfig) {
      const entry = (externalConfig.commands?.ownerAllowFrom ?? []).find((e) => typeof e === "string" && /^feishu:[^:]+$/i.test(e.trim()));
      if (entry) {
        const owner = entry.trim().slice("feishu:".length);
        const got = r(`agent:main:feishu:direct:${owner}`, "main", "main", externalConfig);
        realCfg = got && got.toLowerCase() === `feishu:${owner}`.toLowerCase() ? "owner entry resolves" : `owner entry DID NOT resolve (${redact(String(got))})`;
      } else realCfg = "no feishu:<id> ownerAllowFrom entry";
    }
    const { text } = chunkText("src/gateway/server-methods/system-agent-approval.ts");
    const awaitCount = (text.match(/await manager\.resolveAutoReview\(/g) ?? []).length;
    const bangCount = (text.match(/!manager\.resolveAutoReview\(/g) ?? []).length;
    const pass =
      cases.ownerDirect === "feishu:ou_fake_owner" &&
      Object.entries(cases).every(([k, v]) => k === "ownerDirect" || v === null) &&
      awaitCount >= 1 &&
      bangCount === 0 &&
      !/DID NOT/.test(realCfg);
    return {
      pass,
      evidence: `${__file}: ${j(cases)}; --config owner check: ${realCfg}; static: "await manager.resolveAutoReview(" x${awaitCount}, "!manager.resolveAutoReview(" x${bangCount}`,
    };
  },
);

// ===========================================================================
// 9. E1 (ab4c8e1162e)
await check(
  "E1-feishu-pending-notice-silent",
  'owed pending-delivery notice on feishu -> settled "unresolved" without calling the sender (and a second pass still sends nothing); same notice on telegram -> sender called once with the English notice',
  async () => {
    const pdn = await hooked("src/channels/turn/pending-delivery-notice.ts", ["deliverPendingDeliveryNotice"]);
    const rrc = await hooked("src/gateway/server-recovery-runtime-context.ts", ["registerGatewayRecoveryRuntime"]);
    const acc = await hooked("src/config/sessions/session-accessor.sqlite-entry.ts", ["loadSessionEntry", "replaceSessionEntry"]);
    const calls = [];
    const release = rrc.registerGatewayRecoveryRuntime({
      sendRecoveryNotice: async (req) => {
        calls.push(req);
        return { suppressed: true }; // not delivered: no transcript append in the contrast case
      },
      dispatchAgent: async () => {
        throw new Error("regress96: dispatchAgent not available");
      },
    });
    try {
      const storeDir = fs.mkdtempSync(path.join(STATE_DIR, "e1-notice-"));
      const storePath = path.join(storeDir, "sessions.json");
      const seed = async (sessionKey, channel, to) => {
        const context = { channel, to, accountId: "default" };
        await acc.replaceSessionEntry(
          { sessionKey, storePath },
          {
            sessionId: `session-${channel}`,
            status: "done",
            updatedAt: Date.now(),
            delivery: { kind: "external", route: { channel, accountId: "default" }, context, origin: {} },
            pendingDeliveryNotice: { createdAt: Date.now(), context, intentId: `intent-${channel}`, state: "owed" },
          },
        );
      };
      const fsKey = "agent:main:feishu:direct:ou_fake_member";
      const tgKey = "agent:main:telegram:direct:chat-1";
      await seed(fsKey, "feishu", "ou_fake_member");
      await seed(tgKey, "telegram", "chat-1");
      await pdn.deliverPendingDeliveryNotice(fsKey, storePath);
      const fsCallsAfterFirst = calls.length;
      const fsState = acc.loadSessionEntry({ sessionKey: fsKey, storePath })?.pendingDeliveryNotice?.state;
      await pdn.deliverPendingDeliveryNotice(fsKey, storePath);
      const fsCallsAfterSecond = calls.length;
      await pdn.deliverPendingDeliveryNotice(tgKey, storePath);
      const tgCalls = calls.slice(fsCallsAfterSecond);
      const tgState = acc.loadSessionEntry({ sessionKey: tgKey, storePath })?.pendingDeliveryNotice?.state;
      const pass =
        fsCallsAfterFirst === 0 &&
        fsCallsAfterSecond === 0 &&
        fsState === "unresolved" &&
        tgCalls.length === 1 &&
        tgCalls[0].channel === "telegram" &&
        /couldn.t confirm whether my previous reply reached this chat/.test(tgCalls[0].text ?? "");
      return {
        pass,
        evidence: `${pdn.__file}${SQLITE_BYPASS_NOTE}: feishu sender calls=${fsCallsAfterFirst} (after 2nd pass ${fsCallsAfterSecond}), state=${j(fsState)}; telegram sender calls=${tgCalls.length} text=${j(clip(tgCalls[0]?.text, 45))} state=${j(tgState)}`,
      };
    } finally {
      release();
    }
  },
);

await check(
  "E1-first-queued-unknown-no-debt",
  "settlePendingFinalDelivery: prepared->queued->unknown (first unknown verdict) creates no pendingDeliveryNotice; re-affirmed unknown->unknown owes it (state owed)",
  async () => {
    const dc = await hooked("src/infra/outbound/delivery-completion.ts", ["settlePendingFinalDelivery"]);
    const acc = await hooked("src/config/sessions/session-accessor.sqlite-entry.ts", ["loadSessionEntry", "replaceSessionEntry"]);
    const storeDir = fs.mkdtempSync(path.join(STATE_DIR, "e1-completion-"));
    const storePath = path.join(storeDir, "sessions.json");
    const sessionKey = "agent:main:main";
    const completion = { kind: "pending-final", deliveryId: "delivery-1", intentId: "intent-1", sessionId: "session-1", sessionKey, storePath };
    await acc.replaceSessionEntry(
      { sessionKey, storePath },
      {
        sessionId: "session-1",
        status: "done", // not running/aborted: no recovery wake is scheduled
        updatedAt: Date.now(),
        pendingFinalDelivery: {
          kind: "replayable",
          text: "durable final",
          createdAt: Date.now(),
          intentId: "intent-1",
          context: { channel: "feishu", to: "ou_fake_member", accountId: "default" },
          deliveries: [{ id: "delivery-1", state: "prepared" }],
        },
      },
    );
    const s1 = await dc.settlePendingFinalDelivery(completion, "queued", ["prepared"]);
    const s2 = await dc.settlePendingFinalDelivery(completion, "unknown", ["queued", "unknown"]);
    const afterFirstUnknown = acc.loadSessionEntry({ sessionKey, storePath })?.pendingDeliveryNotice;
    const s3 = await dc.settlePendingFinalDelivery(completion, "unknown", ["queued", "unknown"]);
    const afterReaffirm = acc.loadSessionEntry({ sessionKey, storePath })?.pendingDeliveryNotice;
    const pass =
      s1?.state === "queued" &&
      s2?.state === "unknown" &&
      afterFirstUnknown === undefined &&
      s3?.state === "unknown" &&
      afterReaffirm?.state === "owed" &&
      afterReaffirm?.intentId === "intent-1";
    return {
      pass,
      evidence: `${dc.__file}${SQLITE_BYPASS_NOTE}: queued=${j(s1)} unknown#1=${j(s2)} notice=${j(afterFirstUnknown ?? null)}; unknown#2=${j(s3)} notice=${j(afterReaffirm ? { state: afterReaffirm.state, intentId: afterReaffirm.intentId } : null)}`,
    };
  },
);

// ===========================================================================
// 10. E5 (fa2db71e9b6)
await check(
  "E5-config-changed-back-to-baseline",
  'reload mode off: source-only edit (adds ui) then edit back to the runtime baseline -> onConfigCandidateCommitted fires both times, second with changedPaths ["ui"] (runtime compare diff alone is empty)',
  async () => {
    const cr = await hooked("src/gateway/config-reload.ts", ["startGatewayConfigReloader"]);
    const plan = await hooked("src/gateway/config-reload-plan.ts", ["diffConfigPaths"]).catch(() => undefined);
    // Replace chokidar.watch on the exact module instance the chunk imports.
    const { createRequire } = await import("node:module");
    let chokidarFile;
    try {
      chokidarFile = createRequire(path.join(PKG, "package.json")).resolve("chokidar");
    } catch {
      chokidarFile = path.join(PKG, "node_modules", "chokidar", "index.js");
    }
    if (!fs.existsSync(chokidarFile)) throw new NotCallable(`chokidar not found for watcher fake (${chokidarFile})`);
    const chokidar = (await import(pathToFileURL(chokidarFile).href)).default;
    if (!chokidar || typeof chokidar.watch !== "function") throw new NotCallable("chokidar default export has no watch()");
    const handlers = new Map();
    const watcher = {
      options: { usePolling: false },
      on(event, handler) {
        if (!handlers.has(event)) handlers.set(event, []);
        handlers.get(event).push(handler);
        return this;
      },
      emit(event, value) {
        for (const h of handlers.get(event) ?? []) h(value);
      },
      close: async () => {},
    };
    const realWatch = chokidar.watch;
    let watchCalls = 0;
    chokidar.watch = () => {
      watchCalls++;
      return watcher;
    };
    const watchPath = path.join(STATE_DIR, "e5-openclaw.json");
    const initialConfig = { gateway: { reload: { mode: "off" } } };
    const sourceOnlyConfig = { gateway: { reload: { mode: "off" } }, ui: { prefs: { themeMode: "light" } } };
    const makeSnapshot = (config, hash) => ({
      path: watchPath,
      includedPaths: [],
      exists: true,
      raw: JSON.stringify(config),
      parsed: config,
      sourceConfig: config,
      resolved: config,
      valid: true,
      runtimeConfig: config,
      config,
      issues: [],
      warnings: [],
      legacyIssues: [],
      hash,
    });
    let snapshot = makeSnapshot(sourceOnlyConfig, "source-only-write");
    const committed = [];
    const noop = async () => {};
    const logged = [];
    const log = {
      info: () => {},
      debug: () => {},
      warn: (m) => logged.push(`warn: ${String(m)}`),
      error: (m) => logged.push(`error: ${String(m)}`),
    };
    let reloader;
    try {
      reloader = cr.startGatewayConfigReloader({
        testDebounceMs: 0,
        initialConfig,
        initialSnapshotRawHash: "initial",
        initialAuthoredConfig: initialConfig,
        initialSnapshotValid: true,
        initialSnapshotIssues: [],
        readSnapshot: async () => snapshot,
        initialPluginInstallRecords: {},
        readPluginInstallRecords: async () => ({}),
        subscribeToWrites: () => () => {},
        onConfigChange: noop,
        onConfigApplied: noop,
        onConfigRevisionApplied: () => {},
        onReloadEnabledChange: () => {},
        onConfigAccepted: noop,
        onEffectiveConfigUnchanged: async () => ({ rollback: noop }),
        onNoopConfigCommit: noop,
        onHotReload: async () => "applied",
        onRestart: () => {},
        onConfigCandidateCommitted: (info) => committed.push(info),
        log,
        watchPath,
      });
      if (reloader.ready && typeof reloader.ready.then === "function") await reloader.ready;
      else if (typeof reloader.ready === "function") await reloader.ready();
      if (watchCalls === 0) throw new NotCallable("reloader did not create its watcher through chokidar.watch (fake not reached)");
      const settle = async (count) => {
        const loggedAtStart = logged.length;
        const deadline = Date.now() + 15_000;
        while (Date.now() < deadline) {
          await new Promise((r) => setTimeout(r, 10));
          if (committed.length >= count && !reloader.isReloading()) return true;
          if (logged.length > loggedAtStart && !reloader.isReloading()) return false; // reload failed; see log
        }
        return false;
      };
      watcher.emit("change", watchPath);
      const firstOk = await settle(1);
      snapshot = makeSnapshot(initialConfig, "back-to-baseline");
      watcher.emit("change", watchPath);
      const secondOk = await settle(2);
      const second = committed[1];
      const compareDiff = plan?.diffConfigPaths ? plan.diffConfigPaths(initialConfig, initialConfig) : undefined;
      const sourceDiff = plan?.diffConfigPaths ? plan.diffConfigPaths(sourceOnlyConfig, initialConfig) : undefined;
      const leaseBlocked = committed.length === 0 && logged.some((l) => /OpenClawStateLeaseError[^|]*store unavailable/.test(l));
      if (leaseBlocked && !SQLITE_RUNTIME.safe) {
        const staticUnion = /const publishedChangedPaths = \[\.\.\.(?:\/\* @__PURE__ \*\/ )?new Set\(\[\.\.\.changedPaths, \.\.\.sourceChangedPaths\]\)\]/.test(fileText.get(regionFiles.get("src/gateway/config-reload.ts")[0]));
        throw new NotCallable(
          `the reloader takes the plugin-lifecycle state lease, whose SQLite store runs in a worker thread (spawned with execArgv [], so the loader hook and REGRESS96_LOCAL_UNSAFE_SQLITE cannot reach it); this Node (${process.version}, SQLite ${SQLITE_RUNTIME.version}) is below OpenClaw's WAL-safety floor, so every reload failed before committing. Runs on Node >= 24.16 (host 24.17). Static/pure evidence meanwhile: chunk unions sourceChangedPaths into published changedPaths: ${staticUnion}; diffConfigPaths(runtime baseline, baseline)=${j(compareDiff)}, diffConfigPaths(source-only, baseline)=${j(sourceDiff)}`,
        );
      }
      const pass =
        firstOk &&
        secondOk &&
        committed.length === 2 &&
        second?.persistedHash === "back-to-baseline" &&
        isDeepStrictEqual([...(second?.changedPaths ?? [])], ["ui"]);
      return {
        pass,
        evidence: `${cr.__file}${SQLITE_BYPASS_NOTE}: commits=${j(committed.map((c) => ({ persistedHash: c.persistedHash, changedPaths: c.changedPaths })))}; diffConfigPaths(runtime baseline, baseline)=${j(compareDiff)} vs (source-only, baseline)=${j(sourceDiff)}${logged.length ? `; reloader log: ${clip(logged.join(" | "), 300)}` : ""}`,
      };
    } finally {
      chokidar.watch = realWatch;
      await reloader?.stop?.().catch(() => {});
    }
  },
);

// ===========================================================================
// 11. A21 (65734ce8105)
await check(
  "A21-health-event-loop-delayP50",
  "createGatewayEventLoopHealthMonitor: after 45 samples 20 ms apart and one 100 ms stall the health snapshot has intervalMs 1000, delayP50Ms 20 (median, A21) next to delayP99Ms 100 and delayMaxMs 100",
  async () => {
    const { createGatewayEventLoopHealthMonitor, __file } = await hooked("src/gateway/server/event-loop-health.ts", [
      "createGatewayEventLoopHealthMonitor",
    ]);
    // 9.6 samples its own createHistogram() on setInterval(sample, 20 ms). Capture
    // that interval callback and drive it with a fake clock (the unit test does
    // the same with fake timers): 45 samples 20 ms apart, then one 100 ms stall.
    let nowMs = 10_000;
    const captured = [];
    const realSetInterval = globalThis.setInterval;
    const realClearInterval = globalThis.clearInterval;
    globalThis.setInterval = (fn, ms, ...args) => {
      const handle = { fn, ms, unref() { return handle; }, ref() { return handle; }, hasRef: () => false };
      captured.push(handle);
      return handle;
    };
    globalThis.clearInterval = (h) => (captured.includes(h) ? undefined : realClearInterval(h));
    let monitor;
    try {
      monitor = createGatewayEventLoopHealthMonitor({
        now: () => nowMs,
        cpuUsage: (prev) => {
          const cur = { user: Math.round(nowMs * 0.1 * 1_000), system: 0 };
          return prev ? { user: cur.user - prev.user, system: cur.system - prev.system } : cur;
        },
        eventLoopUtilization: (cur, prev) => ({ idle: 0, active: cur && prev ? cur.active - prev.active : nowMs, utilization: 0.2 }),
      });
    } finally {
      globalThis.setInterval = realSetInterval;
      globalThis.clearInterval = realClearInterval;
    }
    try {
      const sampler = captured.find((h) => typeof h.fn === "function");
      if (!sampler) throw new NotCallable("monitor did not schedule a sampling interval (histogram unavailable?)");
      const tick = (elapsed) => {
        nowMs += elapsed;
        sampler.fn();
      };
      for (let i = 0; i < 45; i++) tick(20);
      tick(100);
      const snap = monitor.snapshot();
      const pass = snap?.delayP50Ms === 20 && snap?.delayP99Ms === 100 && snap?.delayMaxMs === 100 && snap?.intervalMs === 1_000;
      return {
        pass,
        evidence: `${__file}: interval ${sampler.ms} ms; snapshot ${j({ intervalMs: snap?.intervalMs, delayP50Ms: snap?.delayP50Ms, delayP99Ms: snap?.delayP99Ms, delayMaxMs: snap?.delayMaxMs, degraded: snap?.degraded })}`,
      };
    } finally {
      monitor.stop?.();
    }
  },
);

// ---------------------------------------------------------------------------
const passed = results.filter((r) => r.pass === true).length;
const out = { results, passed, total: results.length };
realStdoutWrite(`${JSON.stringify(out, null, 2)}\n`, () => process.exit(0));
setTimeout(() => process.exit(0), 5000).unref();
