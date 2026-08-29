import http from "node:http";
import { unlink } from "node:fs/promises";
import { routeWork } from "./router.mjs";

// project_sandbox_files accepts a 2 MB patch. JSON escaping can expand a
// string by up to six bytes per input byte, so the HTTP envelope must be
// larger than the semantic payload limit while remaining strictly bounded.
const MAX_REQUEST_BYTES = 13_000_000;

export async function listenUnix(managers, socketPath) {
  const jobs = managers.jobs ?? managers;
  const workspaces = managers.workspaces;
  const capacity = managers.capacity;
  try { await unlink(socketPath); } catch (error) { if (error.code !== "ENOENT") throw error; }
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://sandbox-broker.local");
      if (request.method === "GET" && url.pathname === "/health") return json(response, 200, {
        ok: true,
        jobs: jobs.health(),
        workspaces: workspaces?.health(),
        capacity: capacity?.snapshot(),
      });
      if (request.method === "POST" && url.pathname === "/route") return json(response, 200, routeWork(await body(request)));
      if (request.method === "POST" && url.pathname === "/jobs") {
        const result = await jobs.submit(await body(request));
        return json(response, result.existing ? 200 : 202, result);
      }
      if (request.method === "GET" && url.pathname === "/jobs") return json(response, 200, { jobs: await jobs.list() });
      const match = url.pathname.match(/^\/jobs\/([^/]+)(?:\/(cancel))?$/);
      if (match && request.method === "GET" && !match[2]) return json(response, 200, await jobs.get(match[1]));
      if (match && request.method === "POST" && match[2] === "cancel") return json(response, 200, await jobs.cancel(match[1]));

      if (workspaces && request.method === "POST" && url.pathname === "/workspaces") {
        const result = await workspaces.open(await body(request));
        return json(response, result.existing ? 200 : 202, result);
      }
      if (workspaces && request.method === "GET" && url.pathname === "/workspaces") {
        return json(response, 200, { workspaces: await workspaces.list() });
      }
      const workspaceMatch = url.pathname.match(/^\/workspaces\/([^/]+)(?:\/(status|exec|files|finish|cancel))?$/);
      if (workspaces && workspaceMatch && request.method === "GET" && !workspaceMatch[2]) {
        return json(response, 200, await workspaces.get(workspaceMatch[1]));
      }
      if (workspaces && workspaceMatch && request.method === "POST" && workspaceMatch[2]) {
        const payload = await body(request);
        const [id, action] = [workspaceMatch[1], workspaceMatch[2]];
        if (action === "status") return json(response, 200, await workspaces.status(id, payload.actor));
        if (action === "exec") return json(response, 200, await workspaces.exec(id, payload.input, payload.actor));
        if (action === "files") return json(response, 200, await workspaces.files(id, payload.input, payload.actor));
        if (action === "finish") return json(response, 200, await workspaces.finish(id, payload.input, payload.actor));
        return json(response, 200, await workspaces.cancel(id, payload.actor));
      }
      if (request.method === "POST" && url.pathname === "/prune") return json(response, 200, {
        jobs: await jobs.prune(),
        workspaces: workspaces ? await workspaces.prune() : undefined,
      });
      return json(response, 404, { error: "not found" });
    } catch (error) {
      const code = error.code === "ENOENT" ? 404 : error.code === "EACCES" ? 403 : 400;
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
    if (size > MAX_REQUEST_BYTES) {
      request.destroy();
      throw new Error("request body exceeds 13 MB transport limit");
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function json(response, status, value) {
  const data = Buffer.from(`${JSON.stringify(value)}\n`);
  response.writeHead(status, { "content-type": "application/json", "content-length": data.length });
  response.end(data);
}
