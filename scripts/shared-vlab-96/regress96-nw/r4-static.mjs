// Static proof that every patch is in the code the Gateway actually runs:
//  - installed core build-info commit, and file-level identity against a manifest of the fork build
//  - per-commit string literals (tools/extract-literals.mjs) present in the installed packages
//  - explicit positive / negative markers (reverted code absent, 9.6 await fix present, ...)
//  - Codex plugin .setup imports resolvable (the 9.6 "Plugin codex is retiring" trap)
// Read-only.   node r4-static.mjs <label> <outDir> [manifest.json]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { discoverGateway, writeReceipt, run } from "./lib.mjs";

const [label, outDir, manifestFile] = process.argv.slice(2);
const gw = discoverGateway();
const I = gw.instance;
const pkgDir = (name) => {
  const out = run("bash", ["-c", `ls -dt ${I}/state/npm/projects/*/node_modules/${name} ${I}/runtime/npm/projects/*/node_modules/${name} ${I}/npm/projects/*/node_modules/${name} 2>/dev/null | head -1 || true`]);
  return out || null;
};
const roots = {
  core: `${gw.core}/dist`,
  ai: fs.existsSync(`${gw.core}/node_modules/@openclaw/ai/dist`) ? `${gw.core}/node_modules/@openclaw/ai/dist` : null,
  feishu: pkgDir("@openclaw/feishu") && `${pkgDir("@openclaw/feishu")}/dist`,
  codex: pkgDir("@openclaw/codex") && `${pkgDir("@openclaw/codex")}/dist`,
  worker: `${I}/runtime/production-worker`,
  deepseek: pkgDir("@openclaw/deepseek-provider") && `${pkgDir("@openclaw/deepseek-provider")}/dist`,
  providers: fs.existsSync(`${I}/runtime/versa-runtime-providers`) ? `${I}/runtime/versa-runtime-providers` : null,
};
const grepCount = (lit, rs = Object.values(roots).filter(Boolean)) => {
  try { return execFileSync("grep", ["-rlF", "--include=*.js", "--include=*.mjs", "--", lit, ...rs], { encoding: "utf8", maxBuffer: 64 << 20 }).trim().split("\n").filter(Boolean).length; }
  catch { return 0; }
};
const out = { label, at: new Date().toISOString(), version: gw.version, roots };
out.buildInfo = (() => { try { return JSON.parse(fs.readFileSync(`${gw.core}/dist/build-info.json`, "utf8")); } catch { return null; } })();
out.versionLine = run(`/opt/vlab/node-v24.17.0-linux-x64/bin/node`, [`${gw.core}/dist/index.js`, "--version"], 60_000).split("\n")[0];

// 1. file identity of core dist against the fork build manifest (sha256 per relative path)
if (manifestFile && fs.existsSync(manifestFile)) {
  const want = JSON.parse(fs.readFileSync(manifestFile, "utf8"));
  let same = 0; const diff = []; const missing = [];
  for (const [rel, sha] of Object.entries(want)) {
    const p = path.join(gw.core, rel);
    if (!fs.existsSync(p)) { missing.push(rel); continue; }
    const h = crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
    if (h === sha) same++; else diff.push(rel);
  }
  out.identity = { files: Object.keys(want).length, same, diff: diff.slice(0, 20), diffCount: diff.length, missing: missing.slice(0, 20), missingCount: missing.length };
}

// 2. per-commit literals
const lits = JSON.parse(fs.readFileSync(path.join(path.dirname(new URL(import.meta.url).pathname), "literals.json"), "utf8"));
out.commits = lits.filter((c) => !c.skipped).map((c) => {
  const present = c.literals.filter((s) => grepCount(s) > 0);
  return { sha: c.sha, subject: c.subject, literals: c.literals.length, present: present.length, missing: c.literals.filter((s) => !present.includes(s)) };
});

