#!/usr/bin/env node

import {
  chown,
  copyFile,
  readFile,
  readdir,
  rename,
  stat,
  writeFile,
} from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

export const PATCH_MARKER =
  "v-worker-sessions-spawn-external-task-bridge-v0.2.8-v5";
const ACCEPTED_PATCH_MARKER =
  "v-worker-sessions-spawn-external-task-record-v0.2.8-v5";
const LEGACY_TOOL_ANCHOR = "sessions_spawn built-in tool";
const TOOL_FUNCTION_ANCHOR = "function createSessionsSpawnTool(opts)";
const EXECUTE_ANCHORS = [
  "\t\texecute: async (_toolCallId, args) => {\n",
  "\t\texecute: async (_toolCallId, args, signal) => {\n",
];
const ACCEPTED_CALL_PATTERN =
  /(\t+)recordAcceptedSessionSpawn\((result|visibleResult), [^\n]+\);\n/g;
const BACKUP_SUFFIX = ".v-worker-sessions-spawn-v0.2.8-v5.bak";
const INJECTION = `\t\t\t// ${PATCH_MARKER}\n\t\t\tconst externalReplyExpectsCompletion = globalThis[Symbol.for("versa.vlab.external-harness-task-bridge-v1")] === true && args && typeof args === "object" && args.expectsCompletionMessage !== false && args.collect !== true && args.mode !== "session";\n\t\t\tif (globalThis[Symbol.for("versa.vlab.external-harness-task-bridge-v1")] === true && args && typeof args === "object") {\n\t\t\t\targs = { ...args, expectsCompletionMessage: false };\n\t\t\t}\n`;
// Every accepted branch uses the same recorder before returning, including the
// visible dashboard branch. Native completion remains suppressed in the Worker;
// the host relay owns it using this accepted run and requester identity.
const ACCEPTED_HELPER = `\n\t// ${ACCEPTED_PATCH_MARKER}
\tconst recordExternalAcceptedSessionSpawn = (result, params, completionExpected) => {
\t\tif (result?.status !== "accepted") return;
\t\tif (completionExpected) {
\t\t\tresult.expectsCompletionMessage = true;
\t\t\tresult.note = "Completion is owned by the Gateway external task bridge. Use sessions_yield to await the completion event; do not poll files or status to substitute for completion.";
\t\t}
\t\tconst externalTaskFact = {
\t\t\t...result,
\t\t\tvlabCompletionExpected: Boolean(completionExpected),
\t\t\tparentSessionKey: opts?.agentSessionKey,
\t\t\trequesterTurnRunId: opts?.requesterTurnRunId,
\t\t\ttask: params.task,
\t\t\tmode: params.mode,
\t\t\tcleanup: params.cleanup,
\t\t\tlabel: params.label
\t\t};
\t\tconst externalTaskRecorder = globalThis[Symbol.for("versa.vlab.external-harness-task-record-v1")];
\t\tif (typeof externalTaskRecorder === "function") externalTaskRecorder(externalTaskFact);
\t\tconst externalTaskOwnerKeys = [
\t\t\topts?.agentSessionKey?.trim(),
\t\t\topts?.completionOwnerKey?.trim(),
\t\t\topts?.requesterTurnRunId ? \`run:\${opts.requesterTurnRunId}\` : undefined
\t\t].filter(Boolean);
\t\tif (externalTaskOwnerKeys.length > 0) {
\t\t\tconst ownerSymbol = Symbol.for("versa.vlab.external-harness-task-owners-v1");
\t\t\tconst owners = globalThis[ownerSymbol] instanceof Set ? globalThis[ownerSymbol] : new Set();
\t\t\tfor (const ownerKey of externalTaskOwnerKeys) owners.add(ownerKey);
\t\t\tglobalThis[ownerSymbol] = owners;
\t\t}
\t};
`;

