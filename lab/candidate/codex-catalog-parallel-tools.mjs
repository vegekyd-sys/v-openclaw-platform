#!/usr/bin/env node
// Candidate-only: let Codex ask DeepSeek for parallel tool calls.
//
//   node codex-catalog-parallel-tools.mjs <@openclaw/codex/dist>
//
// V's DeepSeek model catalog (v-deepseek-model-catalog.json, passed to codex as model_catalog_json)
// has no supports_parallel_tool_calls, so Codex sends parallel_tool_calls=false and every tool call
// costs one model round trip; the Worker lets DeepSeek batch independent calls. This sets it on every
// catalog entry of the loaded copy, nothing else.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const dist = process.argv[2];
assert(dist, "usage: codex-catalog-parallel-tools.mjs <dist dir>");
const file = path.join(dist, "v-deepseek-model-catalog.json");
assert(fs.existsSync(file), `no DeepSeek catalog in ${dist}`);
const catalog = JSON.parse(fs.readFileSync(file, "utf8"));
const models = Array.isArray(catalog.models) ? catalog.models : [catalog];
for (const model of models) model.supports_parallel_tool_calls = process.env.CODEX_PARALLEL_TOOLS !== "0";
fs.writeFileSync(file, `${JSON.stringify(catalog, null, 2)}\n`);
console.error(`[catalog-parallel-tools] ${models.length} entr${models.length === 1 ? "y" : "ies"} -> ${models[0].supports_parallel_tool_calls}`);
