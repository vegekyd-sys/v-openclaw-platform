// Probe: what a near-1M-token /vds request costs in time and cache on DeepSeek (codex-ds-window).
//
// Sends Codex-shaped Responses API requests (streamed, reasoning effort high, no
// max_output_tokens, as Codex sends for deepseek-flash) straight to DeepSeek. Each size runs
// twice: a fresh salted prompt (nothing cached) and the same prompt with a different last
// question (prefix cached). Measures time to the first streamed delta of any kind, to the first
// answer text, and to completion, plus the usage DeepSeek bills. The largest size checks that a
// request near Codex's new usable window (950,000) is accepted without an output cap.
//
//   PROBE_SIZES=120000,250000,500000,900000,950000   approximate prompt tokens
import assert from "node:assert/strict";
import fs from "node:fs";

const SECRETS = "/srv/vlab-production-mirror/labs/instances/db91-parity/secrets.env";
const secrets = Object.fromEntries(fs.readFileSync(SECRETS, "utf8").split(/\r?\n/u).map((l) => l.match(/^\s*(?:export\s+)?([A-Z0-9_]+)=(.*)$/u)).filter(Boolean).map((m) => [m[1], m[2].replace(/^["']|["']$/gu, "")]));
const apiKey = secrets.DEEPSEEK_API_KEY;
assert(apiKey, "DEEPSEEK_API_KEY missing");
const sizes = (process.env.PROBE_SIZES ?? "120000,250000,500000,900000,950000").split(",").map(Number);
// Mixed Chinese/ASCII rows like V's group transcripts. Calibrated below from the first usage.
let tokensPerRow = Number(process.env.PROBE_TOKENS_PER_ROW ?? 16);

function filler(tokens, salt) {
  const rows = [];
  const n = Math.ceil(tokens / tokensPerRow);
  for (let i = 0; i < n; i += 1) rows.push(`第${i}条 ${salt} 记录：数值 ${(i * 7919) % 100003}，状态正常，备注 item-${i % 997}`);
  return rows.join("\n");
}

async function ask(text, question) {
  const started = Date.now();
  let firstDelta, firstText, usage, status, error, answer = "";
  try {
    const res = await fetch("https://api.deepseek.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: "deepseek-flash", stream: true, store: false, reasoning: { effort: "high" },
        input: [{ type: "message", role: "user", content: [{ type: "input_text", text: `${text}\n\n${question}` }] }] }),
      signal: AbortSignal.timeout(900_000),
    });
    status = res.status;
    if (!res.ok) { error = (await res.text()).slice(0, 300); return { status, error, secs: (Date.now() - started) / 1000 }; }
    const decoder = new TextDecoder();
    let buf = "";
    for await (const chunk of res.body) {
      buf += decoder.decode(chunk, { stream: true });
      let i;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (!line.startsWith("data:")) continue;
        let e; try { e = JSON.parse(line.slice(5)); } catch { continue; }
        if (/delta$/u.test(String(e.type)) && firstDelta === undefined) firstDelta = Date.now() - started;
        if (e.type === "response.output_text.delta") { if (firstText === undefined) firstText = Date.now() - started; answer += e.delta ?? ""; }
        if (e.type === "response.completed") usage = e.response?.usage;
        if (e.type === "response.failed" || e.type === "error") error = JSON.stringify(e).slice(0, 300);
      }
    }
  } catch (err) {
    error = String(err?.message ?? err).slice(0, 300);
  }
  return { status, error, firstDeltaS: firstDelta / 1000, firstTextS: firstText / 1000, secs: (Date.now() - started) / 1000,
    input: usage?.input_tokens, cached: usage?.input_tokens_details?.cached_tokens, output: usage?.output_tokens,
    reasoning: usage?.output_tokens_details?.reasoning_tokens, answer: answer.trim().slice(0, 40) };
}

for (const size of sizes) {
  const salt = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const text = filler(size, salt);
  const cold = await ask(text, "只回复：第一条记录的编号是几？用一个数字回答。");
  console.log(JSON.stringify({ size, run: "uncached", tokensPerRow, ...cold }));
  if (cold.input && sizes.indexOf(size) === 0) tokensPerRow = Math.max(1, cold.input / Math.ceil(size / tokensPerRow));
  if (cold.error) continue;
  const warm = await ask(text, "只回复：最后一条记录的编号是几？用一个数字回答。");
  console.log(JSON.stringify({ size, run: "cached", ...warm }));
}