// 3. explicit markers
const M = [
  // [id, literal, roots, expect present?]
  ["B1", "versa.vlab.native-attempt-91-v1", ["core"], true],
  ["B2", "Completion is owned by the Gateway external task bridge", ["core"], true],
  ["B3", "versa.vlab.gateway-owned-tool-proxy-v1", ["core"], true],
  ["B7", "VLAB_ACTIVE_CONFIG_DOMAIN", ["core"], true],
  ["B8-await(9.6 fix)", "await manager.resolveAutoReview(", ["core"], true],
  ["B8-no-bare-promise", "!manager.resolveAutoReview(", ["core"], false],
  ["B10", "versa.vlab-worker.gateway-event-bridge-v1", ["core"], true],
  ["host-bridge", "versa.openclaw.host-gateway-bridge.v1", ["core"], true],
  ["host-bridge-detached", "runWithGatewayDetachedWorkContinuation", ["core"], true],
  // Worker component is disabled in no-worker mode (left on disk for rollback): informational only.
  ["host-bridge(worker side, inert)", "versa.openclaw.host-gateway-bridge.v1", ["worker"], null],
  ["reverted accfae53", "openclaw.v.gatewayToolCallerStorage", ["core"], false],
  ["reverted accfae53", "openclaw.v.gatewayContextBinding", ["core"], false],
  ["C", "OPENCLAW_CRON_SHARED_POLICY", ["core"], true],
  ["C", "outside caller scope", ["core"], true],
  ["D2", "MAX_CARD_NOTES_LENGTH = 12e3", ["core"], true],
  ["D3", "PRAGMA data_version", ["core"], true],
  ["E1", 'context.channel === "feishu"', ["core"], true],
  ["E2", "gpt-6-luna", ["core"], true],
  ["E3(ai)", "V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED", ["ai"], true],
  ["E3(worker bundle)", "V_DEEPSEEK_CONTEXT_BUDGET_EXHAUSTED", ["core"], true],
  ["E6", "回答达到输出限制", ["core"], true],
  ["E7", "[firsttext-metrics]", ["core"], true],
  ["E7-ws(ai)", "[firsttext-ws-metrics]", ["ai"], true],
  ["secret-entry", "vSecretEntry", ["core"], true],
  ["voice", "managed-room realtime Talk sessions are not available", ["core"], false],
  ["A4", "OPENCLAW_AUTOMATIC_MAINTENANCE_COOLDOWN_MS", ["core"], true],
  ["ff302cbcf62", "OPENCLAW_DB91_CONNECTION_CHECK_TTL_MS", ["core"], true],
  ["session-row", "OPENCLAW_SESSION_ROW_CATALOG_REFRESH_MIN_MS", ["core"], true],
  ["session-row", "OPENCLAW_SESSION_LIST_MATERIALIZE_WAIT_MS", ["core"], true],
  ["c7879215b95", "OPENCLAW_STARTUP_MIGRATION_LEASE_TTL_MS", ["core"], true],
  ["c7879215b95", "OPENCLAW_STARTUP_MIGRATION_EXTERNAL_BACKUP", ["core"], true],
  ["G1", "deepseek", ["codex"], true],
  ["F1", "DEFAULT_VISIBLE_PROGRESS_RUNTIMES", ["feishu"], true],
  ["F2", "COMMENTARY_KEPT_UNDER_ANSWER_RUNTIMES", ["feishu"], true],
  ["F3", "vSecretEntry", ["feishu"], true],
  ["F4", "HEADERLESS_CARD_AGENT_IDS", ["feishu"], true],
  ["F5", "Runtime: ${prefixCtx.agentRuntime}", ["feishu"], true],
  ["F6", "SENDER_NAME_EMPTY_TTL_MS", ["feishu"], true],
  ["F7", "openclaw.v.progressCardChangedListeners", ["feishu"], true],
  ["F7(core)", "openclaw.v.progressCardChangedListeners", ["core"], true],
  ["c8c7a7427e1", "card-phase ", ["feishu"], true],
  ["115e09052ec", "streamingFlushScheduled", ["feishu"], true],
  ["697c81298da", "DEFAULT_TASK_TIMEOUT_MS = 6e5", ["feishu"], true],
  ["7490709cbe8", "VLAB_FEISHU_STEER_ENABLED", ["feishu"], true],
  // Commits after the 2026-09-27 attempt (eb465f0 -> 34214bc).
  ["538aab6caf7 A9 unwound open", "openclaw.agentDatabaseOpenInterruption", ["core"], true],
  ["16e6ab78733 B10 host delivery", "deliverWorkerMediaCompletion", ["core"], true],
  ["8324404c49b lifecycle custody", "OPENCLAW_STATE_LIFECYCLE_HOLDER_TRACE", ["core"], true],
  ["3013cb3112d deepseek equivalence", "isResponseModelEquivalent", ["deepseek"], true],
  ["6c9a1549915 refresh-loop park", "session row refresh made no progress in", ["core"], true],
  ["34214bce5a7 frame prune (V computer-frame-prune)", "superseded by a newer frame in this turn", ["core"], true],
  ["34214bce5a7 execution idle (V computer-execution-idle)", "OPENCLAW_COMPUTER_EXECUTION_IDLE_MS", ["core"], true],
  ["0b1236bb257 MCP loopback scope", "runOutsidePluginRuntimeGatewayRequestScope", ["core"], true],
  ["7a33ec3815c E3 image allowance(ai)", "withoutInlineImageBytes", ["ai"], true],
  ["b82243e4733 stale Azure OpenAI catalog rows", "withoutForeignOpenAITransports", ["core"], true],
  ["549f28190e8 reverted by 9fbf4a96448", "observationMissing", ["core"], false],
  ["no-worker providers: realtime", "volcengine-rtc-agent", ["providers"], true],
  ["no-worker providers: compaction", "versa-fast-quality-v1", ["providers"], true],
];
out.markers = M.map(([id, lit, rs, expect]) => {
  const count = grepCount(lit, rs.map((r) => roots[r]).filter(Boolean));
  return { id, lit, roots: rs, expect, count, pass: expect === null ? null : expect ? count > 0 : count === 0 };
});

