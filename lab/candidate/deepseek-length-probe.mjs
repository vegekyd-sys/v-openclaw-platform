// Probe: when does deepseek-flash stop with finish_reason=length and ~1 output token?
//
// V and VLab both saw it on large prompts (484k-900k tokens), mostly when little
// of the prompt was cached. OpenClaw sends max_tokens=384000 for deepseek-flash
// (maxTokens, no budget clamp: applyDeepSeekOutputBudget only matches deepseek-v4*).
// Each case sends a fresh, uncacheable synthetic prompt so the variables are just
// prompt size and max_tokens. Output: one JSON line per case.
import fs from "node:fs";

const config = JSON.parse(fs.readFileSync(process.env.OPENCLAW_CONFIG_PATH, "utf8"));
const provider = config.models.providers.deepseek;
const keyRef = String(provider.apiKey ?? "");
const apiKey = keyRef.replace(/^\$\{(\w+)\}$/u, (_, name) => process.env[name] ?? "");
if (!apiKey || apiKey.startsWith("${")) throw new Error(`DeepSeek key reference ${keyRef.slice(0, 3)}... is not resolvable here`);

const salt = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
// ~10 tokens per line; numbers and the salt keep every prompt unique and uncached.
function prompt(tokens) {
  const lines = [];
  for (let i = 0; lines.length * 10 < tokens; i++) lines.push(`row ${i} ${salt} value ${(i * 7919) % 100003} ok`);
  return `${lines.join("\n")}\n\nReply with exactly: DONE`;
}

const cases = (process.env.PROBE_CASES ?? "480000:384000,480000:8192,200000:384000,200000:8192,640000:8192")
  .split(",").map((c) => c.split(":").map(Number));
for (const [tokens, maxTokens] of cases) {
  const started = Date.now();
  let out;
  try {
    const res = await fetch(`${provider.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "deepseek-flash", messages: [{ role: "user", content: prompt(tokens) }], max_tokens: maxTokens, stream: false }),
      signal: AbortSignal.timeout(600_000),
    });
    const body = await res.json().catch(() => ({}));
    const choice = body.choices?.[0];
    out = { status: res.status, finish: choice?.finish_reason ?? null, text: String(choice?.message?.content ?? "").slice(0, 40),
      reasoningChars: String(choice?.message?.reasoning_content ?? "").length, usage: body.usage ?? null,
      error: body.error ? String(body.error.message ?? body.error).slice(0, 200) : undefined };
  } catch (error) {
    out = { error: String(error.message ?? error).slice(0, 200) };
  }
  console.log(JSON.stringify({ promptTokensApprox: tokens, maxTokens, secs: Math.round((Date.now() - started) / 1000), ...out }));
}
