import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  PATCH_MARKER,
  patchPackage,
  patchSkillWorkshopWorkerProxy,
  restorePackage,
} from "./patch-openclaw-skill-workshop-worker-proxy.mjs";

const fixture = `
/** Create the Skill Workshop tool for proposal discovery and lifecycle actions. */
function createSkillWorkshopTool(options) {
\treturn {
\t\texecute: async (_toolCallId, args) => {
\t\t\treturn { options, args };
\t\t}
\t};
}
//#endregion
`;

test("routes only the Worker skill_workshop tool through the process proxy", () => {
  const result = patchSkillWorkshopWorkerProxy(fixture);
  assert.equal(result.changed, true);
  assert.match(result.source, new RegExp(PATCH_MARKER));
  assert.match(
    result.source,
    /versa\.vlab\.gateway-owned-tool-proxy-v1/,
  );
  assert.match(result.source, /toolName: "skill_workshop"/);
  assert.doesNotMatch(result.source, /^\+\s*const workerToolProxy/m);
  assert.match(result.source, /workspaceDir: options\.workspaceDir/);
  assert.match(
    result.source,
    /runSessionKey: options\.runSessionKey \?\? options\.origin\?\.sessionKey/,
  );
  assert.doesNotThrow(() => new Function(result.source));
});

test("is idempotent", () => {
  const once = patchSkillWorkshopWorkerProxy(fixture);
  const twice = patchSkillWorkshopWorkerProxy(once.source);
  assert.equal(twice.changed, false);
  assert.equal(twice.source, once.source);
});

test("upgrades the 0.2.2 proxy to preserve the 8.1 run session owner", () => {
  const current = patchSkillWorkshopWorkerProxy(fixture).source;
  const legacy = current
    .replace(PATCH_MARKER, "v-worker-skill-workshop-subprocess-v0.2.2")
    .replace(
      "agentSessionKey: options.agentSessionKey ?? options.origin?.sessionKey",
      "agentSessionKey: options.agentSessionKey",
    )
    .replace(
      "\t\t\t\t\trunSessionKey: options.runSessionKey ?? options.origin?.sessionKey,\n",
      "",
    )
    .replace(
      "requesterAgentIdOverride: options.requesterAgentIdOverride ?? options.agentId",
      "requesterAgentIdOverride: options.requesterAgentIdOverride",
    );
  const upgraded = patchSkillWorkshopWorkerProxy(legacy);
  assert.equal(upgraded.changed, true);
  assert.match(upgraded.source, new RegExp(PATCH_MARKER));
  assert.match(upgraded.source, /options\.origin\?\.sessionKey/);
  assert.doesNotMatch(
    upgraded.source,
    /v-worker-skill-workshop-subprocess-v0\.2\.2/,
  );
});

test("upgrades the first 0.2.8 proxy to the origin-aware owner mapping", () => {
  const current = patchSkillWorkshopWorkerProxy(fixture).source;
  const legacy = current
    .replace(PATCH_MARKER, "v-worker-skill-workshop-subprocess-v0.2.8")
    .replace(
      "agentSessionKey: options.agentSessionKey ?? options.origin?.sessionKey",
      "agentSessionKey: options.agentSessionKey",
    )
    .replace(
      "runSessionKey: options.runSessionKey ?? options.origin?.sessionKey",
      "runSessionKey: options.runSessionKey",
    )
    .replace(
      "requesterAgentIdOverride: options.requesterAgentIdOverride ?? options.agentId",
      "requesterAgentIdOverride: options.requesterAgentIdOverride",
    );
  const upgraded = patchSkillWorkshopWorkerProxy(legacy);
  assert.equal(upgraded.changed, true);
  assert.match(upgraded.source, new RegExp(PATCH_MARKER));
  assert.match(upgraded.source, /options\.origin\?\.sessionKey/);
});

test("refreshes a stale rollback backup before patching", async () => {
  const packageDir = await mkdtemp(join(tmpdir(), "workshop-proxy-package-"));
  const distDir = join(packageDir, "dist");
  const bundlePath = join(distDir, "openclaw-tools-fixture.js");
  const backupPath =
    `${bundlePath}.v-worker-tool-proxy-v0.2.8-agent-owner.bak`;
  try {
    await mkdir(distDir);
    await writeFile(bundlePath, fixture);
    await writeFile(backupPath, "stale backup");

    const patched = await patchPackage(packageDir);
    assert.equal(patched.changed, true);
    assert.equal(await readFile(backupPath, "utf8"), fixture);
    assert.match(await readFile(bundlePath, "utf8"), new RegExp(PATCH_MARKER));

    await restorePackage(packageDir);
    assert.equal(await readFile(bundlePath, "utf8"), fixture);
  } finally {
    await rm(packageDir, { recursive: true, force: true });
  }
});
