// Candidate test for lab/release-files/x-search-effort: the real 9.1 x_search
// tool must send reasoning.effort "low" for grok-4.6, keep "none" for grok-4.3,
// send nothing for other models, and keep max_turns.
//
// V 2026-10-04: with no effort field xAI ran grok-4.6 x_search at high effort,
// 28-51 s per call against OpenClaw's 30 s timeout; 8 of 12 agent calls timed out.
//
// No credential is involved. The tool is pointed at http://api.x.ai/v1 and
// HTTP_PROXY at a local proxy (trusted web-tool endpoints honour the env proxy),
// so the request arrives in plain text and is answered with a canned response.
// X_SEARCH_EFFORT_EXPECT=baseline runs the same checks against the unpatched file.
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import http from "node:http";
import path from "node:path";
import { pathToFileURL } from "node:url";

const runtime = process.env.VLAB_CANDIDATE_RUNTIME;
assert(runtime, "run through vlab.mjs candidate (VLAB_CANDIDATE_RUNTIME)");
const dist = path.join(runtime, "openclaw", "dist");
const expectPatched = process.env.X_SEARCH_EFFORT_EXPECT !== "baseline";

const seen = [];
let proxy;
before(async () => {
  proxy = http.createServer((req, res) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk)).on("end", () => {
      seen.push({ method: req.method, url: new URL(req.url, `http://${req.headers.host}`).href, auth: req.headers.authorization, body: JSON.parse(body) });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        output: [{
          type: "message",
          content: [{
            type: "output_text",
            text: "canned answer",
            annotations: [{ type: "url_citation", url: "https://x.com/xai/status/1", start_index: 0, end_index: 6 }],
          }],
        }],
        citations: ["https://x.com/xai/status/1"],
      }));
    });
  });
  // undici tunnels through the proxy with CONNECT even for http:// targets; the
  // tunnel then carries plain HTTP, which this same server parses.
  proxy.on("connect", (req, socket, head) => {
    socket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head?.length) socket.unshift(head);
    proxy.emit("connection", socket);
  });
  await new Promise((resolve) => proxy.listen(0, "127.0.0.1", resolve));
  process.env.HTTP_PROXY = process.env.http_proxy = `http://127.0.0.1:${proxy.address().port}`;
  delete process.env.NO_PROXY;
  delete process.env.no_proxy;
});
after(() => proxy?.close());

async function runXSearch(model, query) {
  const { createXSearchTool } = await import(pathToFileURL(path.join(dist, "extensions", "xai", "x-search.js")).href);
  const config = {
    plugins: { entries: { xai: { enabled: true, config: { xSearch: {
      enabled: true, model, baseUrl: "http://api.x.ai/v1", maxTurns: 2, timeoutSeconds: 20, cacheTtlMinutes: 0,
    } } } } },
  };
  const auth = { hasAuthForProvider: (id) => id === "xai", resolveApiKeyForProvider: async (id) => (id === "xai" ? "candidate-test-key" : undefined) };
  const tool = createXSearchTool({ config, runtimeConfig: config, auth });
  assert(tool, "x_search tool was not created");
  const before = seen.length;
  const result = await tool.execute("call-1", { query }).catch((error) => {
    throw new Error(`x_search failed: ${error.message}; cause: ${error.cause?.code ?? ""} ${error.cause?.message ?? error.cause ?? ""}`, { cause: error });
  });
  assert.equal(seen.length, before + 1, `expected one request through the proxy, result: ${JSON.stringify(result).slice(0, 300)}`);
  return seen.at(-1);
}

test(`grok-4.6 sends reasoning.effort ${expectPatched ? "low" : "(absent, baseline)"}`, async () => {
  const req = await runXSearch("grok-4.6", "latest post from @xai (4.6)");
  assert.equal(req.method, "POST");
  assert.equal(req.url, "http://api.x.ai/v1/responses");
  assert.equal(req.auth, "Bearer candidate-test-key");
  assert.equal(req.body.model, "grok-4.6");
  assert.equal(req.body.max_turns, 2, "maxTurns config must still reach the request");
  assert.equal(req.body.tools[0].type, "x_search");
  assert.deepEqual(req.body.reasoning, expectPatched ? { effort: "low" } : undefined);
});

test("grok-4.3 keeps reasoning.effort none", async () => {
  const req = await runXSearch("grok-4.3", "latest post from @xai (4.3)");
  assert.deepEqual(req.body.reasoning, { effort: "none" });
});

test("other models send no reasoning field", async () => {
  const req = await runXSearch("grok-4.7", "latest post from @xai (4.7)");
  assert.equal(req.body.model, "grok-4.7");
  assert.equal(req.body.reasoning, undefined);
});
