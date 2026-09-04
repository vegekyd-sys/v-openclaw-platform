#!/usr/bin/env node

import fs from "node:fs";

function fail(message) {
  throw new Error(message);
}

const args = process.argv.slice(2);
const value = (name) => {
  const index = args.indexOf(name);
  if (index < 0 || index + 1 >= args.length) fail(`Missing ${name}`);
  return args[index + 1];
};

const input = value("--input");
const output = value("--output");
const schema = value("--schema");
if (!new Set(["legacy", "current"]).has(schema)) {
  fail("--schema must be legacy or current");
}

const config = JSON.parse(fs.readFileSync(input, "utf8"));
const feishu = config.channels?.feishu;
if (!feishu || typeof feishu !== "object" || Array.isArray(feishu)) {
  fail("channels.feishu is missing");
}

const currentStreaming = feishu.streaming;
const currentSchemaValue = { mode: "partial", block: { enabled: false } };
if (schema === "legacy") {
  if (JSON.stringify(currentStreaming) !== JSON.stringify(currentSchemaValue)) {
    fail("Refusing to replace an unexpected current Feishu streaming config");
  }
  feishu.streaming = true;
} else if (currentStreaming === true) {
  feishu.streaming = currentSchemaValue;
} else if (JSON.stringify(currentStreaming) !== JSON.stringify(currentSchemaValue)) {
  fail("Refusing to replace an unexpected legacy Feishu streaming config");
}

fs.writeFileSync(output, `${JSON.stringify(config, null, 2)}\n`, { mode: 0o600 });
process.stdout.write(`${JSON.stringify({ ok: true, schema, output })}\n`);
