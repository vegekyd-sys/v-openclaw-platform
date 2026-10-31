// Limits V added: what the model is sent, and how much a tool may keep.
import { writeFileSync } from "node:fs";
import crypto from "node:crypto";
import path from "node:path";
import zlib from "node:zlib";
import { lastToolResult } from "../lib/fake-model.mjs";

// Noise does not compress: 800 px is about 1.9 MB, above V's 1 MB cap and small enough for stock to send as is.
function noisePng(size) {
  const chunk = (type, data) => {
    const head = Buffer.from(type);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(zlib.crc32(Buffer.concat([head, data])));
    return Buffer.concat([len, head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  const rows = [];
  for (let y = 0; y < size; y++) rows.push(Buffer.from([0]), crypto.randomBytes(size * 3));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(Buffer.concat(rows), { level: 1 })), chunk("IEND", Buffer.alloc(0))]);
}

const imageBytes = (body) =>
  [...JSON.stringify(body).matchAll(/data:image\/[a-z]+;base64,([A-Za-z0-9+/=]+)/g)].map((m) => Math.floor((m[1].length * 3) / 4));

export default [
  {
    id: "E3c/full-context-compacts-instead-of-max-tokens-1",
    ledger: ["E3c-completions-overflow-signal"],
    boot: {
      config: { models: { providers: { fake: { models: [{ id: "m1", name: "m1", contextWindow: 70000, maxTokens: 8000, input: ["text"], reasoning: false, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } } },
      // A provider given almost no output room stops at length with nothing to show.
      modelScript: (body) => ((body.max_tokens ?? body.max_completion_tokens) < 100 ? { text: "", finishReason: "length" } : { text: "压缩后回答" }),
    },
    timeoutMs: 180_000,
    async run({ gw, assert }) {
      const r = await gw.turn("字".repeat(90000), { timeoutMs: 150_000 }).catch((e) => ({ text: `ERR ${e.message}` }));
      const limits = gw.model.requests.map((q) => q.body.max_tokens ?? q.body.max_completion_tokens);
      assert(!limits.some((l) => l < 100), `a request went out with almost no output room (limits ${limits.join(",")}): ${r.text.slice(0, 160)}`);
      return `limits ${limits.join(",")}, ${r.text.slice(0, 60)}`;
    },
  },
  {
    // Stock has no budget at all and sends this too, so this one compares V and the fork.
    id: "PARITY/E3b-inline-image-budget",
    ledger: ["E3b-deepseek-budget-image"],
    parity: true,
    boot: {
      config: {
        models: { providers: { ds: { baseUrl: "FAKE_MODEL_URL", apiKey: "contract", api: "openai-completions", request: { allowPrivateNetwork: true }, models: [{ id: "deepseek-v4-flash", name: "ds", contextWindow: 1048576, maxTokens: 384000, input: ["text", "image"], reasoning: false, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }] } } },
        agents: { defaults: { model: { primary: "ds/deepseek-v4-flash" } } },
      },
      modelScript: (body) => (lastToolResult(body) ? { text: "看到了" } : { toolCalls: [{ name: "view_image", args: { path: "noise.png" } }] }),
    },
    timeoutMs: 120_000,
    async run({ gw }) {
      writeFileSync(path.join(gw.workspace, "noise.png"), noisePng(800));
      // 600k tokens of text: counting the image by its base64 length would overflow the limit.
      const r = await gw.turn("x".repeat(1_200_000), { timeoutMs: 100_000 }).catch((e) => ({ text: `ERR ${e.message}` }));
      return { reply: r.text, requests: gw.model.requests.length };
    },
  },
  {
    id: "VDS-VIEW-IMAGE/native-result-capped-at-1mb",
    ledger: ["VDS-VIEW-IMAGE"],
    boot: {
      modelScript: (body) =>
        lastToolResult(body) ? { text: "看到了" } : { toolCalls: [{ name: "view_image", args: { path: "noise.png" } }] },
    },
    timeoutMs: 120_000,
    async run({ gw, assert }) {
      writeFileSync(path.join(gw.workspace, "noise.png"), noisePng(800));
      const r = await gw.turn("看图", { timeoutMs: 100_000 });
      assert(r.text.includes("看到了"), `turn failed: ${r.text}`);
      // Stock follows the turn with a bootstrap request, so look through all of them.
      const sizes = gw.model.requests.flatMap((q) => imageBytes(q.body));
      assert(sizes.length > 0, "no image reached the model");
      assert(Math.max(...sizes) <= 1024 * 1024, `image of ${Math.max(...sizes)} bytes reached the model, the cap is 1 MB`);
      return `image ${Math.max(...sizes)} bytes`;
    },
  },
  {
    id: "E3/deepseek-over-budget-is-refused",
    ledger: ["E3"],
    boot: {
      config: {
        models: {
          providers: {
            // Any provider name: the budget keys on the model id, and "deepseek" would pull its plugin from npm.
            ds: {
              baseUrl: "FAKE_MODEL_URL",
              apiKey: "contract",
              api: "openai-completions",
              request: { allowPrivateNetwork: true },
              models: [{ id: "deepseek-v4-flash", name: "ds", contextWindow: 1048576, maxTokens: 384000, input: ["text"], reasoning: false, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 } }],
            },
          },
        },
        agents: { defaults: { model: { primary: "ds/deepseek-v4-flash" } } },
      },
    },
    timeoutMs: 120_000,
    async run({ gw, assert }) {
      // Two bytes per token is V's conservative estimate: this prompt counts as over the
      // provider's 1,048,576 limit although four characters per token says it fits.
      const r = await gw.turn("x".repeat(2_200_000), { timeoutMs: 100_000 }).catch((e) => ({ text: `ERR ${e.message}` }));
      assert(gw.model.requests.length === 0, `the over-budget prompt was sent to the provider ${gw.model.requests.length} time(s)`);
      assert(/上下文|压缩/.test(r.text), `no Chinese budget notice: ${r.text.slice(0, 200)}`);
      return r.text.slice(0, 80);
    },
  },
];
