// Candidate test for lab/release-files/bootstrap-memory-everywhere: root MEMORY.md reaches the
// bootstrap context of group, channel, cron and subagent sessions (core), and native Codex turns
// get its contents as turn-scoped developer instructions instead of a "not pasted" pointer.
//
// Runs against $VLAB_CANDIDATE_RUNTIME. With the release files mapped in, every assertion holds;
// run without them (EXPECT_BASELINE=1) to see the upstream behaviour the patch removes.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "VLAB_CANDIDATE_RUNTIME is not set");
const baseline = process.env.EXPECT_BASELINE === "1";
const MEMORY_MARK = "MEMORY-MARK-7f3a";

function findModule(dir, pattern, definition) {
  const hits = fs.readdirSync(dir).filter((f) => pattern.test(f)).map((f) => path.join(dir, f))
    .filter((f) => fs.readFileSync(f, "utf8").includes(definition));
  assert.equal(hits.length, 1, `${definition} in ${dir}`);
  return hits[0];
}
function findCodexDist() {
  const projects = path.join(runtime, "npm", "projects");
  // V's live generation; the runtime also carries older ones built from other chunks.
  const dir = path.join(projects, "openclaw-codex-8902d781d4__openclaw-generation__g-b42d646e5561ece2", "node_modules", "@openclaw", "codex", "dist");
  assert(fs.existsSync(dir), `no live Codex plugin generation under ${projects}`);
  return dir;
}

const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "bootmem-ws-"));
for (const [name, body] of Object.entries({
  "AGENTS.md": "# Agents\nagents body\n",
  "SOUL.md": "# Soul\nsoul body\n",
  "USER.md": "# User\nuser body\n",
  "MEMORY.md": `# Memory\n${MEMORY_MARK} hot memory index\n`,
})) fs.writeFileSync(path.join(workspace, name), body);
test.after(() => fs.rmSync(workspace, { recursive: true, force: true }));

const SESSIONS = {
  direct: { sessionKey: "agent:makaron:feishu:direct:ou_test", chatType: "direct" },
  group: { sessionKey: "agent:makaron:feishu:group:oc_test", chatType: "group" },
  channel: { sessionKey: "agent:makaron:telegram:channel:-100test", chatType: "channel" },
  cron: { sessionKey: "agent:makaron:cron:job-test" },
  subagent: { sessionKey: "agent:makaron:subagent:child-test" },
};

test("core: root MEMORY.md survives the per-session bootstrap filter", async () => {
  const dist = path.join(runtime, "openclaw", "dist");
  const mod = await import(pathToFileURL(findModule(dist, /^workspace-[\w-]+\.js$/u, "function filterBootstrapFilesForSession(")).href);
  const filter = Object.values(mod).find((fn) => typeof fn === "function" && fn.name === "filterBootstrapFilesForSession");
  const load = Object.values(mod).find((fn) => typeof fn === "function" && fn.name === "loadWorkspaceBootstrapFiles");
  assert(filter && load, "exports not found");
  const files = await load(workspace);
  assert(files.some((f) => f.name === "MEMORY.md" && !f.missing), "MEMORY.md not loaded from the workspace");
  const seen = {};
  for (const [kind, session] of Object.entries(SESSIONS)) {
    const names = filter(files, { ...session, workspaceDir: workspace }).map((f) => f.name);
    seen[kind] = names;
  }
  console.log(JSON.stringify(seen));
  assert(seen.direct.includes("MEMORY.md"));
  for (const kind of ["group", "channel", "cron", "subagent"]) {
    assert.equal(seen[kind].includes("MEMORY.md"), !baseline, `${kind}: ${seen[kind].join(",")}`);
  }
  // Unchanged: subagents still get only AGENTS.md besides MEMORY.md.
  assert.deepEqual(seen.subagent.filter((n) => n !== "MEMORY.md"), ["AGENTS.md"]);
});

test("codex: MEMORY.md is pasted as turn-scoped developer instructions", async () => {
  const dist = findCodexDist();
  const mod = await import(pathToFileURL(findModule(dist, /^attempt-context-[\w-]+\.js$/u, "function selectCodexWorkspaceTurnScopedDeveloperInstructionFiles(")).href);
  const build = Object.values(mod).find((fn) => typeof fn === "function" && fn.name === "buildCodexWorkspaceBootstrapContext");
  assert(build, "buildCodexWorkspaceBootstrapContext not exported");
  const config = { agents: { list: [{ id: "makaron", default: true, workspace }] } };
  const results = {};
  for (const kind of ["direct", "group"]) {
    const { sessionKey, chatType } = SESSIONS[kind];
    const ctx = await build({
      resolvedWorkspace: workspace,
      effectiveWorkspace: workspace,
      sessionKey,
      sessionAgentId: "makaron",
      memoryToolNames: ["memory_search", "memory_get"],
      ringZeroActive: false,
      sandboxed: false,
      params: { config, agentId: "makaron", sessionId: `bootmem-${kind}`, chatType },
    });
    assert(ctx.memoryToolRouted === true, `${kind}: memory tools should be routed (canRoute) in this fixture`);
    results[kind] = {
      turnScoped: (ctx.turnScopedDeveloperInstructions ?? "").includes(MEMORY_MARK),
      promptContext: (ctx.promptContext ?? "").includes(MEMORY_MARK),
      pointer: (ctx.memoryCollaborationInstructions ?? "").includes("does not paste its contents"),
    };
  }
  console.log(JSON.stringify(results));
  for (const kind of ["direct", "group"]) {
    assert.equal(results[kind].turnScoped, !baseline, `${kind} turn-scoped`);
    assert.equal(results[kind].promptContext, false, `${kind}: MEMORY.md must not be prepended to the user prompt`);
  }
  // Upstream renders the pointer only when MEMORY.md was routed to tools, i.e. a direct chat.
  assert.equal(results.direct.pointer, baseline);
  assert.equal(results.group.pointer, false);
});
