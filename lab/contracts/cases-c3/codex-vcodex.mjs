// /vcodex on a real Codex app-server, the fake model standing in for OpenAI.
import { bothBoot, vcodexBoot } from "../lib/codex-boot.mjs";

const TURN = { timeoutMs: 150_000 };
const names = (q) => (q.tools ?? []).map((t) => t.name ?? t.type).sort();

export default [
  {
    id: "C3-vcodex/reply-on-the-openai-route",
    ledger: "CX-routes",
    parity: true,
    boot: () => vcodexBoot({ modelScript: () => ({ text: "from vcodex" }) }),
    async run({ gw, assert }) {
      const r = await gw.turn("hello", TURN);
      assert(r.text.includes("from vcodex"), `reply: ${r.text}`);
      return { harness: r.result.meta.agentMeta.agentHarnessId, tools: names(gw.model.requests.at(-1).body) };
    },
  },
  {
    id: "C3-CX-B/switching-provider-family-starts-a-new-thread",
    ledger: "CX-B-persistent-vds-thread",
    parity: true,
    boot: () => bothBoot({ modelScript: (_b, i) => ({ text: `answer ${i}` }) }),
    async run({ gw, assert }) {
      const key = "agent:main:contract";
      await gw.turn("ON-VDS", TURN);
      const patch = await gw.rpc.call("sessions.patch", { key, model: "openai/gpt-5.6-sol" }).then(() => "ok", (e) => e.message);
      const r = await gw.turn("ON-VCODEX", TURN).then((x) => x.text, (e) => `error ${e.message}`);
      const [a, b] = [gw.model.requests[0].body, gw.model.requests.at(-1).body];
      assert(b.model !== a.model, `still on ${b.model}: ${r.slice(0, 200)}`);
      assert(a.prompt_cache_key !== b.prompt_cache_key, "the provider change kept the DeepSeek thread");
      return { patch, models: [a.model, b.model] };
    },
  },
];
