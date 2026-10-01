// Desktop handoff pieces on 9.6 no-worker (read-only): plugin inventory (exactly one
// cua-computer, v-desktop-handoff loaded, versa-runtime-providers loaded, worker plugin off),
// the CUA node connected with computer/screen commands, duplicate-plugin warnings in the journal,
// desktop units active.   node r9-desktop.mjs <label> <outDir>
import { discoverGateway, connect, rpc, writeReceipt, run, UNIT } from "./lib.mjs";

const [label, outDir] = process.argv.slice(2);
const gw = discoverGateway();
const client = await connect(gw);
const out = { label, at: new Date().toISOString(), version: gw.version };
const pl = await rpc(client, "plugins.list", {}, 120_000);
const plugins = pl.result?.plugins ?? pl.result?.items ?? (Array.isArray(pl.result) ? pl.result : []);
const pick = (id) => plugins.filter((p) => (p.id ?? p.pluginId) === id).map((p) => ({ id: p.id ?? p.pluginId, origin: p.origin ?? p.source, status: p.status ?? p.state, enabled: p.enabled, root: p.rootDir ?? p.root ?? p.path }));
out.plugins = { ok: pl.ok, error: pl.error, total: plugins.length, resultKeys: pl.ok ? Object.keys(pl.result ?? {}) : undefined,
  cuaComputer: pick("cua-computer"), desktopHandoff: pick("v-desktop-handoff"), providers: pick("versa-runtime-providers"), worker: pick("vlab-agent-worker-isolation") };
const ids = plugins.map((p) => p.id ?? p.pluginId);
out.plugins.duplicateIds = [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))];
for (const id of ["cua-computer", "v-desktop-handoff"]) {
  const r = await rpc(client, "plugins.inspect", { pluginId: id }, 60_000);
  out[`inspect:${id}`] = { ok: r.ok, error: r.error, origin: r.result?.plugin?.origin ?? r.result?.origin, status: r.result?.plugin?.status ?? r.result?.status,
    tools: r.result?.plugin?.toolNames ?? r.result?.toolNames, nodeHostCommands: r.result?.plugin?.nodeHostCommands ?? r.result?.nodeHostCommands };
}
const nl = await rpc(client, "node.list", {}, 60_000);
const nodes = nl.result?.nodes ?? [];
out.nodes = { ok: nl.ok, error: nl.error, count: nodes.length, list: nodes.map((n) => ({ name: n.displayName ?? n.name, connected: n.connected, caps: n.caps, commands: n.commands })) };
const cua = nodes.find((n) => /CUA/.test(n.displayName ?? n.name ?? ""));
const since = run("systemctl", ["show", UNIT, "-p", "ExecMainStartTimestamp", "--value"]);
const j = run("bash", ["-c", `journalctl -u ${UNIT} --since '${since}' --no-pager -o cat | grep -ci 'duplicate plugin id' || true`], 120_000);
out.journalDuplicatePluginId = Number(j || 0);
out.units = Object.fromEntries(["vlab-openclaw-desktop", "vlab-v-desktop-handoff", "vlab-cua-node"].map((u) => [u, run("bash", ["-c", `systemctl is-active ${u} || true`])]));
out.pass = {
  oneCuaComputer: out.plugins.cuaComputer.length === 1 && !out.plugins.duplicateIds.includes("cua-computer"),
  desktopHandoffLoaded: out.plugins.desktopHandoff.length === 1,
  cuaNodeConnected: Boolean(cua?.connected) && JSON.stringify(cua?.commands ?? []).includes("computer.act"),
  noDuplicateWarnings: out.journalDuplicatePluginId === 0,
  unitsActive: Object.values(out.units).every((s) => s === "active"),
};
client.stop();
const file = writeReceipt(outDir, `r9-desktop-${label}`, out);
console.log(JSON.stringify({ file, pass: out.pass, duplicateIds: out.plugins.duplicateIds, cua: out.plugins.cuaComputer, nodes: out.nodes.count }));
process.exit(0);
