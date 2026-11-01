#!/usr/bin/env node
// Gives each contract target its own copy of V's Worker plugin. The Worker imports
// three chunks by hashed file name, so a build with other hashes needs them repointed.
// Rehearsal only: it refuses unless each export letter means the same thing in both
// builds. C5 replaces this with a lookup that does not depend on the hash.
// usage: make-worker-targets.mjs --targets <dir> --worker <V's Worker plugin dir>
import { cpSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";

const { values: a } = parseArgs({ options: { targets: { type: "string" }, worker: { type: "string" } } });
if (!a.targets || !a.worker) throw new Error("--targets and --worker are required");

const BINDS = [
  ["index.mjs", "agent-harness-task-runtime-scope", "t", "assertAgentHarnessTaskRuntimeScope"],
  ["worker.mjs", "bash-process-registry", "S", "waitForExecScope"],
  ["worker.mjs", "bash-tools", "t", "createProcessTool"],
];
const exportsOf = (file) =>
  Object.fromEntries(
    [...readFileSync(file, "utf8").matchAll(/export\s*\{([^}]+)\}/g)]
      .flatMap((m) => m[1].split(","))
      .map((s) => s.trim().split(/\s+as\s+/))
      .map(([name, alias]) => [alias ?? name, name]),
  );
function chunkFor(target, prefix, letter, name) {
  const dist = path.join(a.targets, target, "dist");
  const hits = readdirSync(dist)
    .filter((f) => new RegExp(`^${prefix}-[\\w-]{8}\\.js$`).test(f))
    .filter((f) => exportsOf(path.join(dist, f))[letter] === name);
  if (hits.length !== 1) throw new Error(`${target}: ${prefix} ${letter}=${name} has ${hits.length} matches`);
  return hits[0];
}
for (const target of ["v", "fork-c5"]) {
  const out = path.join(a.targets, `worker-${target}`);
  rmSync(out, { recursive: true, force: true });
  cpSync(a.worker, out, { recursive: true });
  for (const [file, prefix, letter, name] of BINDS) {
    const from = chunkFor("v", prefix, letter, name);
    const to = chunkFor(target, prefix, letter, name);
    const f = path.join(out, file);
    const src = readFileSync(f, "utf8");
    if (!src.includes(from)) throw new Error(`${file} does not import ${from}`);
    if (from !== to) writeFileSync(f, src.replaceAll(from, to));
    console.log(`${target} ${file}: ${from} -> ${to}`);
  }
}
