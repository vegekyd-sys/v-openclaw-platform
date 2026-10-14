#!/usr/bin/env node
// Builds the two sidecar files the /vds DeepSeek app-server starts with (README.md):
//
//   node build-deepseek-model-files.mjs --prompt <codex-rs/models-manager/prompt.md @ rust-v0.159.2> --out <dir>
//
//   v-deepseek-model-catalog.json      one catalog entry, slug "deepseek" (longest-prefix match covers
//                                      deepseek-flash, deepseek-v4-pro, ...). Every field equals Codex's
//                                      fallback metadata for an unknown slug (model_info_from_slug in
//                                      codex-rs/models-manager/src/model_info.rs), except the window.
//   v-deepseek-base-instructions.md    the base prompt DeepSeek receives today: prompt.md with the
//                                      update_plan guidance removed (codex-rs/prompts/src/
//                                      update_plan_instructions.rs). Codex stops removing it once any
//                                      model catalog is configured, and a resumed thread reuses the
//                                      unstripped text stored in its session_meta, so the stripped text
//                                      is pinned with model_instructions_file instead.
import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const promptPath = option("--prompt");
const outDir = option("--out");
assert(promptPath && outDir, "usage: build-deepseek-model-files.mjs --prompt <prompt.md> --out <dir>");

// DeepSeek V4 accepts 1,048,576 tokens of input + output. Codex uses 95% of context_window for
// input (950,000) and compacts at 90% (900,000), leaving 148,576 tokens for output and for what
// one turn adds before the next compaction check.
const CONTEXT_WINDOW = 1_000_000;
const PROMPT_SHA256 = "ac8ae107a0d72fe3476b430afb161ea4e67da2e446d778aefc44828160559807"; // rust-v0.159.2

const prompt = fs.readFileSync(promptPath, "utf8");
assert.equal(crypto.createHash("sha256").update(prompt).digest("hex"), PROMPT_SHA256, "prompt.md is not Codex rust-v0.159.2's");

// Port of codex_prompts::without_update_plan_instructions (rust-v0.159.2).
function withoutUpdatePlanInstructions(instructions) {
  const lines = instructions.match(/[^\n]*\n|[^\n]+$/gu) ?? [];
  let rendered = "";
  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trimEnd();
    if (["## Planning", "## `update_plan`", "## Plan tool", "## Plan Mode vs update_plan tool"].includes(line)) {
      let end = index + 1;
      while (end < lines.length && !(lines[end].startsWith("# ") || lines[end].startsWith("## "))) end += 1;
      const isChecklistSection = line !== "## Planning" || lines.slice(index, end).some((l) =>
        l.startsWith("You have access to an `update_plan` tool") || l.startsWith("When `update_plan` is available, follow this section"));
      if (isChecklistSection) {
        index = end;
        continue;
      }
    }
    if (line === "Progress visibility:" && lines[index + 1]?.startsWith("If update_plan is available")) {
      index += 2;
      if (lines[index] !== undefined && lines[index].trim() === "") index += 1;
      continue;
    }
    if (line.startsWith("- Use the plan tool ") || line.startsWith("- If you create a checklist or task list,")) {
      index += 1;
      while (index < lines.length && (lines[index].startsWith(" ") || lines[index].startsWith("\t"))) index += 1;
      continue;
    }
    rendered += lines[index];
    index += 1;
  }
  return rendered;
}

const instructions = withoutUpdatePlanInstructions(prompt);
assert(!instructions.includes("update_plan"), "update_plan guidance left in the base prompt");

// Field for field the fallback ModelInfo (model_info_from_slug), window aside.
const entry = {
  slug: "deepseek",
  display_name: "deepseek",
  description: null,
  supported_reasoning_levels: [],
  shell_type: "unified_exec",
  visibility: "none",
  supported_in_api: true,
  priority: 99,
  additional_speed_tiers: [],
  service_tiers: [],
  availability_nux: null,
  upgrade: null,
  model_messages: { instructions_template: instructions, instructions_variables: null },
  include_skills_usage_instructions: false,
  include_plugin_usage_instructions: false,
  include_apps_usage_instructions: false,
  supports_reasoning_summary_parameter: true,
  default_reasoning_summary: "auto",
  support_verbosity: false,
  default_verbosity: null,
  apply_patch_tool_type: null,
  web_search_tool_type: "text",
  truncation_policy: { mode: "bytes", limit: 10000 },
  supports_image_detail_original: false,
  context_window: CONTEXT_WINDOW,
  max_context_window: CONTEXT_WINDOW,
  effective_context_window_percent: 95,
  experimental_supported_tools: [],
  input_modalities: ["text", "image"],
  supports_search_tool: false,
  supports_experimental_context: false,
  use_responses_lite: false,
  supports_reasoning_effort_updates: false,
  node_repl_auto_review_required: false,
  node_repl_disabled: false,
};

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, "v-deepseek-base-instructions.md"), instructions);
fs.writeFileSync(path.join(outDir, "v-deepseek-model-catalog.json"), `${JSON.stringify({ models: [entry] }, null, 2)}\n`);
console.log(JSON.stringify({ promptChars: prompt.length, instructionsChars: instructions.length, contextWindow: CONTEXT_WINDOW }));
