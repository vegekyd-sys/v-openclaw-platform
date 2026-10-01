#!/usr/bin/env node
// Codex native subagents on OpenClaw 2026.9.1 (V): a later parent turn must not
// tear down the tool relay a yielded child still uses, and the child's result
// must reach the parent even when the parent's task scope carries no Gateway
// resolver.
//
//   node patch-codex-native-subagent.mjs --codex <.../node_modules/@openclaw/codex> --core <openclaw package dir> [--check]
//
// Idempotent: every anchor must match exactly once, or its replacement must
// already be present. Written against @openclaw/codex@2026.9.1 as installed on V
// (generation g-b42d646e5561ece2, /vds patches applied) and core
// v2026.9.1-db91.6. See README.md next to this file.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const codexRoot = option("--codex");
const coreRoot = option("--core");
const checkOnly = args.includes("--check");
assert(codexRoot || coreRoot, "usage: patch-codex-native-subagent.mjs --codex <@openclaw/codex dir> --core <openclaw dir> [--check]");
const MARK = "v-codex-native-subagent-v1";

function moduleIn(dir, re, marker) {
  const hits = fs.readdirSync(dir).filter((f) => re.test(f)).map((f) => path.join(dir, f))
    .filter((f) => fs.readFileSync(f, "utf8").includes(marker));
  assert.equal(hits.length, 1, `expected one ${re} containing ${JSON.stringify(marker.slice(0, 60))} in ${dir}, found ${hits.length}`);
  return hits[0];
}

