// Builds release/load-manifest/<name>.json from candidate receipts of
// measure-load-sets.mjs: the union of what each process loaded across runs,
// limited to the core dist and the Worker plugin (the two components whose
// files can be Worker-only), plus the Gateway-reachable set of the import graph.
//
//   node lab/load-manifest/build-manifest.mjs --out release/load-manifest/v2026.9.1-db91.6.json \
//     tmp/candidate/candidate-<id>.json [...]
//
// Keeps only file paths and run metadata: no stdout, logs or configuration.
import { readFileSync, writeFileSync } from 'node:fs';

const argv = process.argv.slice(2);
const outIndex = argv.indexOf('--out');
if (outIndex < 0 || !argv[outIndex + 1]) throw new Error('--out <file> required');
const out = argv[outIndex + 1];
const receipts = argv.filter((_, i) => i !== outIndex && i !== outIndex + 1);
if (receipts.length === 0) throw new Error('at least one candidate receipt required');

const KEEP = /^(openclaw\/dist|production-worker)\//u;
const gateway = new Set();
const worker = new Set();
const reachable = new Set();
const viaProxy = new Set();
const sources = [];
for (const file of receipts) {
  const receipt = JSON.parse(readFileSync(file, 'utf8'));
  const result = JSON.parse(receipt.outcome.stdout.trim().split('\n').pop());
  for (const f of result.sets.gateway) if (KEEP.test(f)) gateway.add(f);
  for (const f of result.sets.worker) if (KEEP.test(f)) worker.add(f);
  for (const f of result.graph?.gatewayReachable ?? []) if (KEEP.test(f)) reachable.add(f);
  for (const f of result.gatewayToolsProxy?.files ?? []) if (KEEP.test(f)) viaProxy.add(f);
  sources.push({
    candidate: receipt.id,
    sourceCommit: receipt.sourceCommit,
    baseRelease: receipt.baseRelease,
    runtimeSha: receipt.runtimeSha,
    scenarios: result.steps.filter((s) => s.name.startsWith('turn:') || /workboard|voice|roll|rpc-sweep/u.test(s.name))
      .map((s) => ({ name: s.name, status: s.status ?? s.result ?? (s.error ? 'error' : 'ok'), tools: s.toolCalls?.length ? [...new Set(s.toolCalls.map((t) => t.replace(/^.*:"|"$/gu, '')))] : undefined })),
    processes: result.processes.map((p) => ({ role: p.role, files: p.files })),
    graph: result.graph ? { files: result.graph.files, staticMissCount: result.graph.staticMissCount } : undefined,
  });
}
for (const f of gateway) reachable.delete(f);
// Files the Gateway loaded only in the tools-proxy window and in no other run
// stand for what Codex / claude-cli turns pull into the Gateway on V.
const otherRunsGateway = new Set();
for (const file of receipts) {
  const result = JSON.parse(JSON.parse(readFileSync(file, 'utf8')).outcome.stdout.trim().split('\n').pop());
  const proxy = new Set(result.gatewayToolsProxy?.files ?? []);
  for (const f of result.sets.gateway) if (!proxy.has(f)) otherRunsGateway.add(f);
}
const proxyOnly = [...viaProxy].filter((f) => !otherRunsGateway.has(f)).sort();
const manifest = {
  schema: 1,
  about: 'Runtime files each process loads on V 2026.9.1-db91.6, measured in VLab candidates with lab/load-manifest/load-trace-hook.mjs. Read by scripts/lib/restart-scope.mjs. docs/worker-roll-scope.md.',
  measuredAt: new Date().toISOString(),
  sources,
  counts: { gateway: gateway.size, worker: worker.size, gatewayReachable: reachable.size,
    workerOnly: [...worker].filter((f) => !gateway.has(f) && !reachable.has(f)).length, gatewayViaToolsProxy: proxyOnly.length },
  gateway: [...gateway].sort(),
  worker: [...worker].sort(),
  gatewayReachable: [...reachable].sort(),
  gatewayViaToolsProxy: proxyOnly,
};
writeFileSync(out, `${JSON.stringify(manifest, null, 1)}\n`);
console.log(JSON.stringify(manifest.counts));
