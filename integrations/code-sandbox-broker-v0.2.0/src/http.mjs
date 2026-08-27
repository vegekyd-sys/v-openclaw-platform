import http from "node:http";
import { unlink } from "node:fs/promises";
import { routeWork } from "./router.mjs";

export async function listenUnix(manager, socketPath) {
  try { await unlink(socketPath); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://sandbox-broker.local");
      if (request.method === "GET" && url.pathname === "/health") return json(response, 200, manager.health());
      if (request.method === "POST" && url.pathname === "/route") return json(response, 200, routeWork(await body(request)));
      if (request.method === "POST" && url.pathname === "/jobs") {
        const result = await manager.submit(await body(request));
        return json(response, result.existing ? 200 : 202, result);
      }
      if (request.method === "GET" && url.pathname === "/jobs") return json(response, 200, { jobs: await manager.list() });
      const match = url.pathname.match(/^\/jobs\/([^/]+)(?:\/(cancel))?$/);
      if (match && request.method === "GET" && !match[2]) return json(response, 200, await manager.get(match[1]));
      if (match && request.method === "POST" && match[2] === "cancel") return json(response, 200, await manager.cancel(match[1]));
      if (request.method === "POST" && url.pathname === "/prune") return json(response, 200, await manager.prune());
      return json(response, 404, { error: "not found" });
    } catch (error) {
      const code = error.code === "ENOENT" ? 404 : 400;
      return json(response, code, { error: error instanceof Error ? error.message : String(error) });
    }
  });
  await new Promise((resolve, reject) => { server.once("error", reject); server.listen(socketPath, resolve); });
  return server;
}

async function body(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_000_000) throw new Error("request body exceeds 1 MB");
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function json(response, status, value) {
  const data = Buffer.from(`${JSON.stringify(value)}\n`);
  response.writeHead(status, { "content-type": "application/json", "content-length": data.length });
  response.end(data);
}
