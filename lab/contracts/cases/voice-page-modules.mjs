// VOICE-RTC/provider-plugin: the page's import map swaps in V's RTC chat bundle
// and every module the page can reach actually loads.
export default {
  id: "VOICE-RTC/page-modules",
  ledger: ["VOICE-RTC/provider-plugin"],
  needs: [],
  async run({ gw, assert }) {
    const html = await (await gw.http("/")).text();
    const map = html.match(/<script type="importmap"[^>]*>([\s\S]*?)<\/script>/);
    assert(map, "the page has no import map, so the RTC chat bundle is never used");
    const imports = JSON.parse(map[1]).imports ?? {};
    const rtc = Object.values(imports).find((u) => /rtc/i.test(u));
    assert(rtc, "the import map does not point at an RTC bundle");

    const entry = [...html.matchAll(/<script[^>]+type="module"[^>]+src="([^"]+)"/g)].map((m) => m[1]);
    const seen = new Set();
    const missing = [];
    const queue = [...entry, ...Object.values(imports)].map((u) => new URL(u, "http://x/").pathname);
    while (queue.length) {
      const p = queue.pop();
      if (seen.has(p)) continue;
      seen.add(p);
      const res = await gw.http(p);
      const type = res.headers.get("content-type") ?? "";
      if (!res.ok || !/javascript/.test(type)) {
        missing.push(`${p} ${res.status} ${type}`);
        continue;
      }
      const text = await res.text();
      const specs = [
        ...text.matchAll(/(?:from\s*|import\s*\(?\s*)["'`](\.{1,2}\/[^"'`]+\.js)["'`]/g),
        ...text.matchAll(/new URL\(["'`](\.{1,2}\/[^"'`]+\.js)["'`]/g),
      ];
      for (const m of specs) queue.push(new URL(m[1], `http://x${p}`).pathname);
    }
    assert(seen.size > 20, `only walked ${seen.size} modules, the walk did not reach the app`);
    assert(missing.length === 0, `${missing.length} of ${seen.size} modules fail to load: ${missing.slice(0, 5).join(", ")}`);
    return `${seen.size} modules load; RTC bundle ${rtc}`;
  },
};
