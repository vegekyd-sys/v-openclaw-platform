#!/usr/bin/env node
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const host = process.env.RTC_H5_HOST ?? "127.0.0.1";
const port = Number(process.env.RTC_H5_PORT ?? 26241);
const upstream = new URL(process.env.RTC_H5_UPSTREAM ?? "http://[::1]:26243");
const adapterPath = process.env.RTC_H5_ADAPTER_PATH ?? join(here, "../volcengine-rtc-managed-room-client.mjs");
const sdkPath = process.env.RTC_H5_SDK_PATH ?? join(here, "../release-files/volcengine-rtc-agent/volcengine-rtc-4.68.1.esm.js");

const staticFiles = new Map([
  ["/", [join(here, "index.html"), "text/html; charset=utf-8"]],
  ["/index.html", [join(here, "index.html"), "text/html; charset=utf-8"]],
  ["/styles.css", [join(here, "styles.css"), "text/css; charset=utf-8"]],
  ["/app.js", [join(here, "app.js"), "text/javascript; charset=utf-8"]],
  ["/adapter.js", [adapterPath, "text/javascript; charset=utf-8"]],
  ["/volcengine-rtc-4.68.1.esm.js", [sdkPath, "text/javascript; charset=utf-8"]],
]);

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  response.end(JSON.stringify(payload));
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 256 * 1024) throw new Error("Request body is too large");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? "/", `http://${request.headers.host ?? host}`);
  try {
    if (request.method === "GET" && staticFiles.has(url.pathname)) {
      const [path, contentType] = staticFiles.get(url.pathname);
      const info = await stat(path);
      response.writeHead(200, {
        "content-type": contentType,
        "content-length": info.size,
        "cache-control": url.pathname === "/volcengine-rtc-4.68.1.esm.js" ? "public, max-age=31536000, immutable" : "no-store",
      });
      response.end(await readFile(path));
      return;
    }
    if (!url.pathname.startsWith("/api/")) return sendJson(response, 404, { error: "Not found" });
    const payload = request.method === "GET" ? undefined : await readBody(request);
    const target = new URL(`${url.pathname}${url.search}`, upstream);
    const upstreamResponse = await fetch(target, {
      method: request.method,
      headers: payload === undefined ? undefined : { "content-type": request.headers["content-type"] ?? "application/json" },
      body: payload?.length ? payload : undefined,
    });
    const data = Buffer.from(await upstreamResponse.arrayBuffer());
    response.writeHead(upstreamResponse.status, {
      "content-type": upstreamResponse.headers.get("content-type") ?? "application/json; charset=utf-8",
      "content-length": data.length,
      "cache-control": "no-store",
    });
    response.end(data);
  } catch (error) {
    sendJson(response, 502, { error: error instanceof Error ? error.message : String(error) });
  }
});

server.listen(port, host, () => {
  console.log(JSON.stringify({ ready: true, host, port, upstream: upstream.origin }));
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
