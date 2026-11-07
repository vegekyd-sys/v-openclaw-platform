// How much tool argument DeepSeek streams in the watchdog's limit: Codex emits nothing while
// arguments stream, so this rate turns "a long tool call could be mistaken for a hang" into a size.
// Calls DeepSeek directly with a forced tool call; only sizes and times are printed.
import assert from "node:assert/strict";
import fs from "node:fs";

const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const key = fs.readFileSync(SECRETS, "utf8").match(/^\s*(?:export\s+)?DEEPSEEK_API_KEY=["']?([^"'\n]+)/mu)?.[1];
assert(key, "DEEPSEEK_API_KEY missing");
const model = process.env.ARG_RATE_MODEL ?? "deepseek-flash";
for (let run = 0; run < Number(process.env.ARG_RATE_RUNS ?? 3); run++) {
  const started = performance.now();
  const res = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({
      model,
      stream: true,
      max_tokens: 8000,
      thinking: { type: "disabled" },
      tool_choice: { type: "function", function: { name: "write_file" } },
      tools: [{ type: "function", function: { name: "write_file", parameters: { type: "object", properties: { content: { type: "string" } }, required: ["content"] } } }],
      messages: [{ role: "user", content: "用 write_file 写一篇尽量长的中文长文，讲城市供水系统的历史，不少于两万字。" }],
    }),
  });
  assert.equal(res.status, 200, `status ${res.status}`);
  let chars = 0;
  let first;
  let tokens;
  let rest = "";
  for await (const chunk of res.body) {
    rest += Buffer.from(chunk).toString("utf8");
    const parts = rest.split("\n");
    rest = parts.pop();
    for (const line of parts) {
      if (!line.startsWith("data: {")) continue;
      const data = JSON.parse(line.slice(6));
      const delta = data.choices?.[0]?.delta?.tool_calls?.[0]?.function?.arguments ?? "";
      if (delta) { first ??= performance.now(); chars += delta.length; }
      tokens = data.usage?.completion_tokens ?? tokens;
    }
  }
  const streamS = (performance.now() - first) / 1000;
  console.log(JSON.stringify({ run, model, firstArgS: Math.round((first - started) / 100) / 10, streamS: Math.round(streamS * 10) / 10, chars, tokens, charsPerS: Math.round(chars / streamS), tokensPerS: Math.round(tokens / streamS), charsIn90s: Math.round((chars / streamS) * 90) }));
}
