// Every module the Control UI page can reach actually loads. Since 2026.10.10 the page
// carries no RTC import map: Tianyi dropped the Control UI RTC voice on 2026-11-04 and
// kept voice only in the separate v-voice entry.
export default {
  id: "CONTROL-UI/page-modules",
  ledger: ["VOICE-RTC/control-ui"],
  needs: [],
  async run({ gw, assert }) {
    const html = await (await gw.http("/")).text();
    const map = html.match(/<script type="importmap"[^>]*>([\s\S]*?)<\/script>/);
    const imports = map ? (JSON.parse(map[1]).imports ?? {}) : {};
    const rtc = Object.values(imports).find((u) => /rtc/i.test(u));
    assert(!rtc, `the page still swaps in an RTC bundle: ${rtc}`);

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
    return `${seen.size} modules load; no RTC bundle`;
  },
};
