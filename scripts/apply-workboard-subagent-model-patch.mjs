#!/usr/bin/env node
// Workboard runs its cards as `subagent:workboard-*` sessions, yet subagent.run passes no model, so
// they run the agent's default model, and `subagents.model` (which pins sessions_spawn and isolated
// cron) does not reach them. Night Shift is almost all of V's model calls and dispatches through
// workboard.cards.dispatchWithOptions, so a default-model change would carry it along.
//
// With this patch a Gateway dispatch uses the explicit `agents.entries.<id>.subagents.model`, then
// `agents.defaults.subagents.model`. It never falls back to the agent's own model, and a provider and
// model passed to workboard.cards.dispatch still win. Nothing changes until one of those keys is set.

import { copyFileSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const MARKER = "v-workboard-subagent-model-v1";

const optionsBefore = "function gatewayDispatchOptions(params) {\n\tconst { context, client } = params.request;\n\treturn {\n\t\t...params.input,\n";
const optionsAfter = `function gatewayDispatchOptions(params) {
	const { context, client } = params.request;
	return {
		...params.input,
		// ${MARKER}
		resolveSubagentModel: (agentId) => {
			const agents = context.getRuntimeConfig().agents;
			const raw = (agentId ? agents?.entries?.[agentId]?.subagents?.model : void 0) ?? agents?.defaults?.subagents?.model;
			const ref = (typeof raw === "string" ? raw : raw?.primary)?.trim();
			const slash = ref ? ref.indexOf("/") : -1;
			return slash > 0 ? { provider: ref.slice(0, slash), model: ref.slice(slash + 1) } : void 0;
		},
`;
const runBefore = "\t\t\t\t...params.options?.provider ? { provider: params.options.provider } : {},\n\t\t\t\t...params.options?.model ? { model: params.options.model } : {},\n\t\t\t\tlane: `workboard:";
const runAfter = "\t\t\t\t...params.options?.provider ? { provider: params.options.provider } : {},\n\t\t\t\t...params.options?.model ? { model: params.options.model } : {},\n\t\t\t\t...!params.options?.provider && !params.options?.model ? params.options?.resolveSubagentModel?.(card.agentId) ?? {} : {},\n\t\t\t\tlane: `workboard:";

export function patchWorkboardSubagentModel(source) {
  if (source.includes(MARKER)) return { changed: false, source };
  if (!source.includes(optionsBefore) || !source.includes(runBefore)) throw new Error("OpenClaw Workboard dispatcher shape changed; refusing to patch");
  const updated = source.replace(optionsBefore, optionsAfter).replace(runBefore, runAfter);
  if (updated === source || !updated.includes(runAfter) || !updated.includes(optionsAfter)) throw new Error("Patch verification failed");
  return { changed: true, source: updated };
}

function main() {
  const args = new Map(process.argv.slice(2).map((arg) => {
    const [key, ...rest] = arg.split("=");
    return [key, rest.join("=")];
  }));
  if (!args.get("--dist")) throw new Error("Usage: apply-workboard-subagent-model-patch.mjs --dist=/path/to/openclaw/dist [--backup-dir=/path] [--dry-run]");
  const distDir = resolve(args.get("--dist"));
  const dryRun = args.has("--dry-run");
  const backupDir = args.get("--backup-dir") ? resolve(args.get("--backup-dir")) : null;
  const matches = readdirSync(distDir).filter((name) => /^runtime-api-.*\.js$/.test(name)).map((name) => join(distDir, name)).filter((file) => readFileSync(file, "utf8").includes("function gatewayDispatchOptions(params)"));
  if (matches.length !== 1) throw new Error(`Expected exactly one Workboard runtime bundle, found ${matches.length}`);
  const [file] = matches;
  const { changed, source } = patchWorkboardSubagentModel(readFileSync(file, "utf8"));
  if (changed && !dryRun) {
    if (backupDir) copyFileSync(file, join(backupDir, basename(file)));
    else if (!args.has("--no-backup")) throw new Error("--backup-dir or --no-backup is required unless --dry-run is used");
    writeFileSync(file, source);
  }
  process.stdout.write(`${JSON.stringify({ changed: changed && !dryRun, dryRun, file })}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