export function patchSessionsSpawnGatewayProxy(source) {
  if (
    source.includes("v-worker-sessions-spawn-external-task-bridge-v0.2.8") &&
    !source.includes(PATCH_MARKER)
  ) {
    source = source
      .replace(/\t\t\t\/\/ vlab-worker-completion-note-v1\n\t\t\tconst externalReplyExpectsCompletion = [^\n]+\n/g, "")
      .replace(
        /\n\t\t\t\/\/ v-worker-sessions-spawn-external-task-bridge-v0\.2\.8(?:-v[234])?\n\t\t\tif \(globalThis\[Symbol\.for\("versa\.vlab\.external-harness-task-bridge-v1"\)\] === true && args && typeof args === "object"\) \{\n\t\t\t\targs = \{ \.\.\.args, expectsCompletionMessage: false \};\n\t\t\t\}\n/,
        "\n",
      )
      .replace(
        /\t+\/\/ v-worker-sessions-spawn-external-task-record-v0\.2\.8(?:-v[234])?\n[\s\S]*?\t+globalThis\[ownerSymbol\] = owners;\n\t+\}\n/g,
        "\n",
      );
  }
  const hasExecutePatch = source.includes(PATCH_MARKER);
  const hasAcceptedPatch = source.includes(ACCEPTED_PATCH_MARKER);
  if (hasExecutePatch && hasAcceptedPatch) {
    const acceptedCalls = [...source.matchAll(ACCEPTED_CALL_PATTERN)];
    if (!source.includes(ACCEPTED_HELPER) || !acceptedCalls.length || acceptedCalls.some((call) =>
      !source.slice(call.index + call[0].length).startsWith(
        `${call[1]}recordExternalAcceptedSessionSpawn(${call[2]}, params, externalReplyExpectsCompletion);\n`,
      ))) throw new Error("partial sessions_spawn accepted branch bridge detected");
    return { source, changed: false };
  }
  if (hasExecutePatch || hasAcceptedPatch) {
    throw new Error("partial sessions_spawn external Harness patch detected");
  }
  const sectionStart = source.includes(LEGACY_TOOL_ANCHOR)
    ? source.indexOf(LEGACY_TOOL_ANCHOR)
    : source.indexOf(TOOL_FUNCTION_ANCHOR);
  if (sectionStart < 0) throw new Error("sessions_spawn tool anchor was not found");
  const nextSection = source.indexOf("//#endregion", sectionStart);
  const sectionEnd = nextSection >= 0 ? nextSection : source.length;
  const section = source.slice(sectionStart, sectionEnd);
  const matches = EXECUTE_ANCHORS.reduce((n, anchor) => n + section.split(anchor).length - 1, 0);
  if (matches !== 1) {
    throw new Error(`expected one sessions_spawn execute anchor, found ${matches}`);
  }
  const executeAnchor = EXECUTE_ANCHORS.find(anchor => section.includes(anchor));
  const patched = section.replace(TOOL_FUNCTION_ANCHOR + " {", TOOL_FUNCTION_ANCHOR + " {" + ACCEPTED_HELPER).replace(
    executeAnchor,
    `${executeAnchor}${INJECTION}`,
  );
  const acceptedMatches = [...patched.matchAll(ACCEPTED_CALL_PATTERN)].length;
  if (acceptedMatches < 1) {
    throw new Error(
      `expected at least one sessions_spawn accepted fact anchor, found ${acceptedMatches}`,
    );
  }
  const acceptedPatched = patched.replace(
    ACCEPTED_CALL_PATTERN,
    (acceptedCall, indent, resultName) => `${acceptedCall}${indent}recordExternalAcceptedSessionSpawn(${resultName}, params, externalReplyExpectsCompletion);\n`,
  );
  return { source: source.slice(0, sectionStart) +
      acceptedPatched +
      source.slice(sectionEnd), changed: true };
}

async function resolveBundle(packageDir) {
  const distDir = join(resolve(packageDir), "dist");
  const candidates = (await readdir(distDir))
    .filter(
      (name) =>
        /^openclaw-tools-.*\.js$/.test(name) ||
        /^sessions-spawn-tool-.*\.js$/.test(name),
    )
    .sort();
  const matches = [];
  for (const name of candidates) {
    const filePath = join(distDir, name);
    const source = await readFile(filePath, "utf8");
    if (
      source.includes(TOOL_FUNCTION_ANCHOR) &&
      source.includes('name: "sessions_spawn"')
    ) {
      matches.push(filePath);
    }
  }
  if (matches.length !== 1) {
    throw new Error(`expected one sessions_spawn bundle, found ${matches.length}`);
  }
  return matches[0];
}

export async function patchPackage(packageDir) {
  const bundlePath = await resolveBundle(packageDir);
  const backupPath = `${bundlePath}${BACKUP_SUFFIX}`;
  const current = await readFile(bundlePath, "utf8");
  const result = patchSessionsSpawnGatewayProxy(current);
  if (!result.changed) return { ...result, bundlePath, backupPath };
  await copyFile(bundlePath, backupPath);
  const metadata = await stat(bundlePath);
  const temporaryPath = `${bundlePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, result.source, {
    encoding: "utf8",
    mode: metadata.mode,
  });
  await chown(temporaryPath, metadata.uid, metadata.gid);
  await rename(temporaryPath, bundlePath);
  return { ...result, bundlePath, backupPath };
}

export async function restorePackage(packageDir) {
  const bundlePath = await resolveBundle(packageDir);
  const backupPath = `${bundlePath}${BACKUP_SUFFIX}`;
  await rename(backupPath, bundlePath);
  return { restored: true, bundlePath, backupPath };
}

async function main() {
  const [first, second] = process.argv.slice(2);
  const restoring = first === "--restore";
  const packageDir = restoring ? second : first;
  if (!packageDir) {
    throw new Error("usage: patch-openclaw-sessions-spawn-gateway-proxy.mjs [--restore] <openclaw-package-dir>");
  }
  const result = restoring
    ? await restorePackage(packageDir)
    : await patchPackage(packageDir);
  process.stdout.write(`${restoring ? "restored" : result.changed ? "patched" : "already patched"} ${result.bundlePath}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
