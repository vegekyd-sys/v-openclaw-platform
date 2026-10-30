// OpenAI-compatible chat completions with a scripted brain. A contract passes
// `script(request) -> {text?, toolCalls?, finishReason?, usage?}`; every request
// is recorded so a contract can assert on what the Gateway actually sent.
import { createServer } from "node:http";

/** The newest tool result in a request. Channels append runtime context after it, so it need not be last. */
export function lastToolResult(body) {
  return body.messages.findLast((m) => m.role === "tool");
}

export async function startFakeModel(script) {
  const requests = [];
  const server = createServer(async (req, res) => {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const raw = Buffer.concat(chunks);
    let body = {};
    try {
      body = JSON.parse(raw.toString("utf8"));
    } catch {}
    if (!req.url.includes("/chat/completions")) {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ data: [{ id: "m1", object: "model" }] }));
      return;
    }
    requests.push({ body, bytes: raw.length });
    const out = (await script.current(body, requests.length - 1)) ?? { text: "ok" };
    if (out.httpStatus) {
      res.writeHead(out.httpStatus, { "content-type": "application/json" });
      res.end(JSON.stringify({ error: { message: out.errorMessage ?? "scripted", type: "server_error" } }));
      return;
    }
    const id = `chatcmpl-${requests.length}`;
    const created = Math.floor(Date.now() / 1000);
    const frame = (delta, finish = null, extra = {}) =>
      `data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model: body.model, choices: [{ index: 0, delta, finish_reason: finish }], ...extra })}\n\n`;
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write(frame({ role: "assistant" }));
    if (out.text) res.write(frame({ content: out.text }));
    (out.toolCalls ?? []).forEach((tc, index) => {
      res.write(
        frame({
          tool_calls: [{ index, id: tc.id ?? `call_${requests.length}_${index}`, type: "function", function: { name: tc.name, arguments: JSON.stringify(tc.args ?? {}) } }],
        }),
      );
    });
    res.write(frame({}, out.finishReason ?? (out.toolCalls?.length ? "tool_calls" : "stop")));
    res.write(`data: ${JSON.stringify({ id, object: "chat.completion.chunk", created, model: body.model, choices: [], usage: out.usage ?? { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 } })}\n\n`);
    res.end("data: [DONE]\n\n");
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return { port: server.address().port, requests, stop: () => new Promise((r) => { server.closeAllConnections(); server.close(r); }) };
}
