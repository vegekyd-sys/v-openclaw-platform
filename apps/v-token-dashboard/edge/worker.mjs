const assetPaths = new Set([
  "/",
  "/index.html",
  "/ui.js",
  "/public.js",
  "/style.css",
  "/v-brand.webp",
]);

export default {
  async fetch(request, env) {
    const path = new URL(request.url).pathname;
    const headers = new Headers({
      "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow, noarchive",
      "Content-Security-Policy":
        "default-src 'self'; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
      "Cache-Control": "no-store",
    });
    if (!["GET", "HEAD"].includes(request.method))
      return new Response(null, { status: 405, headers });
    if (
      path === "/home.bin" ||
      /^\/datasets\/[0-9]+-[0-9a-f]{16}\.bin$/.test(path)
    ) {
      const key = path.slice(1);
      const object =
        request.method === "HEAD"
          ? await env.USAGE.head(key)
          : await env.USAGE.get(key, { onlyIf: request.headers });
      if (!object) return new Response(null, { status: 404, headers });
      headers.set("Content-Type", "application/octet-stream");
      headers.set(
        "Cache-Control",
        path === "/home.bin"
          ? "private, no-cache"
          : "private, max-age=86400, immutable",
      );
      headers.set("ETag", object.httpEtag);
      if (request.method === "GET" && !("body" in object))
        return new Response(null, { status: 304, headers });
      headers.set("Content-Length", String(object.size));
      return new Response(object.body || null, { headers });
    }
    if (path === "/favicon.ico")
      return new Response(null, { status: 204, headers });
    if (!assetPaths.has(path))
      return new Response(null, { status: 404, headers });
    const asset = await env.ASSETS.fetch(request);
    const response = new Response(asset.body, asset);
    for (const [name, value] of headers) response.headers.set(name, value);
    response.headers.set("Cache-Control", "no-cache");
    return response;
  },
};