const TARGETS = [];
if (codexRoot) {
  const pkg = JSON.parse(fs.readFileSync(path.join(codexRoot, "package.json"), "utf8"));
  assert.equal(pkg.name, "@openclaw/codex");
  assert.equal(pkg.version, "2026.9.1", `written against 2026.9.1, found ${pkg.version}`);
  const dist = path.join(codexRoot, "dist");
  TARGETS.push({
    // 1. The relay id is one per session. A parent turn that yields keeps its relay
    //    registered for the children it spawned (upstream retention). The next parent
    //    turn registered the same id, which in core replaces, i.e. unregisters, the
    //    retained one; when that turn ended without yielding, nothing was left for the
    //    still-running child ("native hook relay not found"). While a retained relay is
    //    alive under the session id, register the new turn under a turn-scoped id
    //    instead. The child keeps the relay, and the authority, of the turn that
    //    spawned it; the parent's hooks point at its own turn's relay.
    file: moduleIn(dist, /^thread-lifecycle-.*\.js$/u, "function createCodexNativeHookRelay(params)"),
    patches: [
      ["/** Registers an OpenClaw native hook relay for a Codex app-server turn. */\nfunction createCodexNativeHookRelay(params) {\n\tif (params.options?.enabled === false) return;\n",
        `// ${MARK}: relay ids currently retained for yielded children, with their owner token.\n`
        + "const codexRetainedNativeHookRelayIds = /* @__PURE__ */ new Map();\n"
        + "let codexTurnScopedNativeHookRelaySeq = 0;\n"
        + "function resolveCodexNativeHookRelayRegistrationId(sessionRelayId) {\n"
        + "\tif (!codexRetainedNativeHookRelayIds.has(sessionRelayId)) return sessionRelayId;\n"
        + "\tcodexTurnScopedNativeHookRelaySeq += 1;\n"
        + "\treturn `${sessionRelayId}-t${Date.now().toString(36)}${codexTurnScopedNativeHookRelaySeq.toString(36)}`;\n"
        + "}\n"
        + "/** Registers an OpenClaw native hook relay for a Codex app-server turn. */\nfunction createCodexNativeHookRelay(params) {\n\tif (params.options?.enabled === false) return;\n"
        + "\tconst retainedRelayToken = Symbol(\"codex-retained-native-hook-relay\");\n"
        + "\tlet registeredRelayId;\n"
        + "\tlet relayDisposed = false;\n"],
      ["\t\trelayId: buildCodexNativeHookRelayId({\n\t\t\tagentId: params.agentId,\n\t\t\tsessionId: params.sessionId,\n\t\t\tsessionKey: params.sessionKey\n\t\t}),\n",
        "\t\trelayId: resolveCodexNativeHookRelayRegistrationId(buildCodexNativeHookRelayId({\n\t\t\tagentId: params.agentId,\n\t\t\tsessionId: params.sessionId,\n\t\t\tsessionKey: params.sessionKey\n\t\t})),\n"],
      ["\t\t\tonDispose: () => {\n\t\t\t\tforegroundClosed = true;\n\t\t\t\trejectPendingAdmissions(\"native hook relay registration closed\");\n\t\t\t}\n",
        "\t\t\tonDispose: () => {\n\t\t\t\tforegroundClosed = true;\n\t\t\t\trejectPendingAdmissions(\"native hook relay registration closed\");\n"
        + "\t\t\t\trelayDisposed = true;\n"
        + "\t\t\t\tif (registeredRelayId !== void 0 && codexRetainedNativeHookRelayIds.get(registeredRelayId) === retainedRelayToken) codexRetainedNativeHookRelayIds.delete(registeredRelayId);\n"
        + "\t\t\t}\n"],
      ["\tconst unregister = () => {\n\t\tforegroundClosed = true;\n\t\trejectPendingAdmissions(\"native hook relay foreground closed\");\n\t\trelay.unregister();\n\t};\n",
        "\tregisteredRelayId = relay.relayId;\n"
        + "\tconst unregister = () => {\n\t\tforegroundClosed = true;\n\t\trejectPendingAdmissions(\"native hook relay foreground closed\");\n"
        + "\t\t// Mark before core decides: if core does not retain, onDispose runs inside relay.unregister() and clears it.\n"
        + "\t\tif (!relayDisposed && successfulYieldRetentionAuthorized && directChildClaims.size > 0) codexRetainedNativeHookRelayIds.set(relay.relayId, retainedRelayToken);\n"
        + "\t\trelay.unregister();\n\t};\n"],
      // A turn that ends normally unregisters after a grace delay; a new turn may start
      // inside that window. Reserve the id as soon as custody is granted.
      ["\t\tauthorizeRetentionAfterSuccessfulYield: () => {\n\t\t\tsuccessfulYieldRetentionAuthorized = true;\n\t\t},\n",
        "\t\tauthorizeRetentionAfterSuccessfulYield: () => {\n\t\t\tsuccessfulYieldRetentionAuthorized = true;\n"
        + "\t\t\tif (!relayDisposed && directChildClaims.size > 0) codexRetainedNativeHookRelayIds.set(relay.relayId, retainedRelayToken);\n\t\t},\n"],
    ],
  });
}
if (coreRoot) {
  const pkg = JSON.parse(fs.readFileSync(path.join(coreRoot, "package.json"), "utf8"));
  assert.equal(pkg.name, "openclaw");
  const dist = path.join(coreRoot, "dist");
  const KEY = 'Symbol.for("openclaw.v.scheduledGatewayContextResolver")';
  TARGETS.push({
    // 2. Publish the Gateway-lifetime resolver that sessions_spawn completions already
    //    fall back to (registerSubagentRun binds the same fenced resolver).
    file: moduleIn(dist, /^subagent-registry-.*\.js$/u, "function activateSubagentRegistry(resolveGatewayContext)"),
    patches: [
      ["\tconst lifecycleGatewayContextResolver = fenceScheduledGatewayContextResolver(resolveGatewayContext);\n\tactiveGatewayContextResolver = resolveGatewayContext;\n",
        "\tconst lifecycleGatewayContextResolver = fenceScheduledGatewayContextResolver(resolveGatewayContext);\n\tactiveGatewayContextResolver = resolveGatewayContext;\n"
        + `\tglobalThis[${KEY}] = lifecycleGatewayContextResolver; // ${MARK}\n`],
    ],
  });
  TARGETS.push({
    // 3. Harness task completion: when the task scope has no resolver, or it no longer
    //    yields a Gateway, deliver through the Gateway-lifetime resolver instead of
    //    dispatching with none ("In-process gateway dispatch requires a gateway
    //    request scope or instance binding (method: agent)").
    file: path.join(dist, "plugin-sdk", "agent-harness-task-runtime.js"),
    patches: [
      ["\tconst resolveGatewayContext = getGatewayContextResolver(scope);\n\treturn resolveGatewayContext ? await withPluginRuntimeGatewayContextResolver(resolveGatewayContext, deliver) : await deliver();",
        "\tconst resolveGatewayContext = getGatewayContextResolver(scope);\n"
        + `\tif (!resolveGatewayContext?.()) { // ${MARK}\n`
        + `\t\tconst lifecycleResolver = globalThis[${KEY}];\n`
        + "\t\tif (typeof lifecycleResolver === \"function\" && lifecycleResolver()) return await withPluginRuntimeGatewayContextResolver(lifecycleResolver, deliver, { inheritRequestScope: false });\n"
        + "\t}\n"
        + "\treturn resolveGatewayContext ? await withPluginRuntimeGatewayContextResolver(resolveGatewayContext, deliver) : await deliver();"],
    ],
  });
}

const report = [];
for (const { file, patches } of TARGETS) {
  assert(fs.existsSync(file), `missing ${file}`);
  let src = fs.readFileSync(file, "utf8");
  for (const [from, to] of patches) {
    if (src.includes(to)) { report.push({ file: path.basename(file), state: "already" }); continue; }
    assert.equal(src.split(from).length - 1, 1, `anchor must match exactly once in ${path.basename(file)}: ${JSON.stringify(from.slice(0, 80))}`);
    if (!checkOnly) src = src.replace(from, to);
    report.push({ file: path.basename(file), state: checkOnly ? "pending" : "applied" });
  }
  if (!checkOnly) fs.writeFileSync(file, src);
}
console.log(JSON.stringify({ checkOnly, codexRoot: codexRoot ?? null, coreRoot: coreRoot ?? null, report }, null, 1));
