import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  patchPackage,
  patchSessionsSendRequesterOwner,
  restorePackage,
} from "../scripts/patch-openclaw91-sessions-send-owner.mjs";

const fixture = `
function createSessionsSendTool(opts) {
  return {
    async execute() {
\t\t\tconst rawRequesterSessionKey = opts?.agentSessionKey ? effectiveRequesterKey : void 0;
\t\t\tconst parsedRequesterSessionKey = parseAgentSessionKey(rawRequesterSessionKey);
\t\t\tconst requesterRouteBindings = cfg.bindings?.filter((binding) => binding.type !== "acp");
\t\t\tconst requesterDeliveryRoute = requesterRouteBindings?.length ? parseSessionDeliveryRoute(rawRequesterSessionKey) : null;
\t\t\tconst bareRequesterPeerId = parsedRequesterSessionKey?.rest.startsWith("direct:") ? parsedRequesterSessionKey.rest.slice(7) : void 0;
\t\t\tconst requesterRouteChannel = requesterDeliveryRoute?.channel ?? opts?.agentChannel;
\t\t\tconst requesterRoutePeerId = requesterDeliveryRoute?.peerId ?? bareRequesterPeerId;
\t\t\tconst requesterRoute = requesterRouteBindings?.length && requesterRouteChannel && requesterRoutePeerId ? resolveAgentRoute({
\t\t\t\tcfg,
\t\t\t\tchannel: requesterRouteChannel,
\t\t\t\taccountId: requesterDeliveryRoute?.accountId,
\t\t\t\tpeer: {
\t\t\t\t\tkind: "direct",
\t\t\t\t\tid: requesterRoutePeerId
\t\t\t\t}
\t\t\t}) : void 0;
      return requesterRoute;
    }
  };
}
`;

test("uses the exact requester Session owner as route fallback", async () => {
  const result = patchSessionsSendRequesterOwner(fixture);
  assert.equal(result.changed, true);
  assert.match(
    result.source,
    /defaultAgentId: parsedRequesterSessionKey\?\.agentId/,
  );

  const createTool = new Function(
    "effectiveRequesterKey",
    "cfg",
    "parseAgentSessionKey",
    "parseSessionDeliveryRoute",
    "resolveAgentRoute",
    `${result.source}\nreturn createSessionsSendTool;`,
  )(
    "agent:makaron:feishu:direct:user-1",
    { bindings: [{ type: "route" }] },
    () => ({ agentId: "makaron", rest: "feishu:direct:user-1" }),
    () => ({ channel: "feishu", peerId: "user-1" }),
    (input) => {
      if (!input.defaultAgentId) {
        throw new Error(
          "Multiple agents are configured, but feishu account default routing has no explicit owner",
        );
      }
      return { agentId: input.defaultAgentId };
    },
  );

  assert.deepEqual(
    await createTool({
      agentSessionKey: "agent:makaron:feishu:direct:user-1",
      agentChannel: "feishu",
    }).execute(),
    { agentId: "makaron" },
  );
});

test("keeps explicit route bindings authoritative", async () => {
  const result = patchSessionsSendRequesterOwner(fixture);
  const createTool = new Function(
    "effectiveRequesterKey",
    "cfg",
    "parseAgentSessionKey",
    "parseSessionDeliveryRoute",
    "resolveAgentRoute",
    `${result.source}\nreturn createSessionsSendTool;`,
  )(
    "agent:makaron:feishu:direct:user-1",
    { bindings: [{ type: "route" }] },
    () => ({ agentId: "makaron", rest: "feishu:direct:user-1" }),
    () => ({ channel: "feishu", peerId: "user-1" }),
    () => ({ agentId: "xiaoai", matchedBy: "binding.peer" }),
  );

  assert.deepEqual(
    await createTool({
      agentSessionKey: "agent:makaron:feishu:direct:user-1",
      agentChannel: "feishu",
    }).execute(),
    { agentId: "xiaoai", matchedBy: "binding.peer" },
  );
});

test("is idempotent and rejects partial marker drift", () => {
  const once = patchSessionsSendRequesterOwner(fixture);
  assert.equal(patchSessionsSendRequesterOwner(once.source).changed, false);
  assert.throws(
    () => patchSessionsSendRequesterOwner(`${fixture}\n// v-sessions-send-owner-v1`),
    /partial or drifted/,
  );
});

test("fails closed when the 9.1 bundle anchor changes", () => {
  assert.throws(
    () => patchSessionsSendRequesterOwner(fixture.replace("accountId:", "account:")),
    /anchor was not found/,
  );
});

test("package patch is 9.1-only, idempotent, and reversible", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "openclaw91-send-owner-"));
  try {
    const dist = path.join(root, "dist");
    const bundle = path.join(dist, "sessions-spawn-tool-fixture.js");
    await mkdir(dist);
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "openclaw", version: "2026.9.1" }),
    );
    await writeFile(bundle, fixture);

    assert.equal((await patchPackage(root)).changed, true);
    assert.equal((await patchPackage(root)).changed, false);
    assert.match(
      await readFile(bundle, "utf8"),
      /defaultAgentId: parsedRequesterSessionKey\?\.agentId/,
    );
    assert.equal((await restorePackage(root)).changed, true);
    assert.equal(await readFile(bundle, "utf8"), fixture);

    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "openclaw", version: "2026.9.4" }),
    );
    await assert.rejects(patchPackage(root), /unsupported OpenClaw version/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