// 4. codex plugin: every relative import of dist/index.js and dist/harness.js resolves
if (roots.codex) {
  const bad = [];
  for (const f of ["index.js", "harness.js"]) {
    const p = path.join(roots.codex, f);
    if (!fs.existsSync(p)) continue;
    for (const m of fs.readFileSync(p, "utf8").matchAll(/from\s*["'](\.\/[^"']+)["']|import\(\s*["'](\.\/[^"']+)["']\s*\)/g)) {
      const rel = m[1] ?? m[2];
      if (!fs.existsSync(path.join(roots.codex, rel))) bad.push(`${f} -> ${rel}`);
    }
  }
  out.codexImports = { unresolved: bad, pass: bad.length === 0, version: JSON.parse(fs.readFileSync(path.join(roots.codex, "../package.json"), "utf8")).version };
}
if (roots.feishu) out.feishuVersion = JSON.parse(fs.readFileSync(path.join(roots.feishu, "../package.json"), "utf8")).version;
out.workerVersion = JSON.parse(fs.readFileSync(path.join(roots.worker, "package.json"), "utf8")).version;

const file = writeReceipt(outDir, `r4-static-${label}`, out);
const commitFail = out.commits.filter((c) => c.present < c.literals);
console.log(JSON.stringify({ file, buildCommit: out.buildInfo?.commit, identity: out.identity && { same: out.identity.same, files: out.identity.files, diff: out.identity.diffCount, missing: out.identity.missingCount },
  commitsWithMissingLiterals: commitFail.map((c) => `${c.sha}:${c.present}/${c.literals}`), markersFailed: out.markers.filter((m) => m.pass === false).map((m) => `${m.id}:${m.lit}`), codexImports: out.codexImports?.pass }));
