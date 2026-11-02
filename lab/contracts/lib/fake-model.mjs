// OpenAI-compatible chat completions with a scripted brain. A contract passes
// `script(request) -> {text?, toolCalls?, finishReason?, usage?}`; every request
// is recorded so a contract can assert on what the Gateway actually sent.
import { createServer } from "node:http";

/** The newest tool result in a request. Channels append runtime context after it, so it need not be last. */
export function lastToolResult(body) {
  return body.messages.findLast((m) => m.role === "tool");
}

/** The same question for a Responses request: the newest tool output in `input`. */
export function lastFunctionOutput(body) {
  return (body.input ?? []).findLast((i) => i.type === "function_call_output");
}

/** OpenAI Responses over SSE, the wire a real Codex app-server speaks. Same script shape as chat completions. */
async function serveResponses(req, res, body, raw, script, requests) {
  // Codex tries a WebSocket first; those upgrade attempts are not model calls.
  if (req.method !== "POST") {
    res.writeHead(404);
    res.end();
    return;
  }
  requests.push({ body, bytes: raw.length, wire: "responses" });
  const out = (await script.current(body, requests.length - 1)) ?? { text: "ok" };
  if (out.httpStatus) {
    res.writeHead(out.httpStatus, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: { message: out.errorMessage ?? "scripted", type: "server_error", code: out.errorCode } }));
    return;
  }
  const id = `resp_${requests.length}`;
  const send = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  res.writeHead(200, { "content-type": "text/event-stream" });
  send("response.created", { response: { id, object: "response", status: "in_progress", model: body.model, output: [] } });
  const output = [];
  let index = 0;
  for (const phase of out.commentary ? ["commentary"] : []) {
    const item = { id: `msg_c${requests.length}`, type: "message", role: "assistant", phase, content: [{ type: "output_text", text: out.commentary, annotations: [] }] };
    send("response.output_item.added", { output_index: index, item: { ...item, status: "in_progress", content: [] } });
    send("response.output_text.delta", { item_id: item.id, output_index: index, content_index: 0, delta: out.commentary });
    send("response.output_item.done", { output_index: index++, item });
    output.push(item);
  }
  const text = out.text ?? out.chunks?.join("");
  if (text) {
    const itemId = `msg_${requests.length}`;
    send("response.output_item.added", { output_index: index, item: { id: itemId, type: "message", role: "assistant", status: "in_progress", content: [] } });
    for (const delta of out.chunks ?? [text]) send("response.output_text.delta", { item_id: itemId, output_index: index, content_index: 0, delta });
    const item = { id: itemId, type: "message", role: "assistant", status: "completed", content: [{ type: "output_text", text, annotations: [] }] };
    send("response.output_item.done", { output_index: index++, item });
    output.push(item);
  }
  (out.toolCalls ?? []).forEach((tc, i) => {
    const item = { id: `fc_${requests.length}_${i}`, type: "function_call", status: "completed", call_id: tc.id ?? `call_${requests.length}_${i}`, name: tc.name, arguments: JSON.stringify(tc.args ?? {}) };
    send("response.output_item.done", { output_index: index++, item });
    output.push(item);
  });
  send("response.completed", { response: { id, object: "response", status: "completed", model: body.model, output, usage: out.usage ?? { input_tokens: 10, output_tokens: 2, total_tokens: 12, input_tokens_details: { cached_tokens: 0 }, output_tokens_details: { reasoning_tokens: 0 } } } });
  res.end();
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
    if (req.url.includes("/embeddings")) {
      if (script.embeddingsHang) await script.embeddingsHang;
      const inputs = Array.isArray(body.input) ? body.input : [body.input];
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ object: "list", model: body.model, data: inputs.map((_, index) => ({ object: "embedding", index, embedding: [0.1, 0.2, 0.3, 0.4] })), usage: { prompt_tokens: 1, total_tokens: 1 } }));
      return;
    }
    if (req.url.includes("/responses")) {
      await serveResponses(req, res, body, raw, script, requests);
      return;
    }
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
    for (const chunk of out.chunks ?? []) {
      res.write(frame({ content: chunk }));
      await new Promise((r) => setTimeout(r, out.chunkDelayMs ?? 30));
    }
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
