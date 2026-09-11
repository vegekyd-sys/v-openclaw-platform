// Compatibility check against an installed OpenClaw runtime. It imports the
// candidate chunk from a temporary overlay and exercises only Git discovery;
// it does not open session state or issue an Agent/model/tool request.
import assert from "node:assert/strict";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const root = process.argv[2];
if (!root?.startsWith("/")) {
  throw new Error("An absolute installed runtime root is required");
}

const scratch = mkdtempSync(join(tmpdir(), "session-diff-git-discovery-"));
try {
  const dist = join(root, "openclaw", "dist");
  const source = readFileSync(
    new URL(
      "../lab/release-files/session-diff-baseline-DLuS-HQ-.js",
      import.meta.url,
    ),
    "utf8",
  ).replace(/(["'])(\.\/[^"']+)\1/g, (_match, quote, specifier) => {
    return `${quote}${pathToFileURL(join(dist, specifier)).href}${quote}`;
  });
  const candidatePath = join(scratch, "session-diff-baseline-candidate.mjs");
  writeFileSync(candidatePath, source, { mode: 0o600 });
  const { hasDiscoverableGitMetadata } = await import(
    pathToFileURL(candidatePath).href
  );
  assert.equal(typeof hasDiscoverableGitMetadata, "function");

  const plain = join(scratch, "plain", "nested");
  mkdirSync(plain, { recursive: true });
  assert.equal(await hasDiscoverableGitMetadata(plain, {}), false);

  const checkout = join(scratch, "checkout");
  const checkoutChild = join(checkout, "a", "b");
  mkdirSync(join(checkout, ".git"), { recursive: true });
  mkdirSync(checkoutChild, { recursive: true });
  assert.equal(await hasDiscoverableGitMetadata(checkoutChild, {}), true);

  const worktree = join(scratch, "worktree");
  mkdirSync(worktree, { recursive: true });
  writeFileSync(join(worktree, ".git"), "gitdir: elsewhere\n");
  assert.equal(await hasDiscoverableGitMetadata(worktree, {}), true);
  assert.equal(
    await hasDiscoverableGitMetadata(plain, { GIT_DIR: "elsewhere" }),
    true,
  );
  assert.equal(
    await hasDiscoverableGitMetadata(undefined, {}),
    true,
    "unknown cwd must preserve the old capture path",
  );

  console.log(
    JSON.stringify({
      status: "ready",
      plainWorkspaceSkipped: true,
      checkoutPreserved: true,
      worktreeGitFilePreserved: true,
      envOverridePreserved: true,
      noSessionAgentModelOrToolRequest: true,
    }),
  );
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
