#!/usr/bin/env node
// Backport of upstream openclaw f8db9be1a94 (#137036): a no-op `write`, `edit` or `apply_patch` no
// longer returns `terminate: true`. With the flag, a turn whose last tool batch was one redundant
// mutation ended without a final answer: the Codex harness released the turn on it ("codex app-server
// turn released after terminal dynamic tool result") and the Worker loop stops on an all-terminal
// batch. On V on 2026-11-09 a night-shift card (BH-ES-22) re-applied an edit that was already in
// place, its turn ended before the stage handoff was written, and the engine blocked the card.

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const T = "\t";
const tabs = (n) => T.repeat(n);
const noOpReturn = (indent, message) => ({
  before: `return {\n${tabs(indent + 1)}...textResult(\`${message}\`, { changed: false }),\n${tabs(indent + 1)}terminate: true\n${tabs(indent)}};`,
  after: `return textResult(\`${message}\`, { changed: false });`,
});

export const PATCHES = {
  sessions: {
    match: (text) => text.includes("The replacement text is identical to the original.") && text.includes("The file already has identical content."),
    edits: [
      noOpReturn(5, "No changes made to ${path}. The replacement text is identical to the original."),
      noOpReturn(5, "No changes made to ${path}. The replacement produced identical content."),
      noOpReturn(4, "No changes made to ${path}. The file already has identical content."),
    ],
  },
  codingTools: {
    match: (text) => text.includes("details: { summary: result.summary }") && text.includes("apply_patch"),
    edits: [{ before: `${tabs(4)}details: { summary: result.summary },\n${tabs(4)}...result.noOp ? { terminate: true } : {}\n`, after: `${tabs(4)}details: { summary: result.summary }\n` }],
  },
};

export function patchSource(source, patch) {
  let text = source;
  let changed = 0;
  for (const { before, after } of patch.edits) {
    if (text.includes(after) && !text.includes(before)) continue;
    const parts = text.split(before);
    if (parts.length !== 2) throw new Error(`anchor must match exactly once (found ${parts.length - 1}): ${before.slice(0, 80)}`);
    text = parts.join(after);
    changed += 1;
  }
  return { changed, source: text };
}

function main() {
  const args = new Map(process.argv.slice(2).map((a) => { const [k, ...v] = a.split("="); return [k, v.join("=")]; }));
  if (!args.get("--dist")) throw new Error("Usage: apply-noop-mutation-nonterminal-patch.mjs --dist=/path/to/openclaw/dist [--dry-run]");
  const dist = resolve(args.get("--dist"));
  const out = [];
  for (const [name, patch] of Object.entries(PATCHES)) {
    const files = readdirSync(dist).filter((f) => f.endsWith(".js")).filter((f) => patch.match(readFileSync(join(dist, f), "utf8")));
    if (files.length !== 1) throw new Error(`${name}: expected exactly one dist file, found ${files.length}`);
    const file = join(dist, files[0]);
    const { changed, source } = patchSource(readFileSync(file, "utf8"), patch);
    if (changed && !args.has("--dry-run")) writeFileSync(file, source);
    out.push({ name, file: files[0], changed });
  }
  process.stdout.write(`${JSON.stringify(out)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
